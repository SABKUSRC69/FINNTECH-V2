# Activate Alpaca IEX real-time stock valuation and deploy

Implement the owner's request to receive automatic real-time stock prices from Alpaca and use them in FINNTECH portfolio valuation and Assets. Complete the integration, test it, and deploy the existing personal Render service after checks pass. Scoped release commit/push/deployment is authorized; do not ask for the same deployment confirmation again.

Workspace: `C:\Users\Admin\Downloads\FINNTECH`
Website: `https://finntech-personal.onrender.com/`

This website records external holdings; no money is deposited and no orders are executed. Use Alpaca market data only. Do not call trading/order endpoints, connect actual brokerage positions, buy subscriptions, or add a paid service.

## Establish current state

Read applicable AGENTS.md, Git status, recent release reports, and the current isolated personal release checkout. Preserve all owner work and deployed fixes, including any audit repairs, category changes, manual valuation, notebook design, receipts, and avatars. Verify the latest deployed commit rather than assuming an older one is current.

Inspect existing `apps/api/src/tracker/stocks.ts`, authenticated market REST/WS routes and `market-stream` implementation, `StockPrices.tsx`, `Assets.tsx`, `valuationPolicy.ts`, contracts, and relevant tests. Existing StockMarketRelay uses Alpaca IEX WebSocket plus latest-trades REST seeding and restricts delivery to a configured owner. Extend the existing path instead of building a second competing relay.

## Provider and access rules

Verify current official documentation and the account's actual entitlement:

- https://docs.alpaca.markets/us/docs/about-market-data-api
- https://docs.alpaca.markets/us/docs/market-data-faq
- https://docs.alpaca.markets/us/docs/streaming-market-data
- https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data
- https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf

Basic currently provides free IEX real-time equities data and up to 30 subscribed symbols. IEX is a single exchange feed, not consolidated all-exchange SIP. Confirm connection limits and handle them. Use `wss://stream.data.alpaca.markets/v2/iex` and REST `feed=iex` explicitly; do not accidentally request paid SIP.

Keep personal data access scoped to the authenticated FINNTECH owner of the configured Alpaca account. Do not remove `ALPACA_OWNER_ID`, bypass checks, or broadcast that owner's provider data to every public user. Publication/redistribution is a separate entitlement under provider terms; if the owner has documented authorization for wider use, implement that verified scope explicitly. Ordinary app deployment authorization is not provider redistribution authorization. Other users retain the existing manual-reference/widget path. Do not represent this release as automatic stock prices for all users.

## Private setup

The owner has confirmed that an Alpaca account exists and the API key pair has already been generated. Do not ask them to create an account or generate a key again. This confirmation does not establish that the keys are already configured in Render or that public redistribution is authorized. Check configuration presence without displaying secret values, then complete private setup and actual entitlement/authentication verification.

Use the existing server-only variables:

```text
ALPACA_API_KEY_ID
ALPACA_API_SECRET_KEY
ALPACA_OWNER_ID
ALPACA_PERSONAL_USE=confirmed
ALPACA_SYMBOLS
```

Prefer a paper-account key with its actual data entitlement when available; paper trading status does not turn real IEX market prices into simulated data. Confirm eligibility through actual account access, not assumptions about the owner's location. Do not create an account, accept agreements, or invent credentials on the owner's behalf.

Ask only for missing non-secret setup facts. If keys are absent, prepare and test all code first, give precise private Render Environment instructions, and request that the owner enter the values there. Never ask them to paste keys into chat or commit them. Set personal-use confirmation only after the owner has acknowledged that usage. Resolve `ALPACA_OWNER_ID` from the legitimate authenticated owner mapping; it is not the email or necessarily the auth-user ID. Inspect privately without publishing owner identifiers.

Verify a sanitized authentication success/failure status. Missing or invalid credentials must be distinguished from an unsupported feed and a closed market. Never log provider headers or authentication payloads. If secrets remain unavailable, deploy validated compatible code with the feed disabled, but report activation as blocked; do not claim live prices worked.

## Required data path and interface

