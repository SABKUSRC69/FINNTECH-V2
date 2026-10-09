# F1.1 Migration Acceptance: legacy DEMO → FINNTECH Finance Tracker

- **สถานะ:** เอกสารสำหรับ Tech Lead ตรวจทวนเท่านั้น (F1.1)
- **วันที่:** 2026-10-01
- **ขอบเขต:** ตรวจ export จาก browser/origin เดิม, mapping, preview, consent, validation, dedupe/idempotency, legacy archive และ rollback
- **งานในรอบนี้:** แก้เฉพาะเอกสาร ไม่สร้าง importer/runtime ไม่แก้ source code ไม่แก้ exporter ไม่ลบหรือเขียนทับต้นฉบับ

เอกสารนี้กำหนด contract สำหรับ migration ในอนาคต ไม่ใช่ผลทดสอบของ importer หรือฐานข้อมูลจริง เกณฑ์ F1.1 ตรวจเฉพาะความครบและความสอดคล้องของเอกสาร ส่วน preview/import/database/relay/browser เป็น runtime gates ของเฟสถัดไป และยังห้ามรายงานว่า PASS

## ขอบเขตผลิตภัณฑ์ที่ต้องตรงกัน

- รายรับรายจ่ายที่ผู้ใช้สร้างใหม่ใช้ **THB** และจึงรวมใน Dashboard, budget และสรุปรายเดือนของระบบใหม่ได้เมื่อผ่าน validation
- พอร์ตคริปโตที่ผู้ใช้สร้างใหม่ใช้ **USDT เป็น quote currency เดียวใน v1** แยก cost basis และ allocation ต่อ portfolio
- ไม่มี FX และไม่มีการรวมยอดเป็น THB ข้ามสกุล
- legacy transaction สามารถเลือก THB แบบทั้ง batch ใน preview และ override รายแถวได้ ค่าที่เลือกเป็น migration metadata ไม่เขียนทับ raw source หรือ provenance
- source dataset namespace มี immutable internal ID และแก้ได้เฉพาะ display name; เปลี่ยนชื่อแล้ว row identity ต้องไม่เปลี่ยน
- non-crypto เก่าอยู่หน้า legacy read-only แยกจาก finance ใหม่
- archive อ่านได้เฉพาะเจ้าของผ่าน server ที่ตรวจ Better Auth session
- v1 ไม่ล้าง archive อัตโนมัติ นโยบาย retention/deletion เป็น gate ก่อน production แต่ไม่ขวางการตั้ง workspace F1.2
- ทุกหน้าที่แสดงข้อมูลการเงินต้องมีข้อความ **“ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน”**

## หลักฐานจากระบบเดิมและขอบเขต exporter

ตรวจ `src/services/demoDataExport.js` แบบอ่านอย่างเดียวแล้วพบว่า exporter v1 กำหนด `EXPORT_SCHEMA`, `EXPORT_VERSION`, `mode: PAPER_DEMO`, `exportedAt`, `selectedSections`, `data` และเพิ่ม `sourceOrigin` เฉพาะเมื่อ parse เป็น origin ได้ (`demoDataExport.js:1-17, 47-90`) ไม่มี source dataset ID และไม่มี file-level namespace ใน output

`VALID_SECTIONS` มีเพียง `transactions`, `portfolio`, `paperWallet`, `paperTrading`, `priceAlerts` (`demoDataExport.js:16-17`) และ `SECTION_FIELDS` เป็น allowlist ที่ตัด field อื่นออกก่อนสร้างไฟล์ (`demoDataExport.js:4-14, 19-36`) ดังนั้นต้องแยกให้ชัดว่า “พบใน storage/consumer” ไม่ได้แปลว่า “อยู่ใน export whitelist”

