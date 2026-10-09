BEGIN;
CREATE TABLE media_objects (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES tracker_users(id) ON DELETE RESTRICT,
 purpose VARCHAR(16) NOT NULL CHECK (purpose IN ('AVATAR','RECEIPT')),
 bytes BYTEA NOT NULL, byte_size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
 sha256 CHAR(64) NOT NULL, staged_expires_at TIMESTAMPTZ(3), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id),
 CHECK(byte_size=octet_length(bytes) AND byte_size>0 AND byte_size<=CASE WHEN purpose='AVATAR' THEN 98304 ELSE 262144 END),
 CHECK(width>0 AND height>0 AND width<=1800 AND height<=1800), CHECK(sha256 ~ '^[a-f0-9]{64}$')
);
CREATE INDEX media_owner_staging ON media_objects(owner_id,staged_expires_at);
CREATE TABLE media_attachments (
 owner_id UUID NOT NULL REFERENCES tracker_users(id) ON DELETE RESTRICT,
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('finance','crypto','stock')), record_id UUID NOT NULL,
 media_id UUID NOT NULL, PRIMARY KEY(owner_id,kind,record_id),
 FOREIGN KEY(owner_id,media_id) REFERENCES media_objects(owner_id,id) ON DELETE RESTRICT
);
CREATE TABLE owner_profiles (
 owner_id UUID PRIMARY KEY REFERENCES tracker_users(id) ON DELETE RESTRICT,
 media_id UUID, preset VARCHAR(16) CHECK(preset IN ('leaf','moon','book')), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 FOREIGN KEY(owner_id,media_id) REFERENCES media_objects(owner_id,id) ON DELETE RESTRICT,
 CHECK(media_id IS NULL OR preset IS NULL)
);
CREATE FUNCTION tracker_media_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p TEXT;
BEGIN
 SELECT purpose INTO p FROM media_objects WHERE owner_id=NEW.owner_id AND id=NEW.media_id;
 IF TG_TABLE_NAME='media_attachments' THEN
  IF p IS DISTINCT FROM 'RECEIPT' OR NOT (CASE NEW.kind
   WHEN 'finance' THEN EXISTS(SELECT 1 FROM finance_transactions WHERE owner_id=NEW.owner_id AND id=NEW.record_id)
   WHEN 'crypto' THEN EXISTS(SELECT 1 FROM crypto_trades WHERE owner_id=NEW.owner_id AND id=NEW.record_id)
   WHEN 'stock' THEN EXISTS(SELECT 1 FROM stock_trades WHERE owner_id=NEW.owner_id AND id=NEW.record_id) ELSE false END)
  THEN RAISE EXCEPTION 'invalid private attachment reference' USING ERRCODE='23514'; END IF;
 ELSIF NEW.media_id IS NOT NULL AND p IS DISTINCT FROM 'AVATAR' THEN
  RAISE EXCEPTION 'invalid private avatar reference' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER media_reference BEFORE INSERT OR UPDATE ON media_attachments FOR EACH ROW EXECUTE FUNCTION tracker_media_reference();
CREATE TRIGGER media_reference BEFORE INSERT OR UPDATE ON owner_profiles FOR EACH ROW EXECUTE FUNCTION tracker_media_reference();
CREATE FUNCTION tracker_media_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'staged_expires_at') IS DISTINCT FROM (to_jsonb(OLD)-'staged_expires_at') OR
  (OLD.staged_expires_at IS NULL AND NEW.staged_expires_at IS NOT NULL) THEN
  RAISE EXCEPTION 'media bytes and owner are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER media_immutable BEFORE UPDATE ON media_objects FOR EACH ROW EXECUTE FUNCTION tracker_media_immutable();
CREATE TRIGGER preserve_owner BEFORE UPDATE ON media_attachments FOR EACH ROW EXECUTE FUNCTION tracker_preserve_owner();
CREATE TRIGGER preserve_owner BEFORE UPDATE ON owner_profiles FOR EACH ROW EXECUTE FUNCTION tracker_preserve_owner();

-- Same operator/tombstone safeguards; media removed before financial owner rows.
CREATE OR REPLACE FUNCTION tracker_purge_owner_case(case_id UUID) RETURNS TEXT
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
  PERFORM pg_advisory_xact_lock(hashtextextended('tracker-media-budget',0));
  DELETE FROM public.media_attachments WHERE owner_id=c.owner_id;
  DELETE FROM public.owner_profiles WHERE owner_id=c.owner_id;
  DELETE FROM public.media_objects WHERE owner_id=c.owner_id;
  DELETE FROM public.stock_holdings WHERE owner_id=c.owner_id;
  DELETE FROM public.stock_trades WHERE owner_id=c.owner_id;
  DELETE FROM public.stock_portfolios WHERE owner_id=c.owner_id;
  DELETE FROM public.manual_assets WHERE owner_id=c.owner_id;
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
COMMIT;
