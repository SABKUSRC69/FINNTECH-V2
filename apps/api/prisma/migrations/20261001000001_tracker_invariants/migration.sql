-- CHECK constraints and partial identities are deliberately versioned SQL.
-- Do not replace migrations with db push: typmod alone still rounds excess scale.
BEGIN;
ALTER TABLE legacy_imports ALTER COLUMN selected_sections SET NOT NULL;
ALTER TABLE finance_categories ADD CONSTRAINT category_name_nonempty CHECK (length(btrim(name)) > 0);
ALTER TABLE finance_transactions ADD CONSTRAINT finance_transaction_rules CHECK (
  currency = 'THB' AND provenance = 'USER_ENTERED'
  AND amount > 0 AND amount <> 'NaN'::numeric
);
ALTER TABLE budgets ADD CONSTRAINT budget_rules CHECK (
  currency = 'THB' AND category_type = 'EXPENSE'
  AND amount >= 0 AND amount <> 'NaN'::numeric
  AND extract(day FROM month) = 1
);
ALTER TABLE crypto_portfolios ADD CONSTRAINT portfolio_rules CHECK (
  quote_currency = 'USDT' AND length(btrim(name)) > 0
);
ALTER TABLE crypto_assets ADD CONSTRAINT asset_symbol_rules CHECK (symbol ~ '^[A-Z0-9_-]{1,32}$');
ALTER TABLE crypto_trades ADD CONSTRAINT crypto_trade_rules CHECK (
  quote_currency = 'USDT' AND provenance = 'USER_ENTERED'
  AND quantity > 0 AND quantity <> 'NaN'::numeric
  AND price > 0 AND price <> 'NaN'::numeric
  AND fee >= 0 AND fee <> 'NaN'::numeric
  AND (gross IS NULL OR (gross >= 0 AND gross <> 'NaN'::numeric))
  AND (cost_removed IS NULL OR (cost_removed >= 0 AND cost_removed <> 'NaN'::numeric))
  AND (realized_pnl IS NULL OR realized_pnl <> 'NaN'::numeric)
);
ALTER TABLE portfolio_holdings ADD CONSTRAINT holding_rules CHECK (
  quote_currency = 'USDT' AND quantity >= 0 AND quantity <> 'NaN'::numeric AND version >= 0
  AND (total_cost IS NULL OR (total_cost >= 0 AND total_cost <> 'NaN'::numeric))
  AND (realized_pnl IS NULL OR realized_pnl <> 'NaN'::numeric)
  AND (state <> 'READY' OR total_cost IS NOT NULL)
);
ALTER TABLE source_dataset_namespaces ADD CONSTRAINT namespace_name_nonempty CHECK (length(btrim(display_name)) > 0);
ALTER TABLE legacy_imports ADD CONSTRAINT legacy_import_rules CHECK (
  provenance = 'LEGACY_DEMO' AND file_sha256 ~ '^[0-9a-f]{64}$'
  AND cardinality(selected_sections) > 0 AND array_position(selected_sections, NULL) IS NULL
  AND (currency_override IS NULL OR currency_override = 'THB')
  AND ((status = 'COMMITTED' AND reversed_at IS NULL AND reversal_reason IS NULL)
    OR (status = 'REVERSED' AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL AND length(btrim(reversal_reason)) > 0))
);
ALTER TABLE legacy_import_rows ADD CONSTRAINT legacy_row_rules CHECK (
  provenance = 'LEGACY_DEMO' AND ordinal >= 0
  AND file_sha256 ~ '^[0-9a-f]{64}$' AND payload_sha256 ~ '^[0-9a-f]{64}$'
  AND (source_row_id IS NULL OR length(source_row_id) > 0)
  AND (currency_override IS NULL OR (currency_override = 'THB' AND section = 'TRANSACTIONS'))
  -- No exported trade ledger can establish legacy cost basis in v1.
  AND cost_basis IS NULL
);
ALTER TABLE legacy_demo_summaries ADD CONSTRAINT legacy_summary_rules CHECK (
  provenance = 'LEGACY_DEMO' AND row_count >= 0
  AND (thb_total IS NULL OR thb_total <> 'NaN'::numeric)
  AND (usdt_total IS NULL OR usdt_total <> 'NaN'::numeric)
);
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_request_rules CHECK (
  length(btrim(endpoint)) > 0 AND length(btrim(key)) > 0 AND request_sha256 ~ '^[0-9a-f]{64}$'
);