| หมวด/หลักฐาน | สิ่งที่พบใน storage หรือ consumer | ฟิลด์/ส่วนที่ exporter v1 ส่งจริง | สถานะ import และกติกา |
|---|---|---|---|
| รายรับรายจ่าย `src/data/initialData.js:20-110`, `QuickActionModal.jsx:19-44`, `authService.js:62-75` | state มีรายการและฟิลด์ `id`, `date`, `type`, `category`, `categoryName`, `amount`, `note` | `transactions` ส่งเฉพาะเจ็ดฟิลด์นี้ (`demoDataExport.js:5, 53-55`) | รองรับเป็น `legacy_import_rows` ป้าย `LEGACY_DEMO`; source ไม่มี currency จึง `N/A` จนผู้ใช้เลือก THB ใน preview; ห้ามสังเคราะห์จากยอดรวม |
| หมวดหมู่ `src/data/initialData.js:1-18` | รายการชื่อ/type/icon/color เป็น metadata ตั้งต้น | ไม่มี section หมวดหมู่แยกใน exporter | ใช้แสดง label/preview ได้เท่านั้น; ไม่สร้าง user category หรือ budget จากชื่อโดยอัตโนมัติ |
| aggregate cashflow `src/data/initialData.js:176-183`, `dashboardMetrics.js:16-24, 36-87` | พบค่า income/expense/savings รายเดือนและคำนวณด้วย `Number` | ไม่มีใน `SECTION_FIELDS` และไม่มี section export | ไม่ใช่รายการย่อย; ไม่สร้าง transaction, budget หรือยอดปัจจุบัน; ถ้าอยู่ใน raw dump ถือว่านอก whitelist |
| พอร์ต snapshot `src/data/initialData.js:113-174`, `PortfolioView.jsx:40-170` | พบ `id`, `name`, `symbol`, `currency`, `type`, `typeName`, `shares`, `avgBuyPrice`, `currentPrice`, `color` | `portfolio` ส่งฟิลด์ข้างต้นเท่านั้น (`demoDataExport.js:6, 55`) | รองรับเป็น legacy asset snapshot; ไม่สร้าง `crypto_trades`; missing currency/cost basis เป็น `N/A` |
| `balance`/`spotBalances` `App.jsx:94-103`, `authService.js:235-273` | storage มี account balance และ spot balances | `paperWallet` ส่ง `balance` และ `spotBalances` เฉพาะ asset ใน `SUPPORTED_ASSETS` ที่เป็นเลข finite และไม่ติดลบ (`demoDataExport.js:16, 56-66`) | รองรับเป็น read-only legacy wallet snapshot; ไม่สร้างเครดิต, spendable balance หรือ ledger; ค่าที่ไม่ผ่าน exporter จึงไม่ใช่ supported import |
| open orders `authService.js:167-180, 212-227` | consumer/storage รองรับ order fields เช่น `id`, `symbol`, `side`, `orderType`, `price`, `amount`, `total`, `fee`, assets, target/status, lock fields และ `placedAt` | `paperTrading.openOrders` ใช้ allowlist `id`, `symbol`, `side`, `orderType`, `price`, `amount`, `total`, `fee`, `baseAsset`, `quoteAsset`, `targetPrice`, `status`, `lockedAsset`, `lockedAmount`, `lockedFee`, `lockVersion`, `placedAt`, `legacyLockUnverified` (`demoDataExport.js:7-11, 68-71`) | รองรับเป็น `legacy_paper_orders` read-only; ไม่ match, unlock, refund หรือสร้าง active order |
| `closedAt` ของ PAPER trade `authService.js:183-192, 219`, `PositionsTable.jsx:227-295` | storage/consumer รองรับหรืออาจอ่าน `closedAt` ใน trade history | **ไม่มี `closedAt` ใน `tradeHistory` export whitelist** (`demoDataExport.js:12`) | ไม่ใช่ supported import field; ต้องแสดง missing/N/A หรือ quarantine โดยไม่เดาเวลาปิด |
| ประวัติ PAPER `authService.js:183-192, 219`, `PositionsTable.jsx:227-295` | storage/consumer มี `id`, `orderId`, `symbol`, `side`, `orderType`, `price`, `amount`, `total`, `fee`, `executedAt`, `status` และอาจมี `realizedPnl` | `paperTrading.tradeHistory` ส่งเฉพาะ **11 ฟิลด์** ข้างต้น (`demoDataExport.js:12, 68-72`) | รองรับเป็น `legacy_paper_trades`; `realizedPnl` **ไม่ถูกส่ง** และห้ามคำนวณ/ยกระดับเป็น realized P&L ใหม่ |
| `positions`/`INITIAL_POSITIONS` `authService.js:14, 228-229, 272`, `tradingData.js:129-130` | พบ object array ใน storage/consumer แต่ schema ธุรกิจไม่แน่นอน | ไม่มี `positions` ใน `VALID_SECTIONS` หรือ `SECTION_FIELDS` | **ไม่รองรับ import**; ห้ามเดา symbol, quantity, side, currency หรือ cost basis และห้ามรับ raw dump/log เข้า quarantine โดยปริยาย |
| cancelled IDs `authService.js:14, 231-233` | storage มีรายการ id ที่ยกเลิก | `paperTrading.cancelledOrderIds` ส่งค่าที่เป็น string/number (`demoDataExport.js:72-75`) | รองรับเป็น legacy order event; id ที่ไม่มี order คู่กันเป็น quarantine และไม่มีผลต่อยอด |
| price alerts `authService.js:194-200, 220` | storage มี id/symbol/condition/target/note/createdAt | `priceAlerts` ส่งหกฟิลด์ (`demoDataExport.js:13, 77`) | รองรับเป็น `legacy_price_alerts` read-only; ไม่สร้าง order, provider subscription หรือ trade |
| signal logs/คีย์จำลอง `tradingViewWebhookService.js:13-83, 125-323` | พบ storage keys และ signal log consumer | ไม่มี section/field ใน exporter allowlist | ไม่ใช่ supported import; ห้ามรับ raw signal log โดยอัตโนมัติ และห้ามเก็บ/แสดง credential, token, secret หรือ key ใด ๆ |
| profile/session/UI/theme/sound/market snapshot | พบ state หรือ storage ระหว่างใช้งานใน `authService.js`, `App.jsx`, `soundEffects.js`, `liveMarketService.js` | ไม่มีใน exporter whitelist | ไม่ migrate; ห้ามใช้เป็น identity หรือเติมไฟล์ export เอง |

