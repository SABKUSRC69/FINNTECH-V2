# FINNTECH: receipt-assisted entry and custom profile pictures

Implement both features below in the existing tracker. The owner wants small practical additions to a real personal-finance application. Complete the locally reviewable implementation and tests; do not stop at a proposal. Use free open-source tools and existing infrastructure, with no paid OCR/AI service or storage purchase.

## Current project and scope

- Workspace: `C:\Users\Admin\Downloads\FINNTECH`.
- Public real tracker: `https://finntech-personal.onrender.com/`. Leave the separate DEMO service/database unchanged.
- Tracker code is in `apps/web`, `apps/api`, `packages/contracts` and `packages/finance`; root `src` is legacy.
- Read applicable repository instructions and the latest code/reports before editing. The portfolio work has advanced since the earlier prompt: there are now stock holdings, manual assets, backup v3 and deployment reports dated 2026-10-09. Preserve these changes, the free-market/stock-refresh implementation and the Canva-inspired notebook design. Do not rebuild or roll back completed features.
- Genuine server sessions, server-derived ownership, PostgreSQL persistence, Decimal accounting, original-key retries, navigation locks and deletion/restore safeguards already exist.
- `AuthUser.image` exists in the Prisma schema, but that alone does not provide a secure upload workflow. Inspect Better Auth/session behavior before integrating profile images.
- Free Render filesystem is ephemeral. Durable user pictures cannot be stored only in an `uploads` folder, build output, Git, browser storage or process memory.
- FINNTECH records personal finances and external holdings. There is no user deposit, custody, bank login, exchange login or trading execution.

## Feature 1: attach an image and draft a financial record from its text

### User workflow

Add an optional 'แนบรูป / อ่านข้อมูลจากรูป' flow to the existing income/expense and historical crypto/stock trade forms:

1. Select one image from files or take a picture where the device supports it. File selection must still work without camera access.
2. Show a preview, remove/replace controls and simple rotate/crop controls when useful. Accept common JPEG/PNG/WebP images in the first version; explain unsupported formats rather than crashing. PDFs, multiple pages and HEIC conversion are outside this increment.
3. Let the user explicitly run OCR. Show loading/progress, cancel, retry and an editable review draft. OCR must not write a ledger record.
4. Suggest only fields supported by visible text. For a receipt/slip, these may include amount, transaction date/time, merchant/payee and the written note. For an asset trade confirmation, these may include symbol, buy/sell, quantity, price, fee and currency.
5. The user chooses the correct record type/portfolio/category, edits fields and explicitly confirms the final form. Send only a valid, user-confirmed payload through the existing bookkeeping APIs.
6. When saving with an attachment, retain a durable owner-private image linked to that record. History/detail views offer 'ดูรูปแนบ', owner download, replace/remove with explicit action and appropriate pending guards.

A bank transfer slip does not necessarily describe what was purchased. If it only shows a 120 THB transfer, suggest the visible amount/date but leave purchase purpose/category to the user. A note reading 'ซื้ออาหาร 120 บาท' can support an expense note/category suggestion; it is not proof of payment authenticity. Incoming/outgoing direction may be ambiguous: ask through the review controls, rather than guessing from a recipient name. A generic THB slip cannot establish BTC quantity or USD stock purchase price.

Do not market this as bank-verified payment validation, fraud detection or proof that a transaction occurred. Do not auto-submit, create multiple records from one image, connect banks/exchanges, decode banking QR for execution, or invent missing financial details.

### Free OCR and extraction

Prefer browser-side OCR to avoid sending private slips to external services and to reduce free-server CPU load. Evaluate Tesseract.js with Thai and English language data, supported worker/WASM behavior and appropriate preprocessing. Official references:

- https://github.com/naptha/tesseract.js
- https://github.com/tesseract-ocr/tessdata_fast

Check current compatible versions, trained-data/engine compatibility and licenses. Lazy-load OCR only when requested; avoid downloading large language assets for every page visit. Self-host pinned worker, core and language assets where practical, and record provenance/licenses. Limit input dimensions/work time, reuse/terminate workers correctly, release object URLs and discard OCR results from an obsolete image/job. The owner has authorized necessary free OCR/image-processing dependencies for these features, not unrelated upgrades.