1. Maintain one shared backend Alpaca connection per configured account, with bounded reconnect/backoff, cleanup, REST seed caching, subscription acknowledgments, symbol limits, and sanitized diagnostics. Browser tabs connect to FINNTECH's authenticated relay, never directly with API keys. Ensure deployment overlap does not cause an uncontrolled competing connection/retry loop.
2. Subscribe to actual supported held symbols within the free limit, not only a starter watchlist. Preserve configured watchlist behavior, prioritizing holdings deterministically when necessary. Explain excess/unsupported symbols and retain manual fallback; never silently omit their value.
3. Parse provider decimal numbers safely and retain provider observation timestamps. Reject invalid, future, out-of-order, or non-positive prices and reconcile corrections/cancellations. Keep the last-trade valuation policy explicit; do not silently switch to bid, ask, or midpoint.
4. Feed authenticated stock events into Stock holdings and Assets so native USD value, unrealized P&L, and the THB reference total update without page reload or manual price entry. Reuse one frontend subscription/store where practical. Coalesce renders without dropping the latest valid observation. Retain periodic reconciliation as fallback rather than waiting for a 15-second poll for every live update.
5. Preserve confirmed buy/sell refresh, exact decimal arithmetic, owner isolation, unknown-outcome locks, and retry with the same key/payload. Streaming changes must never submit trades or alter financial records.
6. Keep manual price overrides explicit and reversible. Clearly indicate if an override prevents a live Alpaca value from being selected; provide a return-to-automatic action without erasing the user's history.
7. Distinguish connecting, not configured, authentication/entitlement error, streaming, per-symbol stale/missing, and market closed. Apply the existing 30-second live freshness policy to provider timestamps; a connected socket is not proof that a symbol's price is fresh. Do not refresh an old price's timestamp to make it appear live.
8. Outside trading activity, show the last known price with its real time and stale/closed label. Keep it excluded from the live total under existing rules. An optional last-known reference estimate must be a separately labeled policy; never silently count it as fresh. Preserve manual/daily-reference fallback and incomplete-total explanations.
9. Retain ECB daily USD/THB and manual FX. Alpaca stock streaming does not make FX real-time. Label THB totals as a reference conversion with the rate's source/as-of date even when the USD stock value is live. Never use USDT/THB as USD/THB.
10. Preserve Thai copy, mobile/light/dark layouts, amount privacy masking, and accessible controls. Remove misleading suggestions that the owner must manually enter prices while a valid automatic reference is selected. Keep manual entry available for legitimate fallback.

## Tests and actual verification

Add meaningful regressions for owner-authorized REST/WS access and denial for a second owner, no key leakage, stream update reaching Assets and P&L, manual override selection, held-symbol subscriptions/limit handling, stale/out-of-order/correction events, provider errors/reconnect, and closed-market behavior. Verify fractional accounting, save-to-Assets refresh, and no duplicate trades after retry.

Run current required checks: `npm test`, `npm run build`, `npm run tracker:typecheck`, `npm run tracker:test`, `npm run tracker:build`, `node --no-strip-types scripts/tracker-package-smoke.mjs`, and `git diff --check`; use relevant isolated PostgreSQL tests for financial paths. Record actual commands/exit codes. Do not broaden this task into unrelated audit repairs unless they directly block this integration; preserve repairs already made.

With privately configured keys, verify real IEX authentication, subscription, and actual price observations for supported held symbols. Alpaca's `FAKEPACA` test stream can verify protocol outside hours but cannot establish real stock market coverage. If no real market observation can be obtained at the test time, distinguish that limitation instead of faking LIVE. Compare observed and received times and demonstrate that an event changes internal USD valuation; test THB math deterministically with synthetic holdings/rates.

Use synthetic records for write tests. Do not modify a real user's holdings. Production owner-only access may be checked through the owner's authorized session without altering their financial records. Verify a second synthetic account cannot obtain the owner's Alpaca data through REST, WS, or cached valuation responses. Check affected UI at mobile and desktop widths in both themes.

## Deploy and deliver

Build a scoped release on top of the latest existing personal release in the isolated checkout. Do not blindly run root `npm run deploy`, which may target legacy gh-pages. Preserve real data and secrets, keep the separate DEMO unchanged, and use no paid resources. If a schema change is necessary, use additive compatible migrations and the existing encrypted verified pre-migration backup process.

Commit/push the scoped release and deploy the existing personal Render service when checks pass. Verify release identity, HTTPS/WSS, authenticated quote delivery and Assets updates, and non-owner denial. Respect accepted Render Free sleep; do not add external keepalive traffic merely to avoid sleeping.

Deliver an incremental patch including new files, concise acceptance report, checks and exit codes, deployed commit/deployment identity, website link, and brief Thai setup/use instructions. Clearly distinguish code deployed, credentials configured, real IEX observations verified, stock USD valuation live, and daily FX conversion. State the authorized user scope. If activation remains blocked, identify exactly what private setup is missing and do not claim a completed real-time connection.
