# FINNTECH asset portfolios — local review, 9 October 2026

## Scope and decision

Implemented against the owner's existing dirty working tree, following `FINNTECH_ASSET_PORTFOLIO_PROMPT_EN.md` and the pasted request. This increment is **local only; STOP FOR REVIEW**. No commit, push, deployment, cloud database/settings changes, dependency changes, purchases or existing volume removal occurred. The notebook release previously published at `https://finntech-personal.onrender.com/` remains the public version; these new features are not claimed to be online.

Local authenticated preview: http://127.0.0.1:4312/ — synthetic records only. Credentials remain in the private ignored setup directory, not this report. This is a manual tracker: no order execution, automatic cash debit, deposits or credit.

## Delivered behavior

- Crypto: backend validates BTC/ETH/SOL/XRP/BNB/DOGE/ADA against actual spot USDT metadata; one bounded shared Binance public aggregate-trade WebSocket per server. Trade timestamp, receipt timestamp and sequence are checked. Duplicate/older/future/nonpositive events cannot freshen a quote. A REST fallback is explicitly a snapshot without a trade timestamp. Prices older than 30 seconds remain unsuitable for current valuations. Metadata refresh, timeout, exponential backoff, reconnect, idle stop and lifecycle stop are bounded. Unsupported/delisted assets retain history and show N/A.
- Holdings display quantity, known cost, average cost, current value, realized/unrealized P&L, personal cost return and allocation. Historical inputs remain distinct from reference prices. Percentage presentation is rounded to two places; ledger precision is unchanged.
- Owned USD stock/ETF portfolios and fractional buy/sell history: curated identities AAPL/MSFT/NVDA/AMZN/GOOGL/TSLA/SPY/QQQ; fees, dates and notes; correction/void retain original history; replay rejects overselling/backdated invalid histories; row locking and the existing audited idempotent mutation boundary remain in place. Same-date events use recorded order; replacements preserve original order. No automatic splits, dividends or corporate actions. Watchlist is explicitly separate from owned holdings. Existing Alpaca key-owner authorization remains enforced.
- Manual gold/property/other assets: native THB/USD/USDT, dated total valuation, optional quantity/unit/cost/note, owner-scoped optimistic-version updates. Value is a dated total, not quantity multiplied a second time or a live market price. No delete UI was introduced.
- Combined assets show native subtotals and known partial THB amounts honestly. Missing eligible stock price or direct USD/THB makes the complete total N/A. USDT/THB is never substituted for USD/THB. Cash is not inferred from investment entries and manual valuation is not realized profit.
- Backup v3 includes stock portfolios, complete stock history including cancellations, and manual assets. Existing v1/v2 remain readable. Strict size/count/identity/accounting checks, UUID/owner remapping, empty-target restriction and all-or-nothing restore are retained. No credentials, sessions, market prices or server configuration are exported.
- New writes preserve validated payload and idempotency key after unknown outcome. Navigation/logout stay locked until reconciliation. The stock void dialog keeps its retry button inside the focus trap; Escape/close remain blocked while reconciliation is pending. Owner privacy/deletion procedures include the new tables and retain their approval/archive boundaries.

## Actual final acceptance

All seven final commands completed with exit code **0** after the last source change. Full outputs are in `evidence/asset-portfolios-20261009/check-*.log`; structured results in `checks.json`.

| Command / check | Actual result | Exit |
| --- | --- | --- |
| `npm test` | 53 files, **426 tests passed** | 0 |
| `npm run build` | Root production build passed | 0 |
| `npm run tracker:typecheck` | Passed | 0 |
| `npm run tracker:test` | Finance 25 + contracts 16 + API 129 + web 111 = **281 passed** | 0 |
| `npm run tracker:build` | API + web build passed | 0 |
| `node --no-strip-types scripts/tracker-package-smoke.mjs` | Passed | 0 |
| `git diff --check` | Passed | 0 |
| Synthetic PostgreSQL integration command below | **11 passed, 0 failed/skipped** | 0 |
| Fresh isolated Prisma migration deploy | All 13 forward migrations applied | 0 |
| Populated upgrade SQL rehearsal | Old 10 migrations + old synthetic records, then 3 new migrations; all rows in 8 existing tables unchanged | 0 |
| Genuine public provider probe | REST HTTP 200, valid seven pairs, real WebSocket events | 0 |
| Browser responsive matrix | 4 changed pages × 5 widths × 2 themes = **40/40 no page overflow** | Browser result, not shell exit |
| Browser download | Actual 2,468-byte JSON, v3 parsed, credential patterns absent | Browser result, not shell exit |

Integration command (private synthetic URL supplied through ignored file):

```powershell
$env:FINNTECH_PORTFOLIO_TEST='synthetic-only'
node --env-file=.portfolio-20261009.local/database.env --no-strip-types --import tsx --test apps/api/db-test/assets.integration.ts
```

