# Shared-code DEMO access

DEMO creates a separate synthetic Better Auth user, session and tracker owner for each browser request cookie. It never signs visitors into an owner account. Better Auth **1.7.7** and its existing **@better-auth/core 1.7.7** create the user/session; the latter is now explicitly declared as a direct dependency to use its exported transaction-context helper. No new password store, anonymous plugin endpoint, account linking, paid resource, or dependency version upgrade is introduced.

## Owner setup in Render

Keep the current `TRACKER_BETA_REGISTRATIONS_OPEN` value unchanged (currently `false`), `TRACKER_BETA_DATA_MODE=synthetic` and `TRACKER_RECOVERY_MODE=off`.

In Render → **finntech-beta → Environment → Edit** set:

| Server variable | Value / purpose |
| --- | --- |
| `FINNTECH_DEMO_ENABLED` | `true` to permit entry; `false` disables prepare/entry/reset |
| `FINNTECH_DEMO_ACCESS_CODE` | Owner-entered secret, 12–128 characters; prefer at least 16 random characters |
| `FINNTECH_DEMO_ACCOUNT_LIMIT` | `100` by default, allowed 1–5000; total retained demo workspaces, not concurrent users |
| `FINNTECH_DEMO_SESSION_SECONDS` | `14400` (four hours) by default; allowed 60–86400 |
| `FINNTECH_DEMO_SESSION_EPOCH` | `1` initially; 1–64 letters/digits/`.`/`_`/`-` |

Enter the code directly in Render's secret store. Do not paste it into chat, source, `.env.example`, a VITE variable, a URL, screenshot, release artifact or logs. Use **Save only** until the verified release and additive migration are ready. Never select a paid plan. Code changes take effect after restart/deploy.

## Deployment sequence

1. Prepare/verify the release in an isolated checkout. Preserve the owner's original dirty/untracked checkout. Review the incremental patch and actual test report.
2. Before changing the **existing** Beta DB, take a private PostgreSQL 18-compatible `pg_dump` backup and verify its archive with `pg_restore --list`. Keep auth data/secrets/private backup outside release files and never print or publish it. Do not use the old fresh-database-only migration helper: it intentionally refuses a nonempty database.
3. Verify the selected direct Neon target remains `beta_app` / `finntech_beta` / the configured exact host with `sslmode=verify-full`. Run Prisma `migrate deploy` for the reviewed release. Migration `20261008000000_demo_workspaces` only adds the receipt table and foreign key/indexes. It does not rewrite existing accounts or finance rows. The new runtime requires that table even when demo entry is disabled. Never reset/drop/truncate.
4. Set the owner secret as above and deploy the verified release with `Dockerfile.beta`. Same origin, health `/api/ready`, Free instance, existing deployment target.
5. Verify real HTTPS health/readiness, login, correct/incorrect demo code, Secure cookies, separate sessions/data, retry, logout, expiry and WSS before announcing entry. Local harness Secure-cookie assertions are not proof of transport over public HTTPS.

## Browser behavior and retry

Select **ทดลองใช้งาน** and enter the common code. The server prepares an HttpOnly, signed, SameSite=Strict request cookie before entry. It is a browser capability for one request receipt, not a client owner ID. No code or generated credential is persisted in frontend storage. The code remains only in form memory while an unknown entry outcome is reconciled; reload requires entering the code again and the retained request cookie resumes the original receipt. A normal returning browser with a valid session needs no new code.

One transaction holds a database advisory lock for the creation ceiling/replay, binds Better Auth's exported `runWithAdapter` to the transaction, creates the authentic user/session, maps a fresh VERIFIED tracker owner and seeds only labeled fictional data: THB income/category records and an empty USDT portfolio. No password-based account or recovery enrollment is created. No USD/USDT/THB conversion, generated P&L or market-history chart is added. Ledger and market freshness rules are unchanged.

After a lost entry response, use **ตรวจผลคำขอ DEMO เดิม**. It keeps the same code and signed request cookie. It reissues the original session cookie and does not create a second user/session or extend the workspace lifetime. Parallel requests and runtime recreation use the durable receipt. Definite failures permit correction; unknown entry outcomes lock mode changes and fresh workspace actions.

Logout uses Better Auth's existing sign-out. The receipt cannot resurrect a logged-out or expired session. **ออกและเริ่มพื้นที่ทดลองใหม่** in the account page obeys the existing tracker navigation locks, confirms logout, resets only that browser's request cookie, and requires code entry again. **เริ่มพื้นที่ทดลองใหม่** on the entry form has the same effect after logout/expiration. It does not delete any old dataset. Tabs in one browser share cookies; use distinct browser profiles for independent workspaces.

## Disable, rotate and revoke

- `FINNTECH_DEMO_ENABLED=false`: rejects new entry/reset/prepare. Existing unexpired sessions survive, preserving their access to their own records/backup/logout. Keep the epoch/configuration present.
- Change only `FINNTECH_DEMO_ACCESS_CODE`: old code stops admitting/replaying entries. Existing valid sessions survive until logout, expiry or revocation. Demo entry does not depend on public signup.
- Change `FINNTECH_DEMO_SESSION_EPOCH` and restart/deploy: invalidates all **previous demo** workspaces on HTTP owner checks and `get-session`, and closes existing WS connections on the existing five-second revalidation cycle. Normal accounts are unaffected. Request receipts for the old epoch cannot resurrect a session.
- Removing the demo configuration denies existing demo subjects; retaining explicit disabled config is the supported way to stop only entry. Never rotate `BETTER_AUTH_SECRET` merely to revoke demos: that also affects normal accounts.

The fixed workspace expiry is checked independently of Better Auth session refresh. Rate limiting allows **30 total demo requests per minute per process**, including preparation/reset, with no trust in `X-Forwarded-For`. Bodies are limited to 1024 bytes and five seconds before Better Auth parsing. The database-wide lifetime account ceiling survives restarts and concurrent workers. The in-memory rate counter resets on restart and is not a distributed limiter; this deployment remains one Render instance.

## Retention

No scheduled database cleanup is implemented. Retained workspaces count toward the ceiling even after expiry/logout. Expired records are not a way to access somebody else's workspace, nor a recovery credential. When the ceiling is reached, entry returns 429. Review a retention/export/deletion plan before deleting any workspace; otherwise increase the bounded ceiling deliberately or keep entry disabled. Fresh mode preserves the previous data and cannot delete another user's records.

## Local verification

`node scripts/demo-test-prepare.mjs` writes only a synthetic fixture credential under `.demo-20261008.local/`. Start `docker compose --env-file .demo-20261008.local/test.env -f compose.demo-test.yaml up -d --pull never --wait postgres-demo-test`. Build the API, then run `node --env-file=.demo-20261008.local/test.env scripts/demo-test.mjs`. The runner verifies exact loopback PostgreSQL database/role/port 5443 and applies forward migrations without clearing retained data. Tests generate their own codes/normal accounts; never use the owner's shared code.

Stop only `postgres-demo-test` with the same Compose project after verification. Preserve the volume; do not run `down -v`, reset or cleanup against owner resources.
