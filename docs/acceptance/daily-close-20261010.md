# FINNTECH — ประเมินพอร์ตหุ้น/ETF อัตโนมัติจากราคาปิดรายวัน, 2026-10-10

หลักฐาน: [`daily-close-20261010/`](daily-close-20261010/)

## สถานะ (แยกให้ชัด)

| เรื่อง | สถานะ |
|---|---|
| โค้ดเชื่อมต่อ + การคำนวณ + ตาราง DB + UI | ✅ เสร็จในเครื่องและทดสอบผ่าน (ยังไม่ commit/deploy) |
| แหล่งราคาปิดที่ **ฟรี** และอนุญาตแสดงให้ผู้ใช้หลายบัญชีตามเงื่อนไขที่ประกาศ | ❌ **ไม่พบ** (ดูตารางแหล่งข้อมูล) |
| เชื่อมต่อผู้ให้บริการจริง (Tiingo) | ❌ NOT TESTED — ไม่มี key; ทดสอบด้วย upstream ปลอมเท่านั้น |
| เปิดให้เพื่อนใช้ราคาอัตโนมัติ | ❌ **ยังไม่ได้** จนกว่าจะมีแพ็กเกจที่ให้สิทธิ์ display/redistribution และ deploy |
| ใช้ได้ทันทีโดยไม่เสียเงิน | ✅ โหมด `personal-owner-only` (key ฟรีของเจ้าของ เห็นเฉพาะเจ้าของ) · ผู้ใช้อื่นกรอกราคาเองได้ตามเดิม |
| USD→THB | ECB รายวัน (ของเดิม) พร้อมวันที่ · ตรวจกับ ECB จริงในพรีวิวในเครื่อง: 33.530251650901302873 ณ 2026-10-09 |

## แหล่งข้อมูลและเงื่อนไข (ตรวจ 2026-10-10)

