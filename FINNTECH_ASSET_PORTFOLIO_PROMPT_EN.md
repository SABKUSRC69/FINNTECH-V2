# FINNTECH: personal finance and updating asset portfolios

You are the implementation agent for this existing repository. Complete the owner's intended product, not merely a page of market tickers. Inspect the working implementation, preserve its behavior and the completed local notebook design, then implement and test the missing portfolio features. Work autonomously on all available local work and deliver a concrete result for review.

## The owner's actual goal

FINNTECH is a personal income/expense journal and asset portfolio tracker. Users manually record income, expenses, cash and assets they already own elsewhere. The application uses market prices to update estimated asset values and gains/losses.

There is no funding of a FINNTECH account, money custody, deposit/withdrawal processing, exchange account connection, wallet connection or trading execution. A recorded buy/sell is a historical bookkeeping entry, never an order sent to a provider. Do not add brokerage onboarding or trading infrastructure to solve price tracking.

The owner expects:

1. Working income/expense and cash records.
2. A crypto portfolio showing actual recorded holdings, costs, current reference prices, values and gains/losses that update as market observations arrive.
3. Equivalent stock/ETF holdings tracking, rather than a watchlist alone.
4. A useful combined asset overview, with accurate currencies, transparent conversion and incomplete-price handling.
5. A simple way to record other assets whose value is maintained manually, without pretending they have a live feed.

Budget is zero. Scope is a public school-project website with a small initial audience, accepting free-host sleep/no SLA. Do not impose unrelated email recovery, enterprise monitoring or paid infrastructure as prerequisites for portfolio work.

## Repository and baseline

- Workspace: `C:\Users\Admin\Downloads\FINNTECH`.
- Real public service: `https://finntech-personal.onrender.com/`; separate DEMO: `https://finntech-beta.onrender.com/`.
- Main tracker: `apps/web`, `apps/api`, `packages/contracts`, `packages/finance`. Root `src` is legacy. Read applicable repository instructions; preserve all existing owner changes.
- The local Canva-inspired notebook redesign already exists and has not yet been deployed. Keep its pastel paper styling, original local artwork, Thai typography, labeled sidebar, four mobile destinations, dark mode, amount privacy and accessible dialogs.
- Review baseline on 2026-10-09: root 408 tests, tracker 263 tests, typecheck/build/package smoke passed. This is not a certificate that live market feeds work.
- Existing finance, budgets, cash, crypto history, weighted-average ledger, corrections, exports/restores and genuine password sessions must be reused, not replaced with a mock dashboard or localStorage.
- Existing crypto UI in `apps/web/src/tracker/Dashboard.tsx` already shows quantity, total/average cost, realized/unrealized P&L and allocation. `apps/api/src/tracker/market.ts` currently hardcodes BTCUSDT/ETHUSDT and retrieves REST prices periodically. Do not describe this as an existing upstream tick stream.
- `apps/web/src/tracker/Assets.tsx` and `apps/api/src/tracker/fx.ts` already use a direct USDT/THB reference snapshot from Bitkub. Preserve its precise quote meaning and freshness rules.
- Existing stock files: `apps/api/src/tracker/stocks.ts`, `routes.ts`, `stream.ts`, `server.ts`, and `apps/web/src/tracker/StockPrices.tsx`. Alpaca IEX is restricted to a configured owner; there is currently no persisted stock holding ledger. Inspect contracts, schema and tests before extending them.
- This prompt supersedes the narrow stocks-only prompt for product scope. Keep its truthful provider coverage/permission constraints, but do not let unresolved stock display entitlement prevent finishing crypto and other portfolio functionality.

## A. Finish crypto holdings and price tracking first

Keep the existing accounting semantics. Make the portfolio screen clearly distinguish:

- the assets and quantities this user actually recorded;
- the selected portfolio's costs and historical transactions;
- public reference market observations;
- current estimated market value and unrealized P&L;
- realized P&L from recorded sells;
- a separate optional market watchlist, if retained.

Support more than BTC/ETH through a bounded, provider-validated catalog and searchable selector. At minimum evaluate liquid spot USDT pairs for BTC, ETH, SOL, XRP, BNB, DOGE and ADA, only offering live valuation for pairs actually supported and available at implementation time. Do not promise that a named asset or venue is always supported. Validate symbol/base/quote/status using provider metadata; do not build arbitrary upstream URLs from user input. Unsupported or delisted holdings must retain their user records and show unavailable valuation with an explanation.

Prefer one shared backend public market-data stream for the supported holdings/watchlist. Use bounded subscriptions, cache and request coalescing, clear rate limits, reconnect backoff, heartbeat/rotation and REST reconciliation as appropriate to current provider documentation. Do not subscribe to an entire exchange for a handful of users or create a provider socket for each browser.

