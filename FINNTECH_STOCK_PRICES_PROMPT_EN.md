# FINNTECH: make real stock prices work on the public tracker

You are the implementation agent. Inspect this repository, implement the missing stock-price integration, and deliver a working, reviewable result. Do the available work autonomously; do not stop at a plan. The owner wants actual updating US stock/ETF prices visible to ordinary signed-in users, with a budget of zero. Never present delayed prices or synthetic fixtures as successful real-time delivery.

## Context and current implementation

- Workspace: `C:\Users\Admin\Downloads\FINNTECH`.
- Real public tracker: `https://finntech-personal.onrender.com/`.
- The separate `finntech-beta.onrender.com` service is DEMO. Do not modify it or its database.
- The tracker is in `apps/web`, `apps/api`, `packages/contracts` and `packages/finance`. The root `src` app is legacy.
- The local Canva-inspired notebook redesign is complete but not yet deployed. Preserve it and all unrelated owner changes. Read applicable repository instructions before editing.
- Existing stock integration: `apps/api/src/tracker/stocks.ts`, `tracker/routes.ts`, `tracker/stream.ts`, `server.ts`; contracts and tests; frontend `apps/web/src/tracker/StockPrices.tsx`.
- Existing provider is Alpaca IEX, using a backend WebSocket and REST seed. Default watchlist has 30 US stocks/ETFs, including AAPL, MSFT, NVDA and TSLA.
- Current configuration requires `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `ALPACA_OWNER_ID` and `ALPACA_PERSONAL_USE=confirmed`. The relay, HTTP route and WS path intentionally restrict configured data to the designated owner. Inspect every enforcement point. Merely removing this restriction is not a valid public implementation.
- On 2026-10-09, public health/ready returned 200, public password registration was open, recovery/verification were off. Root 408 tests and tracker 263 tests passed; builds/typecheck passed. These prior checks do not prove stock provider operation. Recheck what changes require.

## 1. Establish the actual cause

Trace current frontend, authenticated HTTP route, WebSocket, relay and deployment configuration. Distinguish:

- provider not configured;
- configured but credentials rejected;
- owner not entitled;
- quota/subscription/connection limit;
- provider/network unavailable;
- connected with no recent trade;
- market closed or data stale;
- a working local change not deployed.

Inspect private configuration only through authorized local/cloud mechanisms, and report presence/mode/status rather than secret values. Do not print .env contents, API keys, cookies, database URLs or account identifiers. Do not guess that missing prices necessarily mean missing credentials. Keep diagnostics understandable to normal users; show provider configuration details only to the operator.

## 2. Resolve the free provider path before broadcasting data

Use current official provider documentation to verify price coverage, whether data is real time, rate/connection limits, account requirements and permission to display it in this public multi-user application. Record direct source links and the date checked. Compare no more than three plausible free choices before selecting an implementation; avoid an open-ended vendor search.

Official starting sources, reviewed on 2026-10-09:

- Alpaca Basic coverage: https://docs.alpaca.markets/us/docs/about-market-data-api - free real-time IEX, up to 30 WebSocket symbols; this is a single-exchange feed, not consolidated US-market coverage.
- Alpaca streaming: https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data
- Alpaca terms: https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf - personal/noncommercial usage and making content available through another application have additional conditions; public redistribution requires attention to the applicable permissions. Recheck the current agreement applying to the selected account, rather than assuming an API key grants publication rights.
- TradingView widgets: https://www.tradingview.com/widget/
- TradingView US widget coverage: https://www.tradingview.com/widget-docs/markets/north-america/ - the currently listed NASDAQ/NYSE/Arca stock coverage is delayed.
- TradingView data FAQ: https://www.tradingview.com/widget-docs/faq/data/ - widgets are not a market-data API, and a TradingView subscription does not automatically enable real-time website data.

Priority is a verified free provider/feed that permits the intended public use and delivers actual real-time US equity observations. Prefer the existing relay if its applicable entitlement can be established at zero cost. Do not buy a plan, start a paid trial, add a card, bypass quotas, scrape websites, extract private widget endpoints, or broadcast an owner's personal feed without established permission.

If no free public real-time path can be established, explain that specific limitation plainly. Complete an official free delayed-data widget integration as a separately labeled fallback for visual review, retaining required branding. Mark the real-time objective INCOMPLETE. Do not activate that fallback on the public service or silently redefine the owner's request as delayed prices. Continue all useful implementation work rather than demanding credentials before preparing the UI.

If a provider signup/key or written permission is genuinely required, identify the exact missing action and free setup steps after preparing the code. The owner enters credentials privately; never ask for secrets in chat. Do not contact a provider or send notices on the owner's behalf without explicit authorization.

## 3. Implement the selected supported mode

For a directly integrated feed:

- Keep credentials server-side and out of Vite variables, browser bundles, exports, screenshots, logs and Git.
- Use a shared bounded backend connection/cache where provider rules permit, instead of creating an upstream connection for each visitor. Respect symbol/subscription limits, reconnection backoff, timeout and request quotas.
- Normalize provider observations accurately, preserving Decimal strings. Display symbol, USD price, exact source/feed, observation timestamp and a truthful availability/freshness label.
- Reject invalid, nonpositive, out-of-order and implausibly future observations; preserve correction/cancellation handling. Never update an old quote's observation time to make it look fresh.
- Distinguish transport connected, actual new observations, feed delay and market/session status. Frequent polling alone does not establish real-time data. If reliable market-session metadata is absent, say that the observation is old instead of asserting the exchange is closed.
- Preserve the existing 30-second freshness rule unless a separately explained, source-backed change is necessary. Delayed feeds need their own truthful delay label; they must never receive a LIVE badge just because a response was freshly fetched.
- If verified public-display entitlement exists, revise stock-feed visibility consistently in HTTP and WS for ordinary valid tracker accounts. Keep all finance/account/backup authorization and session checks intact. Do not turn protected ledger routes into public endpoints.
- Preserve the private Alpaca owner-only mode as appropriate; do not accidentally expose it through a new public fallback.
- Clean up subscriptions and browser sockets/timers when leaving the screen. Theme toggles and navigation must not multiply upstream connections.

For an official widget fallback:

- Use the supported embed mechanism, official supported symbols and required provider attribution. Keep the data inside the widget rather than scraping it into custom cards or finance calculations.
- Display Thai text identifying delayed/provider-limited data. Do not imply the widget is FINNTECH's own real-time API.
- The current API CSP uses `script-src 'self'`, `frame-src` inherited from `default-src 'self'`, and exact connection origins. If the supported widget needs exceptions, add only necessary, verified origins/directives and test them. Do not disable CSP, use blanket wildcards or add `unsafe-eval`/`unsafe-inline` just to hide integration errors. If secure embedding is infeasible, deliver that constraint explicitly rather than weakening application security.
- Do not pass session tokens, email, owner IDs, financial records or credentials into a third-party widget or URL. Update the privacy information to accurately describe the loaded external market-data service.

## 4. UI and scope

Keep the notebook design, Thai interface, dark/light themes, amount-hiding behavior, four mobile navigation destinations and existing keyboard dialog behavior. Make the stocks screen useful at 320, 375, 768 and 1440px without document-level overflow. Start with existing well-known symbols rather than adding portfolios, trading execution or unsupported asset classes.

Use clear Thai states for loading, unavailable, delayed, old observation and actual live observations. An ordinary user must not see a blank screen or instructions to obtain the website owner's server keys. Give an honest explanation when coverage is unavailable; do not substitute fake prices, zero or a permanently animated LIVE badge.

This is US stock/ETF price tracking only. Do not add stock holding accounting, stock P&L, Thai stock coverage, order execution, deposits, wallet connection or automatic conversion into the owner's THB/USDT totals. Preserve genuine password accounts, server-derived ownership, Decimal finance, audit/idempotency, original-payload/key retry, unknown-outcome navigation locks and account deletion/recovery behavior.

Avoid new dependencies unless necessary and justified. Do not alter database schema merely to display prices. Never change general signup access, activate recovery, modify the DEMO service, purchase infrastructure, migrate/reset/delete user data or run unrelated automated cleanup.

## 5. Prove behavior, not merely a successful build

Add meaningful tests for changed behavior: provider normalization/freshness and delayed classification; unavailable/rate-limit/reconnect behavior; correct HTTP/WS account visibility; and the new UI/embedding lifecycle. Preserve existing assertions, especially unauthorized access and pending request behavior.

Run appropriate checks and record actual exit codes:

```text
npm test
npm run build
npm run tracker:typecheck
npm run tracker:test
npm run tracker:build
node --no-strip-types scripts/tracker-package-smoke.mjs
git diff --check
```

Inspect in a real browser, in both themes and the specified widths. Confirm no CSP violations, secret disclosure, runaway requests or navigation regression. Use isolated synthetic accounts for local functional fixtures and distinguish them from actual provider evidence. Never modify the owner's financial data as a test.

For a direct real-time feed, capture genuine provider observation timestamps and actual arrival times during a supported open trading session. Demonstrate new observations arriving and appearing in the UI, and verify the supported access with two independent valid tracker sessions. Record source/feed and measured update behavior without promising tick frequency the provider cannot guarantee. Authentication/subscription success alone is insufficient. If the market is closed or credentials/entitlement are unavailable, mark live verification NOT TESTED and give exact reproduction steps; do not use the provider test stream or mock ticks as real-market proof.

For a widget, inspect the actual widget loading, symbols and displayed data status. Do not claim custom visibility into its cross-origin timestamps or quote stream unless officially available. A working delayed widget proves only the fallback, not the owner's real-time requirement.

Scan changed source and compiled frontend for secret exposure. Separate current dependency audit findings from stock implementation regressions; do not perform unsolicited broad dependency upgrades.

## 6. Delivery and public rollout

Finish with a concrete local implementation, operator setup steps and a deployable allowlisted release patch. Deliver a review report, exact changed files, incremental patch relative to this task's starting state (including new files), screenshots, checks and limitations. Preserve unrelated uncommitted work.

Report separately:

1. integration implemented locally;
2. provider permission/coverage established;
3. actual real-time observations verified;
4. ordinary-user access verified;
5. public deployment verified, or not performed.

Use PASS / FAIL / NOT TESTED / INCOMPLETE accurately. State explicitly if the implementation is delayed-data only. Never call the whole feature complete merely because tests or mocks pass.

Do not commit, push or deploy in this implementation turn. Stop for review of the concrete result. If a key/permission is the only remaining requirement, ask for that exact private setup action and keep credentials outside chat. Provide precise rollout/rollback steps for the existing real-use service, including a post-deployment check with ordinary accounts. Treat the unrelated notebook rollout as a separately identified change; do not claim local changes are already live.
