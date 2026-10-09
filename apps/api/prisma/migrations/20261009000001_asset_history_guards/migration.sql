-- Corrections retain immutable original history; only replay accounting and first void are allowed.
CREATE FUNCTION tracker_preserve_stock_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['gross','cost_removed','realized_pnl','voided_at','void_reason'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['gross','cost_removed','realized_pnl','voided_at','void_reason'])
   OR (OLD.voided_at IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
   RAISE EXCEPTION 'stock history is immutable; append a correction' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_history BEFORE UPDATE ON stock_trades FOR EACH ROW EXECUTE FUNCTION tracker_preserve_stock_history();
CREATE FUNCTION tracker_owned_asset_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF public.tracker_case_delete_allowed(OLD.owner_id) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'asset deletion requires approved owner case' USING ERRCODE='23514';
END;
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['stock_holdings','stock_trades','stock_portfolios','manual_assets'] LOOP
  EXECUTE format('CREATE TRIGGER owner_case_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION tracker_owned_asset_delete()',t);
 END LOOP;
END $$;