Binance official starting reference: https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams . Verify current payloads, limits, available endpoints and applicable use conditions. Test reachability from the intended Render region. If inaccessible there, evaluate a supported free public venue and preserve its source and quote currency explicitly. Do not bypass geographic access restrictions or assume USD and USDT are equal.

Market observations update valuations without reloading or rewriting the ledger. Preserve Decimal strings end to end, observation ordering, provider timestamp where present, local receipt time and rejection of invalid/nonpositive/future values. A REST price snapshot without a trade timestamp must be labeled as a recently fetched reference snapshot, not proof that a new trade happened at receipt time.

Maintain the existing 30-second freshness policy and its regression guarantees. If the feed disconnects, the browser must age prices to stale even if it receives no more messages. Stale values may remain visible as last-known observations but cannot masquerade as a complete current valuation. Never invent movement, substitute zero for missing prices, or show LIVE because only a transport connection succeeded.

Show quantity, cost basis, average cost, price and its unit/source/time, holding value, realized/unrealized P&L, P&L percentage where mathematically defined and allocation only when the needed valuations are complete. Distinguish market price change from the user's own return. Keep reference prices independent of user's entered historical prices.

Use clear Thai copy such as 'บันทึกประวัติซื้อ/ขาย' and 'มูลค่าประเมิน'. Keep the forms usable for assets held in another exchange or wallet without connecting those accounts. For entering an existing position, provide a transparent opening purchase/history workflow using the existing ledger where possible; avoid adding a second editable balance that disagrees with trade history. Do not silently subtract an external purchase from manually recorded cash.

## B. Add actual stock/ETF holding records

Implement a stock/ETF portfolio ledger with manual historical buy/sell entries and, where appropriate, an explicitly described opening-history entry. Support validated symbol/instrument identity, portfolio, quantity (including fractional shares), date, price, quote-currency fee and note. Start with US stocks/ETFs priced in USD; do not introduce Thai equities or corporate-action automation in this increment.

Follow the existing ledger patterns for owner mapping, Decimal validation, weighted-average cost, fee treatment, oversell rejection, deterministic history ordering, correction/void audit trail, transaction boundaries and idempotency. Explain the policy for identical-date transactions and backdated entries. Do not change crypto accounting to implement stocks. Make any corporate actions not supported in this increment explicit; never claim adjusted quantities or dividends are automatically handled.

Show recorded holdings and cost/history even when market data is unavailable. Connect eligible observations to each holding, calculating value and unrealized P&L only with appropriate source/freshness. Keep the stock watchlist separate from the holdings list so following AAPL never implies owning it.

Use free data where its documented scope permits the intended users. Verify provider pricing, coverage, latency, limits and public-display permissions from current official sources. Existing Alpaca Basic has single-exchange IEX coverage and owner-only code; do not just remove its guard or broadcast personal-account data to everyone. Evaluate up to three realistic candidates rather than conducting an indefinite provider search.

Starting references:

- https://docs.alpaca.markets/us/docs/about-market-data-api
- https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf
- https://www.finnhub.io/ and https://finnhub.io/terms-of-service
- https://twelvedata.com/pricing and https://twelvedata.com/pricing-business

Treat free real-time access and permission to serve other users as separate facts. Ask only for a specific genuinely missing private setup action after preparing all available work; no credentials in chat. No provider emails/notices or paid signup without owner authorization. If no zero-cost public real-time entitlement is established, mark that subfeature INCOMPLETE, retain stock holding/cost functionality and show honest unavailable or approved delayed references. Do not claim delayed widgets fulfill the owner's real-time request. Do not make a provider limitation a reason to stop crypto implementation.

## C. Complete the asset overview and manual assets

Reuse existing cash records. Add a modest manual-valuation workflow for other assets, such as physical gold or property, with name/type, native currency, quantity/unit where applicable, cost if known, valuation amount/date and note. Label them 'ประเมินด้วยตนเอง' with valuation date. Do not connect new speculative gold/property feeds or animate manual/cash values as though they have market ticks.

The overview should distinguish cash, crypto, stocks/ETFs and manually valued assets. Show native-currency subtotals and a THB estimate only when the required validated conversion is available. Use direct USDT/THB for USDT holdings. USD holdings require their own USD/THB source, date and freshness/delay semantics; never substitute USDT/THB or assume a 1:1 peg. If a reliable free conversion is unavailable, preserve USD subtotals and mark the THB estimate incomplete.

Show current value, cost and P&L only where comparable and defined. Avoid double-counting a portfolio in both its subtotal and its constituent holdings. Do not count income/expense history or a market watchlist as an additional asset. Cash entries are current manually maintained balances unless an explicit linked-account accounting workflow exists; do not silently derive or debit them from unrelated historical trades.

