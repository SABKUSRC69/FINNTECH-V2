# ADR-002: FINNTECH เว็บติดตามการเงินส่วนบุคคล

- **สถานะ:** เสนอให้ Tech Lead ตรวจทวน (F1.1)
- **วันที่:** 2026-10-01
- **ขอบเขต:** การกำหนดขอบเขตและสถาปัตยกรรมสำหรับรายรับ-รายจ่ายและพอร์ตคริปโต
- **หลักฐานที่ใช้:** ตรวจ working tree ปัจจุบันและเก็บ baseline SHA-256 ของ source ก่อนแก้เอกสาร งานนี้แก้เฉพาะไฟล์ ADR และ acceptance ที่ระบุ

## บริบทและผล audit ระบบเดิม

ไม่มี `AGENTS.md` ใน repository ก่อนเริ่ม และ working tree มี uncommitted changes เดิมหลายไฟล์ การตรวจนี้จึงอ้างอิงโค้ดที่พบจริง ไม่ถือว่าเป็น clean baseline และไม่ใช้ข้อมูล credential หรือข้อมูลส่วนตัวในเอกสาร

| หมวด | หลักฐานที่ตรวจพบ | ผลต่อการเปลี่ยนระบบ |
|---|---|---|
| จุดประกอบแอปและ state | `src/App.jsx:54-184, 186-320` โหลดและ autosave `transactions`, `portfolio`, `balance`, `spotBalances`, `openOrders`, `tradeHistory`, `priceAlerts` ต่อผู้ใช้ | แนวคิด state/user scope ใช้เป็น UX reference ได้ แต่ source of truth ต้องย้ายไป server/API |
| บัญชีและที่เก็บข้อมูล | `src/services/authService.js:9-21, 62-75, 284-446, 492-575` ใช้ `localStorage`, ตรวจตัวเลข JavaScript และมี profile DEMO | ไม่ย้ายข้อมูลยืนยันตัวตนหรือ profile DEMO เป็นบัญชีจริง ใช้ Better Auth database session และ HttpOnly cookie |
| รายรับ-รายจ่าย | `src/data/initialData.js:1-110`, `src/components/dashboard/QuickActionModal.jsx:19-44`, `src/components/transactions/TransactionManager.jsx:30-95` | นำ field ความหมายเดิมไปทำ preview ได้ แต่ finance ใหม่ต้องเป็น THB, Decimal และมี provenance |
| สรุปรายเดือน | `src/utils/dashboardMetrics.js:16-24, 36-87` รวมยอดด้วย `Number`; `src/data/initialData.js:176-183` เป็น aggregate ตัวอย่าง | ห้ามสร้างรายการจาก aggregate ตัวอย่าง และต้องคำนวณยอดใหม่ด้วย Decimal |
| พอร์ตสินทรัพย์ | `src/data/initialData.js:113-174`, `src/components/portfolio/PortfolioView.jsx:40-170, 487-511` เก็บ snapshot `shares`, `avgBuyPrice`, `currentPrice`, `currency` | snapshot ไม่ใช่ trade ledger; crypto ใหม่ใช้พอร์ตแยกและ cost basis scope ต่อพอร์ต |
| valuation/allocation | `src/utils/assetValuation.js:42-94, 97-137`, `PortfolioView.jsx:364-418` ใช้ `Number` และแปลงเป็น THB | crypto v1 ใช้ USDT, ไม่มี FX และไม่มี cross-currency total |
| Spot wallet/PAPER | `src/data/tradingData.js:112-130`, `src/services/spotTradingService.js:98-129, 246-468`, `PortfolioView.jsx:301-339` | เป็น legacy evidence แบบอ่านอย่างเดียว ไม่สร้าง spendable balance หรือ ledger ใหม่ |
| PAPER orders/trades | `src/services/authService.js:167-220`, `src/components/trading/PositionsTable.jsx:92-295`, `src/services/spotAnalyticsService.js:1-28` | แยก archive `LEGACY_DEMO`; ไม่ยกระดับเป็น crypto trade จริงและไม่เดา cost basis |
| exporter | `src/services/demoDataExport.js:4-17, 47-90` whitelist เฉพาะ `transactions`, `portfolio`, `paperWallet`, `paperTrading`, `priceAlerts`; `tradeHistory` มี 11 ฟิลด์และไม่มี `closedAt`/`realizedPnl`; `App.jsx:363-390` สร้างไฟล์จาก section ที่เลือก | เอกสารต้องแยก storage fields ออกจาก export fields ห้ามรับ raw dump นอก whitelist และห้ามแก้ exporter ใน F1.1 |
| ฝาก/ถอน/QR | `src/components/trading/SpotDepositModal.jsx:21-39, 122-188`, `SpotWithdrawModal.jsx:31-61, 109-190` | ตัดออกจากรุ่นแรก แม้ข้อมูลเดิมจะยังอยู่ใน storage |
| signal simulator | `src/services/tradingViewWebhookService.js:13-83, 125-323`, `TradingViewSignalModal.jsx:21-76` | signal logs/คีย์จำลองไม่อยู่ใน supported import และห้ามรับ raw log โดยปริยาย |
| market feed | `src/services/liveMarketService.js:3-5, 469-514, 565-679, 728-777, 851-869`; `README.md:7-17` | เปลี่ยนจาก direct Bitkub browser calls เป็น Binance public relay ฝั่ง server และ same-origin API/WS |

