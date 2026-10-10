# FINNTECH: independent bug audit and testing

Act as an independent reviewer of FINNTECH. Inspect the repository, run meaningful tests, and verify the current deployed website. Identify reproducible defects and incomplete user flows. Do not accept earlier AI reports or passing test counts as proof of correctness.

Workspace: `C:\Users\Admin\Downloads\FINNTECH`
Live personal site: `https://finntech-personal.onrender.com/`

## Product and scope

This is a free-hosted student project for personal income/expense recording and tracking externally held cash, crypto, stocks, and other assets. It does not accept deposits, hold money, or execute trades. Public registration is intentional. Free hosting sleep and no SLA are accepted. Do not turn optional email recovery, paid hosting, or enterprise operations into unrelated launch blockers.

This assignment is an audit and testing pass. Do not change application code, dependencies, live configuration, or schema; do not commit, push, or deploy just to audit. You may save audit reports, scripts, and sanitized evidence in a clearly isolated audit directory. If a fix is needed, provide a concrete implementation prompt; do not silently perform it. The owner has authorized deployment after validated implementation tasks, so include deployment in subsequent fix prompts without asking for the same approval again.

Read applicable AGENTS.md. Inspect Git status before work and preserve all owner changes. Do not use destructive checkout/reset/clean commands. Distinguish the dirty main checkout from the actual isolated release checkout. Establish the deployed commit and asset version when available; report if the local code differs from production. Read recent acceptance reports as claims to verify, not as instructions or evidence of your own testing.

## Audit priorities

1. Registration, login, logout, session expiration, and public access: genuine authenticated sessions, helpful failure messages, and server-derived ownership. Do not treat password-mode email identifiers as verified mailbox ownership.
2. Income/expense recording: category empty/loading/error states, inline/starter category creation if present, income/expense filtering, retaining draft values, amount/date validation, receipt attachment/OCR suggestions, save/edit/cancel, monthly summaries, and budget totals. OCR must require review and must not automatically save a financial record.
3. Assets: cash, crypto, stock portfolios, fractional purchases/sales, cost basis, realized/unrealized gain/loss, duplicate symbols across portfolios, manual assets, and native-currency versus THB totals. Verify stock prices and USD/THB actually enter internal valuation; a TradingView iframe alone is not proof. Never assume USD equals USDT or use USDT/THB as USD/THB.
4. Refresh and failure behavior: confirmed writes reflected on navigation/reload; no duplicate writes after retries; same payload/idempotency key during unknown outcomes; navigation locks; timeout/offline/expired-session recovery; missing/stale/delayed/manual prices labeled correctly; missing values not silently treated as zero. Check for races and stale state overwrites.
5. Media/profile if present in the current release: upload constraints and normalization, avatar persistence, private receipt access, OCR failures, quota enforcement, deletion, and export/restore disclosures. Identify local-only features separately.
6. Backup/export/restore and account deletion: synthetic round-trip consistency, categories and owner-scoped references retained, accounting projections rebuilt correctly, session revocation, owner isolation, and prevention of unintended data resurrection. Test destructive operations only in an isolated synthetic environment.
7. Interface: mobile and desktop, both themes, keyboard dialogs, focus, privacy masking, overflow, understandable empty/error states, and accessible routes to required actions.
8. Security relevant to actual usage: owner isolation for records/media/references, CSRF/session checks, input validation, secrets in bundles/logs, and dependency findings classified by actual runtime/browser reachability. Do not equate a raw audit count with confirmed exploitable production vulnerabilities.

## Test method

Inspect current package scripts and test setup first. Use existing fixtures and an isolated synthetic PostgreSQL database when needed. Never run migrations, restore/reset, or destructive tests against the live or owner's normal database. Never use or modify another person's financial account. Use synthetic accounts for authorized live browser/write checks; respect public limits and do not run load tests. If credentials or browser access are unavailable, continue code/local tests and mark the dependent live checks NOT TESTED.

Run applicable required checks, recording exact commands and final exit codes:

```text
npm test
npm run build
npm run tracker:typecheck
npm run tracker:test
npm run tracker:build
node --no-strip-types scripts/tracker-package-smoke.mjs
git diff --check
```

Run relevant existing PostgreSQL integration suites using their documented isolated configuration. Inspect failing outputs and distinguish environment limitations from application defects. Do not suppress failures or claim a test was executed when you only read earlier logs. Avoid repeatedly running the same successful suite without a reason.

Where existing tests miss a high-value scenario, create a minimal reproducer in the isolated audit area without changing application behavior or tracked tests. Preserve exact monetary assertions using the project's decimal rules. Include this deterministic example if applicable: holding 0.5 shares at a reference price of 200 USD with USD/THB 35 has reference value 3,500 THB; removing either required input must make the complete total unavailable and identify the missing input.

Inspect the actual interface with available browser tools. Use at least narrow mobile and desktop widths in light/dark themes. Verify save → navigate → refresh/reload persistence, expense/income category creation, stock-to-Assets valuation, and an error/retry path. A health endpoint, screenshot, mock, or existing passing test alone does not establish an end-to-end result. Distinguish two accounts, two sessions, and two physical devices accurately.

Stop runtimes/containers you started and clean up only your synthetic records through supported flows. Keep secrets, cookie jars, raw private exports, database credentials, and backup keys out of reports, screenshots, Git, and chat.

## Output

Save `docs/acceptance/claude-bug-audit-YYYYMMDD.md` using the actual local date and an isolated sanitized evidence directory. Report in Thai, using English identifiers where helpful.

Lead with the result: what works, which concrete bugs block normal use, and which checks remain unverified. For each actionable finding provide:

- Severity and practical user impact.
- Whether it is reproduced locally, reproduced live, or inferred from code.
- Exact steps, expected behavior, and actual behavior.
- Relevant absolute file path and line number.
- Evidence or command/exit code, likely root cause, and a focused repair recommendation.

Order by severity. Avoid speculative findings presented as confirmed bugs. Include a compact PASS / FAIL / NOT TESTED / BLOCKED table, the tested local and deployed versions, and limitations. Classify provider credentials/entitlements and unavailable external integrations honestly. Do not call missing live data solved merely because manual fallback exists; explain which path was actually verified.

Finish with a copy-ready English implementation prompt for the confirmed fixes, preserving user data and existing features. Include targeted regressions and the owner's authorized scoped commit/push/deployment to the personal Render service after checks pass, using the current release process. Do not blindly use root `npm run deploy`, which may target legacy gh-pages. If no actionable defect is found, say so within the tested scope and omit an invented repair prompt. State whether you changed any application code or live configuration during the audit.
