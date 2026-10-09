# HTTPS deployment status — 2026-10-07

Render deployment dep-db369vjbc2fs73cok3bg: Deploy succeeded / Live.
Commit: 2def6a6d4bb690ce28107c8bb3710390930edba9.
URL: https://finntech-beta.onrender.com

Actual HTTPS fetch checks (exit 0, network-enabled execution):
- /: 200 HTML
- /api/health: 200 JSON
- /api/ready: 200 JSON
- /api/not-found: 404 JSON

Initial sandbox network fetch failed (exit 1); network-enabled rerun passed. Browser loaded the actual login screen and Beta fictional-data notice. Registration remains closed during acceptance. Signup, authenticated ownership, backup, HTTP/WS session revocation and free-tier sleep/recovery on this cloud deployment are NOT TESTED at this checkpoint. This is deployment availability evidence, not full public Beta acceptance.

First deployment failed due to Node 22 rejecting --no-strip-types. Corrected Docker CMD was deployed successfully. No claim that all acceptance checks are complete.