### สิ่งที่นำกลับมาใช้ได้

- โครงสร้าง navigation, ภาษาไทย, filter, empty state และ responsive layout จาก `Sidebar`, `TransactionManager`, `DashboardView` และ `PortfolioView`
- แนวคิดสถานะ `LIVE/STALE/UNAVAILABLE`, `N/A` และ error state
- whitelist export และการไม่ mutate snapshot ต้นทางเป็นแนวคิดตั้งต้นของ migration
- ชื่อเชิงความหมายของ field เก่าเพื่อใช้ใน preview เท่านั้น ไม่ใช่หลักฐานธุรกรรมจริง

### สิ่งที่ต้องแทนที่หรือยกเลิก

- `localStorage` auth/data → Better Auth + database session + HttpOnly cookie + server API
- การคำนวณด้วย `Number`/`parseFloat` → `decimal.js` และ decimal strings
- direct Bitkub browser feed → Node/Express relay + `ws` ไป Binance public
- snapshot portfolio → append-only crypto trade ledger และ holding projection ต่อพอร์ต
- Spot order, matching, deposit, withdrawal, QR, bank fields และ signal execution → ไม่อยู่ในรุ่นแรก

### ความเสี่ยงสำคัญ

1. `balance` กับ `spotBalances.THB` มีความหมายซ้ำและอาจไม่ตรงกัน
2. portfolio เดิมอาจไม่มี currency และไม่มี trade history; `avgBuyPrice` ไม่พอสำหรับ P&L
3. lock ของ open order บางรายการยืนยันไม่ได้ จึงห้ามคืนยอดหรือสร้าง ledger
4. ข้อมูล browser แก้ไข/เสียหายได้ ต้องถือเป็น user-supplied legacy data
5. การรวม THB กับ USDT หรือใช้ราคา stale เป็นฐาน P&L ทำให้ความหมายผิด

## การตัดสินใจด้านผลิตภัณฑ์

FINNTECH รุ่นแรกเป็นระบบ **ติดตามเท่านั้น**:

1. รายรับ-รายจ่ายใหม่ใช้ **THB** พร้อมหมวดหมู่ งบประมาณ และสรุปรายเดือน
2. พอร์ตคริปโตใหม่ใช้ **USDT เป็น quote currency เดียวใน v1** ผู้ใช้บันทึก buy/sell เอง มี weighted-average cost basis, realized/unrealized P&L และ allocation ต่อพอร์ต
3. ไม่มี FX และไม่มีการรวมยอดคริปโตเป็น THB ข้ามสกุล
4. ราคาอ้างอิงมาจาก Binance public ผ่าน relay ของ backend; browser ไม่เชื่อม provider โดยตรง
5. ไม่มีการส่งคำสั่งซื้อขาย ฝาก ถอน QR private exchange API หรือการให้เครดิต

ทุกหน้าที่แสดงข้อมูลการเงินต้องมีข้อความ:

> ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน

## สถาปัตยกรรมเป้าหมาย

```text
Browser: React + Vite + TypeScript + Tailwind
        │ same-origin /api และ /ws/market; HttpOnly cookie
        ▼
Node.js + TypeScript + Express + ws
        ├── Better Auth database session
        ├── Finance/Portfolio/Import services + Zod
        ├── decimal.js (precision 80)
        ├── PostgreSQL ผ่าน Prisma (NUMERIC)
        └── Binance public relay (server-to-provider เท่านั้น)
```

