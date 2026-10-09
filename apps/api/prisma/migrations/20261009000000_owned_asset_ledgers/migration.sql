-- CreateTable
CREATE TABLE "stock_instruments" (
    "symbol" VARCHAR(15) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',

    CONSTRAINT "stock_instruments_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "stock_portfolios" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "quote_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',

    CONSTRAINT "stock_portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_trades" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "quote_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "symbol" VARCHAR(15) NOT NULL,
    "side" "TradeSide" NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "fee" DECIMAL(38,18) NOT NULL,
    "gross" DECIMAL(38,18) NOT NULL,
    "cost_removed" DECIMAL(38,18) NOT NULL,
    "realized_pnl" DECIMAL(38,18) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" VARCHAR(500),
    "note" VARCHAR(500) NOT NULL DEFAULT '',

    CONSTRAINT "stock_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_holdings" (
    "owner_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "quote_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "symbol" VARCHAR(15) NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "total_cost" DECIMAL(38,18) NOT NULL,
    "realized_pnl" DECIMAL(38,18) NOT NULL,

    CONSTRAINT "stock_holdings_pkey" PRIMARY KEY ("owner_id","portfolio_id","symbol")
);

-- CreateTable
CREATE TABLE "manual_assets" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(8) NOT NULL,
    "currency" VARCHAR(4) NOT NULL,
    "quantity" DECIMAL(38,18),
    "unit" VARCHAR(32) NOT NULL,
    "cost" DECIMAL(38,18),
    "value" DECIMAL(38,18) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "manual_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_portfolios_owner_id_name_key" ON "stock_portfolios"("owner_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "stock_portfolios_owner_id_id_quote_currency_key" ON "stock_portfolios"("owner_id", "id", "quote_currency");

-- CreateIndex
CREATE INDEX "stock_trades_owner_id_portfolio_id_symbol_occurred_at_creat_idx" ON "stock_trades"("owner_id", "portfolio_id", "symbol", "occurred_at", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "manual_assets_owner_id_name_key" ON "manual_assets"("owner_id", "name");

-- AddForeignKey
ALTER TABLE "stock_portfolios" ADD CONSTRAINT "stock_portfolios_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_trades" ADD CONSTRAINT "stock_trades_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_trades" ADD CONSTRAINT "stock_trades_owner_id_portfolio_id_quote_currency_fkey" FOREIGN KEY ("owner_id", "portfolio_id", "quote_currency") REFERENCES "stock_portfolios"("owner_id", "id", "quote_currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_trades" ADD CONSTRAINT "stock_trades_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "stock_instruments"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_holdings" ADD CONSTRAINT "stock_holdings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_holdings" ADD CONSTRAINT "stock_holdings_owner_id_portfolio_id_quote_currency_fkey" FOREIGN KEY ("owner_id", "portfolio_id", "quote_currency") REFERENCES "stock_portfolios"("owner_id", "id", "quote_currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_holdings" ADD CONSTRAINT "stock_holdings_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "stock_instruments"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_assets" ADD CONSTRAINT "manual_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- USD ledger/currency/valuation boundaries; owner reassignment is forbidden.
ALTER TABLE stock_portfolios ADD CONSTRAINT stock_quote CHECK (quote_currency='USD');
ALTER TABLE stock_instruments ADD CONSTRAINT instrument_identity CHECK(currency='USD' AND kind IN ('STOCK','ETF'));
ALTER TABLE stock_trades ADD CONSTRAINT stock_trade_rules CHECK(quote_currency='USD' AND quantity>0 AND price>0 AND fee>=0 AND gross>=0 AND cost_removed>=0 AND ((voided_at IS NULL)=(void_reason IS NULL)));
ALTER TABLE stock_holdings ADD CONSTRAINT stock_holding_rules CHECK(quote_currency='USD' AND quantity>=0 AND total_cost>=0 AND (quantity<>0 OR total_cost=0));
ALTER TABLE manual_assets ADD CONSTRAINT manual_asset_rules CHECK(currency IN ('THB','USD','USDT') AND type IN ('GOLD','PROPERTY','OTHER') AND value>=0 AND (cost IS NULL OR cost>=0) AND (quantity IS NULL OR quantity>=0) AND version>0 AND (currency<>'THB' OR (value=round(value,2) AND (cost IS NULL OR cost=round(cost,2)))));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['stock_portfolios','stock_trades','stock_holdings','manual_assets'] LOOP EXECUTE format('CREATE TRIGGER preserve_owner BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION tracker_preserve_owner()',t); END LOOP; END $$;
INSERT INTO stock_instruments(symbol,name,kind,currency) VALUES ('AAPL','Apple Inc.','STOCK','USD'),('MSFT','Microsoft Corporation','STOCK','USD'),('NVDA','NVIDIA Corporation','STOCK','USD'),('AMZN','Amazon.com Inc.','STOCK','USD'),('GOOGL','Alphabet Class A','STOCK','USD'),('TSLA','Tesla Inc.','STOCK','USD'),('SPY','SPDR S&P 500 ETF Trust','ETF','USD'),('QQQ','Invesco QQQ Trust','ETF','USD');
-- Preserve all existing privacy operator/archive checks; include new owner datasets.
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
