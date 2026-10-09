# FINNTECH — independent readiness review, 8 October 2026

**Decision: NOT READY for public real financial data. The real-use implementation is ready for further controlled acceptance, but system work is not complete.** The currently deployed public URL still reports synthetic DEMO, not the locally prepared real-use release.

## Independently verified this review

- Read current real-use source boundaries/configuration, registration guards, authorization and recovery/mail integration, backup/Drive helpers, operating documents and supplied acceptance evidence. This is a focused readiness review, not a complete security certification of all source and dependencies.
- Ran focused Vitest on 11 files: **118 tests passed, exit 0**. Covers real configuration/mail, recovery configuration, owner authorization, WS, account/entry/reconciliation UI, authenticated backup encryption/retention, Drive mocks and backup target guards. Command/log retained in `.real-use-independent-review-20261008.local/focused-tests.log`.
- Compared the source snapshot against current files: **86/86 SHA256 inputs match**. Snapshot excludes tests/generated/build/private files as its scope states.
- `git apply --check --reverse docs/acceptance/real-use-incremental-20261008.patch`: **exit 0**. Patch SHA256 matches the supplied receipt: `e19bbf17e37ae41a41725a7713adfcf6bea09ec29baecf777c76d5be64e058c8`.
- Read the supplied 119-package runtime inventory: none of the five flagged package names is present. This does not certify absence of all vulnerabilities or independently establish contents of a running cloud image.
- GET `https://finntech-beta.onrender.com/api/health`: **HTTP 200**, process/database ok, auth `not_checked`, Beta dataMode `synthetic`, recovery false, DEMO enabled. Availability is not real-use readiness.
- `git diff --check`: **exit 0**.
- Attempted read-only Docker image identity inspection: **exit 1**, Docker Linux engine named pipe unavailable. Did not start Docker or claim an independent image inspection passed.

No application source changed, no private credentials read, no database/container started or modified, no commit/push/deploy in this review. Only this review document and ignored review log were created.

## Supplied evidence, not rerun here

Read the final accepted root log: **394 tests passed**, including the earlier separate sandbox EPERM/no-tests failure preserved in another log. Tracker logs support **257 tests**, PostgreSQL log supports **16 tests**, and the restore result records **27 tables**, authenticated archive, schema/constraints matching and unchanged source. Counts overlap and must not be added.

The real PostgreSQL suite uses mocked mail HTTP transport. The full restore is isolated local synthetic evidence; its own receipt marks actual off-device copy, schedule, alerts and production recovery objectives NOT TESTED. Browser evidence covers unauthenticated local recovery widths, not the full authenticated real release on physical devices. Full suites, database integration and restore were not rerun in this review.

## Outstanding launch gates

| Gate | Current evidence | What closes it |
| --- | --- | --- |
| Controlled staging enrollment | Public registration is closed; no dedicated real staging allowlist/enrollment implementation | A reviewed way to admit only owner-controlled test accounts without general public signup, on a separate target |
| Real mailbox verification/recovery | Brevo adapter/outbox code and transport mocks pass; actual delivery untested | Sender/account setup, received verification/reset/notice mail and full browser flow, provider failure/delay/expiry behavior on actual HTTPS |
| Off-device backup and machine-loss recovery | Encrypted local full restore passes; Drive code mocked | Private folder/OAuth/quota/ACL setup, ciphertext upload/download, independently recoverable key, restore without depending on this Windows profile |
| Schedule and independent alerts | Wrapper parsed; task/watchdog templates unactivated | Working scheduled run, missed/offline/failure detection outside Windows and sleeping app, actual Gmail receipt and operator response |
| Deletion and finite retention | Auth deleteUser disabled; owner-scoped purge and Drive pruning not implemented | Tested owner-authorized process, other-owner preservation, session/challenge revocation, deletion handling after restoring old backup, matching privacy text and retention operation |
| Real deployment acceptance | No real-use release deployed; current website is DEMO | Separate reviewed target/database, actual HTTPS/WSS, two browser profiles/devices, saved export/restore, network-loss original-key retry, restart/redeploy/cold wake and persisted data |

The five high package findings remain a build/CLI dependency-tree audit failure. Their absence from the supplied runtime inventory is useful classification, not a reason to say the audit passed. Runtime/base-image and supply-chain assessment remains limited as documented. Do not force a Prisma downgrade or claim zero vulnerabilities.

## Design decision

The existing core tracker supports design exploration using synthetic data. However, if the owner's sequence is **finish systems first, then final design**, that milestone has not been reached: staging/account lifecycle and operational acceptance remain open. Settle registration, verification, recovery, account deletion and backup/error states before finalizing their screens. After a redesign, recheck submission, original-request reconciliation/navigation locks, keyboard/modal behavior and responsive layouts.

Do not promote DEMO accounts or seed data into the real database, remove session expiry to make data persistent, open public registration to work around missing staging enrollment, or change environment flags as a substitute for acceptance.