- Frontend เรียกเฉพาะ relative same-origin `/api/*` และ `/ws/market`; ห้ามมี Binance URL ใน browser runtime
- Server ดึง subject จาก Better Auth session เท่านั้น ไม่รับ owner/user id จาก body
- relay validate upstream ด้วย Zod, normalize เป็น decimal strings, ติดสถานะ `LIVE/STALE/UNAVAILABLE`, cache และ reconnect/backoff
- market allowlist รุ่นแรกเริ่มที่ `BTCUSDT` และ `ETHUSDT`; เปิดใช้ symbol ต่อเมื่อยืนยันว่ามีอยู่ใน provider metadata จริง และถือ quote stale เมื่ออายุเกิน 30 วินาที
- ราคาไม่พร้อมห้ามเติมราคาเองและห้ามเรียก stale ว่า `LIVE`

### โมดูลและตารางเชิงตรรกะ

| โมดูล | ตาราง | กฎ |
|---|---|---|
| Better Auth | user/session tables ตาม adapter | session ใน database, cookie เป็น HttpOnly, archive อ่านผ่าน server เฉพาะเจ้าของ |
| Finance | `finance_categories`, `finance_transactions`, `budgets` | รายการใหม่เป็น THB เท่านั้น |
| Crypto | `crypto_portfolios`, `crypto_assets`, `crypto_trades`, `portfolio_holdings` | quote ใหม่เป็น USDT; holding/P&L แยกต่อ portfolio |
| Market | `market_quotes` หรือ server cache | source/provider time/received time/status; ไม่ใช่ execution |
| Legacy | `legacy_imports`, `legacy_import_rows`, `legacy_demo_summaries` | archive แยกจาก normal tables และติด `LEGACY_DEMO` |
| Audit | `audit_events`, `idempotency_keys` | actor จาก session, request id และผลลัพธ์ โดยไม่เก็บข้อมูลลับ |

ข้อมูล legacy อ่านได้ผ่าน server เฉพาะเจ้าของเท่านั้น ไม่รวมใน Dashboard ปกติ, budget หรือ portfolio ใหม่ และ v1 ไม่ล้าง archive อัตโนมัติ นโยบาย retention/deletion ต้องสรุปก่อน production

## กฎ Decimal, NUMERIC และ rounding

กฎนี้เป็นกฎบัญชีของระบบติดตาม ไม่ใช่กฎ precision/step สำหรับส่งคำสั่ง เพราะระบบนี้ไม่ส่งคำสั่งตลาด

- ค่าเงิน THB ใช้ PostgreSQL `NUMERIC(20,2)`
- ปริมาณ ราคา ยอด quote/fee/cost และ P&L ของคริปโตใช้ `NUMERIC(38,18)`
- `decimal.js` ตั้ง precision ภายในเป็น **80** และใช้ `ROUND_HALF_EVEN` ที่จุดบันทึกผลคำนวณทางบัญชี
- API รับ/ส่งจำนวนเงินและปริมาณเป็น canonical decimal strings เท่านั้น ไม่ส่ง JSON numbers
- input เกิน scale/range หรือมี exponent/รูปแบบที่ schema ไม่อนุญาตต้อง reject ไม่ปัดเงียบ ๆ
- ห้ามอาศัย PostgreSQL cast/assignment ให้ปัดโดยปริยาย ต้อง quantize และตรวจ range ใน application ก่อนเขียน
- THB transaction quantize เป็น scale 2 ก่อนบันทึก `finance_transactions.amount`
- crypto quantity, price, gross, fee, cost removed, remaining cost และ P&L quantize เป็น scale 18 ก่อนบันทึกผลบัญชี
- ค่าเฉลี่ยและ intermediate calculation ใช้ precision 80; ห้ามอ่านค่าที่ปัดเพื่อแสดงผลกลับมาคำนวณ

### Cost basis ตอนขาย

- ต้นทุน scope คือ `(user_id, portfolio_id, asset, quote_currency)` โดย v1 `quote_currency = USDT`
- ขายบางส่วน: `cost_removed = quantize(quantity_sold × average_cost)` แล้ว `remaining_cost = stored_cost_before - stored_cost_removed`; ใช้ต้นทุนที่บันทึกจริง ไม่คำนวณจากค่าที่ปัดเพื่อแสดงผล
- ขายทั้งหมด: ตัดต้นทุนคงเหลือทั้งหมด และต้องทำให้ quantity กับ cost เหลือศูนย์แบบตรวจสอบได้
- หาก quantize แล้วทำให้ quantity/cost ติดลบหรือขายเกินจำนวนตามลำดับประวัติ ให้ reject transaction
- weighted average ใหม่คำนวณจากค่า internal precision 80 และบันทึกผลที่ scale 18 ตามกฎข้างต้น

## Portfolio ledger, ownership และ concurrency

