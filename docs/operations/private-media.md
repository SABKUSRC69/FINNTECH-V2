# Private media: local implementation and operator notes

This increment is implemented locally; it has not been deployed or migrated on Render. The separate DEMO is unchanged. Existing markets, Decimal bookkeeping, historical stock/crypto trades, manual assets and JSON backup v1/v2/v3 remain supported.

## User behavior

Receipts are optional on income/expense and historical crypto/stock entry forms. Select JPEG/PNG/WebP, preview/rotate/crop, explicitly run OCR, review/edit text, check the desired fields and apply them to the form. The application never saves a ledger record from OCR alone. Direction, category and portfolio remain manual; a THB transfer cannot establish USD/USDT trades. To retain the picture, press **เตรียมรูปแนบสำหรับบันทึก** before the normal final save; the form explains that otherwise the record has no image. OCR failure/cancel does not disable manual entry or image attachment.

History's **ดูรูปแนบ / จัดการรูป** opens an owner-private modal with download and explicit replace/remove. Removal changes only that record's attachment. Correction shares the immutable original by default; a voided record retains its evidence. Removing one shared link keeps the other record's image. Uploaded bytes become JPEG with server-side metadata stripping, so download is the normalized image, not the original file.

Account supports custom square-positioned avatars, original leaf/moon/book presets and initials. Avatar state is separate from Better Auth's `AuthUser.image`; passwords, email verification, signup/recovery policy, server ownership and session caching are not changed. Confirmed responses update both header and card immediately. Version checks and original-key retries preserve the old image during an uncertain replacement. A stale profile GET cannot overwrite a newer confirmed version. Logout remounts account state; image URLs contain only opaque application IDs and require the current owner session.

Amount hiding hides receipt images and the OCR review draft without discarding the staged reference or draft. This remains a display preference, not encryption. Avatars continue to show.

## Storage and limits

Forward migration: `apps/api/prisma/migrations/20261009000003_private_media/migration.sql` adds `media_objects` (PostgreSQL BYTEA), `media_attachments`, `owner_profiles`, owner foreign keys/reference triggers, immutable-byte checks and the media-aware operator purge function. It is transactional. Nothing is stored durably in an uploads folder or browser storage.

| Limit | Value |
|---|---|
| Accepted original | JPEG/PNG/WebP, at most 5 MiB, decoded at most 12 million pixels, single image |
| Stored avatar | 384 × 384 JPEG, at most 96 KiB |
| Stored receipt | Fits 1800 × 1800, at most 256 KiB |
| Per owner | 10 receipt objects and 3 MiB including staged objects/avatars |
| Shared media payload | 64 MiB, also constrained by the unchanged total database cap |
| Decode concurrency | Two simultaneous requests per server process; Sharp threads limited to one |
| Upload admission | Eight requests per owner per minute, in addition to existing mutation budgets |
| Unattached staging | 24 hours; expired objects cannot be downloaded/linked |
| Browser OCR | One active job per editor, terminated on cancel/change/unmount; 90-second deadline |

Header/type checks, actual decoder checks, dimensions/page count, metadata stripping and JPEG re-encoding all run server-side. SVG/HTML, malformed bytes, MIME spoofing and large decoded images are rejected. No automatic deletion of confirmed images occurs when quota is full. Budget checks and replacements use a shared PostgreSQL advisory lock; final ledger save and receipt link commit together under existing ownership/dataset/idempotency protections. Current-owner upload admission removes up to 20 expired unattached staged objects; an inactive owner's expired staging is inaccessible but can continue consuming shared space until that owner returns or the approved owner purge runs. There is no global scheduled deletion job in this increment.

Confirmed staged media is never expired. Failed final saves keep the private stage available until expiry; account lists staged objects for download/discard. A lost response retains the same upload bytes/request key and locks navigation/logout until its result is resolved. Avatar quota permits one confirmed and one staged image so failed replacements retain the previous picture.

The isolated acceptance database measured 2,370,764 payload bytes and 3,211,264 bytes for `media_objects` including indexes/TOAST (840,500 bytes above payload), with total database size 13,702,847 bytes. This includes multiple synthetic test runs; it is not a production capacity measurement. Other attachment/profile tables, WAL, backups and later growth consume additional space. The 64 MiB payload budget does not imply 64 MiB of total database consumption; each write also checks current database size with conservative headroom against the existing configured cap. No cap was increased.

## OCR assets and dependencies

Tesseract.js **7.0.0**, tesseract.js-core **7.0.0**, and `tessdata_fast` commit **87416418657359cb625c412a48b6e1d6d41c29bd** use LSTM-only OEM 1 with Thai+English and PSM 6. All worker/core/language URLs are same-origin under `/ocr/`; loading begins only after the OCR button. Trained data and core are public libraries, never user pictures. Language caching contains public trained data, not receipt text/images. The browser review stores raw OCR text only in component memory; only selected, validated financial fields/notes go to bookkeeping APIs. A prepared image is uploaded to FINNTECH itself; no external OCR/AI service receives it.

`scripts/prepare-ocr-assets.mjs` reproduces pinned assets; `--offline` verifies existing language checksums and copies the exact installed package versions. `public/ocr/provenance.json` records sizes/SHA256. Bundled worker, core and language data retain Apache-2.0 license files. The core WASM JavaScript variants embed WASM; no missing separate `.wasm` download is required. The first run can need roughly 9 MB of uncompressed selected core/language assets, plus other page assets; all three core variants are bundled, only one is selected by the engine.