| ผู้ให้บริการ | ฟรี | เงื่อนไขแสดงผลให้ผู้อื่น | สรุป |
|---|---|---|---|
| [Tiingo pricing](https://www.tiingo.com/about/pricing) / [EOD product](https://www.tiingo.com/products/end-of-day-stock-price-data) | Starter $0: 50 req/ชม., 1,000/วัน, 500 symbols/เดือน | Starter/Power/Commercial = "Internal Use Only" — ห้าม display หรือแชร์ให้บุคคลอื่น · แพ็กเกจ **EOD + IEX Redistribution $250/เดือน (startup), $500 (enterprise)** — ให้ติดต่อ sales | ใช้ได้แบบ personal เท่านั้น; ตัวเลือกจ่ายเงินที่ถูกที่สุดที่ประกาศราคา redistribution |
| [Alpha Vantage ToS](https://www.alphavantage.co/terms_of_service/) | มี | personal non-commercial; การให้ผู้อื่นเข้าถึงข้อมูล "directly or indirectly" นับเป็น commercial → ต้องติดต่อ | ❌ |
| [Twelve Data](https://twelvedata.com/pricing) / [business](https://twelvedata.com/pricing-business) | Basic 800/วัน | Basic "internal non-display"; **Venture** "External display … client-facing apps or websites" ($499/เดือน บนการ์ด แต่ตารางแสดง $149 — หน้าเว็บไม่สอดคล้องกัน) | ❌ ฟรี; ✅ จ่ายเงิน (ต้องยืนยันราคา) |
| [Massive (Polygon)](https://massive.com/pricing) / [business](https://massive.com/business) | Basic EOD 5 req/นาที | แผนรายบุคคลทั้งหมด "individual use"; Business $2,499/เดือน | ❌ |
| [Finnhub ToS](https://finnhub.io/terms-of-service) | มี | ใช้ส่วนตัว; ห้าม redistribute/แชร์ "data or derived results" ถ้าไม่มี written approval | ❌ |
| [EODHD terms](https://eodhd.com/financial-apis/terms-conditions) | มี | Non-professional ห้าม "displaying, or granting access" | ❌ |
| [Market Data](https://www.marketdata.app/pricing/) | 100 credits/วัน | Free–Prime "Internal Use"; Commercial (custom) = Redistribution | ❌ |
| FMP | มี | หน้า ToS ทางการตอบ 403 ต่อการดึงอัตโนมัติ; ผลค้นหาระบุ personal-only และห้าม public display โดยไม่มี written approval (**แหล่งทุติยภูมิ**) | ❌ |
| IEX Exchange (HIST/delayed) | ฟรี | เอกสาร SEC ระบุว่าข้อมูล IEX แบบ delayed redistribute ได้ แต่เป็นไฟล์ pcap หลาย GB และเป็นราคา IEX ตลาดเดียว ไม่ใช่ official close; ไม่ได้อ่านเงื่อนไข HIST ฉบับเต็ม | ไม่เหมาะ/ยังไม่ยืนยัน |
| Alpaca (รอบก่อน) | Basic | personal non-commercial | ❌ หลายบัญชี |

ข้อสังเกต: "API ฟรี" หรือ "commercial internal use" ไม่ได้ให้สิทธิ์แสดงผลแก่ผู้อื่นในทุกเจ้าที่ตรวจ ก่อนซื้อ Tiingo redistribution ควรขอคำยืนยันเป็นลายลักษณ์อักษรว่าครอบคลุม (1) การแสดงราคาปิดและมูลค่าพอร์ตที่คำนวณได้แก่ผู้ใช้ที่ login (2) เงื่อนไข attribution (3) ค่าธรรมเนียมตลาดหลักทรัพย์ (ถ้ามี) — **ไม่ได้ซื้อหรือสมัครบริการใด**

## สิ่งที่แก้

- **`packages/finance/src/market-calendar.ts` (ใหม่)**: ปฏิทินวันหยุด NYSE ตามกฎ (รวม Good Friday, Juneteenth, กฎวันเสาร์/อาทิตย์, ปีใหม่ตรงวันเสาร์) + นโยบายความสดของราคาปิดที่ **นับเป็นวันซื้อขาย ไม่ใช่ 30 วินาที**: `CURRENT` (วันล่าสุดที่ควรเผยแพร่แล้ว ตัดที่ 18:00 นิวยอร์ก), `DELAYED` (ช้า 1 วันซื้อขาย ยังนับแต่แสดงทั้งสองวันที่), `STALE` (เก่ากว่า ไม่นับ), `INVALID` (ไม่ใช่วันซื้อขายหรือตลาดยังไม่ปิด)
- **`summarizeStockHoldings`**: รวมหลายพอร์ต/หลายหุ้นด้วย Decimal; ขาดราคา → ยอดรวม `null` + รายชื่อที่ขาด + ยอดบางส่วน (ไม่ใช้ต้นทุนแทน)
- **contracts**: `dailyCloseSnapshotSchema` (source, tradingDate, fetchedAt, currency=USD, priceType=CLOSE, status, problem) เป็นฟิลด์ optional ใน `valuationOverview` (เข้ากันได้ย้อนหลัง)
- **`apps/api/src/tracker/daily-close.ts` (ใหม่)**: adapter Tiingo (ใช้ `close` ดิบ ไม่ใช้ `adjClose`; key อยู่ใน header เท่านั้น; redirect error; timeout 8 วิ; body ≤ 64 KiB; ตัวเลขผ่าน Decimal); relay กลางตัวเดียวสำหรับทุกบัญชี (single-flight); ดึงเฉพาะเมื่อถึงวันใหม่; ข้อมูลยังไม่มา → ลองใหม่ทุก 30 นาที; ดึงซ้ำ 1 ครั้งหลัง 20:30 นิวยอร์กเพื่อรับการแก้ไข; ล้มเหลว → backoff 1 นาที→1 ชม.; 401/403 พักทั้งหมด 1 ชม.; 429 ตาม Retry-After; งบคำขอ 40/ชม., 500/วัน (ตั้งค่าได้); ไม่ย้อนวันที่ที่เก็บไว้; ตรวจสิทธิ์ตาม licence ต่อบัญชี (PERSONAL → `NOT_LICENSED` สำหรับบัญชีอื่น และไม่ก่อ traffic)
- **ตาราง `daily_close_prices`** (migration `20261010000000_daily_close_prices`, เพิ่มตารางใหม่อย่างเดียว ไม่แตะตารางเดิม): source, symbol, trading_date (CHECK จ.–ศ.), close > 0, currency='USD', price_type='CLOSE', fetched_at · เป็นข้อมูลตลาดใช้ร่วม ไม่อยู่ใน backup/purge ของผู้ใช้
- **`server.ts`/`app.ts`/`routes.ts`**: ตั้งค่าผิด → ปิดเฉพาะ feed นี้ (log เฉพาะชื่อตัวแปร); `GET /api/valuation/references` เพิ่ม `dailyCloses` ตามบัญชีที่ login
- **Web `valuationPolicy.ts`**: ลำดับ กรอกเอง (ติดป้าย "แทนอัตโนมัติ") → ราคาสด Alpaca (เจ้าของ key) → ราคาปิดรายวัน → ขาด/เก่า พร้อมเหตุผล · **`Assets.tsx`**: กล่อง "หุ้น/ETF รวมทุกพอร์ต" (มูลค่า, ≈THB, ต้นทุนคงเหลือ, กำไร/ขาดทุนยังไม่รับรู้ หรือ "ยังขาดราคา: …" + ยอดบางส่วน), วันที่ซื้อขาย + เวลาดึง ต่อแถว, ราคาปิดล่าสุดที่ทราบเมื่อเก่าเกิน, ปุ่ม "กลับไปใช้ราคาปิดอัตโนมัติ", สถานะ feed + attribution · **`StockHoldings.tsx`**: ใช้นโยบายเดียวกันต่อพอร์ต
- ไม่แตะ TradingView widget (ไม่ดึงตัวเลขจาก widget), ไม่แก้รายการซื้อขาย/ต้นทุน/เงินสด/ข้อมูลผู้ใช้เดิม

## ผลตรวจ

| คำสั่ง / ชุด | ผล |
|---|---|
| Baseline ก่อนแก้ `npm run tracker:test` | PASS (finance 25, contracts 16, api 147, web 156) |
| `npm test` | PASS exit 0 — 71 files, 523 tests |
| `npm run build` | PASS exit 0 |
| `npm run tracker:typecheck` | PASS exit 0 |
| `npm run tracker:test` | PASS exit 0 — finance 35, contracts 18, api 161, web 164 + dev smoke |
| `npm run tracker:build` | PASS exit 0 |
| `git diff --check` + ตรวจ trailing whitespace ไฟล์ใหม่ | PASS (มีเฉพาะคำเตือน LF/CRLF) |
| **ใหม่** `market-calendar.test.ts` (วันหยุด 2026/2027, เสาร์-อาทิตย์, ก่อน/หลังเผยแพร่, DST, หุ้นเศษส่วนหลายพอร์ต, ขาดราคา) | 10/10 |
| **ใหม่** `daily-close.test.ts` (API: close vs adjClose, ไม่มี key ใน URL/response/log, error mapping, config, cache ร่วม 50 บัญชี = 1 คำขอ/symbol, รอเผยแพร่+ลองใหม่ 30 นาที, correction, วันหยุด, provider ล้ม → DELAYED/STALE, auth/429, งบคำขอ, monotonic, licence, restart) | 14/14 |
| **ใหม่** `dailyClose.test.tsx` (UI: 940 USD ×35 + 100 = 33,000 THB, ขาด QQQ → บางส่วน 31,600 THB, DELAYED, override + กลับอัตโนมัติ, NOT_LICENSED/NOT_CONFIGURED, หน้าหุ้นต่อพอร์ต) | 8/8 |
| **ใหม่** `daily-close.integration.ts` (PostgreSQL 16 จริง + Better Auth จริง + migrations ทั้ง 16 + upstream ปลอม): CHECK ปฏิเสธวันเสาร์/0/THB/ADJ_CLOSE, 2 บัญชีได้ข้อมูลเดียวกัน 8 คำขอรวม, เก็บ 8 แถวพร้อม provenance, แยกข้อมูลบัญชี (B เขียนพอร์ต A = 404), มูลค่า A 770.75/ต้นทุน 744.5/กำไร 26.25 USD, B 1000/40, backup ไม่มีข้อมูลตลาด, restart+provider ล้ม → DELAYED แล้ว STALE, personal licence ผ่าน route จริง | 5/5 ([evidence](daily-close-20261010/integration-evidence.json)) |
| พรีวิวในเครื่อง (build จริง, ราคาปิด **SYNTHETIC**, ECB จริง) | ยอด/วันที่/สถานะถูกต้อง, 375px ไม่ล้นจอ ([ภาพ](daily-close-20261010/synthetic-preview-mobile-375.jpg)) |
| Tiingo จริง / deploy | **NOT TESTED** |

ข้อมูลทดสอบทั้งหมดเป็นข้อมูลสมมติ (ระบุ `SYNTHETIC` ในไฟล์) และไม่ใช่หลักฐานการเชื่อมต่อราคาจริง

## ค่าใช้จ่ายและโควตา

- การใช้งานจริงต่อวันซื้อขาย: ~8 คำขอ (8 หลักทรัพย์ใน catalog) + ดึงแก้ไข ≤ 8 + ลองใหม่ขณะรอข้อมูล ≤ 2/ชม./ตัว — ไม่ขึ้นกับจำนวนผู้ใช้ · อยู่ในโควตา Tiingo ฟรี (50/ชม., 1,000/วัน, 500 symbols/เดือน)
- DB: ~2,000 แถว/ปี
- ฟรี (personal-owner-only): $0 · ให้ทุกบัญชีเห็น: Tiingo EOD + IEX Redistribution $250/เดือน (startup, ต้องติดต่อ sales) หรือ Twelve Data Venture (ต้องยืนยันราคา)

## ตัวแปรที่ต้องตั้ง (Render → Environment เท่านั้น ห้ามส่ง key ทางแชท)

| ตัวแปร | ค่า |
|---|---|
| `DAILY_CLOSE_PROVIDER` | `tiingo` |
| `TIINGO_API_TOKEN` | token จากบัญชี Tiingo |
| `DAILY_CLOSE_LICENSE` | `personal-owner-only` (แผนฟรี/internal) **หรือ** `redistribution-confirmed` (ตั้งได้หลังมีแผนที่ให้สิทธิ์ display redistribution แล้วเท่านั้น) |
| `DAILY_CLOSE_OWNER_ID` | `ownerId` จาก `/api/me` (ต้องมีเมื่อ personal, ห้ามมีเมื่อ redistribution) |
| `DAILY_CLOSE_MAX_REQUESTS_PER_HOUR` / `_PER_DAY` | ไม่บังคับ (ค่าเริ่ม 40 / 500) |

Log ที่ควรเห็น: `Daily close feed configured (Tiingo EOD, …)` แล้ว `Daily close (Tiingo EOD): stored N close(s)` · ถ้าเห็น `AUTH_FAILED` = token ผิด

## ข้อจำกัด / สิ่งที่ยังขาด

- ยังไม่มีแผนข้อมูลที่ยืนยันสิทธิ์แสดงผลหลายบัญชี → **ยังไม่ควรตั้ง `redistribution-confirmed`**
- ต้อง deploy พร้อม migration ใหม่ (เพิ่มตารางเดียว) — ยังไม่ทำ; ควรสำรองฐานข้อมูลก่อนตามขั้นตอนเดิม
- ราคาปิดดิบไม่ปรับ split: หากหุ้นแตก ผู้ใช้ต้องบันทึกปรับจำนวนเอง (ระบบเดิมไม่รองรับ corporate actions)
- วันปิดตลาดที่ไม่ได้ประกาศล่วงหน้าไม่อยู่ในปฏิทิน — ครอบคลุมด้วยสถานะ DELAYED 1 วัน
- Catalog ยังจำกัด 8 ตัว (AAPL, MSFT, NVDA, AMZN, GOOGL, TSLA, SPY, QQQ)
- Render Free หลับ: ตอนตื่น ข้อมูลที่เก็บใน DB แสดงทันที แล้วจึงดึงใหม่