ข้อมูลนอก allowlist ไม่ใช่ supported import แม้จะพบใน browser storage หรือ log การส่ง raw dump/log เข้า quarantine ต้องมีการตัดสินใจและ schema ใหม่ภายหลัง ไม่อนุมานว่าอนุญาตโดย default และห้ามแก้ `demoDataExport.js` ในงาน F1.1

## แผนผังข้อมูลเก่า → archive ใหม่

ทุกแถวที่นำเข้าได้ต้องอยู่ใน archive แยกและมี `provenance_label = LEGACY_DEMO`, `owner_id` จาก session, `source_origin` (ถ้ามี), `exported_at`, `imported_at`, `source_section`, `source_row_id` (ถ้ามี), `row_ordinal`, file SHA-256, row fingerprint และ `unknown_reason` เมื่อข้อมูลไม่ครบ ค่า currency/cost basis/fee currency ที่ไม่ทราบเก็บเป็น `NULL` ในฐานข้อมูลและแสดง `N/A` โดยไม่ใช้คำนวณ

| ข้อมูล | archive target | สิ่งที่ห้ามเกิดขึ้น |
|---|---|---|
| `transactions` | `legacy_import_rows(kind=FINANCE_TRANSACTION)` และ optional typed legacy view | ห้ามสร้างแถวปกติใน `finance_transactions` อัตโนมัติ; batch/row THB เป็น metadata ใน preview ไม่เปลี่ยน raw source |
| `portfolio` และ non-crypto snapshot | `legacy_import_rows(kind=ASSET_SNAPSHOT)` / `legacy_demo_summaries` | ห้ามสร้าง `crypto_trades`, `portfolio_holdings` หรือ P&L ใหม่จาก `avgBuyPrice`/`currentPrice` |
| `paperWallet` | `legacy_import_rows(kind=WALLET_SNAPSHOT)` แยก asset | ห้ามสร้างเครดิต, deposit, withdrawal, QR หรือ spendable ledger |
| `paperTrading.openOrders` | `legacy_import_rows(kind=PAPER_ORDER)` | ห้ามเปิด order, match, unlock หรือคืนเงิน |
| `paperTrading.tradeHistory` | `legacy_import_rows(kind=PAPER_TRADE)` | ห้ามยกให้เป็น exchange fill หรือ cost basis ของพอร์ตใหม่ |
| `cancelledOrderIds` | `legacy_import_rows(kind=ORDER_EVENT)` | ห้ามสร้าง reversal/credit จาก id ที่ขาด order คู่กัน |
| `priceAlerts` | `legacy_import_rows(kind=PRICE_ALERT)` | ห้ามสร้าง provider subscription หรือคำสั่งตลาด |
| ข้อมูลนอก whitelist | ไม่รับเป็น supported import; quarantine เฉพาะเมื่อมี policy แยก | ห้ามเก็บหรือแสดง credential/token/secret และห้าม execute signal |