-- Ordinal is not part of a known logical row identity. Content hash never dedupes rows.
CREATE UNIQUE INDEX legacy_rows_known_identity ON legacy_import_rows
  (owner_id, namespace_id, section, source_row_id) WHERE source_row_id IS NOT NULL;
CREATE UNIQUE INDEX legacy_rows_noid_identity ON legacy_import_rows
  (owner_id, namespace_id, file_sha256, section, ordinal) WHERE source_row_id IS NULL;

CREATE FUNCTION tracker_preserve_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'owner is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'auth_identities', 'finance_categories', 'finance_transactions', 'budgets',
    'crypto_portfolios', 'crypto_trades', 'portfolio_holdings', 'source_dataset_namespaces',
    'legacy_imports', 'legacy_import_rows', 'legacy_demo_summaries', 'audit_events', 'idempotency_keys'
  ] LOOP
    EXECUTE format('CREATE TRIGGER preserve_owner BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION tracker_preserve_owner()', table_name);
  END LOOP;
END;
$$;

CREATE FUNCTION tracker_preserve_namespace_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'namespace identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_namespace_identity BEFORE UPDATE ON source_dataset_namespaces
  FOR EACH ROW EXECUTE FUNCTION tracker_preserve_namespace_identity();

CREATE FUNCTION tracker_archive_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'archive/audit rows are append-only; retention is not enabled' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER legacy_rows_append_only BEFORE UPDATE OR DELETE ON legacy_import_rows
  FOR EACH ROW EXECUTE FUNCTION tracker_archive_append_only();
CREATE TRIGGER legacy_summaries_append_only BEFORE UPDATE OR DELETE ON legacy_demo_summaries
  FOR EACH ROW EXECUTE FUNCTION tracker_archive_append_only();
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION tracker_archive_append_only();

CREATE FUNCTION tracker_preserve_import() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'archive deletion is not enabled' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'reversed_at', 'reversal_reason'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'reversed_at', 'reversal_reason'])
      OR (OLD.status = 'REVERSED' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'import metadata and reversed batches are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_legacy_import BEFORE UPDATE OR DELETE ON legacy_imports
  FOR EACH ROW EXECUTE FUNCTION tracker_preserve_import();

CREATE FUNCTION tracker_preserve_idempotency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'receipt deletion is not enabled' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'receipt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'receipt'])
    OR (OLD.status = 'REVERSED' AND NEW IS DISTINCT FROM OLD)
    OR (NEW.receipt IS DISTINCT FROM OLD.receipt AND NOT (OLD.status = 'COMPLETED' AND NEW.status = 'REVERSED')) THEN
    RAISE EXCEPTION 'request identity/receipt is immutable; reversed retry cannot restore' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_idempotency BEFORE UPDATE OR DELETE ON idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION tracker_preserve_idempotency();

-- Import reversal and its receipt state must agree at transaction commit, regardless of update order.
CREATE FUNCTION tracker_check_receipt_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'legacy_imports' THEN
    IF EXISTS (SELECT 1 FROM idempotency_keys k JOIN legacy_imports i ON i.id = k.legacy_import_id
      WHERE i.id = NEW.id AND (k.status = 'REVERSED') <> (i.status = 'REVERSED')) THEN
      RAISE EXCEPTION 'batch and receipt states disagree' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM idempotency_keys k JOIN legacy_imports i ON i.id = k.legacy_import_id
      WHERE k.id = NEW.id AND (k.status = 'REVERSED') <> (i.status = 'REVERSED')) THEN
      RAISE EXCEPTION 'batch and receipt states disagree' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER legacy_receipt_state AFTER INSERT OR UPDATE ON legacy_imports
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tracker_check_receipt_state();
CREATE CONSTRAINT TRIGGER idempotency_receipt_state AFTER INSERT OR UPDATE ON idempotency_keys
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tracker_check_receipt_state();
COMMIT;
