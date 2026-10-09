# FINNTECH DEMO review follow-up

You are implementing a focused review fix in `C:\Users\Admin\Downloads\FINNTECH`. Read `docs/acceptance/demo-independent-review-20261008.md`, the DEMO deployment report and `docs/operations/demo-access.md` first. Preserve the existing dirty working tree and unrelated changes.

The deployed synthetic DEMO is running. Do not rebuild the tracker or redesign it. Fix the following confirmed P2 issue:

In `apps/web/src/auth/DemoEntry.tsx`, `/demo/enter` can succeed, then `readAccount()` can fail with an `AuthRequestError` whose `outcomeUnknown` is false. The catch currently clears pending/navigation locks, enables code edits and fresh entry, and omits the original-request reconciliation button even though the new session has not been verified.

Track successful entry explicitly. After entry succeeds, any subsequent account verification failure must retain the pending/navigation lock and offer reconciliation using the original code and signed request cookie. Do not prepare/reset/create a fresh workspace, replace the request identity, or persist the code in browser storage. Unlock only after the original result is verified or an authoritative terminal rejection allows a deliberate fresh action. Keep genuine pre-entry invalid-code rejection editable.

Review the analogous `freshDemo()` flow in `apps/web/src/App.tsx`: if sign-out succeeds but the following `readAccount()` fails, retain an uncertain state and require account reconciliation before further actions. Preserve the existing normal-account behavior.

Add meaningful regressions for successful entry followed by failed health/session/me verification; locked navigation/code/fresh actions; same-request retry; recovery after verification succeeds; actual invalid-code correction; and successful logout followed by failed account verification. Use synthetic inputs only. The review-only reproduction under `.demo-independent-review-20261008.local/` confirms the current bug; its passing result means the bug was observed, not fixed.

Preserve owner isolation, Decimal strings, THB/USDT/USD boundaries, fixed expiry/epoch, durable transactional receipts, original ledger payload/idempotency-key retries, closed public signup and disabled recovery. Do not weaken assertions, increase WS deadlines, or change backend/schema/dependencies to fix this UI issue.

Run focused regressions, then the appropriate existing acceptance checks. Report exact commands, exit codes, failures and reruns; distinguish your new results from previously supplied evidence. Deliver a review report and incremental patch including new tests. Do not commit, push or deploy in this task; stop for review.

Record the remaining expiry/cold-start, final-runtime advisory triage, physical-profile/network-loss and isolated full-restore checks as open. Do not claim full readiness, run production expiry/rotation/deletion experiments, access or disclose the owner's code, or apply `npm audit fix --force`.
