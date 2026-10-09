# FINNTECH Public Beta — Render Free + Neon Free

2026-10-07 Asia/Bangkok. Owner selected **public signup / synthetic financial data only**, replacing Closed Beta invitation-only. Repository visibility is not changed. No real-data migration, shared DEMO account, automatic invitation mail or synthetic recovery activation.

## Release prepared / prerequisites

One compiled Node22 API serves `apps/web/dist`, HTTP API and WS from the same HTTPS origin. Use `Dockerfile.beta`; never `npm run deploy` (legacy GitHub Pages). Local default remains loopback with the original PORT guard. Cloud requires explicit production mode, exact HTTPS origin, selected Neon hostname, `beta_app` role / `finntech_beta` DB, `sslmode=verify-full`, synthetic data mode and recovery off.

Owner has not created/connected Render, Neon or Git provider accounts yet. Human must create free accounts/connect a **private** release repository via provider UI and enter credentials/secret-store values themselves; never send password/token/DB URL through chat. If signup requires card, a paid plan or trial, stop that provider step. No external services have been created by this preparation.

1. Create free Render and Neon accounts through their official dashboards. Confirm actual selected plan/quota/billing has no paid resources or payment method that would enable overage charges.
2. Create a **new Neon project** for this synthetic Beta only. Create DB `finntech_beta` and role `beta_app`; do not reuse owner/test projects or move DEMO/fixtures. Choose the closest matching regions actually offered on both Free dashboards. Preserve other default DBs; no delete/reset.
3. Keep direct and pooled connection strings only in private env/secret store. Configure `sslmode=verify-full`. Runtime can use the pooled endpoint; migration must use the **direct** endpoint. `TRACKER_BETA_DATABASE_HOST` is the exact direct endpoint hostname, without `-pooler`.
4. Use a private env file outside the release containing the values in `beta-env.example.txt`. Generate a unique >=32-character auth secret locally and store it in Render; do not copy owner or rehearsal keys. Run `npm ci`, `npm run tracker:build`, then `node --no-strip-types --env-file=<private-file> scripts/beta-migrate.mjs`. This first-deploy script requires exact selected direct hostname/DB/role and an empty public schema; otherwise it refuses without mutation. It applies existing forward migrations only. Do not run ordinary prepare/reset scripts against cloud.
5. Exported source snapshot is a clean allowlisted copy of the current working tree, including tracker code that is currently untracked. Connect/push that snapshot to an owner-selected private release repo/branch; do not deploy the old HEAD or `git add .` on this dirty checkout. Keep commit/build hash evidence.
6. Create **one Free Docker Web Service** using that source and `Dockerfile.beta`, health path `/api/ready`. `render.beta.yaml` is a reviewable candidate with manual deploy and registrations initially false, not a service already created. Enter DATABASE_URL, BETTER_AUTH_SECRET, exact assigned HTTPS TRACKER_ORIGIN, direct TRACKER_BETA_DATABASE_HOST in server secret store. Do not set TRACKER_HOST/TRACKER_API_PORT; Render supplies PORT. No VITE secrets.
7. Check real HTTPS acceptance below with synthetic accounts before opening registration (`TRACKER_BETA_REGISTRATIONS_OPEN=true` and deploy). Opening is authorized by owner, but target/access/secrets and acceptance must actually exist first. Browser credential entry/change requires human takeover. Do not call a local harness public TLS proof.

## Access / limits / recovery

`TRACKER_BETA_ACCESS=public` explicitly enables public signup. `invited` requires a server-only comma-separated email allowlist and gates signup/signin/HTTP/session/WS, including periodic WS revalidation. No owner override or client owner ID. Removing an invitation takes effect after configuration deployment/revalidation; it does not delete data.

