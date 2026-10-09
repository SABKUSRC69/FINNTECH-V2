# FINNTECH: implement a real-use release

The owner's updated goal is a public website with real individual accounts and persistent personal finance data. This replaces the previous synthetic-only product objective. Build the real-use release, not another DEMO or a cosmetic relabeling. The budget remains zero unless the owner explicitly changes it. Your role is implementation; deliver concrete reviewed code, tests and operating instructions before public activation.

Repository: `C:\Users\Admin\Downloads\FINNTECH`.

Read applicable repository instructions and inspect the current working tree. Read `docs/acceptance/demo-cloud-deploy-20261008.md`, `demo-independent-review-20261008.md`, `demo-review-fix-20261008.md`, the latest relevant acceptance evidence, `docs/operations/demo-access.md`, `beta-deploy.md`, `data-retention-deletion.md`, the backup/recovery documents, and `docs/decisions/010-account-recovery.md`. Historical status paragraphs may be obsolete: reconcile them with current source and evidence. Do not report old test counts as new results.

## Product behavior

- Each person registers their own account, verifies the chosen identity channel, logs in and accesses only their own records. No common password, shared owner, browser-generated anonymous workspace or four-hour DEMO workspace lifetime in the real-use flow.
- Start real accounts with empty ledgers and portfolios. Do not insert fictional income, holdings or balances. Saved records survive logout, browser changes, ordinary session expiry, restart and redeployment. Sessions must still expire and remain revocable; persistent data does not mean permanent login.
- Keep the current manual tracker scope: THB income/expenses/budgets/cash, USDT crypto cost/history/P&L and explicitly labeled reference valuation. Do not add trade execution, deposits, withdrawals or invented market history.
- Preserve server-derived ownership, Decimal strings, currency separation, audit/idempotency, original payload/key retries, navigation locks and market stale/unavailable behavior. Keep existing functionality and defer the large visual redesign.

## 1. Review the prepared fix and establish a real-use boundary

Independently review the prepared DEMO reconciliation fix and its regressions. Reuse the corrected reconciliation behavior where appropriate for real login/logout. Preserve the dirty/untracked owner checkout and use an isolated release checkout when needed.

Add an explicit, fail-closed real-use runtime/configuration path. Current listener/auth configuration accepts `cloud-beta`, requires synthetic data and recovery off, and hardcodes the Beta database/role. Do not bypass this by lying about data mode or deleting safety guards. Keep local and synthetic rehearsal modes intact. Validate HTTPS origin, provider listener PORT, exact selected database target, TLS, secrets and required services for the new mode.

Use a separate real-use database and credentials; do not repurpose or promote the existing DEMO/Beta database, fixture users, seeded records or recovery enrollments. Never silently migrate existing accounts. Any requested future migration needs its own mapping, consent, backup and verification plan.

## 2. Real account verification and recovery

Implement and test production-capable account verification and password recovery using existing Better Auth and the proven atomic reset/session-revocation design. The current `LocalSyntheticSink`, example.invalid-only queue and loopback-only recovery configuration are test infrastructure, not real delivery. Preserve them and implement a distinct tested delivery integration.

Select a genuinely free delivery option supported by the chosen host. Verify current official limits and sender/domain requirements. Do not assume arbitrary recipients can receive email from an unverified sender or that a paid domain is available. On Render Free, SMTP ports 25/465/587 are blocked; an appropriate HTTPS API integration may be necessary. If the zero-cost requirement prevents real delivery, report the exact prerequisite and prepare all independent work; do not enable fake recovery or an unauthenticated administrator password override.

Test genuine delivery to owner-controlled test mailboxes, browser verification/reset, token expiry/replay, link scanners, enumeration resistance, lost responses, transaction rollback, provider failure/retry/restart, rate limits, and immediate HTTP/new-WS rejection plus existing-WS revocation after reset. Handle unverified accounts and delivery failures without deleting or prematurely enabling accounts. Never log reset links, passwords, tokens, request bodies or mailbox contents.