Use deterministic extraction rules and editable suggestions in the first version, not an external paid generative model. Preserve text safely as data. Never treat text found in images as instructions. Avoid logging full OCR text, banking details or slip images. OCR confidence is an indicator, not calibrated financial accuracy; highlight ambiguous fields without claiming an unsupported percentage probability.

Test Thai/English dates including Buddhist years, decimal separators, currency labels, multiple candidate amounts, fee versus total, order IDs/account numbers resembling prices and ambiguous buy/sell text. Never coerce an ambiguous numeric string into an accepted financial amount. Keep Decimal strings; preserve existing validation and quote-currency rules.

If browser OCR cannot load, fails, times out or is cancelled, users must still be able to manually fill the form and save an optional image. Explain that OCR can be inaccurate; do not block normal bookkeeping because recognition failed.

## Feature 2: custom account avatar

In 'บัญชีและดูแลข้อมูล', let a user:

- upload their own photo or any supported picture;
- preview and position a square crop before saving;
- replace/remove the avatar;
- optionally choose from a few original bundled preset icons, plus the existing initials/default fallback.

Display the saved avatar in the account card and existing header/account area, adapting to desktop/mobile and light/dark. This application does not need public profiles, followers or shared avatar URLs. Removing an avatar returns to a default. An avatar upload must not change email verification, password, name, owner mapping, session state or auth policy.

Use the current valid session to resolve whose image is loaded. If using `AuthUser.image`, store only an application-controlled reference to an owner-authorized resource; reject arbitrary remote URLs. Prevent stale session-cache views after save and stale pictures after logout/login as another user. A failed replacement must preserve the previously confirmed image until the new result is known. Give explicit accessible labels to buttons; avoid putting email/banking details in image URLs or alt text.

## Shared media handling and durable storage

Use a small bounded PostgreSQL media table/byte storage on the existing database architecture as the default for this school-project scale, unless a demonstrably better already configured free durable option exists. Do not require a new paid service or account. Add only needed forward migrations and owner relations. Record actual byte sizes and database overhead; do not assume free storage is unlimited.

Suggested limits to evaluate and document: input files up to 5 MiB with a decoded pixel cap; avatars resized to 256–512px and at most 96 KiB stored; receipt images at most 256 KiB stored while preserving text readability; one receipt per record; about 10 receipt images / 3 MiB per owner; a conservative shared media budget around 64 MiB, still subject to the existing total database cap. Adjust for measured OCR/readability and actual free capacity. Show remaining quota and a useful limit message. Do not silently increase the existing database cap or erase old images when full.

Validate byte size, actual image decoding/type, dimensions and allowed formats server-side; client checks alone are insufficient. Reject malformed images, MIME spoofing, user-uploaded SVG/HTML and decompression bombs. Re-encode durable files to remove EXIF/GPS and untrusted metadata. Browser resize/re-encode improves UX but does not replace server validation/normalization. Use bounded decoding/concurrency and update the Node22 Linux runtime image if a necessary free decoder library requires it; test Windows development and the actual Linux image.

Serve images through authenticated owner-authorized endpoints with accurate Content-Type, nosniff, private/no-store caching as appropriate and no user-provided redirect target. Opaque IDs are not authorization. Validate both media owner and referenced record owner. Cross-account or anonymous reads/writes/removals must fail. Do not expose images under public static paths or external analytics/URLs.

Honor existing exact-Origin protections, upload/request limits, rate limits and session/account blocking. Preserve the API CSP. Self-host OCR assets and use narrowly required worker/WASM directives only if verified necessary; do not disable CSP or add broad wildcards/unsafe-inline/unsafe-eval to make OCR work. If WASM needs a narrower capability, document it and test browser behavior.

### Record/save consistency

