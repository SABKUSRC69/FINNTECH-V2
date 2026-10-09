ALTER TABLE runtime_boundaries ADD COLUMN dataset_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE TABLE privacy_restore_receipts(dataset_id UUID PRIMARY KEY, ledger_sha256 CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL);
REVOKE ALL ON privacy_restore_receipts FROM PUBLIC;
CREATE TABLE account_deletion_cases (
  id UUID PRIMARY KEY, sequence BIGSERIAL UNIQUE NOT NULL,
  user_id UUID UNIQUE NOT NULL, owner_id UUID UNIQUE NOT NULL,
  request_hash CHAR(64) UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','PURGING','PURGED')),
  requested_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  purged_at TIMESTAMPTZ(3), purge_transaction BIGINT,
  archive_id TEXT,archive_sha256 CHAR(64),archive_envelope TEXT,archived_at TIMESTAMPTZ(3)
);
CREATE TABLE privacy_operators(role_name TEXT PRIMARY KEY);
REVOKE ALL ON privacy_operators FROM PUBLIC;
REVOKE ALL ON account_deletion_cases FROM PUBLIC;

-- Deletion is admitted only inside the approved case's transaction, for that owner,
-- under an explicitly provisioned operator login distinct from the application.
CREATE FUNCTION tracker_case_delete_allowed(target_owner UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.account_deletion_cases c, public.runtime_boundaries b
   WHERE b.id='singleton' AND b.mode IN ('real','real-rehearsal')
     AND session_user::text <> b.database_role
     AND EXISTS(SELECT 1 FROM public.privacy_operators p WHERE p.role_name=session_user::text)
     AND c.owner_id=target_owner AND c.status='PURGING' AND c.purge_transaction=txid_current()
     AND c.id::text=current_setting('finntech.purge_case', true)
 )
