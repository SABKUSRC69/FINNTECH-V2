# Student-project real-use release — 2026-10-08

Working HTTPS service: https://finntech-personal.onrender.com . **Live with public registration enabled after explicit owner confirmation.** Current actual health: registrationsOpen=true, stagingEnrollment=false, authenticationMode=email-password; /api/ready returns 200. Public signup outside the former allowlist passed.

Scope follows the latest owner instruction: persistent individual accounts on free Render/Neon, hosting sleep/no SLA accepted; Brevo, Drive/Gmail automation and machine-loss recovery deferred. Their unconfigured integrations no longer block basic registration/login. Optional existing recovery/privacy/backup tooling preserved.

Implemented explicit `TRACKER_REAL_AUTH_MODE=email-password` with `TRACKER_RECOVERY_MODE=off`; there is no silent fallback from verified-email mode. Better Auth 1.7.7 creates real password hashes and authenticated sessions. Emails remain `emailVerified=false`. Unconfigured reset/verification endpoints return 404. Honest UI explains missing recovery and forgotten-password consequences. Authentication still requires real lifecycle enrollment, an unblocked account, server-derived owner mapping and any staging membership. Signup uses a database transaction and global advisory lock for account/storage limits; user/account/lifecycle/session creation rolls back together. Extra signup fields such as emailVerified are rejected. Existing HTTPS/origin/cookie/HTTP/WS authorization and finance code remain intact.

Neon: fresh database **finntech_personal**, separate **personal_app** role without SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS. Temporary provisioning membership removed. This is a separate database on the existing Neon project; no DEMO tables were changed or promoted. Forward migrations: 10/10; runtime boundary recorded; no demo workspace rows. PostgreSQL database creation initially lacked role membership; partial new role was preserved and unused-role provisioning resumed safely, without resets/deletion. Credentials remain in ignored private files and Render env only.

Render Free service **srv-db3pcll9fdbs73enrmg0**, separate from DEMO **srv-db35ldnavr4c739s7j7g**. Dockerfile.real; Ohio; /api/ready health check; auto-deploy Off; no purchased service/disk/domain. Release branch codex/student-real-use in SABKUSRC69/finntech-beta contains only an allowlisted tracker snapshot. Root owner's Git index/branches/unrelated changes were preserved. Release commit **74812cbd16cef6bf2835af88ab153c5d1d8ba642**; source manifest in student-real-evidence-20261008/release-manifest.json. No dependency changes in this increment.

## Actual verification

| Command/check | Actual result | Exit |
|---|---|---:|
| npm test | 49 files, 408 tests PASS | 0 |
| npm run tracker:test | 21 finance + 13 contracts + 125 API + 104 web = 263 PASS; dev smoke PASS | 0 |
| npm run tracker:typecheck (final, after diagnostic) | PASS | 0 |
| npm run build | PASS | 0 |
| npm run tracker:build | PASS | 0 |
| node --no-strip-types scripts/tracker-package-smoke.mjs | PASS | 0 |
| isolated PostgreSQL password-mode integration | 5 PASS, 0 FAIL/skip | 0 |
| final API tests after readiness instrumentation | 125 PASS | 0 |
| Dockerfile.real build (final) | PASS, Node 22 Linux | 0 |
| compiled package smoke inside release image | PASS | 0 |
| release/frontend scan | 92 files; zero matches of known current secret values | 0 |
| git diff --check | PASS | 0 |
| cloud staging acceptance on HTTPS | 7 groups PASS; two independent cookie jars | 0 |
| cloud persistence after Render redeploy | both mappings/export arrays/finance/crypto unchanged; logout/login PASS | 0 |
| browser login + export download | genuine login; saved JSON v2 parses; 1 transaction/1 trade/1 cash account; no credential fields | PASS |
| npm audit --json | 14 findings: 12 high, 2 moderate; affected package names absent from 119-package server runtime closure | 1 |
| public registration outside former allowlist | PASS: genuine session, emailVerified=false, empty isolated workspace, logout/login, recovery absent | 0 |
| persistence recheck after public activation deploy | PASS: both existing owners, exports and finance/crypto unchanged | 0 |

Earlier sandbox attempts: root/tracker tests/builds exit 1 due to Windows EPERM realpath, not failing behavior assertions. Approved reruns passed. A new regression test initially hit Better Auth's signup rate limit (4 PASS/1 FAIL, exit 1); the final test honors the existing 10-second window rather than disabling it (5 PASS, exit 0). Typecheck initially found a possibly undefined test header (exit 2); fixed with an asserted response header, final exit 0.

