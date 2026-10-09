# Finish FINNTECH real-use readiness

Act as the implementation engineer for `C:\Users\Admin\Downloads\FINNTECH`. Complete the remaining work for a limited public release with real individual accounts and persistent personal finance data. The owner wants the system finished before the final visual redesign. Implement and verify the work; do not stop at a plan or another preparation-only report while independent implementation remains possible.

## Existing decisions and baseline

Read applicable repository instructions, current source, and:
- `docs/acceptance/real-use-independent-review-20261008.md`
- `docs/acceptance/real-use-readiness-20261008.md`
- `docs/operations/real-use-setup.md`
- `docs/operations/real-use-backup.md`
- `docs/operations/real-use-data-lifecycle.md`
- `docs/operations/data-retention-deletion.md`

Preserve the dirty/untracked checkout and unrelated changes. Work from the current tracker source, not the old legacy Git HEAD. The previous implementation supplied root 394 / tracker 257 / PostgreSQL 16 tests and a local 27-table restore; the independent review reran 118 focused tests. These are historical results, not new verification.

The budget is zero. The owner accepts free hosting sleep and no SLA, selected Brevo Free for actual delivery testing without an owned domain, and selected Windows scheduled backups, existing Google Drive storage and Gmail alerts. Do not ask these preference questions again. Ask only for concrete missing setup information. No paid plans, card trials, purchased domains or automatic upgrades. Verify actual provider eligibility/quotas and distinguish an accepted availability limitation from a broken function. Do not promise unlimited capacity or continuous availability.

## Complete all six workstreams

1. **Controlled staging enrollment.** Implement a fail-closed way for explicitly allowed owner-controlled test emails to register while general public signup remains closed. Enforce it server-side, including relevant session/recovery boundaries, and keep the allowlist private. Use a separate database and fresh credentials; never promote DEMO accounts or fictional records. Public activation must remain a distinct explicit setting. Prepare a concrete release and target for review before cloud deployment.

2. **Actual verification and password recovery.** Complete the Brevo HTTPS integration and owner setup. Test received verification, reset and password-change notification emails in controlled mailboxes, including inbox/spam, delays, provider rejection, quota exhaustion and retry. API acceptance is not delivery proof. Exercise the browser links end to end, expiry/replay, scanner GET safety, atomic password update, challenge invalidation and HTTP/WS session revocation. Preserve durable job IDs and the provider deduplication window. Never enable fake verification or an administrator password-reset bypass.

3. **Off-device backup and disaster recovery.** Complete Google Drive upload/download, OAuth lifecycle, permissions/quota checks and verification of encrypted archives. Keep the recovery key independently recoverable and separate from backup ciphertext. Demonstrate full restoration from the off-device archive into an isolated target without relying on the original Windows profile. Verify schema, constraints, auth, ownership, ledger, audit and idempotency data. Measure recovery time and recoverable data age; do not call a second local directory a machine-loss drill.

4. **Scheduled backups and independent alerts.** Complete and test the Windows runner, overlap prevention, missed-run handling, bounded retry and secret-safe logging. Prepare task installation with the actual private paths. Implement a watchdog outside both this Windows computer and the sleeping web service. Prove that an offline computer, failed upload, expired authorization or missing receipt causes an alert that reaches the selected Gmail inbox. Verify any scheduler/free-minute limits. Activate schedules only after the concrete setup is validated; do not create duplicate tasks or artificial web keep-alive traffic.

5. **Account deletion and finite retention.** Implement a working owner-verified deletion process; a tested controlled operator workflow is acceptable for the first release. Require recent authentication and explicit owner intent, derive ownership server-side, handle pending writes, revoke sessions/challenges/delivery jobs, and preserve every other owner's data. Review immutable audit/ledger constraints and use a narrowly scoped, reviewed purge path without global trigger disabling or generic database wipes. Retain minimal case evidence and implement restoration handling that prevents previously deleted accounts/data from silently reappearing. Complete local and Drive retention with dry-run inventory, recognized archive IDs/hashes, unrelated-file protection and idempotent retry. Never delete actual user records or existing backups merely to test the feature. Make privacy/export/deletion text match the implemented behavior; do not claim deletion from every historical copy instantly.

6. **Actual deployed release acceptance.** After the concrete staging release and target are approved, deploy with public signup closed and test the exact build over HTTPS/WSS. Cover two independent browser profiles and available devices, empty verified accounts, foreign-owner denial, finance/cash/crypto corrections, Decimal/currency accuracy, network interruption with original payload/key retry, browser-saved export and consented restore, logout/reset/expiry, restart/redeploy/cold wake and persistence. Verify readiness, cookie/Origin/proxy behavior, stale market states, service quotas and rollback compatibility. Document unavailable physical-device checks honestly.

## Private setup and implementation rules

Provide one concise private-setup checklist with exact variable names and safe validation commands. Never request API keys, tokens, passwords, database URLs or encryption keys in chat. Use private files/provider secret stores and redact command errors. If inputs are missing, prepare the integration and validation tooling, list the exact missing inputs once, and continue all unrelated implementation. Do not substitute invented resource IDs, fake credentials or placeholders for working setup.

Preserve Better Auth ownership, existing atomic recovery guarantees, Decimal strings, THB/USDT/USD separation, navigation locks, original-request receipts and market freshness. Data must survive session expiry; do not disable expiry to achieve persistence. Keep real accounts empty and separate from DEMO. Do not redesign the site or add trading, deposits, withdrawals or unrelated features.

Reassess dependency findings against the final runtime inventory. The five previous high package findings were absent from the supplied runtime inventory; that does not make the audit pass or prove zero vulnerabilities. Address relevant findings deliberately, keep build-only findings visible and assess the base image as feasible. Do not use `npm audit fix --force`, blindly downgrade Prisma, weaken assertions or increase deadlines to conceal failures.

## Verification and delivery

Run meaningful new regressions, existing full tests/typecheck/build/package smoke, relevant isolated PostgreSQL integration tests, full restore and actual provider/browser checks. Report exact commands, exit codes, release/source/image identities and PASS/FAIL/NOT TESTED/BLOCKED. Never replace external evidence with mocks or add overlapping suite counts together.

Deliver an incremental patch including new files, a Thai-readable readiness report, evidence without private data and tested setup/backup/deletion/incident/rollback instructions. Separate remaining code work from missing owner/provider inputs. Do not call unfinished code an external blocker.

Complete every independent workstream before stopping. If an external prerequisite prevents completion, identify precisely what the owner must do and the validation that will follow. When staging gates pass, present the concrete public-activation decision with evidence. Do not silently deploy, modify the existing Beta database or open real-data signup under the old DEMO approval. Mark READY only after the actual real-use acceptance gates pass.