legacy ไม่ถูกสร้างใน `finance_transactions` หรือ `crypto_trades`, ยอด legacy แสดงบนหน้า legacy read-only เท่านั้น และไม่รวมใน Dashboard ปกติ, budget หรือ portfolio ใหม่ non-crypto เก่าอยู่หน้า legacy read-only แยกจาก finance/crypto ใหม่ การยืนยัน THB เป็นเพียง override ของ batch/row ใน migration metadata ไม่เปลี่ยน provenance และไม่ทำให้ DEMO กลายเป็นรายการปกติ การ rollback จัดการเฉพาะ legacy batch จึงไม่แก้รายการที่ผู้ใช้สร้างใหม่

## Identity, dedupe และ idempotency

ต้องแยกสามกลไกต่อไปนี้ ไม่ใช้ค่าหนึ่งแทนอีกค่า:

1. **file SHA-256** คือ hash ของ export artifact ทั้งไฟล์ ใช้รู้ว่า artifact เดิมถูกส่งซ้ำหรือมีไฟล์ใหม่ ไม่ใช่ row identity และไม่ใช่หลักฐานว่าเป็นบัญชีเดียวกัน
2. **request idempotency key** คือ key ของคำขอ import โดย scope คือ `(owner, endpoint, idempotency_key)` ไม่ผูกกับ session ID; request hash ต้องครอบคลุม file SHA-256, namespace immutable ID, selected sections และ currency overrides
3. **row identity** แยกตามว่าต้นทางมี source row ID หรือไม่ พร้อม canonical payload hash สำหรับตรวจความขัดแย้ง

`source_dataset_namespace` มี immutable internal ID และ display name ที่แก้ไขได้ เช่น A/B เพื่อแยกชุดข้อมูลต้นทางที่มาจาก origin เดียวกันและมี row ID ซ้ำได้ การเปลี่ยน display name ห้ามเปลี่ยน identity; namespace **ไม่ใช่ credential และไม่ใช่หลักฐานยืนยันตัวตน** ห้ามอนุมาน namespace จาก origin, email, row ID หรือ file hash

export v1 ไม่มี source dataset ID ดังนั้น preview ต้องบังคับให้ผู้ใช้:

- เลือก namespace immutable ID เดิมเมื่อยืนยันได้ว่าไฟล์เป็นชุดเดียวกับ import ก่อนหน้า
- สร้าง namespace immutable ID ใหม่อย่างชัดเจนสำหรับชุด A/B ที่เป็นคนละชุด แม้ `sourceOrigin` และ row ID จะเหมือนกัน
- ระบุความสัมพันธ์ของไฟล์กับชุดข้อมูลด้วย consent/audit metadata โดยไม่ใช้เป็น identity หรือ authentication

กติกา row และ retry:

- ถ้ามี source row ID: identity คือ `(owner, namespace_id, section, source_row_id)`; `row_ordinal` เป็นตำแหน่งต้นทางสำหรับ provenance/receipt เท่านั้น ไม่ใช่ส่วนของ identity ดังนั้น export ใหม่ที่สลับลำดับแถวแต่ใช้ ID เดิมต้องไม่เพิ่มรายการซ้ำ
- ถ้าไม่มี source row ID: identity คือ `(owner, namespace_id, file_sha256, section, ordinal)`; แถวที่เนื้อหาเหมือนกันทุกแถวในไฟล์เดียวใช้ ordinal ต่างกันและต้องรักษาแถว/จำนวนเงินครบ
- ไฟล์ใหม่ที่ hash ต่างกันและแถวไม่มี ID ห้าม dedupe อัตโนมัติเมื่อไม่มีหลักฐานว่าเป็นรายการเดียวกัน ให้แสดงเป็น duplicate candidate ใน preview/receipt เพื่อให้ผู้ใช้ตรวจ ไม่ทิ้งเงียบ ๆ
- ห้ามตัดแถวข้ามไฟล์ด้วย content hash อย่างเดียวเมื่อพิสูจน์ไม่ได้ว่าเป็นรายการเดียวกัน; file SHA-256 หรือ canonical row hash ไม่พอที่จะลบแถว
- logical ID เดิมใน namespace เดียวกันและ payload เดิมเป็น duplicate/idempotent ที่อ้าง receipt เดิมได้; logical ID เดิม payload ต่างกันเป็น **conflict** และห้าม overwrite หรือทิ้งเงียบ ๆ
- logical ID เดิมคนละ namespace เป็นคนละ source row ได้ ไม่ dedupe ข้าม namespace
- key เดิมและ request hash เดิมต้องคืนผลเดิมแม้ผู้ใช้ล็อกอินใหม่; key เดิมแต่ request hash ต่างกันเป็น idempotency conflict
- retry หลัง timeout หรือหลัง server commit สำเร็จแต่ response หายต้อง lookup key เดิมและคืน receipt เดิม ไม่สร้าง batch/row ซ้ำ
- retry batch ที่ `REVERSED` ต้องคืนสถานะ `REVERSED` เดิม ห้ามทำให้ข้อมูลกลับมาเอง; การนำเข้าใหม่ต้องเป็น request ใหม่พร้อม preview และ consent ใหม่

