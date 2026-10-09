BEGIN;
CREATE TABLE valuation_references (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES tracker_users(id) ON DELETE RESTRICT,
 symbol VARCHAR(16) NOT NULL CHECK(symbol IN ('USDTHB','AAPL','MSFT','NVDA','AMZN','GOOGL','TSLA','SPY','QQQ')),
 currency VARCHAR(3) NOT NULL CHECK(currency=CASE WHEN symbol='USDTHB' THEN 'THB' ELSE 'USD' END),
 source VARCHAR(16) NOT NULL DEFAULT 'MANUAL' CHECK(source='MANUAL'),
 value NUMERIC(38,18) NOT NULL CHECK(value>0 AND value<'100000000000000000000'::numeric),
 as_of TIMESTAMPTZ(3) NOT NULL, updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 enabled BOOLEAN NOT NULL DEFAULT true, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(owner_id,symbol)
);
CREATE TRIGGER preserve_owner BEFORE UPDATE ON valuation_references FOR EACH ROW EXECUTE FUNCTION tracker_preserve_owner();
CREATE TRIGGER owner_case_delete BEFORE DELETE ON valuation_references FOR EACH ROW EXECUTE FUNCTION tracker_owned_asset_delete();
-- Preserve the current media-aware approved privacy purge, adding only owner references.
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
  DELETE FROM public.valuation_references WHERE owner_id=c.owner_id;
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