Cloud Prisma connection establishment initially timed out at 1 second while pg connected. Increased only bounded connection establishment to 5 seconds; query_timeout remains 5 seconds and unknown write outcomes still use original payload/key. Confirmed same target/role boundary and SQL connection afterward. Do not confuse this with stale price thresholds (unchanged 30 seconds).

First Render deploy **dep-db3pcm59fdbs73enrob0** failed waiting 15 minutes for readiness. Exact image passed /api/health and /api/ready locally, including simulated 0.1 CPU/512 MB. Added coarse no-PII readiness logs without weakening readiness. Next deploy **dep-db3pou60tbcc738g3kd0** Live, database/storage ok at 9 ms. First deploy cause **UNCONFIRMED**. Persistence redeploy **dep-db3puo0473hc73euc5c0** Live, readiness 7 ms/5 ms; cloud-persistence check passed afterward.

Cloud acceptance used fictional expenses, budget, cash, and a Decimal crypto trade only. Confirmed cross-owner category write and correction rejection, anonymous rejection, payload/key conflict 409, concurrent same-key expense creates one receipt, THB/USDT rejection, exact long Decimal price, credential-free attachment saved/parsed, consent-based idempotent restore into empty other owner with remapped IDs. Both accounts' datasets persisted after actual Render redeployment. UI browser download separately saved and parsed a file. Owner data/secrets were never used as test data.

## Limits / deferred / NOT TESTED

Public activation completed with explicit owner action-time confirmation. Render deployment **dep-db3qikmgekts73fql4f0** is Live, readiness database/storage ok at 103 ms and 8 ms. The focused public acceptance script and existing two-owner persistence recheck both exited 0 after activation. Only the new real-use service changed; DEMO remained separate.

Two physical independent browsers/profile isolation: NOT TESTED; cloud evidence uses separate HTTP cookie jars plus one browser UI login. New-mode session expiration and WS revocation on live cloud: NOT TESTED in this increment (existing tests unchanged). Full desktop/mobile breakpoint re-audit: NOT TESTED in this increment; no redesign performed. Recovery delivery, Drive uploads, Gmail alerts, off-device restore, machine-loss recovery and OS CVE scanner: NOT TESTED/deferred; no backup readiness claim. Automated retention/purge was not activated. Test accounts/data retained; no destructive cleanup.

The 14 dependency findings remain in dev/build/root UI dependencies; assessment of package names is not a full compiled-browser or OS security audit. No paid upgrades or dependency updates performed. Free Render hours are shared between services and free hosting may sleep/quota-suspend; accepted scope has no SLA. Users must keep password and JSON export copies; JSON cannot recover a login account.

Temporary local Linux probe container stopped; temporary API port 4201 released. Synthetic PostgreSQL was started for tests; the cleanup stop command could not connect because the Docker engine was unavailable. Ports 4201 and 5446 had no listener at final check. Explicit final PostgreSQL container stop is NOT TESTED; volumes retained. No existing owner services stopped. Public endpoint and free database resources remain deployed with public signup enabled.

## Activation record

Following explicit owner confirmation, the new service was set to TRACKER_REAL_ENROLLMENT_MODE=public and TRACKER_REAL_REGISTRATIONS_OPEN=true, with TRACKER_REAL_ACCEPTANCE_APPROVED=review-approved; TRACKER_REAL_STAGING_EMAILS was removed. Database/role/secrets unchanged, recovery off. Save and deploy completed Live; public signup and both prior owners were verified afterward. DEMO service unchanged. The acceptance flag reflects owner authorization and essential checks, not an independent reviewer certificate.

Browser automatic approval rejected the public draft change because it materially expands public access and requires confirmation at action time. No workaround attempted; owner subsequently confirmed, and the normal UI action succeeded. Earlier administrative cloud create was rejected while an integration test still failed; it was retried only after the required checks actually passed.

See docs/operations/student-real-use.md for supported mode/setup and student-real-evidence-20261008 for actual logs, manifests, screenshots and nonsecret cloud results. Incremental patch is against the 476-file starting snapshot for this request, not Git HEAD.

A readiness helper returned a successful HTTPS readiness response but Node terminated with a Windows UV_HANDLE_CLOSING assertion (exit 1). Subsequent public acceptance and persistence checks independently verified readiness and behavior, both exit 0. This helper process failure is recorded separately from application behavior.
