# FINNTECH Public Beta — preparation review (2026-10-07)

Status: local preparation PASS; online deployment NOT TESTED / not provisioned. Owner selected Render Free + Neon Free, public signup, fictional financial data only. This supersedes the earlier invitation-only choice. Owner has no connected provider accounts yet. No online URL, Git commit, push, service creation, real database migration or deployment is claimed.

## Implemented

- Explicit cloud-beta runtime binds 0.0.0.0 to validated PORT; local remains loopback. Cloud requires production, exact HTTPS origin, compiled web assets, recovery OFF, synthetic data, scoped Neon host/database/role and verify-full TLS configuration.
- Public signup is server-controlled; registration pause preserves existing login/logout/backup. Optional invited mode gates direct authentication, HTTP and both WebSocket channels. Existing ownership/session/ledger and write payload/idempotency contracts remain intact.
- Added bounded authentication bodies, account/service aggregate rate limits and conservative shared Better Auth buckets. Forwarded IP/host headers are not trusted. These are single-instance limits, not distributed or proven per-client-IP protection.
- Readiness checks database availability separately from liveness; API errors remain JSON. Beta UI clearly restricts fictional data and describes disabled recovery and manual backup. Fixed account capability loss after /api/me 401.
- Linux multi-stage Docker candidate contains compiled tracker and 119 runtime packages; existing dependency versions/lockfile unchanged. Render candidate starts with registrations paused until real online acceptance.
- Fresh-target-only forward migration helper refuses unknown targets and nonempty databases. No reset/drop/truncate/delete operations. Release snapshot uses an explicit allowlist and excludes private env, generated files, dumps and local backup evidence.

## Actual checks

| Command / check | Result | Exit |
|---|---|---:|
| npm test | PASS: 330 tests, 38 files | 0 |
| npm run tracker:test | PASS: 201 tests (finance 21, contracts 13, API 92, web 75); dev ESM smoke stopped its server | 0 |
| npm run tracker:typecheck | PASS after optional response-header typing correction | 0 |
| npm run tracker:build | PASS | 0 |
| npm run build | PASS (legacy only; not cloud target) | 0 |
| node --no-strip-types scripts/tracker-package-smoke.mjs | PASS | 0 |
| npm run tracker:db:validate | PASS | 0 |
| git diff --check | PASS | 0 |
| docker build -f Dockerfile.beta -t finntech-beta:20261007 . | PASS: clean Linux generation/build | 0 |
| node --no-strip-types --import tsx --env-file=.beta-20261007.local/rehearsal.env --test apps/api/db-test/beta.integration.ts | PASS: 6 tests, 0 failures, 0 skipped | 0 |
| Final image: compiled auth/Prisma/signup/owner lookup/SPA/API JSON 404/readiness | PASS: isolated synthetic PostgreSQL | 0 |
| Rehearsal prepare against already populated fixture | PASS: refused, no mutation | 2 (expected) |
| npm audit --omit=dev --json | FAIL: 5 high dependency advisories | 1 |
| npm audit --json | FAIL: 12 high, 2 moderate advisories | 1 |

Dependency audit is not declared clean. Final runtime inventory excludes the identified Prisma CLI/config, deepmerge-ts, mysql2 and source-map-js tooling packages. This is exposure reduction, not evidence that all production vulnerabilities are absent. Earlier npm-prune image attempts retained tooling and were replaced by a tested explicit runtime dependency closure; no blind major dependency change was made.

Initial typechecks failed on view union / test-header typing and were corrected. First root run picked up private baseline copies; copies were renamed to .baseline.txt (original tests/assertions retained). Initial PostgreSQL harness failures concerned Secure cookie prefix and the established Decimal canonical string '0.1', then corrected without changing money behavior. These attempts are recorded separately from final results.

## Isolated PostgreSQL evidence

New fixture: localhost:5442 / finntech_beta_rehearsal_20261007 / beta_fixture; distinct compose project and retained named volume. Seven existing forward migrations applied to its empty database. Synthetic random accounts only.

Verified direct public signup, anonymous denial, forged Origin rejection, owner isolation, concurrent identical payload/key receipt, THB/USDT storage, saved JSON backup parsing/schema/credential scan, restore into empty second owner and receipt reuse after runtime recreation. Invited-mode removal denied HTTP and closed both actual WS channels in 4980 ms. Actual fixture database stop produced readiness 503; restart retained data and recovered readiness. No raw backups or credentials are published.

These tests use local HTTP harnesses with Secure cookie configuration; they do not prove public TLS/WSS. Final Linux image authenticated against the same isolated fixture. The dedicated PostgreSQL service was stopped after testing; its volume remains. No unrelated process or owner database was stopped.

## Release identity

Local image: sha256:3874887d9b87f27debfe8b1d09a547aa20d2557d09168936936b22002244bde0

Allowlisted source snapshot: 130 files; manifest fingerprint 63a7447b7db2a07e78bfc56515c93e29beb0bb50c2c97b44417f3b08e73a9886. Source commit: none (working-tree snapshot, Git provider not connected). Deployment must use this complete snapshot, not old HEAD or an incremental patch applied to an unrelated baseline.

## NOT TESTED / next acceptance

- Render/Neon account creation, selected free plans/regions/quotas and deployment permissions.
- Neon migration on actual selected cloud target, driver/pool/cold connections and provider TLS.
- Real HTTPS login/logout/reload and cookie transport; CSP/assets/deep links; WSS reconnect/session revocation on the public URL.
- Real Render restart/redeploy/15-minute sleep/wake and Neon auto-suspend; cloud data/session retention.
- Public price-provider outage/stale behavior on the target; all broader financial flows on the actual release URL, including USD/budgets/corrections/lost responses.
- Cloud operational encrypted backup/restore, key custody and rollback rehearsal on a separate cloud target.
- No browser online acceptance or screenshots are claimed in this preparation round. No invitations sent.

Owner action required: create/login to Render, Neon and a Git provider through their UI; select Free without payment/card and connect a private release repository. Set credentials exclusively in provider secret stores. Follow docs/operations/beta-deploy.md; do not send passwords, tokens or database URLs in chat. Keep registrations paused until the HTTPS acceptance matrix passes. Recovery remains OFF; fictional Beta is never promoted to real financial storage automatically.

Runbooks: docs/operations/beta-deploy.md and beta-env.example.txt cover start/stop, quota restrictions, migration, backup, pause and compatible-image rollback. Preparation does not certify production readiness or successful deployment.
