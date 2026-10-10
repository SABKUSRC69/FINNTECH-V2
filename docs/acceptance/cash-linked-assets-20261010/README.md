# Cash linkage and held assets — 2026-10-10

## Behavior

- New income/expense entries require the owner's selected THB cash account.
- New stock/ETF and crypto trades require a selected THB cash account and the actual net THB payment or receipt. Buy subtracts cash, sell adds cash. Fees are included in the supplied net cash amount; current FX is not used to reconstruct historical settlement.
- Source records, cash balance/version, and holdings replay commit in one owned, idempotent database transaction. Corrections aggregate reversal and replacement before checking funds. Cross-owner cash links are blocked by composite foreign keys. Insufficient cash rolls back the entire mutation.
- Existing records remain unlinked. Existing cash balances are the opening balances and are not recalculated from historical transactions. A correction of an old unlinked record remains unlinked.
- Export/restore preserves cash links and actual settlement amounts with remapped account IDs. Restored balances are already settled and are not applied again. Restore verifies links and accounting before commit.
- Assets inserts a full-width holdings table immediately below the total/cash cards. Cash, nonzero stock/crypto positions, and recorded manual assets appear with accounts/portfolios, quantities, and THB values. Missing prices/FX stay N/A; purchase cost is not substituted for market value.
- Refresh controls, FX summaries and manual price/FX editing are grouped at the bottom. Existing pricing/freshness/retention policies are preserved. Personal Tiingo prices and derived values remain transient.

## Verification performed

- Release typecheck and production build passed, including Prisma generation. Root mirror typecheck passed before the wording follow-up.
- Migration `20261010040000_link_cash_settlements` applied only nullable linkage columns, composite foreign keys and settlement checks. Seven cash rows, 14 stock trades, nine stock holdings, five crypto trades, 13 finance entries and one active market key were preserved. Cash balances/dates/versions matched before and after; no personal Tiingo caches existed.
- Read-only live UI inspection confirmed all cash/stock/crypto/manual groups, five held rows in the selected account, available cash/total, no alerts, placement immediately after the summary and price controls below cash. Desktop inspection at 1440px confirmed two summary columns, equal-width holdings table and no document overflow. Default 615px also rendered the table.
- Finance, crypto and stock forms showed cash account selection. Stock buy/sell labels distinguished actual THB paid including fees from actual THB received after fees. Editing a preexisting stock record showed the unlinked legacy notice and hid cash settlement fields.
- No fabricated financial records were added. No test suite was added or executed. Provider quotes and derived valuations were not saved in evidence; screenshots mask amounts.

## Releases

- `8687a074a861b183143996179372cba19794b4b7`: cash linkage and holdings layout. Render deploy `dep-db4lm459fdbs73fovk7g` reached live.
- `22c5e5edbc7ecee4d9e2ea0e62a1891693ed55b0`: concise source labels and retryable asset refresh. Final deployment evidence is saved separately after it reaches live.
- Only selected task files were committed in the release checkout on `codex/student-real-use` at `SABKUSRC69/finntech-beta`. The root's unrelated pending work was preserved with a three-way mirror; its shared stock connection labels were retained.

## Using the change

Reload the site. Check opening cash balances under Assets, then choose the cash account when entering each new income/expense or trade. For USD/USDT trades, enter the actual THB net payment/receipt, including fees. A sale is recorded only once through the trade form; do not add the same cash proceeds as a separate income entry.