## 3. Data durability and lifecycle

Provide encrypted full database backups stored outside the web service, with a working schedule, independently recoverable key custody, finite retention, failure alerts and a full restore drill into an isolated target. Set and document initial recovery objectives appropriate to a small service; verify what actually runs. A dump listing, user JSON export or provider restore window alone does not close this requirement.

Verify browser-saved JSON export and preview/consent restore into an empty owned account, using synthetic acceptance data. Protect audit receipts and ledger semantics. Define a practical owner-verified data/account deletion process, including treatment of sessions, recovery challenges and backups. A documented controlled operator process is acceptable initially if it genuinely works; do not promise unsupported immediate deletion from every backup. Never delete owner data as an acceptance experiment. Publish concise Thai privacy/data handling and service limitation text matching actual behavior, without claiming legal certification.

## 4. Security and operation on a zero-cost budget

Audit the final deployed runtime dependency inventory, separately from CLI/build/legacy findings, and document reachability and remediation. The prior dependency-tree audit's five high package findings are not proof of five reachable server vulnerabilities. Do not blindly downgrade Prisma or run `npm audit fix --force`. Re-test targeted dependency changes.

Check anonymous denial, foreign-owner reads/mutations/export, exact Origin, HTTPS/Secure cookies, CSRF, headers, session revocation, secrets and logs. Bound request parsing/time, authentication/recovery abuse and database growth; test against the chosen proxy topology. Add useful health/readiness and operator alerts without leaking private data.

Verify current free hosting/database/mail/backup quotas and commercial-use terms from official sources. Do not create paid services, card trials, purchased domains or hidden recurring costs. Render's current Free documentation explicitly discourages production, describes idle spin-down, ephemeral disk and quotas. Do not certify it as always-on production or evade its idle policy with artificial keep-alive traffic. Evaluate a compatible free alternative if necessary; document any availability tradeoff and owner input actually needed. Do not pretend zero cost guarantees unlimited capacity or uptime.

Prepare safe migrations, application rollback, quota/exhaustion handling, paused-registration behavior, incident and secret-rotation instructions. Retain data when pausing service. Identify exact selected resources only after discovery; never invent provider/project IDs or expose credentials in chat. Credentials should be entered through private provider secret stores.

## 5. Acceptance and release handoff

Implement and verify the independent work rather than stopping at a plan. Ask only for genuinely missing provider/account/domain/policy inputs, while continuing unrelated work. Use synthetic acceptance data throughout testing; real customer data is admitted only after the release gates pass.

Run the appropriate full existing tests/typecheck/build/package smoke, real isolated PostgreSQL integration tests, and actual staging HTTPS/WSS/browser acceptance. Test two independent browser profiles/devices, finance/crypto/cash corrections, identical-payload/key retry during network loss, export/restore, login after session expiry, restart/redeploy/cold wake, and persistence on the chosen topology. Record exact release/source/image identity, commands and exit codes; distinguish PASS, FAIL, NOT TESTED and BLOCKED. Never replace transport/production evidence with local component tests.

Deliver an incremental patch, a Thai-readable readiness report, evidence without private records, free-plan/prerequisite inventory and concrete deployment/backup/recovery/rollback instructions. Identify any remaining launch blockers plainly. Prepare a reviewable release before requesting the final public-activation decision. Do not commit/push/deploy, enable public real-data signup, alter the current cloud database or activate recovery on existing accounts in this implementation task without explicit authorization for that concrete release.

The release is complete only when users can create separate verified accounts, recover access, retain and export their own data, and the actual operating setup has passed acceptance. Changing labels or enabling registrations in the old synthetic Beta is not completion.

Official hosting reference checked 8 October 2026: https://render.com/docs/free . Recheck current terms before selecting/provisioning any deployment target.
