# History corrections for the local tracker

Date: 2026-10-04. The owner authorized the next increment after the completeness audit.
Scope: correct or cancel user-entered THB transactions and USDT crypto history. No stock
holdings, importer, execution, FX, new dependencies or changes to the old application.

## Preservation and accounting

Forward migration `20261004000001_history_corrections` adds nullable `voided_at` and
`void_reason` to both history tables. Existing four migrations remain unchanged.
SQL requires the timestamp/reason together and a nonempty reason. Existing rows remain
active with both columns NULL; no reset, deletion or automatic legacy migration.

Corrections never overwrite original financial input. A replacement creates a new ID
and cancels the original; cancellation alone retains the original without a replacement.
Both versions remain visible to their owner. Cancelled transactions are excluded from
income, expense and budget spending. Cancelled trades are excluded from ledger replay;
their historical accounting fields are evidence, not current realized P&L.

POST `/api/finance/transactions/:id/corrections` and
`/api/crypto/trades/:id/corrections` accept `{action:'void', reason}` or
`{action:'replace', reason, entry}`. Shared strict contracts validate decimal strings,
dates and scope. Finance replacement accepts the ordinary finance entry fields. Crypto
replacement accepts side, quantity, price, fee, quoteCurrency=USDT and date; portfolio
and asset remain immutable. Correcting the wrong asset/portfolio requires cancellation
and a separate new record; bulk dependent-history correction is not available.

## Ownership, concurrency and retry

Existing database session ownership and exact Origin checks protect both endpoints.
Finance corrections lock the owned original row; crypto corrections lock the owned
portfolio before re-reading the original and replaying the active asset scope. A stale
original already cancelled by another operation yields409 `RECORD_ALREADY_CORRECTED`.
Replacement trades retain the original server-created timestamp to preserve same-day
ordering; an explicit date correction changes the calendar ordering. Oversell, range
overflow or storage failure rolls back cancellation, replacement, replay/projection,
audit and idempotency receipt in the same transaction. Empty replay persists zero
quantity/cost/realized P&L and NULL lastTradeId.

Idempotency uses `(owner, endpoint, key)` independently of session. The request hash
includes the original record ID, action, reason and validated replacement. The receipt
links original ID to replacement ID (or NULL) and audit links its actor/request. Same
key/payload returns that receipt even if a later correction cancels the replacement;
it never resurrects a row. Changed payload gives409. After a timeout the UI freezes the
payload/key for same-page retry and does not claim rollback. Pending requests are still
memory-only; after closing/reloading, check history before submitting a new request.

## Verification and local activation

`npm run tracker:typecheck`, `npm run tracker:test`, `npm run tracker:build`,
`node --no-strip-types scripts/tracker-package-smoke.mjs`, `npm test`, `npm run build`.
Tracker tests retain the cold Vite optimization smoke; old root tests are not modified.

Real PostgreSQL acceptance extends `scripts/tracker-acceptance.mjs`: five migrations on
an empty synthetic database, preserved original values, exact totals/budgets and partial
rounding, independent portfolios, foreign owner/Origin rejection, concurrent edits,
duplicate receipt, stale correction conflict, oversell rollback, zero empty projection,
and structured SQLSTATE55P03 with another portfolio and successful callback after release.

Use only `.env.tracker.acceptance` and `compose.tracker.test.yaml`, a freshly named test
Compose project on loopback5437. The runner refuses nonempty public schemas and unexpected
targets; never reset. Stop that project's test service after verification, preserving its
volume. Historical evidence databases and the local UI5436 are not acceptance targets.

For the existing local synthetic UI database, apply only `prisma migrate deploy` after
explicitly verifying loopback5436 / database `finntech_auth_local` / role `ui_fixture` and
the local synthetic confirmation. Do not run the empty-database prepare command again.
Restart the owned dev launcher after migration, then inspect `http://127.0.0.1:4173/`.

Alpaca activation still requires the owner's server-only keys and personal-use confirmation.
No provider account is created and no price is invented if those values are absent.
Production security, backup/restore, stock ledger and legacy importer remain separate work.