If some positive holdings cannot be valued, show known amounts with an explicit coverage/partial label, or N/A for the complete total. Do not silently sum available prices and call the result the total. A recorded zero position need not make valuation incomplete merely because its price is unavailable. Do not call the asset sum net worth while liabilities remain outside scope.

## D. Persistence, ownership, backup and compatibility

New holding/manual-asset data belongs in PostgreSQL under server-derived owners with migrations, shared validated contracts and appropriate authenticated routes. Use isolated synthetic PostgreSQL for migration/integration testing. Never reset, repurpose, migrate or delete the existing cloud database during local implementation.

Preserve existing records and accounting. Use forward-compatible migrations; document upgrade/rollback limits. Do not casually broaden accepted decimal formats or reduce precision.

Extend export/import to include new persisted asset records. Preserve reading existing backup v2; introduce a documented new version if necessary. Preview/consent, ownership remapping, size limits, empty-account restore rules, atomic rollback, identical-key retries and forbidden credential fields must cover all newly included datasets. Ensure 'empty' checks account for new tables. Do not store credentials or transient market observations as account backup data. Keep deletion/restore suppression and account privacy tooling consistent with new owner data.

Keep real password sessions, HTTP/WS authorization and revocation, exact origin validation, server-side secrets, audit trail and unknown-outcome reconciliation. Market visibility changes must not leak other users' holdings, notes, costs or history. Sharing eligible public quotes is distinct from sharing private portfolio records.

Preserve navigation locks and the same payload/idempotency key on retries. Never fake success, prematurely clear pending state, rewrite provider timestamps or persist account/ledger data in localStorage. Presentation state remains separate from financial state.

## E. UI and truthful behavior

Keep the notebook presentation across overview, crypto, stocks, other assets, forms, histories and status panels. Reuse existing components and enhance navigation minimally. Stock holdings should be reachable from the existing stocks area rather than requiring an unrelated app rewrite.

Support light/dark, hidden amounts, long labels/Decimals, empty/loading/error/partial/stale/unknown-write states, keyboard dialogs and mobile More. Check 320/375/768/1024/1440px without document overflow; financial tables may have an accessible local scroll region. At least 44px interactive targets. Provide units, headings, labels, visible focus and announcements for important errors/status changes. Avoid flashing on every tick; respect reduced motion.

Do not inject fictional balances into production to make the screen look complete. Any chart must describe actual available history: a short session observation chart is not a historical P&L/performance chart. Do not add a chart library or invented history solely for appearance.

## F. Acceptance and delivery

Implement in stages within this task: finish existing crypto valuation/feed, then stock ledger and available pricing, then manual assets/overview/backup integration. Continue independent work if a specific provider action is missing. Ordinary users must be able to record and view their own portfolio without owning the website operator's API credentials.

Add meaningful tests for:

- non-BTC/ETH catalog/pair validation and stream subscription/cache lifecycle;
- provider ordering, source/quote units, timeout/backoff and stale aging;
- quantity/cost/fees, buy/sell/correction/void and exact P&L;
- stock fractional quantities, oversell and backdated history;
- manual valuation status and mixed-currency incomplete totals;
- two-owner isolation, protected HTTP/WS, session revocation and unknown-write retries;
- migrations, new backup round trips, existing v2 compatibility, atomic rollback and deletion/restore boundaries;
- UI navigation, privacy and relevant form interactions.

Run root tests/build, tracker tests/typecheck/build, package smoke, diff check and the appropriate isolated PostgreSQL integration checks. Preserve existing meaningful assertions and record actual exit codes, including failed attempts. Do not disable tests, freshness checks or authorization to make the result pass.

Prove crypto updates using genuine provider observations and a synthetic recorded holding served by the actual local app, clearly separating synthetic ownership/accounting inputs from real public prices. Observe multiple genuine prices arriving and changing value/P&L without reload. Use a deterministic synthetic price-change test as additional calculation evidence; do not label mocks as real-market observations. Check provider reachability from the intended cloud region where authorized. For stocks, live-open-session evidence is required before asserting working real-time data; unavailable credentials/closed sessions are NOT TESTED, not a passing connection test.

Never require a real trade, deposit, wallet connection or modification of the owner's portfolio to test this application. Use local isolated accounts/databases and no real financial data. Stop only processes you started and retain test volumes unless separately authorized to remove them.

Deliver an incremental patch against this task's starting state, changed files, migration/backup notes, setup steps, screenshots and a review report. Report independently: ledger implemented, provider connected, real observations verified, ordinary-account isolation/access verified, backup compatibility verified, and public deployment status. If a subfeature is missing, identify it precisely without describing the whole app as complete or blocked.

Do not commit, push, deploy, change public enrollment, modify cloud databases/settings, enable paid services or remove the owner's work in this turn. Prepare a concrete deployable result and stop for review. Include staged rollout and fallback/rollback instructions for the real-use service. Be explicit that local code and screenshots are not yet the public version.
