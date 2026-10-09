# Fix the empty finance category selector and deploy

Implement and deploy a focused usability fix in FINNTECH. The owner authorizes the scoped release commit, push, and deployment to `https://finntech-personal.onrender.com/` after validation. Do not stop at local review or ask for deployment confirmation again.

Workspace: `C:\Users\Admin\Downloads\FINNTECH`. Read applicable AGENTS.md and the current personal release records. Verify the latest deployed branch/commit and preserve the dirty owner's checkout, existing portfolio valuation work, notebook styling, receipts, profile features, and user data.

## Reported issue and code evidence

On the income/expense entry form, opening Category shows only the placeholder `เลือกหมวดหมู่`. In `apps/web/src/tracker/Dashboard.tsx`, options are populated from `finance.categories` filtered by transaction type. The separate category creation form appears farther down the page. `financeOverview` returns owner-scoped saved categories, and the real auth path does not appear to seed starter categories. The screenshot alone does not distinguish an empty category list from a loading/request problem; inspect actual responses using a synthetic account before concluding.

## Required behavior

1. Distinguish loading, API error, no categories at all, and no categories for the selected income/expense type. Never silently turn an API failure into an empty state. Provide a retry action on request failure.
2. When there are no applicable categories, show clear Thai copy such as `ยังไม่มีหมวดรายจ่าย เพิ่มหมวดหมู่เพื่อเริ่มบันทึก` and an obvious action beside the selector. Do not require scrolling to discover the existing form.
3. Add an accessible inline/dialog creation flow: category name plus an explicit income/expense type, defaulting to the current transaction type. Preserve the transaction amount/date/note/receipt while creating a category. After confirmed creation, refresh categories and select the new category if its type matches the transaction form. Do not create or save a financial transaction automatically.
4. Add an explicit `เพิ่มหมวดหมู่พื้นฐาน` action for existing accounts, available near the empty selector. Suggested expense names: `อาหารและเครื่องดื่ม`, `เดินทาง`, `ที่พัก`, `ค่าน้ำไฟและอินเทอร์เน็ต`, `สุขภาพ`, `การศึกษา`, `ซื้อของ`, `อื่น ๆ`. Suggested income names: `เงินเดือน`, `งานเสริม`, `รายได้จากการลงทุน`, `ของขวัญ`, `อื่น ๆ`. These are category labels only: never seed amounts, transactions, budgets, or investment trades. Explain that users can create/rename their own categories.
5. Make the starter action authenticated, owner-scoped, transactional, and idempotent with the existing write system. Add only missing names within each type, respect existing uniqueness/name normalization, and handle concurrent clicks/retries without duplicates. Do not rename, replace, or delete existing categories or change IDs referenced by transactions/budgets. No global production backfill is needed; use an explicit per-owner action.
6. Preserve correct income/expense filtering and reset an invalid selection when switching type. Treat budget expense selectors consistently and provide a nearby way to create expense categories. Reject mismatched or another owner's category IDs server-side.
7. While categories are unavailable or creation has an uncertain outcome, apply the existing write/navigation locks and same-payload/same-key retry rules. Prevent saving a transaction with no valid category, with an explanation. Do not discard draft transaction data on errors or refresh.
8. Preserve privacy masking, light/dark themes, 320px layouts, keyboard focus, Escape behavior, and receipt attachment state. The existing management section may remain, but creation must be discoverable directly from entry/budget flows.

Use the existing category schema and APIs where possible. If a starter-batch endpoint is necessary, enforce the same authentication, CSRF, ownership, quota, and idempotency boundaries as existing category writes. Integrate existing export/restore/deletion behavior; do not maintain a separate unsaved browser-only category list.

## Verify and deploy

Add meaningful regressions for empty expense/income lists, failed loads, inline creation retaining a draft, starter retry/concurrency without duplicates, type filtering, budget flow, and two-owner isolation. Verify a new category remains available after reload and can be used to save a transaction.

Run required checks from current package scripts: `npm test`, `npm run build`, `npm run tracker:typecheck`, `npm run tracker:test`, `npm run tracker:build`, `node --no-strip-types scripts/tracker-package-smoke.mjs`, and `git diff --check`. Run relevant PostgreSQL integration tests for the added write path. Record commands, exit codes, and any failures honestly. Check affected browser flows at mobile/desktop widths in both themes with synthetic data.

Prepare a scoped release on top of the latest personal release using the existing isolated checkout/process. Do not run root `npm run deploy` blindly; its gh-pages target is not the personal API deployment. Preserve existing deployed fixes, real records, and credentials. Use additive migrations only if necessary, with the existing encrypted pre-migration backup process. Never reset the live database or change the separate DEMO service. Keep hosting free.

After checks pass, commit/push the scoped release and deploy the existing personal Render service. Verify the live release identity, HTTPS health, empty state, starter/inline category creation, actual transaction save, reload persistence, budget selector, and ownership isolation through synthetic accounts. Never write to a real user's account to demonstrate the fix. Keep secrets/private records out of Git and evidence.

Deliver the incremental patch including new files, acceptance report, actual test results, deployed commit/deployment identity, website link, and brief Thai instructions explaining how an existing user adds their first categories. Distinguish verified live behavior from local-only tests and report any concrete blocker instead of claiming deployment success.
