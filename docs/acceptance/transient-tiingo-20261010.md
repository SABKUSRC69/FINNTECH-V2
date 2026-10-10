# Personal Tiingo transient pricing — 2026-10-10

## Release

Live site: https://finntech-personal.onrender.com/

Deployment repository: SABKUSRC69/finntech-beta, branch `codex/student-real-use`.
Retention commit: `afbc953e0ad5a2424e7aa29df8e4be2f539b3bd4`.
Final live commit, including the FX follow-up: `ebc5a148f12209b7372a32c322904c5166f56e09`.
Retention deployment: `dep-db4ks72d0e5s73cobftg`; final deployment: `dep-db4l0j3ncjis73fua80g`; service `srv-db3pcll9fdbs73enrmg0`.
Render reported **Deploy succeeded | Live** for both; final service live at 03:38:04 Asia/Bangkok. The browser loaded the final production bundle `index-DedFzZcm.js`.

## Changes

- Personal Tiingo reads fetch held supported symbols during a request, with no stored quotes, provider instances, completed promises or valuation history.
- Reconciliation returns metadata only. The visible mounted view keeps calculation inputs in local React state; hidden/pagehide/unmount clears them.
- View entry, key or held-symbol changes, trading-session changes, 30-minute refresh, and an explicit refresh button request a new operation. No browser storage or global price store holds personal Tiingo results.
- Request budget is 40/hour and 500/day per owner in this process, including key verification. The provider's own quota remains authoritative; other apps or restarts can consume that quota too.
- Existing encrypted personal keys remain write-only. Idempotent save retries return the committed receipt; verification writes have a longer timeout.
- Only explicitly configured redistribution feeds use the durable relay. Personal environment keys use the transient reader too.
- Migration `20261010010000_transient_personal_prices` removes legacy personal Tiingo cache rows and adds a database constraint against future personal Tiingo persistence. Startup clears legacy Tiingo caches when no redistribution feed is configured.
- Accounting data, manually entered references and encrypted keys are retained.

## Checks performed

- Root and isolated release TypeScript checks passed.
- Isolated release production build passed. The initial sandboxed Vite build could not resolve Vite; the same build succeeded outside the sandbox using existing dependencies.
- Migration deployed against the verified real-use boundary for this site's origin. All other migrations were already applied.
- Before/after row counts unchanged: cash 7, stock trades 14, holdings 9, crypto trades 5, finance transactions 11, active keys 1. Personal Tiingo cache rows: 0 before and after.
- Live selected account still authenticated after reload. Assets showed transient pricing notice and manual refresh control.
- Both displayed AAPL holdings selected Tiingo EOD closes, with no missing-price or error state. The all-assets THB total was numeric and USD/THB was available.
- Manual refresh entered its fetching state. No provider prices or derived numeric valuations are included in this report or evidence screenshots.
- A subsequent observation caught an intermittent unavailable total while stock closes remained usable: USDT/THB had expired. The prior reference-rate handler started an asynchronous refresh and returned the old snapshot immediately. A follow-up changes the handler to await the due/in-flight update, fetches public metadata and ticker concurrently within one 5-second timeout, and evaluates freshness at render time. The 30-second upper age limit and rejection of future timestamps remain intact. The follow-up release also passed TypeScript checks and production build; its separate manifest and published record are in `transient-tiingo-20261010/fx-followup`.
- On the final live version, observations after view entry and after more than 30 seconds both showed a numeric all-assets total, fresh USDT/THB and usable Tiingo closes for both AAPL rows, with no status/alert messages. These are sampled observations, not a guarantee against upstream failures.
- No test suite was added or run for this change. These observations establish the current deployment, not a guarantee of provider availability or future quota.
- Only the twelve manifest files were committed to the clean deployment checkout. Unrelated working-repository changes were preserved. Known-secret source/bundle scan passed.

## Scope

Supports the existing catalog: AAPL, MSFT, NVDA, AMZN, GOOGL, TSLA, SPY, QQQ.
Daily closes use the exchange trading-session policy; they are not intraday quotes. USD/THB remains a daily ECB reference. Live crypto freshness remains 30 seconds.
Each account must connect its own Tiingo key; this change does not authorize sharing one personal feed with other people.
The implementation uses transient calculation inputs; it does not certify compliance with every provider term.

## Evidence

See [release manifest](transient-tiingo-20261010/release-manifest.json), [migration result](transient-tiingo-20261010/migration-result.json), and [published release](transient-tiingo-20261010/published.json).

The key/status screenshot `transient-tiingo-20261010/connected-transient-key.png` contains no provider prices or derived valuations. Provider response shape was checked against the [official Bitkub V3 documentation](https://github.com/bitkub/bitkub-official-api-docs/blob/master/rest-v3.md) and a public read; numeric lexemes are preserved by the existing provider JSON parser.