$$;
REVOKE ALL ON FUNCTION tracker_case_delete_allowed(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION tracker_archive_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND TG_TABLE_NAME='audit_events' AND public.tracker_case_delete_allowed(OLD.owner_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'archive/audit rows are append-only; approved owner case required' USING ERRCODE='23514';
END;
$$;
CREATE OR REPLACE FUNCTION tracker_preserve_idempotency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF public.tracker_case_delete_allowed(OLD.owner_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'receipt deletion requires approved owner case' USING ERRCODE='23514';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['status','receipt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','receipt'])
    OR (OLD.status='REVERSED' AND NEW IS DISTINCT FROM OLD)
    OR (NEW.receipt IS DISTINCT FROM OLD.receipt AND NOT(OLD.status='COMPLETED' AND NEW.status='REVERSED')) THEN
    RAISE EXCEPTION 'request identity/receipt is immutable; reversed retry cannot restore' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION tracker_purge_owner_case(case_id UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.account_deletion_cases; b public.runtime_boundaries;
BEGIN
  SELECT * INTO STRICT b FROM public.runtime_boundaries WHERE id='singleton';
  IF b.mode NOT IN ('real','real-rehearsal') OR b.database_role=session_user::text
    OR NOT EXISTS(SELECT 1 FROM public.privacy_operators WHERE role_name=session_user::text) THEN
    RAISE EXCEPTION 'privacy operator required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT c FROM public.account_deletion_cases WHERE id=case_id FOR UPDATE;
  IF c.status='PURGED' THEN RETURN 'PURGED'; END IF;
  IF c.status<>'REQUESTED' OR c.archived_at IS NULL OR c.archive_id IS NULL OR c.archive_sha256 IS NULL THEN RAISE EXCEPTION 'off-device case receipt required'; END IF;
  PERFORM id FROM public.auth_users WHERE id=c.user_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('tracker-dataset:'||c.owner_id::text,0));
  IF EXISTS(SELECT 1 FROM public.legacy_imports WHERE owner_id=c.owner_id)
    OR EXISTS(SELECT 1 FROM public.demo_workspaces WHERE user_id=c.user_id)
    OR NOT EXISTS(SELECT 1 FROM public.auth_identities WHERE owner_id=c.owner_id AND auth_user_id=c.user_id)
    OR NOT EXISTS(SELECT 1 FROM public.auth_recovery_enrollments WHERE user_id=c.user_id AND blocked) THEN
    RAISE EXCEPTION 'owner case boundary rejected';
  END IF;
  UPDATE public.account_deletion_cases SET status='PURGING',purge_transaction=txid_current() WHERE id=case_id;
  PERFORM set_config('finntech.purge_case',case_id::text,true);
  DELETE FROM public.auth_sessions WHERE user_id=c.user_id;
  DELETE FROM public.auth_verifications WHERE value=c.user_id::text;
  DELETE FROM public.auth_delivery_jobs WHERE user_id=c.user_id;
  DELETE FROM public.audit_events WHERE owner_id=c.owner_id;
  DELETE FROM public.idempotency_keys WHERE owner_id=c.owner_id;
  DELETE FROM public.portfolio_holdings WHERE owner_id=c.owner_id;
  DELETE FROM public.crypto_trades WHERE owner_id=c.owner_id;
  DELETE FROM public.crypto_portfolios WHERE owner_id=c.owner_id;
  DELETE FROM public.budgets WHERE owner_id=c.owner_id;
  DELETE FROM public.finance_transactions WHERE owner_id=c.owner_id;
  DELETE FROM public.finance_categories WHERE owner_id=c.owner_id;
  DELETE FROM public.cash_accounts WHERE owner_id=c.owner_id;
  DELETE FROM public.source_dataset_namespaces WHERE owner_id=c.owner_id;
  DELETE FROM public.auth_identities WHERE owner_id=c.owner_id AND auth_user_id=c.user_id;
  DELETE FROM public.tracker_users WHERE id=c.owner_id;
  DELETE FROM public.auth_recovery_enrollments WHERE user_id=c.user_id;
  DELETE FROM public.auth_accounts WHERE user_id=c.user_id;
  DELETE FROM public.auth_users WHERE id=c.user_id;
  UPDATE public.account_deletion_cases SET status='PURGED',purged_at=clock_timestamp(),purge_transaction=NULL WHERE id=case_id;
  PERFORM set_config('finntech.purge_case','',true);
  RETURN 'PURGED';
END;
$$;
REVOKE ALL ON FUNCTION tracker_purge_owner_case(UUID) FROM PUBLIC;

-- Restored archives stay on a different database name and remain unservable until
-- the operator has replayed the current authenticated off-device deletion ledger.
CREATE FUNCTION tracker_replay_deletion(case_id UUID,target_owner UUID,target_user UUID,consented_at TIMESTAMPTZ,archive_id TEXT,archive_hash TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.runtime_boundaries; c public.account_deletion_cases;
BEGIN
 SELECT * INTO STRICT b FROM public.runtime_boundaries WHERE id='singleton';
 IF archive_id !~ '^[A-Za-z0-9_-]{10,200}$' OR archive_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'archive evidence rejected'; END IF;
 IF current_database()=b.database_name OR session_user::text=b.database_role
   OR NOT EXISTS(SELECT 1 FROM public.privacy_operators WHERE role_name=session_user::text) THEN RAISE EXCEPTION 'isolated restore operator required'; END IF;
 IF EXISTS(SELECT 1 FROM public.auth_users WHERE id=target_user)
   AND NOT EXISTS(SELECT 1 FROM public.auth_identities WHERE auth_user_id=target_user AND owner_id=target_owner) THEN RAISE EXCEPTION 'restore identity mismatch'; END IF;
 INSERT INTO public.account_deletion_cases(id,user_id,owner_id,request_hash,requested_at)
 VALUES(case_id,target_user,target_owner,replace(case_id::text,'-','')||replace(case_id::text,'-',''),consented_at)
 ON CONFLICT(id) DO NOTHING;
 SELECT * INTO STRICT c FROM public.account_deletion_cases WHERE id=case_id FOR UPDATE;
 IF c.user_id<>target_user OR c.owner_id<>target_owner OR c.requested_at<>consented_at THEN RAISE EXCEPTION 'restore case mismatch'; END IF;
 UPDATE public.account_deletion_cases SET archive_id=tracker_replay_deletion.archive_id,archive_sha256=archive_hash,archived_at=clock_timestamp() WHERE id=case_id;
 IF NOT EXISTS(SELECT 1 FROM public.auth_users WHERE id=target_user) THEN
   IF EXISTS(SELECT 1 FROM public.tracker_users WHERE id=target_owner) THEN RAISE EXCEPTION 'restore orphan rejected'; END IF;
   UPDATE public.account_deletion_cases SET status='PURGED',purged_at=COALESCE(purged_at,clock_timestamp()),purge_transaction=NULL WHERE id=case_id;
   RETURN 'PURGED';
 END IF;
 IF c.status='PURGED' THEN RAISE EXCEPTION 'restored tombstone conflicts with live account'; END IF;
 UPDATE public.auth_recovery_enrollments SET blocked=true WHERE user_id=target_user;
 RETURN public.tracker_purge_owner_case(case_id);
END;
$$;
REVOKE ALL ON FUNCTION tracker_replay_deletion(UUID,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT) FROM PUBLIC;

CREATE FUNCTION tracker_case_archive(case_id UUID,file_id TEXT,encrypted_hash TEXT DEFAULT NULL,envelope TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.account_deletion_cases;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.runtime_boundaries WHERE id='singleton' AND database_role<>session_user::text)
   OR NOT EXISTS(SELECT 1 FROM public.privacy_operators WHERE role_name=session_user::text)
   OR file_id !~ '^[A-Za-z0-9_-]{10,200}$' OR (encrypted_hash IS NOT NULL AND encrypted_hash !~ '^[a-f0-9]{64}$')
   OR (envelope IS NOT NULL AND (length(envelope)>8192 OR length(envelope)<64)) THEN RAISE EXCEPTION 'operator archive receipt rejected'; END IF;
 SELECT * INTO STRICT c FROM public.account_deletion_cases WHERE id=case_id FOR UPDATE;
 IF c.archive_id IS NOT NULL AND c.archive_id<>file_id THEN RAISE EXCEPTION 'original archive id required'; END IF;
 IF c.archive_sha256 IS NOT NULL AND c.archive_sha256 IS DISTINCT FROM encrypted_hash THEN RAISE EXCEPTION 'original archive bytes required'; END IF;
 IF c.archive_envelope IS NOT NULL AND envelope IS NOT NULL AND c.archive_envelope<>envelope THEN RAISE EXCEPTION 'original archive envelope required'; END IF;
 UPDATE public.account_deletion_cases SET archive_id=file_id,
   archive_envelope=COALESCE(archive_envelope,envelope),
   archive_sha256=COALESCE(encrypted_hash,archive_sha256),archived_at=CASE WHEN encrypted_hash IS NULL THEN archived_at ELSE clock_timestamp() END WHERE id=case_id;
END;
$$;
REVOKE ALL ON FUNCTION tracker_case_archive(UUID,TEXT,TEXT,TEXT) FROM PUBLIC;

CREATE FUNCTION tracker_record_restore(dataset UUID,ledger_hash TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.runtime_boundaries WHERE id='singleton' AND dataset_id=dataset
   AND database_name<>current_database() AND database_role<>session_user::text)
   OR NOT EXISTS(SELECT 1 FROM public.privacy_operators WHERE role_name=session_user::text)
   OR ledger_hash !~ '^[a-f0-9]{64}$'
   OR EXISTS(SELECT 1 FROM public.account_deletion_cases WHERE status<>'PURGED') THEN RAISE EXCEPTION 'restore acceptance rejected'; END IF;
 INSERT INTO public.privacy_restore_receipts VALUES(dataset,ledger_hash,clock_timestamp())
 ON CONFLICT(dataset_id) DO UPDATE SET ledger_sha256=EXCLUDED.ledger_sha256,applied_at=EXCLUDED.applied_at;
END;
$$;
REVOKE ALL ON FUNCTION tracker_record_restore(UUID,TEXT) FROM PUBLIC;