Integration covers genuine Better Auth sessions, two owners, fractional USD accounting, double submission, payload mismatch, cross-owner writes, exact Origin/body limits, backdated oversell rollback, immutable originals, optimistic version conflicts, export/restore/accounting tamper rejection, older backup compatibility, late-insert restore fault rollback and identical-key retry, existing cash unchanged, deletion boundary rejection and approved synthetic purge **inside deliberately rolled-back transactions**, and logout revoking HTTP plus active WS. No retained owner/test data was purged.

Earlier attempts are not concealed: initial tracker tests exited 1 because old mocks did not provide new read endpoints and a strict manual-asset schema incorrectly rejected persisted `id/version`; both were corrected. Initial typecheck/build exited 2 for new test typing and an unsupported Testing Library option; fixed. One intermediate web test timed out during clock adjustment; the complete subsequent checks passed. Docker access and Windows Time operations initially failed due to environment permissions/service state, separately from code bugs. No skipped tests or weakened assertions were used to obtain the final result.

## Browser and genuine-price evidence

Evidence directory: `evidence/asset-portfolios-20261009/`.

- `crypto-real-1.jpg` and `crypto-real-2.jpg`: genuine SOL **107.83 → 107.92 USDT**, synthetic quantity **2**, unchanged cost **201 USDT**, value **215.66 → 215.84**, unrealized P&L **14.66 → 14.84**, without reload. These initial captures used the actual 1280px viewport, not 1440px. `real-public-observations.json` contains public quote metadata only.
- Later named `*-1440-*`, `*-375-*`, `*-320-*` screenshots and DOM snapshots correspond to explicit actual viewport overrides. `responsive-matrix.json` records viewport/client/scroll widths for **320/375/768/1024/1440**, light/dark, assets/crypto/stocks/backup. Windows scrollbars account for a 15px client-width difference. No page-level horizontal overflow was detected. This matrix is not a full accessibility certification.
- `stock-dialog-keyboard.json`: initial close focus; Shift+Tab wraps to confirmation; Tab wraps back; Escape closes and returns focus to the original void button, without submitting a cancellation.
- `more-keyboard.json`: mobile sheet wrapping, Escape and focus return. `mobile-form-bottom.json`: manual submit bottom ~540px versus bottom-nav top ~829px at 375×900, so the focused submit is not covered. Pending reconciliation placement is additionally tested in frontend regressions.
- `stock-privacy.dom.txt`: stock quantity and cost concealed by amount privacy toggle. `manual-form-375-dark.jpg` and `manual-submit-375-dark.jpg` show the dated manual form and usable submit.
- `interactive-targets.json`: 40 page/width/theme checks of rendered main controls and navigation/header buttons; no target below 44px in either dimension was found. Physical touch and screen-reader testing remain unperformed.
- Browser reload after local preview restart retained genuine authenticated synthetic owner data: SOL quantity/cost, AAPL 0.5/cost 51 USD, manual gold 12,500 THB and cash 5,000 THB. Persistent account/session secret stays private. No browser restore was submitted; atomic restore was tested through actual HTTP/PostgreSQL integration instead.

Before reference: `notebook-redesign-evidence-20261008/stocks-1440-light.jpg`. New stock screenshots show a real owned ledger preceding the distinct watchlist; no template redesign was performed.

## Clock synchronization evidence and limits

The owner authorized starting Windows Time/resync against its configured source. The elevated helper's `w32tm /resync` returned **exit 0**, and `w32tm /query /status` returned **exit 0**; W32Time is running. However, a later status query still reported **Leap Indicator 3 (not synchronized), Stratum 0**. Therefore Windows Time protocol synchronization is **UNCONFIRMED**, despite acknowledgement and a recorded last-successful-sync time. No source change or freshness/future-timestamp relaxation was introduced.

Before adjustment, public Binance timestamps were roughly 1.5s ahead of Windows receipts and rejected correctly. After adjustment, the real probe recorded trade `2026-10-08T18:36:04.330Z` received `18:36:04.385Z`, and further events likewise arrived after their provider timestamp. This proves observed feed eligibility, not durable clock synchronization. If the host clock drifts, future events remain rejected and the UI falls back honestly.

## Provider evaluation — technical access is not redistribution permission

All references below are official; no paid service or credentials were added.

| Provider | Verified constraint | Decision |
| --- | --- | --- |
| Binance market-data-only | Keyless public REST/stream; combined streams; bounded ping/message/connection rules; 24h connection lifespan | Local REST and genuine stream PASS. Public display/license entitlement **UNCONFIRMED**, Render-region reachability **NOT TESTED**. No geographic workaround. |
| Alpaca Basic | Free IEX coverage, 30 stream symbols, 200 API calls/min; authenticated access; terms restrict third-party redistribution | Keep existing key-owner guard. Public multi-user real-time permission **INCOMPLETE**. No key available for real open-market-session proof. |
| Finnhub | Official terms restrict third-party redistribution/derived data without written permission | No proven free public display entitlement; not integrated. |
| Twelve Data | Business Basic free limits 8 API credits/min, 800/day and trial WS credits; internal non-display; external display tier is paid | Not a verified zero-budget public display solution; not integrated. |