ข้อจำกัดของ export v1 คือไม่มี source dataset ID และ `sourceOrigin` อาจไม่มีถ้า input ไม่ใช่ URL ที่ parse ได้ จึงต้องให้ผู้ใช้ยืนยัน namespace immutable ID ใน preview และทำให้ receipt แสดง namespace ID/display name, file hash, row counts, candidate counts และ conflict counts ทุกครั้ง

## วิธี export จาก browser/origin เดิม

ทำก่อนเปลี่ยน custom domain, redirect หรือหยุด origin เดิม เพราะ `localStorage` ผูกกับ `scheme + host + port` และ origin ใหม่อ่านของเดิมไม่ได้

1. เปิด origin เดิมด้วย browser profile เดิม ตรวจว่าข้อมูลโหลดได้และไม่ใช่ storage error
2. ใช้เมนู export ของแอป เลือกเฉพาะ section ที่ต้องการ แล้วดาวน์โหลด JSON ต้นฉบับ; ห้ามคัดลอกหรือแนบ credential, token, secret, password หรือ hash ที่เป็นข้อมูลลับลง chat/ticket
3. ตรวจ `schema`, `version`, `mode = PAPER_DEMO`, `exportedAt`, `selectedSections` และ `sourceOrigin` ถ้ามี ให้หยุดถ้า schema ไม่ตรง allowlist
4. เก็บไฟล์ต้นฉบับแบบ read-only และคำนวณ file SHA-256; ห้ามแก้ไฟล์เดิม หากต้อง redact note ให้สร้างไฟล์สำเนาและกำหนด namespace/receipt แยก
5. ทำซ้ำต่อ browser profile/ชุดข้อมูลที่ต้องการ และตั้ง namespace A/B ใน preview เมื่อ row ID ซ้ำกัน
6. อย่าใช้ credential DEMO เป็นบัญชีจริง ให้สร้าง/เข้าสู่ Better Auth ด้วย flow ใหม่ก่อน import ในอนาคต

## Preview, consent และ validation

preview ต้องเป็น read-only และแสดงอย่างน้อย:

- source origin (ถ้ามี), export time, schema/version, file SHA-256, selected sections และ namespace immutable ID/display name ที่ผู้ใช้เลือก
- จำนวน source rows, valid rows, duplicate rows, conflict rows, quarantined rows, rejected rows และ rows ที่จะ archive ต่อ section
- จำนวนแถวที่ไม่มี ID, ordinal ของแถวซ้ำในไฟล์เดียว และ rows ที่ไม่ถูกตัดข้ามไฟล์
- จำนวน asset/รายการต่อหมวด, wallet asset ต่อ symbol และยอดที่ยืนยันสกุลเงินแล้วแยก THB/USDT
- field ที่เป็น `N/A` (currency, cost basis, fee currency, date/category) และผลว่าไม่นับใน summary/P&L
- ข้อความ `LEGACY_DEMO` และ “ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน”

ผู้ใช้ต้อง consent แยกจากการเปิด preview เพื่อยืนยันว่า:

1. เป็นเจ้าของไฟล์และเข้าใจว่าเป็นข้อมูล DEMO/PAPER ที่แก้ไขได้ ไม่ใช่หลักฐานตัวตนหรือ exchange fill
2. ยอมรับ archive read-only ที่ไม่มีเครดิต, order, deposit, withdrawal หรือยอดใช้จ่ายใหม่
3. ยอมรับว่า unknown currency/cost basis/fee currency เป็น `N/A` และไม่นำไปคำนวณ
4. เลือก namespace ของ source dataset และยอมรับว่า namespace ไม่ใช่ authentication
5. ถ้าต้องการกำหนด THB ให้ finance legacy เลือกแบบ batch หรือ override รายแถวใน preview โดยค่าต้นทางยังคงเดิม
6. ยืนยัน counts, duplicate/conflict/quarantine และ section ก่อน commit