Sharp **0.35.5** and the Linux sharp native binding are Apache-2.0; Linux libvips package **1.3.4** is LGPL-3.0-or-later. The Windows native package declares Apache-2.0 AND LGPL-3.0-or-later. Runtime packaging includes installed optional platform dependencies and their license files; retain notices and upstream source/license access when redistributing the image. No existing package versions were upgraded as part of this task. Windows normalization and the Node22 Debian Linux runtime were both tested. npm's existing audit findings were not silently repaired through unrelated upgrades.

Official references: [Tesseract.js](https://github.com/naptha/tesseract.js), [fast trained data](https://github.com/tesseract-ocr/tessdata_fast), [local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md), [Sharp installation](https://sharp.pixelplumbing.com/install/).

CSP stays in place. Only `/ocr/runner.js` and `/ocr/worker.min.js` worker responses receive `script-src 'self' 'wasm-unsafe-eval'`; the application document remains `script-src 'self'`. `worker-src 'self'` and image `blob:` support are narrowly retained. No `unsafe-inline`, broad wildcard or general `unsafe-eval` was added. Actual browser OCR succeeded under this policy.

## Local reproduction

Requires Node supported by the project, npm, Docker Desktop and an unused loopback port 5449/4340. Run from the project root:

```powershell
npm ci
node scripts/prepare-ocr-assets.mjs --offline
npm run tracker:build
node scripts/media-review-setup.mjs
node scripts/media-runtime-smoke.mjs
node scripts/media-lifecycle-smoke.mjs
node scripts/media-ocr-smoke.mjs
node scripts/media-local-preview.mjs
```

Setup creates only project `finntech-media-20261009`, database `finntech_media_test` and a dedicated volume. Credentials and fictional fixture files are generated under ignored `.media-review-20261009.local`; never publish this folder. Guards reject non-local targets. Each runtime acceptance run creates fresh fictional owners; lifecycle creates new empty databases, takes an in-memory pg_dump and replays deletion only for its blocked fictional owner. No existing database is reset or dropped. Synthetic archive receipt markers test operator invariants; they are **not** actual off-device archive receipts and no external backup integration was activated. Fixture databases/volumes are left intact for review. Local credentials are fixture-only and must never be reused on a real service.

## Privacy, backup and later rollout

Authenticated image reads use exact ownership, account-blocking checks, JPEG Content-Type, nosniff and private/no-store; IDs alone confer no access. All writes retain exact-Origin protections. Account blocking makes media inaccessible immediately. The restricted operator purge removes attachments, profiles and bytes before financial/owner rows, preserving existing case/archive/tombstone safeguards. Full PostgreSQL pg_dump/restore includes all three tables. Every restored database must remain isolated until the existing deletion ledger replay/acceptance process has purged restored deleted-owner media; restoring database files is not permission to reopen the service.

The existing dynamic restore evidence enumerates every table, including media bytes, and schema definitions. It now additionally recognizes only the two observed PostgreSQL 18 VARCHAR-array cast spellings for five exact named media/stock/manual-asset constraints. The original two auth constraints remain intact. No general cast stripping or constraint omission is used. Full evidence matched across the synthetic dump/restore; an unexpected stricter media constraint caused comparison to differ and was rolled back.

Financial JSON v1/v2/v3 excludes avatar/receipt bytes and media IDs. JSON import restores ledger rows without pictures; owner download is separate. Full database backups remain private and include images. Existing backup/deletion documentation's role separation and authenticated off-device deletion ledger requirements still apply.

For a later authorized real rollout: inspect actual remaining PostgreSQL capacity, take the existing approved full backup and deletion-ledger evidence, build the tested Node22 Linux image with Sharp optional dependencies and pinned OCR assets, apply the forward migration using the normal deployment role/process, then deploy matching API+web and run owner-private smoke checks. Leave DEMO and signup/recovery settings unchanged. No step has been performed on the live service in this task.

For rollback: stop new media writes by rolling back to the previous application release; retain the additive media tables and updated privacy purge function. The earlier release will ignore pictures, while bytes remain available for a forward fix. Do not drop media tables, weaken the purge function or restore an old database over live records to roll back UI code. Any database disaster recovery must use an isolated restore and current deletion-ledger suppression before activation. Keep full database backups containing pictures private under the existing retention policy.

## Measured limits

Readable fictional 1200×800 receipts passed actual Thai/English engine and browser review tests. On this desktop browser with mobile-sized viewport **375px** (not physical mobile hardware), English preprocessing was 31 ms/OCR 578 ms; Thai preprocessing 29 ms/OCR 469 ms. English retry at 1440px was 434 ms. Model/assets were already available locally; these are warm synthetic-image timings, not cold Render/network or low-end-phone guarantees. Avatar preprocessing measured 63 ms. Node engine startup was 212 ms, English recognition 312 ms and Thai 237 ms.

The engine's confidence indicators (95/93 on these fixtures) are not probabilities of financial correctness. Actual Thai output used decomposed sara-am; extraction now normalizes that case. Ambiguous decimal separators, multiple totals/currencies/dates, account/order identifiers and conflicting buy/sell remain manual review. Numeric day/month dates such as 09/10/2026 are deliberately not chosen automatically. Glare, blur, handwritten slips, Thai month abbreviations, absent labels, two-digit years and irregular trade layouts may fail or yield incomplete suggestions. Real camera permission/hardware and slow physical mobile devices were not exercised; file selection works without a camera. PDF/multipage/HEIC remain outside scope.
