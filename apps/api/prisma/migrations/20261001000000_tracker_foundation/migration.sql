-- Generated from schema.prisma, then wrapped for atomic DDL.
BEGIN;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "IdentityState" AS ENUM ('UNVERIFIED', 'FIXTURE', 'VERIFIED');

-- CreateEnum
CREATE TYPE "FinanceType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "Provenance" AS ENUM ('USER_ENTERED', 'LEGACY_DEMO');

-- CreateEnum
CREATE TYPE "ProjectionState" AS ENUM ('NOT_BUILT', 'READY');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('COMMITTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('COMPLETED', 'REVERSED');

-- CreateEnum
CREATE TYPE "LegacySection" AS ENUM ('TRANSACTIONS', 'PORTFOLIO', 'PAPER_WALLET', 'PAPER_OPEN_ORDERS', 'PAPER_TRADE_HISTORY', 'PAPER_CANCELLED_ORDER_IDS', 'PRICE_ALERTS');

-- CreateTable
CREATE TABLE "tracker_users" (
    "id" UUID NOT NULL,
    "identity_state" "IdentityState" NOT NULL DEFAULT 'UNVERIFIED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracker_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "subject" VARCHAR(191) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_categories" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "type" "FinanceType" NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_transactions" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "category_id" UUID,
    "type" "FinanceType" NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" VARCHAR(4) NOT NULL DEFAULT 'THB',
    "provenance" "Provenance" NOT NULL DEFAULT 'USER_ENTERED',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "category_type" "FinanceType" NOT NULL DEFAULT 'EXPENSE',
    "month" DATE NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" VARCHAR(4) NOT NULL DEFAULT 'THB',

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_portfolios" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "quote_currency" VARCHAR(4) NOT NULL DEFAULT 'USDT',

    CONSTRAINT "crypto_portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_assets" (
    "id" UUID NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "name" VARCHAR(100),

    CONSTRAINT "crypto_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_trades" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "quote_currency" VARCHAR(4) NOT NULL DEFAULT 'USDT',
    "side" "TradeSide" NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "fee" DECIMAL(38,18) NOT NULL,
    "gross" DECIMAL(38,18),
    "cost_removed" DECIMAL(38,18),
    "realized_pnl" DECIMAL(38,18),
    "provenance" "Provenance" NOT NULL DEFAULT 'USER_ENTERED',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crypto_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_holdings" (
    "owner_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "quote_currency" VARCHAR(4) NOT NULL DEFAULT 'USDT',
    "quantity" DECIMAL(38,18) NOT NULL,
    "total_cost" DECIMAL(38,18),
    "realized_pnl" DECIMAL(38,18),
    "state" "ProjectionState" NOT NULL DEFAULT 'NOT_BUILT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "last_trade_id" UUID,

    CONSTRAINT "portfolio_holdings_pkey" PRIMARY KEY ("owner_id","portfolio_id","asset_id","quote_currency")
);

-- CreateTable
CREATE TABLE "source_dataset_namespaces" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,

    CONSTRAINT "source_dataset_namespaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_imports" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "namespace_id" UUID NOT NULL,
    "file_sha256" CHAR(64) NOT NULL,
    "source_origin" VARCHAR(255),
    "exported_at" TIMESTAMPTZ(3),
    "imported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consented_at" TIMESTAMPTZ(3) NOT NULL,
    "selected_sections" "LegacySection"[],
    "currency_override" VARCHAR(4),
    "provenance" "Provenance" NOT NULL DEFAULT 'LEGACY_DEMO',
    "status" "ImportStatus" NOT NULL DEFAULT 'COMMITTED',
    "receipt" JSONB NOT NULL,
    "reversed_at" TIMESTAMPTZ(3),
    "reversal_reason" VARCHAR(500),

    CONSTRAINT "legacy_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_import_rows" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "namespace_id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "file_sha256" CHAR(64) NOT NULL,
    "section" "LegacySection" NOT NULL,
    "source_row_id" VARCHAR(191),
    "ordinal" INTEGER NOT NULL,
    "payload_sha256" CHAR(64) NOT NULL,
    "source_payload" JSONB NOT NULL,
    "currency_override" VARCHAR(4),
    "cost_basis" DECIMAL(38,18),
    "unknown_reason" VARCHAR(500),
    "provenance" "Provenance" NOT NULL DEFAULT 'LEGACY_DEMO',

    CONSTRAINT "legacy_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_demo_summaries" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "summary_key" VARCHAR(100) NOT NULL,
    "row_count" INTEGER NOT NULL,
    "thb_total" DECIMAL(20,2),
    "usdt_total" DECIMAL(38,18),
    "provenance" "Provenance" NOT NULL DEFAULT 'LEGACY_DEMO',

    CONSTRAINT "legacy_demo_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "endpoint" VARCHAR(128) NOT NULL,
    "key" VARCHAR(191) NOT NULL,
    "request_sha256" CHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'COMPLETED',
    "receipt" JSONB NOT NULL,
    "legacy_import_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "actor_identity_id" UUID,
    "idempotency_id" UUID,
    "request_id" VARCHAR(191) NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_subject_key" ON "auth_identities"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_owner_id_id_key" ON "auth_identities"("owner_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_owner_id_id_type_key" ON "finance_categories"("owner_id", "id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_owner_id_type_name_key" ON "finance_categories"("owner_id", "type", "name");

-- CreateIndex
CREATE INDEX "finance_transactions_owner_id_occurred_at_idx" ON "finance_transactions"("owner_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_owner_id_category_id_month_key" ON "budgets"("owner_id", "category_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_portfolios_owner_id_name_key" ON "crypto_portfolios"("owner_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_portfolios_owner_id_id_quote_currency_key" ON "crypto_portfolios"("owner_id", "id", "quote_currency");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_assets_symbol_key" ON "crypto_assets"("symbol");

-- CreateIndex
CREATE INDEX "crypto_trades_owner_id_portfolio_id_asset_id_quote_currency_idx" ON "crypto_trades"("owner_id", "portfolio_id", "asset_id", "quote_currency", "occurred_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_trades_owner_id_portfolio_id_asset_id_quote_currency_key" ON "crypto_trades"("owner_id", "portfolio_id", "asset_id", "quote_currency", "id");

-- CreateIndex
CREATE UNIQUE INDEX "source_dataset_namespaces_owner_id_id_key" ON "source_dataset_namespaces"("owner_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_imports_owner_id_id_key" ON "legacy_imports"("owner_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_imports_owner_id_namespace_id_file_sha256_id_key" ON "legacy_imports"("owner_id", "namespace_id", "file_sha256", "id");

-- CreateIndex
CREATE INDEX "legacy_import_rows_owner_id_import_id_idx" ON "legacy_import_rows"("owner_id", "import_id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_demo_summaries_owner_id_import_id_summary_key_key" ON "legacy_demo_summaries"("owner_id", "import_id", "summary_key");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_owner_id_endpoint_key_key" ON "idempotency_keys"("owner_id", "endpoint", "key");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_owner_id_id_key" ON "idempotency_keys"("owner_id", "id");

-- CreateIndex
CREATE INDEX "audit_events_owner_id_created_at_idx" ON "audit_events"("owner_id", "created_at");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_owner_id_category_id_type_fkey" FOREIGN KEY ("owner_id", "category_id", "type") REFERENCES "finance_categories"("owner_id", "id", "type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_owner_id_category_id_category_type_fkey" FOREIGN KEY ("owner_id", "category_id", "category_type") REFERENCES "finance_categories"("owner_id", "id", "type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_portfolios" ADD CONSTRAINT "crypto_portfolios_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_trades" ADD CONSTRAINT "crypto_trades_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_trades" ADD CONSTRAINT "crypto_trades_owner_id_portfolio_id_quote_currency_fkey" FOREIGN KEY ("owner_id", "portfolio_id", "quote_currency") REFERENCES "crypto_portfolios"("owner_id", "id", "quote_currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_trades" ADD CONSTRAINT "crypto_trades_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "crypto_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_owner_id_portfolio_id_quote_currency_fkey" FOREIGN KEY ("owner_id", "portfolio_id", "quote_currency") REFERENCES "crypto_portfolios"("owner_id", "id", "quote_currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "crypto_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_owner_id_portfolio_id_asset_id_quote_cu_fkey" FOREIGN KEY ("owner_id", "portfolio_id", "asset_id", "quote_currency", "last_trade_id") REFERENCES "crypto_trades"("owner_id", "portfolio_id", "asset_id", "quote_currency", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_dataset_namespaces" ADD CONSTRAINT "source_dataset_namespaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_imports" ADD CONSTRAINT "legacy_imports_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_imports" ADD CONSTRAINT "legacy_imports_owner_id_namespace_id_fkey" FOREIGN KEY ("owner_id", "namespace_id") REFERENCES "source_dataset_namespaces"("owner_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_import_rows" ADD CONSTRAINT "legacy_import_rows_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_import_rows" ADD CONSTRAINT "legacy_import_rows_owner_id_namespace_id_fkey" FOREIGN KEY ("owner_id", "namespace_id") REFERENCES "source_dataset_namespaces"("owner_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_import_rows" ADD CONSTRAINT "legacy_import_rows_owner_id_namespace_id_file_sha256_impor_fkey" FOREIGN KEY ("owner_id", "namespace_id", "file_sha256", "import_id") REFERENCES "legacy_imports"("owner_id", "namespace_id", "file_sha256", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_demo_summaries" ADD CONSTRAINT "legacy_demo_summaries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_demo_summaries" ADD CONSTRAINT "legacy_demo_summaries_owner_id_import_id_fkey" FOREIGN KEY ("owner_id", "import_id") REFERENCES "legacy_imports"("owner_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_owner_id_legacy_import_id_fkey" FOREIGN KEY ("owner_id", "legacy_import_id") REFERENCES "legacy_imports"("owner_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tracker_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_owner_id_actor_identity_id_fkey" FOREIGN KEY ("owner_id", "actor_identity_id") REFERENCES "auth_identities"("owner_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_owner_id_idempotency_id_fkey" FOREIGN KEY ("owner_id", "idempotency_id") REFERENCES "idempotency_keys"("owner_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