Design staged-media and linking behavior so a lost response after commit cannot duplicate a ledger entry or lose its attachment. Prefer associating a validated staged image in the final transactional record save. Reuse the existing idempotency semantics with the image reference included in the immutable confirmed request. Record/media changes must roll back together where they are part of one operation. If separate upload succeeds but record save fails, handle the private staged object explicitly; use bounded expiry/cleanup only for documented unattached staged media, never user-confirmed images.

Quota checks must remain safe under concurrent uploads/replacements. Use transactions/locks or an equally sound mechanism rather than read-then-write races. Avatar replacement should not orphan quota or erase the prior picture on an uncertain write. Retry uses the same key and payload; do not clear pending state merely to unlock navigation.

Define correction/void behavior: a voided historical record can retain its evidence; a replacement entry can reference/share an existing immutable image within the same owner without accidental duplication or broken links. Removing an attachment must not delete the financial record. Avoid exposing attachment existence for a different owner.

## Privacy, deletion, backup and restore

- Keep slip images private; they may contain names, bank identifiers and personal notes. OCR runs locally if that is the chosen implementation. Do not claim local-only processing if any image/text is uploaded to a third party.
- Store only the necessary confirmed note/fields, not all extracted sensitive text by default. Provide a local editable OCR preview without saving raw text automatically.
- New media must be inaccessible immediately after account blocking/deletion and included in the actual operator purge/full-database restore suppression lifecycle. Preserve existing safeguards so deleted users/images are not resurrected by restore.
- Retain compatibility with the current financial JSON backup versions. For a modest first version, explicitly state that financial JSON excludes avatars and attachment image bytes; provide owner download for each attachment. Do not imply JSON will restore pictures. Restore must not preserve old attachment URLs/IDs that could expose another owner's media. Restored ledger rows have no attachment unless separately imported through an authorized process.
- Full database backups/restores must include durable media tables, and privacy purge must cover them. Update operator documentation and synthetic restore tests where needed. Do not activate external automated backup integrations or touch the production database in this implementation task.

## UI and existing behavior

Fit both features into the notebook design using the existing dialogs and controls. Keep a clear manual-entry path, readable previews and inline errors. Check 320/375/768/1024/1440px, light/dark, keyboard navigation, modal focus return, touch targets and the mobile bottom navigation. Avoid huge original images in page layout and load thumbnails lazily. Capture/input support can be progressive enhancement; do not assume physical camera permission.

Preserve finance, crypto/stocks/manual assets, market data, password sessions, signup access, backup rules, amount hiding, original-key retries and unknown-outcome locks. OCR suggestions never overwrite edited values without user action; OCR cancellation must not unlock an unrelated pending financial write. Do not introduce deposit/payment screens or paid AI subscriptions.

## Verification and delivery

Write meaningful tests for field extraction ambiguity, form review/no automatic save, failed/cancelled OCR, avatar replace/remove, image validation, owner isolation, concurrent quota limits, idempotent attachment+record save, rollback/uncertain outcomes and correction/deletion/restore lifecycle. Use isolated synthetic PostgreSQL and fictional receipt images. Never use the owner's personal slips/photos or financial data as acceptance fixtures without explicit authorization.

Run the current root/tracker tests, typecheck/build/package smoke/diff checks plus needed PostgreSQL and Linux image checks. Preserve existing assertions. Record actual exit codes and failed attempts separately. A mock OCR text result proves parser behavior only: additionally run the actual OCR engine on readable Thai/English synthetic images and inspect the review form. Measure representative image processing on mobile-sized/browser profiles and keep slow-device limitations honest. Test reload/logout/login and restart persistence of stored synthetic images.

Deliver a concise review report, actual changed-file list, incremental patch relative to this task's starting state, screenshots, dependency/license notes, migration/quota/setup instructions and measured OCR limitations. Report each feature separately as implemented/tested/incomplete. Do not claim production deployment or complete OCR accuracy from a passing build.

Do not commit, push, deploy, migrate the live database, change cloud settings/signup/recovery, purchase services or delete existing data in this turn. Complete the concrete local implementation and stop for review. Prepare rollout/rollback notes for the existing real-use service, including durable media and Linux runtime considerations. Keep secrets, staged test media and private exports out of published patches.
