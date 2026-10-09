# DEMO reconciliation review fix — 8 October 2026 (Asia/Bangkok)

**Prepared locally; stopped for review. No commit, push or deployment in this task.** The Beta release checkout remains clean at `e8caa93e92ca169ffa7759aebd8f4b1d74adc222`. The deployed site still has the pre-fix behavior until a separately authorized release is prepared/deployed.

Read the root `FINNTECH_DEMO_REVIEW_FIX_PROMPT_EN.md`, independent review, deployment report, setup instructions, package scripts and related source/tests. No `AGENTS.md` was found in the repository search. Existing tracked/untracked owner changes were preserved. A byte-for-byte before snapshot of the six edited files and initial Git status is saved under `.demo-review-fix-20261008.local/`; no owner source was reset or staged.

## Cause, fix and boundaries

`/demo/enter` could succeed and create a genuine session, then health/session/owner verification could throw an `AuthRequestError` with `outcomeUnknown=false` because the failing request was a GET. The old catch cleared pending/navigation locks solely from that flag. A successful write is not reversed by a later failed read.

`DemoEntry` now retains a request-level `needsVerification` ref after successful entry or unknown outcome, including across repeated reconciliation attempts. It keeps the code field, ordinary submit, fresh action, auth mode tabs and brand navigation locked. The original-request reconciliation button remains available and uses the same code, same-origin cookies and previously prepared request; it does not prepare/reset again or persist code in browser storage. A later nonterminal replay rejection does not undo this state. Verified sign-in clears pending/code state and completes entry. Only an authoritative terminal receipt HTTP **410** permits deliberate fresh action. A genuine initial invalid-code rejection remains editable.

The existing `AuthRequestError` carries an optional `demoEnded=false` marker; only `submitDemo`'s HTTP 410 sets it. Other auth/recovery errors retain existing defaults. No server error details or secrets are exposed.

`freshDemo` explicitly tracks completed sign-out. A later failed GET keeps `uncertain` and the existing tracker navigation locks. Account reconciliation requires a confirmed **signed-out** snapshot, including after repeated failures or a contradictory still-signed-in result. A failed refresh retains the already-known Beta/demo/recovery capabilities while marking the account unavailable; tabs remain visible and locked. A confirmed signed-out refresh returns to DEMO entry without automatically resetting or creating a workspace; the user can then deliberately select fresh. The DEMO form also respects the parent's uncertain lock. Existing ordinary login/logout handlers remain in place and their regressions pass.

No backend, schema, WS deadline, dependency, finance/Decimal/ledger, original financial payload/key, ownership/session, expiry/epoch, signup, recovery, design or production setting was changed. No owner code, cloud database or production token/expiry/rotation/deletion experiment was accessed. All new tests use synthetic inputs and mocked HTTP/component boundaries.

## Files / incremental patch

| File | Change |
| --- | --- |
| `apps/web/src/auth/DemoEntry.tsx` | Persistent original-entry reconciliation state and ordinary resubmit guard |
| `apps/web/src/auth/client.ts` | Explicit terminal receipt error marker |
| `apps/web/src/App.tsx` | Fresh logout commit/reconciliation state; retain feature flags on failed refresh; parent uncertain form lock |
| `apps/web/src/auth/DemoEntry.test.tsx` | Repeated post-success failures/nonterminal replay rejection; terminal 410 then deliberate fresh |
| `apps/web/src/auth/client.test.ts` | Actual HTTP 403/429/503/410 classification |
| `apps/web/src/App.test.tsx` | Actual client flow: post-entry health/session/me 503 and malformed responses, nav/code/fresh locks, same payload retry and unlocked recovery, invalid-code correction, fresh logout GET failures and repeated/still-signed-in reconciliation |

Deliverable: [demo-review-fix-20261008.patch](demo-review-fix-20261008.patch), incremental against the **saved pre-task dirty-tree files**, not against the root Git HEAD. It includes all six source/test changes plus this new review report. The previous 31-file DEMO patch/report remains historical and is not replaced. Apply to a matching reviewed baseline only; do not overwrite unrelated owner work. The generated before/after hash manifest and `git apply --check` evidence are under [demo-review-fix-evidence-20261008](demo-review-fix-evidence-20261008/verification.json).

## New verification results

These results were actually run in this task. Prior deployment/reviewer test numbers are not represented as new checks, and overlapping suites must not be summed as unique tests.

| Exact command | Result | Exit |
| --- | --- | ---: |
| `npm --workspace apps/web run test -- src/App.test.tsx src/auth/DemoEntry.test.tsx src/auth/client.test.ts` (new first six regressions, before fix) | Expected FAIL: 6 failed / 21 passed, 3 files; reproduces both confirmed issues | 1 |
| Same focused command, final | PASS: **35 / 35**, 3 files | 0 |
| `npm test` | PASS: **356 / 356**, 41 files | 0 |
| `npm run build` | PASS: legacy build | 0 |
| `npm run tracker:typecheck` | PASS | 0 |
| `npm run tracker:test` | PASS: **227 / 227** — finance 21, contracts 13, API 98, web 95; dev web smoke stopped | 0 |
| `npm run tracker:build` | PASS | 0 |
| `node --no-strip-types scripts/tracker-package-smoke.mjs` | PASS | 0 |
| `git diff --check` | PASS, existing CRLF normalization warnings only | 0 |
| Incremental patch `git -c core.autocrlf=false apply --check --directory=.demo-review-fix-20261008.local/patch-check docs/acceptance/demo-review-fix-20261008.patch` | PASS against exact saved baseline | 0 |
| Final deployed source manifest preservation check | PASS: all **132 non-target files** of the 138-file previous release remain hash-identical in the workspace | 0 |

Final safe logs are copied to `demo-review-fix-evidence-20261008/`. API's existing WS regression is included unchanged in the acceptance suite; no timeout/deadline was increased. The tracker web smoke creates/stops its own temporary dev process. No PostgreSQL/container/cloud process was started in this task.

Intermediate failures were recorded, rather than hidden: first post-fix run **3 failed / 28 passed**, exit 1, because a new test expected a detached/unmounted input DOM node to be updated. It was corrected to verify the actual subsequent fresh form is empty; the component-level clear assertion remains. Another intermediate run **1 failed / 34 passed**, exit 1, used an ambiguous sign-in button query; it was corrected to assert both tab and submit are disabled. That revealed a missing DEMO tab after failed refresh because feature flags were discarded; retaining already-known flags fixed it. Final focused **35 passed**. No existing assertion was weakened or skipped. No sandbox/environment execution failure was encountered in these elevated check runs.

## Open / NOT TESTED in this task

- Production natural expiry and Render idle/cold start; production code/epoch rotation remains unexercised.
- Final-runtime advisory inventory/reachability triage. Independent review reported five high package findings in the dependency tree; those are not proof of five reachable deployed vulnerabilities. No new audit was run, no dependency/lock changes and no `npm audit fix --force`.
- Two physical browser profiles/devices, real browser network-loss interruption, physical touch/screen-reader or new responsive browser screenshots. The new HTTP failure tests use the real frontend client with mocked responses, not a production/browser failure injection.
- Isolated full database restore drill. Prior archive listing is not a restore drill.
- Retention/capacity policy: retained workspaces count toward the default ceiling, and no automatic deletion is introduced.
- New real HTTPS/WSS or isolated PostgreSQL rerun for this frontend-only fix. Prior deployment/database evidence remains separate; no backend source changed.

This closes preparation of the focused P2 fix and waits for independent review. It does not claim complete readiness or change the live Beta.