- ทุก request อ่าน owner จาก verified Better Auth session; server ตรวจว่า `portfolio_id` เป็นของ owner ก่อนอ่าน/เขียนทุกครั้ง
- การเพิ่ม trade, ตรวจลำดับประวัติ, คำนวณ cost basis, ตัดต้นทุน, อัปเดต `portfolio_holdings` และบันทึก audit event อยู่ใน PostgreSQL transaction เดียว
- ใช้ row lock/optimistic version หรือ isolation ที่เทียบเท่าเพื่อป้องกัน concurrent writes ต่อ scope เดียวกัน
- ใช้ request idempotency key และ unique constraint ป้องกัน duplicate request/replay
- ตรวจยอดตาม trade sequence ใน transaction เดียวกัน; ขายเกิน quantity หรือขายจาก asset/quote ที่ไม่มีอยู่ให้ reject ทั้ง transaction
- ห้ามใช้ projection ที่ค้างอยู่เป็นหลักฐานแทนการ replay ledger; เมื่อ rebuild ต้องตรวจผลลัพธ์กับ ledger ก่อน commit projection
- รายละเอียด transaction/lock strategy อยู่ใน F1.4 และต้องป้องกัน concurrent writes ใน scope เดียวกัน พร้อมทดสอบกับ PostgreSQL จริง

## Dedupe และ idempotency ของ migration

ต้องแยกสามสิ่งออกจากกัน:

1. **file SHA-256** — hash ของไฟล์ export ทั้งไฟล์ ใช้ยืนยัน artifact เดิม/ไฟล์ใหม่ ไม่ใช่ row identity
2. **request idempotency key** — key ของคำขอ import โดย scope คือ `(owner, endpoint, idempotency_key)` ไม่ผูกกับ session ID; request hash ครอบคลุม file SHA-256, namespace immutable ID, selected sections และ currency overrides
3. **row identity** — แยกตามว่าต้นทางมี logical ID หรือไม่ ตามกติกาด้านล่าง

`source_dataset_namespace` มี immutable internal ID และ display name ที่แก้ไขได้ ใช้แยกชุดข้อมูลต้นทาง A/B ที่มาจาก origin เดียวกันและมี row ID ซ้ำได้ การเปลี่ยน display name ห้ามเปลี่ยน identity; namespace ไม่ใช่ credential และไม่ใช่หลักฐานยืนยันตัวตน

export v1 ยังไม่มี source dataset ID ดังนั้น preview ต้องบังคับให้ผู้ใช้เลือก namespace immutable ID ที่มีอยู่ หรือสร้าง namespace ใหม่อย่างชัดเจน ห้ามเดาจาก origin, email, row ID หรือ file hash

- ถ้ามี source row ID: identity คือ `(owner, namespace_id, section, source_row_id)`; `row_ordinal` เป็นตำแหน่งต้นทางสำหรับ provenance/receipt เท่านั้น ไม่ใช่ส่วนของ identity ดังนั้น export ใหม่ที่สลับลำดับแถวแต่ใช้ ID เดิมต้องไม่เพิ่มรายการซ้ำ
- ถ้าไม่มี source row ID: identity คือ `(owner, namespace_id, file_sha256, section, row_ordinal)`; แถวที่เนื้อหาเหมือนกันทุกแถวในไฟล์เดียวใช้ ordinal ต่างกันและต้องรักษาแถว/จำนวนเงินครบ
- ไฟล์ใหม่ที่ file SHA-256 ต่างกันและแถวไม่มี ID ห้าม dedupe อัตโนมัติเมื่อไม่มีหลักฐานว่าเป็นรายการเดียวกัน ให้แสดงเป็น duplicate candidate ใน preview/receipt เพื่อให้ผู้ใช้ตรวจ ไม่ทิ้งเงียบ ๆ
- logical ID เดิมใน namespace เดียวกันและ payload เดิมเป็น duplicate/idempotent; logical ID เดิม payload ต่างกันเป็น conflict และห้าม overwrite/ทิ้งเงียบ ๆ
- ห้ามตัดแถวข้ามไฟล์ด้วย content hash อย่างเดียวเมื่อพิสูจน์ไม่ได้ว่าเป็นรายการเดียวกัน
- key เดิมและ request hash เดิมต้องคืนผลเดิมแม้ผู้ใช้ล็อกอินใหม่; key เดิมแต่ request hash ต่างกันเป็น idempotency conflict
- retry หลัง timeout หรือหลัง server commit สำเร็จแต่ response หายต้อง lookup key เดิมและคืน receipt เดิม ไม่สร้าง batch/row ซ้ำ
- การยกเลิกก่อนส่ง commit หรือ DB rollback ที่ server ยืนยันแล้วเท่านั้นจึงสรุปได้ว่าไม่มีแถวใหม่; timeout/connection ขาดหลังส่ง commit ทำให้สถานะยังไม่ทราบ ต้องตรวจสถานะหรือ retry key เดิม และห้ามรายงาน rollback สำเร็จจาก timeout เพียงอย่างเดียว
- retry ของ batch ที่ `REVERSED` คืนผล reversed เดิมและห้ามทำให้ข้อมูลกลับมาเอง; การนำเข้าใหม่ต้องเป็นคำขอใหม่พร้อม preview/consent ใหม่

