# Local tracker: THB finance, USDT ledger and public quotes

Date: 2026-10-04. Local synthetic-data v1 increment, following ADR-002 and migration acceptance without changing F1.1 history. User authorized continuing the tracker to usable local features with the assistant implementing and reviewing.

## Behavior and boundaries

- Authenticated owners can create income/expense categories, rename them without changing type, record dated THB transactions, inspect a Thai-calendar monthly summary, and set expense-category monthly budgets. Budget updates are explicit last-write-wins; no automatic expense transaction.
- Owners create separate USDT portfolios and manually record crypto purchases/sales. These are history records, never exchange execution. Fees are entered in USDT: purchases add gross+fee to cost, sales calculate gross-fee-costRemoved.
- New transactions/trades are USER_ENTERED only. No legacy table is read into ordinary totals; no original source/localStorage/DEMO credentials are read or migrated. Legacy import, edit/delete history, FX, withdrawals and execution remain unavailable. Retention/deletion is a production gate.
- Dates are strict calendar strings between 1900 and 9999, converted to Bangkok midnight server-side. Monthly boundaries use Bangkok time, not UTC-month filters. Same-date crypto trades follow monotonically increasing server commit timestamps then UUID; backdated inserts replay the complete affected asset scope.
- Every financial page has “ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน”. Mobile forms use text/decimal keyboards rather than JS number conversion.

## Persistence and concurrency

Authenticated session middleware derives the server owner and all reads/writes include it. Strict contracts reject owner overrides, financial JSON numbers, excessive scale/range and unknown fields. Mutations require an exact trusted Origin and UUID Idempotency-Key. Body parsing errors return safe JSON. No credential or driver details reach responses.

Request scope is `(owner, endpoint, key)`. A PostgreSQL transaction advisory lock over that tuple protects receipt lookup and insertion, independent of login session. Validated request JSON is hashed in deterministic schema order. Same key/hash returns the stored receipt, different hash returns409. Receipt, mutation and audit are committed together; no response is interpreted as proof of rollback after network failure. Financial audit references the resolved Better Auth identity where available.

Crypto mutations also acquire FOR UPDATE on the owned portfolio before reading its ledger, in the same transaction. READ COMMITTED after lock acquisition sees the last committed history. Different portfolios and different request keys do not share an owner-wide lock. Every affected trade's accounting fields and holding projection are written atomically; a failed replay/oversell rolls back the inserted trade, projection, receipt and audit. Lock timeout is3seconds; max transaction15seconds. Lock/query/connect failures produce503 with unknown outcome; retry the original key. No isolation predicate or SQLSTATE test is weakened.

The ledger scopes `(owner, portfolio, asset, USDT)`. Decimal arithmetic uses the private precision80/HALF_EVEN Finance facade; Prisma.Decimal is converted only through explicit decimal-string boundary helpers. Product gross is quantized before storage; purchase cost includes stored gross and fee. Partial-sale removal quantizes the high-precision quantity×average then subtracts that stored removal from stored remaining cost. Full sale consumes all remaining cost and ends with quantity/cost zero. Storage/API serialization validates NUMERIC range after quantization, including aggregate overflow; overflow is rejected rather than allowing PostgreSQL rounding or emitting a financial number. Displayed average never enters replay calculations.

No migration is necessary for these operations: all four previously applied migrations remain byte-identical, including category type Restrict FK and ownership constraints. Ledger mutation is internal to authenticated routes; no provider trading endpoint exists.

## Market relay

Initial provider symbol candidates BTCUSDT/ETHUSDT are enabled only after exchangeInfo confirms exact base/quote and TRADING status. Other manually recorded ASCII asset symbols are canonical uppercase and have N/A live valuation; no guessed market mapping. REST ticker responses require matching symbol and a positive plain decimal string. Shared server cache polls at most every15seconds while used, metadata hourly, each call times out at5seconds, failures back off to300seconds. Last validated observations becomeSTALE after30seconds; failed metadata never enables a candidate.

Browser connects only to relative same-origin HTTP and `/ws/market`. WebSocket upgrades require exact Origin and a database session, rechecked every5seconds; stream carries quotes only and rejects client messages. Socket payload/backpressure/handshake limits are bounded. Web polls HTTP every15seconds as fallback and reconnects its socket with exponential backoff. HTTP and WebSocket share one relay instance. Vite proxy respects the same API-port setting for both; compiled serving uses the same HTTP server. Upstream uses public REST; there are no API keys or private provider operations. Received time is local observation time, not an invented exchange trade timestamp.

Primary references: [Binance exchange information](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/general), [public market ticker](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market), [PostgreSQL locks](https://www.postgresql.org/docs/16/explicit-locking.html).

## Synthetic PostgreSQL acceptance

Create `.env.tracker.acceptance` only if absent, keep ignored, and use a fresh synthetic password. Required names:

- `TRACKER_ACCEPTANCE_DB_PASSWORD`: synthetic local value only.
- `DATABASE_URL`: loopback PostgreSQL5437, database `finntech_tracker_acceptance`, role `tracker_acceptance`, synthetic password. Never paste this URL or password into reports.
- `TRACKER_ACCEPTANCE_CONFIRM=synthetic-only`.

```powershell
docker compose --env-file .env.tracker.acceptance -f compose.tracker.test.yaml up -d --wait
npm run tracker:build
node --no-strip-types --env-file=.env.tracker.acceptance scripts/tracker-acceptance.mjs
docker compose --env-file .env.tracker.acceptance -f compose.tracker.test.yaml stop postgres-tracker-acceptance
```

Runner validates fixed loopback target and empty public schema before applying existing migrations. It refuses nonempty DB, never reset/delete. A rerun requires an explicitly named new disposable synthetic Compose project/volume; stop the original first to release5437, keep its volume. This task's second evidence run used `-p finntech-tracker-acceptance-v2`; final compiled-source verification used `-p finntech-tracker-acceptance-final`, each with the matching stop command, preserving all prior evidence. Do not rerun the empty-database acceptance against local UI5436 or historical5434/5435 evidence databases.

Checks use compiled JS with Node type stripping disabled: migrations, actual auth cookies, exact finance sums/budgets, input/Origin/ownership rejection, canonical symbols, isolated cost bases, partial/full sale rounding, backdated rollback, concurrent selling, concurrent duplicate receipts, category Restrict/rename, structured adapter-pg SQLSTATE55P03, another portfolio while locked and callback after release. WebSocket acceptance uses actual HTTP/DB sessions and a deliberately unavailable upstream fixture; unit fixtures are not evidence of provider availability. Browser/provider runtime evidence is reported separately.

## Remaining limits

Local pending requests survive same-page retries only; closing the browser requires checking saved history before re-entry. Import preview/consent/dedupe/legacy reversal UI is not implemented, so no import is advertised. There is no history correction/deletion UI, cursor pagination, distributed rate limiting or production deployment. Auth email verification/reset, HTTPS secure-cookie acceptance, retention policy and dependency advisories remain production work. Minimum Node22.12 requires its own runtime test; this task uses installed Node24.18.0. No secrets/config are exported through VITE variables or client storage.