`TRACKER_BETA_REGISTRATIONS_OPEN=false` blocks only new registration, retaining existing login/logout/backup. Public beta no longer restricts invited accounts because owner explicitly chose that mode. Signup/signin bodies bounded16KiB, account HMAC buckets10/minute and aggregate path bucket60/minute, maximum4096 active buckets. Installed Better Auth limits remain enabled. Proxy headers are not trusted: explicit baseURL/trustedOrigin, `trustedProxyHeaders:false`, no client IP headers; library falls back to shared path buckets. No `trust proxy=true`. These are conservative single-instance limits, reset on process restart; not distributed or verified client-IP protection. Re-evaluate with measured Render topology and actual public usage before expansion.

Recovery remains **off**. No mailbox service, verified-email claim, admin password override, email change/link/delete feature. A lost password can lose access to that Beta account. User-downloaded JSON excludes credentials and restores data into a new empty owned account; it does not restore login credentials or silently transfer ownership. Beta data never becomes real-data storage automatically.

## Free plans verified on official sources, not account quotas

- [Render Free](https://render.com/docs/free): idle15minutes, wake about1minute, ephemeral filesystem, 750 instance-hours/workspace/month, quota suspension. No keepalive to evade idle policy; database/backup cannot live on service disk. Free Render Postgres expires30days, so it is not the chosen DB.
- [Render Web Services](https://render.com/docs/web-services) / [WS](https://render.com/docs/websocket): bind0.0.0.0 on provider PORT; public WS must use wss, TLS terminated by provider; reconnect/revocation/cold start must be checked on the real URL.
- [Neon official 2026-10-02 update](https://neon.com/blog/neon-free-plan-1-gb-per-project): 1GB/project, 100CU-hours/project/month, 6-hour instant restore window. Pricing page was unreadable in the web tool, so console plan/region/quota confirmation is still required before provisioning. Retain existing Better Auth/Prisma, not Neon Managed Auth.

Free is not a production SLA. No paid disk/service/domain, card trial or external mail provider is selected. Beta must be stopped/registration paused on quota/incident instead of silently purchasing resources.

## Acceptance on the actual deployed build — still pending

Record URL, source commit + snapshot/build/image hashes and selected project/service IDs without secrets. Two independent human-controlled accounts; synthetic data only:

- Signup/login/logout/reload, anonymous/forged-Origin/owner isolation, no client owner override.
- THB/USDT/USD units, Decimal strings, budgets/cash/crypto corrections, duplicate/lost-response same payload/key.
- Actual HTTPS/Secure/HttpOnly/SameSite cookie, CSP/local assets, JSON API404, SPA deep links, no secrets in history/storage/network/log evidence.
- WSS upgrade/reconnect, revoked cookies, stale30s/outage/N/A; do not enable stock credentials or invent prices.
- Browser saved-file JSON parse/credential scan + preview/consent restore into an empty account; no raw backups/cookies in evidence.
- Render restart/redeploy/idle wake and Neon autosuspend/cold connection: data/session behavior, readiness503 vs health process200. No keepalive workaround.
- Image/release inventory and audit; backup/restore on isolated target, forward-only rollback plan. No overwrite/reset of a populated DB.

## Operate / pause / backup / rollback

Pause registration through server env and redeploy; existing users can export JSON. Stop/suspend only the selected Render service when necessary; leave Neon project/data intact. Do not change owner runtime or destroy volumes.

Before changing a populated Beta database, create an encrypted full PostgreSQL dump through a reviewed operation using the direct connection, store off Render with separately held keys, verify restore into a **new isolated target**, then apply reviewed forward migrations. Existing Windows backup scripts are hardcoded synthetic rehearsals and are not cloud backup automation. No schedule/key custody/real-data retention has been activated here. Neon 6-hour restore is not a substitute for independent backup.

App rollback: pause signup, preserve DB, deploy the previously verified compatible image/source commit. Never undo migrations by drop/reset/truncate; fix forward or restore a verified backup into a separate DB, switch only after validation and owner decision. Do not resurrect sessions/credentials by blindly restoring old DB backups. Delete/restore tombstone semantics remain unimplemented.

To tell users: public experimental Beta, financial data must be fictional, manual tracker only, no execution/deposit/credit, no password recovery, download JSON yourself, free service may sleep/suspend. Owner sends any invitations/announcements; this task sends none.