รายละเอียดขั้นตอนอยู่ใน `docs/acceptance/migration.md`

## การแยก `LEGACY_DEMO`

- legacy เก็บเฉพาะใน archive แยก ไม่สร้างแถวปกติใน `finance_transactions` หรือ `crypto_trades`
- หน้า legacy เป็น read-only; Dashboard ปกติ, budget และ portfolio ใหม่ไม่รวม legacy
- ผู้ใช้เลือก THB ให้ legacy transaction แบบ batch ใน preview ได้ และ override รายแถวได้ โดยไม่เขียนทับ raw source, provenance หรือ label `LEGACY_DEMO`
- portfolio เก่า non-crypto อยู่หน้า legacy read-only แยกจาก crypto portfolio ใหม่
- rollback มีผลเฉพาะ legacy import batch และไม่เปลี่ยนรายการที่ผู้ใช้สร้างใหม่
- v1 ไม่ล้าง archive อัตโนมัติ; retention/deletion เป็น gate ก่อน production แต่ไม่ใช่เงื่อนไขขวางการตั้ง workspace F1.2

## สิ่งที่ยังไม่ทำในรุ่นแรก

- ส่งคำสั่งซื้อขาย, exchange account, private API, deposit, withdrawal, QR, bank integration และ webhook execution
- sync statement อัตโนมัติ, tax lot/FIFO/LIFO, leverage, staking, lending, NFT และ derivatives
- FX conversion, cross-currency THB total และการใช้ legacy เป็นยอดตั้งต้น

## ความสัมพันธ์กับ ADR-001

`ADR-001-user-data-migration.md` ยังคงอยู่และห้ามลบ/เขียนทับ เป็นประวัติการตัดสินใจเดิม เรื่องที่สืบต่อคือ export ก่อนเปลี่ยน origin, provenance, ไม่ใช้ local profile ยืนยันตัวตน, ไม่ให้เครดิตอัตโนมัติ, เก็บต้นฉบับ และ rollback ด้วย compensating record

ADR-002 เสนอ stack ปัจจุบันคือ Better Auth + Node/Express/ws + Prisma/PostgreSQL + same-origin frontend/API/WS แทนข้อเสนอ provider/BFF เดิมใน ADR-001 สำหรับเป้าหมาย finance tracker เท่านั้น ยังไม่มี infra, deploy, DNS หรือระบบจริง

## F1.1 document gate และข้อกำหนดที่ Tech Lead ตัดสิน

F1.1 ตรวจเฉพาะความครบและความสอดคล้องของเอกสาร, mapping, product invariants และหลักฐานจาก source ที่ตรวจพบจริง การทดสอบ preview/import/database/relay/browser เป็น runtime gates ของเฟสถัดไปและยังห้ามรายงานว่า PASS

ข้อกำหนดที่ Tech Lead ตัดสินในรอบนี้:

1. namespace มี immutable internal ID และ display name ที่แก้ไขได้ โดยการเปลี่ยนชื่อไม่เปลี่ยน identity
2. รายละเอียด transaction/lock ลงใน F1.4; ต้องป้องกัน concurrent writes ใน scope เดียวกันและทดสอบกับ PostgreSQL จริง
3. market allowlist เริ่ม `BTCUSDT`/`ETHUSDT` และเปิดใช้ต่อเมื่อยืนยันจาก provider metadata จริง; stale threshold คือ 30 วินาที
4. retention/deletion เป็น gate ก่อน production ไม่ใช่เงื่อนไขขวางการตั้ง workspace F1.2

ประเด็นที่ยังต้องตัดสินในเฟสถัดไป:

- รูปแบบหน้าจอ preview/consent สำหรับเลือก namespace และ currency overrides
- รายละเอียดนโยบาย retention/deletion (ระยะเวลา, actor, audit และขั้นตอนลบ) ก่อน production