ไม่มี consent, namespace หรือผู้ใช้ปิดหน้า preview ให้ยกเลิกโดยไม่เขียนข้อมูล

### Validation ของไฟล์และแถว

- ตรวจ JSON parse, schema/version, file size, section allowlist และชนิด field; reject field ที่เป็น credential/token/secret โดยไม่ echo ค่าใน error
- ตรวจ source row id, row ordinal, canonical payload, date/time, enum, `NaN`/`Infinity` และค่าติดลบตาม domain
- แปลง JSON number จาก source เก่าเป็น decimal string ก่อน service; ห้ามใช้ floating arithmetic เพื่อรวม/เปรียบเทียบ
- ตรวจ `balance` กับ `spotBalances.THB` และรายงาน `price × amount` เฉพาะเป็น legacy consistency check ไม่สร้าง fill/ยอดใหม่
- แถว finance ที่ไม่มี currency เก็บ `NULL`/แสดง `N/A` จนผู้ใช้เลือก THB
- portfolio ที่ currency หาย/นอก THB/USDT และ `avgBuyPrice` ที่ไม่มี ledger ให้ `N/A`; ห้ามเติมจาก symbol หรือเดาต้นทุน
- THB และ USDT ต้องแยกยอด แยก cost basis และแยก allocation; ไม่มี FX และไม่รวมข้ามสกุล

## Decimal และกฎ cost basis สำหรับ runtime ในอนาคต

กฎนี้เป็นกฎบัญชีของระบบติดตาม ไม่ใช่ precision/step สำหรับส่งคำสั่ง เพราะระบบนี้ไม่ส่งคำสั่งตลาด:

- finance THB ใช้ PostgreSQL `NUMERIC(20,2)`
- crypto quantity, price, gross, fee, cost และ P&L ใช้ `NUMERIC(38,18)`
- `decimal.js` ใช้ precision ภายใน **80** และ `ROUND_HALF_EVEN` ที่จุดบันทึกผลคำนวณทางบัญชี
- API ใช้ canonical decimal strings; input เกิน scale/range หรือใช้ exponent/รูปแบบที่ schema ไม่อนุญาตต้อง reject ไม่ปัดเงียบ ๆ
- quantize THB เป็น scale 2 ก่อนบันทึก amount; quantize crypto quantity/price/gross/fee/cost removed/remaining cost/P&L เป็น scale 18 ก่อนบันทึก
- ค่าเฉลี่ยและ intermediate ใช้ precision 80; ห้ามอ่านค่าที่ปัดเพื่อแสดงผลกลับมาคำนวณ
- ห้ามพึ่ง PostgreSQL cast/assignment ให้ปัดโดยปริยาย ต้อง validate range และ quantize ใน application ก่อนเขียน

cost basis มี scope `(user_id, portfolio_id, asset, quote_currency)` และ v1 บังคับ `quote_currency = USDT` โดย:

- server อ่าน owner จาก Better Auth session และตรวจ ownership ของ portfolio ทุก request; ไม่รับ owner/user id จาก body
- การบันทึก trade, replay history, คำนวณ cost basis, อัปเดต projection และ audit event อยู่ใน server-side database transaction เดียว
- ใช้ row lock/optimistic version/isolation ที่เทียบเท่า ป้องกัน concurrent writes และใช้ request idempotency + unique constraint ป้องกัน duplicate requests
- ตรวจลำดับประวัติใน transaction; ขายเกิน quantity หรือขายจาก scope asset/quote ที่ไม่มีอยู่ต้อง reject ทั้ง transaction
- ขายบางส่วน: `cost_removed = quantize(quantity_sold × average_cost)` และ `remaining_cost = stored_cost_before - stored_cost_removed`; ใช้ต้นทุนที่บันทึกจริง ไม่ย้อนใช้ค่าที่ปัดเพื่อแสดงผล
- ขายทั้งหมด: ตัดต้นทุนคงเหลือทั้งหมดและตรวจให้ quantity กับ cost เหลือศูนย์
- provider order rules/step size เป็นเรื่องแยกจาก accounting rules; ระบบนี้บันทึก buy/sell history เท่านั้นและไม่ส่ง order
- รายละเอียด transaction/lock อยู่ใน F1.4; ต้องป้องกัน concurrent writes ใน scope เดียวกันและทดสอบกับ PostgreSQL จริง