Sources:

- [Binance market data only](https://developers.binance.com/en/docs/products/spot/faqs/market_data_only)
- [Binance stream specification](https://raw.githubusercontent.com/binance/binance-spot-api-docs/master/web-socket-streams.md)
- [Binance terms](https://www.binance.com/en/terms): IP/jurisdiction restrictions do not establish this app's public redistribution entitlement.
- [Alpaca data API](https://docs.alpaca.markets/us/docs/about-market-data-api), [official terms](https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf)
- [Finnhub terms](https://finnhub.io/terms-of-service)
- [Twelve Data business pricing](https://twelvedata.com/pricing-business)
- [NASDAQ listed identities](https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt), [other listed identities](https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt): actual local probe verified all eight ledger symbols and stock/ETF identity. This curated set is not a complete instrument directory or corporate-action service.

## Migration, runner and rollout instructions

Three additive migrations: `20261009000000_owned_asset_ledgers`, `20261009000001_asset_history_guards`, `20261009000002_asset_numeric_invariants`. The latter guards reject numeric NaN, invalid quantity/unit/name and direct destructive mutations; the authorized owner purge procedure is extended without removing its controls. No old migration was rewritten.

Isolated project `finntech-portfolio-20261009`, PostgreSQL16, role `portfolio_synthetic`, loopback **5448**, database `finntech_portfolio_test`; separate populated upgrade database `finntech_portfolio_upgrade_test`. Guard `scripts/portfolio-db-target.mjs` refuses any other integration target. New retained volume `finntech-portfolio-20261009_portfolio_test_data`. Fresh Prisma deployment and exact-SQL populated rehearsal passed; populated Prisma migration-history reconciliation itself is **NOT TESTED**. No production/DEMO connection was used.

To run the review preview after dependencies/builds and private synthetic setup exist:

```powershell
$env:FINNTECH_PORTFOLIO_TEST='synthetic-only'
node --env-file=.portfolio-20261009.local/database.env scripts/portfolio-local-preview.mjs
```

Do not start a second preview on 4312. Stop the foreground preview with Ctrl+C; its handler closes market sockets, WS/server and DB adapter. Stop only this Docker project with Compose `stop`, never `down -v`. Observed listeners: 127.0.0.1:4312 PID14464 (preview), 127.0.0.1:5448 PID11656 (Docker forwarding). Temporary integration port4311 closed. `/health` returned HTTP200. Preview stop/restart was performed, with records retained; PID is observational and must be rechecked before any process operation. No unrelated processes were stopped. Private raw backup, passwords, DB URL and auth secret are deliberately excluded from deliverables.

Future rollout, only after review/authorization: take a separately tested backup of the selected real database; verify target/provenance; apply forward migrations without reset; release API/contracts/web together; check actual regional REST/WS access and provider public-display rights; smoke-test two synthetic accounts against the chosen environment. Preserve DEMO separately. If rolling back application code, keep added tables/history and backups; never drop them. Older application code does not export the new v3 datasets, so rollback must not be presented as a complete backup solution.

## PASS / incomplete / not tested

**PASS:** local code checks; isolated genuine-auth/owner-bound ledger and atomic backup regressions; native Decimal accounting; bounded crypto metadata/stream and observed live movement; honest stale/N/A behavior; unknown-outcome navigation locks/retry; actual JSON download; additive migration preservation rehearsal; responsive/keyboard observations above.

**INCOMPLETE / UNCONFIRMED:** free public multi-user real-time stock entitlement and configured open-market feed; direct USD/THB; Binance public redistribution entitlement; durable Windows Time synchronization. These are not replaced by fake quotes, a USDT peg, or stale-threshold changes.

**NOT TESTED:** Render-region/provider network probe or new cloud deployment, production migration/data operations, populated Prisma migration metadata rehearsal, browser-submitted restore, real mobile touch hardware/screen readers, corporate-action accounting, long-duration 24h stream soak or host reboot clock durability. Recovery/Drive/Gmail automation remain optional prior work and were not reconfigured.

Incremental patch and changed-file hashes accompany this report. The patch is against the 634-file task-start snapshot, not Git HEAD, and excludes the owner's earlier modifications from the delta. Patch application and preservation evidence are recorded separately in `patch-verification.json`.

For an untouched copy of that task-start snapshot only, patch verification uses `git -c core.autocrlf=false -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol apply --check --whitespace=error-all <patch>` followed by application to the scratch copy and byte comparison. This preserves Windows CRLF bytes without changing global Git configuration. Do not apply it again over this already modified working tree. Earlier patch tooling attempts failed byte comparison under automatic CRLF conversion and then flagged CR line endings as whitespace; the per-command settings corrected the tooling, without changing owner files or disabling real trailing-space checks.
