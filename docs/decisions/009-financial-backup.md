# 009: Tracker financial backup and restore

## Scope

This is a local tracker feature, not a full PostgreSQL disaster-recovery system.
ADR-002 and the legacy migration acceptance document remain unchanged. This
format supports only new `USER_ENTERED` tracker data; legacy export/import is a
separate feature. No legacy DEMO data is promoted into regular records.

The authenticated owner can download a version-1 JSON snapshot containing
categories, THB income/expense history, monthly budgets, USDT crypto portfolios
and trades. Cancelled records, cancellation reasons and their historical trade
accounting are retained. Active trade accounting and holdings are checked against
replay before export. Prices and projections are not exported as independent
authority. Stocks are a watchlist, not holdings, and are outside this format.

Auth users, credentials, sessions, tokens, server settings, audit events,
idempotency receipts and legacy archives are excluded through a strict whitelist.
Free-text notes are included and may contain information the user typed: the
download is private financial data, unencrypted, and must be stored privately.
The application does not upload it to a third-party service or log its contents.

## Format and validation

Shared strict Zod contracts reject unknown fields, unsupported versions or
provenance, financial JSON numbers, invalid decimal scale/range, duplicate source
IDs, broken references, mismatched category types and incomplete cancellation
metadata. Finance supplies all decimal validation and arithmetic; THB and USDT
remain separate, with no FX or combined cross-currency total.

The complete file is limited to 2 MiB and a combined 2,000 records across all five
sections, including cancelled history; no silent truncation or partial export.
At most 128 distinct crypto symbols are allowed. Exceeding a limit is an explicit
error. This release does not provide large-account/chunked backup support.

The SHA-256 preview digest identifies the parsed, validated document, not raw file
bytes, a signature or proof of identity. A modified file can acquire a new digest;
the owner must select a trusted personal backup and inspect its preview. A strict
format cannot establish that someone actually owned the source history.

## Preview and restore

`GET /api/backup`, `POST /api/backup/preview` and `POST /api/backup/restore` require
database-session ownership. POST requires the exact application Origin; responses
are `no-store`. Browser requests stay on the application's origin. Larger body
parsing occurs after authorization and is restricted to the two backup routes.

Preview writes nothing. It shows record and cancellation counts, per-month THB
income/expense/balance, and quantity/cost/realized P&L per USDT portfolio/asset.
Replay rejects oversells, accounting discrepancies and aggregate decimal overflow.
The user must explicitly consent; restore must carry the same preview digest.

Restore supports only a destination owner with all six business tables empty
(categories, finance transactions, budgets, portfolios, trades, holdings).
Cancelled records also make the destination nonempty. Existing Auth/account,
audit and receipt records do not. There is no merge, overwrite, destructive
rollback, account recovery or automatic database reset. Users with existing
records can still export and preview; a separately prepared empty destination is
required to restore. An empty financial document is valid and creates no ledger
rows. No automatic migration from localStorage takes place.

Source IDs are remapped to new owner-scoped IDs; references and trade tie order
(date, original creation timestamp, source ID) are preserved. Two otherwise
identical rows with different IDs remain two rows. Cancellation evidence is
retained; active accounting and holdings are rebuilt using Finance replay.
Counts and accounting totals are read back and compared inside the same
transaction before committing. The preview does not promise the target will stay
empty: eligibility is checked again under the transaction lock.

All regular mutations acquire a shared owner-dataset advisory lock before their
existing request/scope locks. Restore acquires its exclusive counterpart before
checking emptiness and writing. Ordinary independent portfolios keep concurrent
access; restore serializes against writes to the same owner. PostgreSQL lock
timeout remains 3 seconds. Category/portfolio/trade changes, projection, receipt
and audit commit or roll back together.

Idempotency scope is owner + `backup.restore` + key, independent of session.
The request hash covers the validated document digest and explicit consent.
Same key/payload returns its original receipt even after the target becomes
nonempty; changed payload conflicts. Two different keys cannot restore two copies.
Cancelled source rows never become active on retry.

Timeout after submission has an unknown outcome. The UI freezes the request and
key and offers a retry of that exact request, disabling navigation/other writes.
It does not claim rollback from a missing response. Pending state is in memory;
after closing/reloading, inspect the destination before issuing a new request.
A successful receipt verifies counts/totals, not the browser's ability to save a
file to disk. Check Downloads after requesting export.

## Verification and limits

Unit/UI suites cover strict format, duplicate rows, Decimal replay, preview,
consent and lost-response retry. They are not PostgreSQL runtime evidence.
The compiled synthetic acceptance runner additionally tests real PostgreSQL
round-trip, maximum values, fractional BTC, cancellations, isolated costs,
owner/Origin protection, nonempty refusal, same/different-key concurrent requests,
real database-trigger failure with complete rollback, and structured SQLSTATE
55P03 followed by successful retry after release. Fixtures pace registration to
respect Better Auth's installed three-sign-ups-per-ten-seconds rule; no limiter
or assertion is disabled.

After building, run the existing guarded acceptance runner with a newly named
`compose.tracker.test.yaml` project and ignored synthetic `.env.tracker.acceptance`:

```powershell
docker compose -p <new-synthetic-project> --env-file .env.tracker.acceptance -f compose.tracker.test.yaml up -d --wait
node --no-strip-types --env-file=.env.tracker.acceptance scripts/tracker-acceptance.mjs
docker compose -p <same-project> --env-file .env.tracker.acceptance -f compose.tracker.test.yaml stop postgres-tracker-acceptance
```

The runner rejects a nonempty schema before migrations. Never reset an existing
database or delete volumes to rerun. Ensure loopback port 5437 is free, preserve
failed-run evidence, and stop only this test project's container after testing.
The five existing forward migrations are not modified by this feature.

Production database backups, encrypted storage, retention/deletion policy,
account recovery, large-scale imports, merge/dedupe across backup files and
legacy restore remain separate work. This feature is not approval to deploy.