## Commit, ตรวจจำนวน/ยอด และ receipt

เมื่อ runtime ถูกสร้าง การ commit ต้องทำ transaction เดียวสำหรับ import metadata และ rows ที่ผ่าน validation หาก server ยืนยันว่า transaction rollback แล้วจึงสรุปได้ว่าไม่มี legacy row ใหม่และไม่แตะ source file/localStorage

receipt ต้องไม่มีข้อมูลลับและต้องตรวจสอบก่อน/หลังได้:

| ตรวจ | วิธีตรวจ | เกณฑ์ที่เอกสารกำหนด |
|---|---|---|
| จำนวนต่อ section | เทียบ `source`, `valid`, `duplicate`, `conflict`, `quarantined`, `rejected`, `archived` | counts ใน receipt ตรงกับ preview และผลรวมตามนิยาม ไม่เกิดแถวเกิน |
| finance | นับตาม type/category/date และรวมเฉพาะ THB ที่ผู้ใช้ยืนยันด้วย Decimal | จำนวนและยอด THB ก่อน/หลังตรงกัน; `N/A` ไม่ถูกนับ |
| wallet | นับ asset keys และ available/locked ของ legacy snapshot ต่อ asset | decimal strings ตรงกัน; spendable ledger ใหม่เพิ่มศูนย์ |
| portfolio | นับ symbol/type/currency และ quantity/cost field ที่ source มี | missing currency/cost basis ยังคง `N/A`; ไม่มี P&L ที่มาจากการเดา |
| PAPER | นับ open orders, trade history, cancelled IDs, `closedAt` ที่ไม่มีใน export และ `realizedPnl` ที่ไม่ส่งออก | ทั้งหมดอยู่ใน legacy archive/read-only; active order/fill ใหม่เพิ่มศูนย์ |
| cross-currency | ตรวจ THB และ USDT แยกกัน | ไม่มี FX หรือการรวมข้ามสกุล |
| provenance/identity | ตรวจ namespace, file SHA-256, request id, row identity, ordinal และ conflict | ทุกแถว trace กลับไฟล์/section/row ได้ และ duplicate/conflict ไม่ถูกกลืน |

## Rollback และ retention

- การยกเลิกก่อนส่ง commit หรือกรณีที่ server ยืนยัน DB rollback แล้ว: ต้องไม่มี legacy row ใหม่และไม่มีผลต่อยอด
- timeout/connection ขาดหลังส่ง commit แล้ว: ผลเป็น **ไม่ทราบสถานะ** ต้องตรวจสถานะ batch หรือ retry ด้วย idempotency key เดิม; ห้ามรายงานว่า rollback สำเร็จจาก timeout เพียงอย่างเดียว
- หลัง commit: rollback เปลี่ยนเฉพาะ `legacy_import.status` ของ batch เป็น `REVERSED` พร้อม actor/time/reason/reference; ไม่ลบ rows หรือ receipt
- retry batch ที่ `REVERSED` คืนผล reversed เดิมและไม่ restore ข้อมูล; ต้องสร้าง request ใหม่พร้อม preview/consent ใหม่หากต้องการนำเข้าอีกครั้ง
- rollback มีผลเฉพาะ batch `LEGACY_DEMO` และห้ามเปลี่ยน finance transaction/crypto trade ที่ผู้ใช้สร้างใหม่ภายหลัง
- ห้ามลบ localStorage, export ต้นฉบับ หรือ archive อัตโนมัติใน v1; retention/deletion เป็น gate ก่อน production แต่ไม่ขวางการตั้ง workspace F1.2

## ข้อกำหนดที่ Tech Lead ตัดสินในรอบนี้

- namespace มี immutable internal ID และ display name ที่แก้ไขได้ การเปลี่ยนชื่อไม่เปลี่ยน row identity
- รายละเอียด transaction/lock ลงใน F1.4 โดยต้องป้องกัน concurrent writes ใน scope เดียวกันและทดสอบกับ PostgreSQL จริง
- market allowlist เริ่ม `BTCUSDT`/`ETHUSDT` และเปิดใช้ symbol ต่อเมื่อยืนยันจาก provider metadata จริง; stale threshold คือ 30 วินาที
- retention/deletion เป็น gate ก่อน production แต่ไม่ใช่เงื่อนไขขวางการตั้ง workspace F1.2

