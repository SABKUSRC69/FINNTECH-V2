# Fix stock valuation in total assets and deploy

You are implementing and deploying a focused FINNTECH bug fix. Complete the work, validate it, and deploy it to the existing personal website. The owner explicitly authorizes the necessary scoped release commit, push, and deployment after checks pass. Do not stop at a local review or ask for deployment confirmation again. If an actual permission restriction prevents deployment, report the restriction accurately.

## Context and confirmed problem

- Workspace: `C:\Users\Admin\Downloads\FINNTECH`.
- Target: `https://finntech-personal.onrender.com/`.
- FINNTECH records income, expenses, and externally held assets. It does not take deposits or execute trades.
- After recording a stock purchase, the user sees the stock, quantity, and cost in Assets, but its valuation does not contribute to the THB total, which can show N/A.
- In `apps/web/src/tracker/Assets.tsx`, `valueMixedAssets(...)` receives `null` for its USD/THB argument. Its eligible stock prices come from the internal market feed, whereas the free TradingView display is an independent iframe.
- `StockPortfolioValue.tsx` explicitly says its displayed value is not included in the THB total. `packages/finance/src/analytics.ts` correctly marks the total incomplete when a held stock lacks a price or a nonzero USD amount lacks FX.

Confirm these findings against the current working tree and actual deployed release before changing anything. Read applicable AGENTS.md and current release/deployment records. The checkout contains substantial owner work, including notebook styling and receipt/profile media features. Preserve it. Determine the latest deployed commit and schema; do not assume an older report is current.

## Required result

Make stock holdings participate in Assets valuation using:

`stock quantity × reference price in USD × USD/THB reference rate`

Aggregate the result with THB cash, crypto converted using its own USDT/THB reference, and manual assets exactly once. Keep holdings quantity, purchase cost, current reference value, and unrealized gain/loss distinct. Preserve the existing accounting model; do not introduce cash debits/credits that duplicate recorded movements.

The feature must remain usable with zero paid subscriptions. Implement both an automatic reference path where a verified suitable free provider is available and an explicit manual reference fallback so missing API credentials do not leave the feature unusable.

## Price and FX inputs

1. Research current official provider documentation and terms before selecting any new stock/FX source. Verify free quotas, symbol coverage, browser/server access, and permission for displaying data on this public website. Keep any keys server-side. Do not enable paid plans or treat a personal-use entitlement as public redistribution permission.
2. TradingView widgets may remain as visual references. Do not scrape their iframe, intercept private widget APIs, or extract displayed numbers to feed internal valuation.
3. If suitable automatic stock quotes are unavailable, let the owner of each portfolio explicitly enter or update a reference price per stock. Store currency, source type, observation/as-of time, and update time. Scope manual entries to the authenticated owner; another owner's value must never affect them. Explain that the user can read a quote and enter it themselves. Never automatically use trade price or purchase cost as today's price. A latest-trade-price estimate may be offered only through an explicit user action with an honest label.
4. Add a genuine USD/THB reference through an appropriate verified free FX source. Also support an explicit owner-scoped manual USD/THB rate when the source is unavailable. Never substitute USDT/THB or assume USD equals USDT. Show direction, source, and as-of time. Daily FX references must be labeled as daily references, not real-time rates.
5. Use a documented selection policy: valid automatic quote or explicit manual override/reference; valid automatic FX or explicit manual override/reference. Make override behavior visible and reversible. Preserve each holding's reference provenance when combining values.
6. Model real-time, delayed, daily, manual, stale, missing, and error states appropriately. Keep the existing live-feed freshness protection. Do not make an old live quote appear fresh by changing its receipt timestamp. Manual/daily reference validity is a separate documented policy, not an excuse to relax live checks.
7. Cache and deduplicate server provider requests, enforce timeouts/backoff and quotas, and limit fetches to needed supported symbols. Do not make a provider call for every user poll. Handle provider failure without losing saved trades.

## Assets behavior

- Refresh affected holdings and valuation after a confirmed purchase, sale, reference-price change, or FX change, and when navigating to Assets. Preserve the original idempotency key/payload and existing locks when an outcome is unknown; never replay a trade just to refresh totals.
- Keep decimal-string arithmetic and established rounding rules. Cover fractional shares and multiple portfolios holding the same symbol.
- When all necessary values are present, show a complete THB reference total. If any input is manually entered or delayed, describe the total as a reference estimate with that provenance, not a live executable value.
- When inputs are incomplete, show a clearly labeled known partial value plus the missing stock/rate details and an action to resolve them. Keep the complete total unavailable; never present missing holdings as zero or silently omit them. Explain why the value differs from the complete total.
- Show native USD value as soon as stock prices are available, even if USD/THB is missing. Provide a straightforward path from Assets to update the missing reference. Localize user-facing copy in Thai and preserve light/dark mode, mobile layout, privacy masking, and keyboard accessibility.
- Persist manual references in the existing database with authenticated owner isolation. Integrate applicable data export/restore and account-deletion behavior. Do not store durable references only on Render's ephemeral filesystem. Use additive migrations if needed.

## Verification

Add meaningful regressions for: buy/sell then Assets refresh; fractional and duplicate-symbol holdings; missing quote versus missing FX; partial totals; zero holdings; stale automatic quotes; explicit manual references and overrides; provider failures; and two-owner isolation. Preserve retry behavior without duplicate trades. Test persistence and lifecycle/export integration if new stored fields are introduced.

Use synthetic accounts and records for write tests. Run the repository's relevant PostgreSQL integration tests and required checks, including:

```text
npm test
npm run build
npm run tracker:typecheck
npm run tracker:test
npm run tracker:build
node --no-strip-types scripts/tracker-package-smoke.mjs
git diff --check
```

Read current package scripts first and record the actual commands, outcomes, and exit codes. Inspect failures instead of suppressing them. Run browser checks on the affected stock/Assets flows at narrow mobile and desktop sizes in both themes. A fixture test alone does not establish that a live provider works.

## Authorized deployment

Use the existing personal release process and isolated release checkout/branch after verifying their current state. Never run the root legacy `npm run deploy` blindly: it targets gh-pages and is not the personal API/database deployment.

Prepare a release containing only this task's reviewed changes on top of the latest personal release. Preserve existing deployed features, user records, credentials, and schema. Take and verify an encrypted pre-migration backup using the existing tooling if changing persisted schema. Apply only compatible additive migrations; never reset or recreate the live database. Do not change the separate DEMO service or database. Do not purchase hosting or storage.

Commit/push the scoped release and deploy the existing personal Render service when checks pass. Verify its real deployed commit, HTTPS health, asset version, authenticated synthetic stock-to-Assets flow, data isolation, and persistence. Clean up only your synthetic records through supported flows. Keep secrets, raw backups, and private user data out of logs, patches, screenshots, and Git.

Do not stop solely because a free automatic stock provider is unavailable: deploy the working, honestly labeled manual reference path with USD/THB support after validation. If the complete requested functionality or deployment cannot be verified, describe the exact remaining limitation rather than declaring success.

## Delivery

Provide an incremental patch including new files, changed-file list, concise acceptance report, actual test results, release commit/deployment identity, and the working website link. Explain how the user makes their existing holding appear in the total, including any one-time manual reference entry. Separate automatic quotes actually verified from manual fallback, synthetic tests, and untested conditions. Do not report the website as showing real-time stock values unless the deployed data path demonstrably provides them.