## กรณีตรวจรับที่ต้องมีใน runtime gate

กรณีต่อไปนี้เป็น acceptance scenarios ที่ต้องสร้าง test ในเฟส runtime ภายหลัง เอกสาร F1.1 ยังไม่รายงานผล PASS:

1. แถวไม่มี ID แต่เนื้อหาเหมือนกันสองแถวในไฟล์เดียว: archive และจำนวนเงินต้องครบสองแถว
2. ชุดข้อมูลต้นทาง A/B จาก origin เดียวกันมี row ID ซ้ำ: namespace immutable ID แยกและไม่ dedupe ข้ามชุด
3. export ใหม่ของข้อมูลเดิมที่มี source row ID: file hash อาจเปลี่ยน แต่ identity เดิมและ payload เดิมต้องได้ผล idempotent ตาม namespace
4. export ใหม่ของข้อมูลเดิมที่ไม่มี source row ID และ file hash ต่างกัน: แสดงเป็น duplicate candidate ให้ผู้ใช้ตรวจ ห้าม dedupe หรือลบทิ้งอัตโนมัติ
5. export ใหม่ที่สลับลำดับแถวซึ่งมี source row ID: `row_ordinal` เปลี่ยนได้แต่ต้องไม่เพิ่มรายการซ้ำ
6. logical ID เดิมแต่ payload ต่างกัน หรือ idempotency key เดิมแต่ request hash ต่างกัน: แสดง conflict ไม่ overwrite และไม่ drop เงียบ ๆ
7. ยกเลิกก่อนส่ง commit หรือ server ยืนยัน DB rollback: ไม่มีแถวใหม่และไม่มีผลต่อยอด
8. server commit สำเร็จแต่ response หาย: ผลครั้งแรกเป็น unknown, retry ด้วย key เดิมต้องคืน receipt เดิม ไม่เพิ่ม batch/rows และห้ามรายงาน rollback สำเร็จ
9. retry batch ที่ `REVERSED`: ยังคง reversed ไม่ทำให้ข้อมูลกลับมา
10. BTC/USDT สอง portfolio ที่ต้นทุนต่างกัน: cost basis แยกตาม portfolio และ quote currency ไม่ปนกัน
11. rounding ตอนขายบางส่วนและขายทั้งหมด: ใช้ HALF_EVEN/scale 18 ตามจุด quantize, ต้นทุนคงเหลืออ้างอิงต้นทุนที่บันทึกจริง และขายทั้งหมดเหลือ quantity/cost ศูนย์

## เกณฑ์ F1.1 และเกณฑ์ runtime ที่ยังไม่ทำ

### Gate F1.1 (เอกสาร)

- [x] มี mapping ครบหมวดที่พบใน storage และระบุ export whitelist แยกกัน
- [x] ระบุข้อมูลที่ย้ายไม่ได้/ความหมายคลุมเครือ (`closedAt`, `realizedPnl`, `positions`, signal logs และข้อมูลลับ)
- [x] ป้องกันไม่ให้ `LEGACY_DEMO` กลายเป็นข้อมูลลงทุนจริงหรือรวมใน Dashboard/budget/portfolio ใหม่
- [x] ระบุ preview, consent, validation, dedupe, idempotency, จำนวน/ยอดก่อน-หลัง และ rollback
- [x] กำหนด THB finance, USDT crypto v1, no FX และ server owner-only archive ให้สอดคล้องกับ ADR-002

### Runtime gates ของเฟสถัดไป (ยังไม่ PASS ใน F1.1)

- [ ] browser/origin export และ namespace selection ทำงานจริง
- [ ] preview/consent/import/rollback และ database transaction ทำงานจริง
- [ ] Decimal/NUMERIC, cost basis, concurrent writes, duplicate/reversed retry และ oversell tests ผ่าน
- [ ] Binance relay, same-origin browser/API/WS และ no provider direct connection tests ผ่าน

Importer, Prisma schema/migration, runtime tests และ exporter change อยู่นอก F1.1 ต้องให้ Tech Lead ตรวจเอกสารนี้และ ADR-002 ก่อนเริ่ม F1.2
