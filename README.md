# FINNTECH

สถานะวันที่ 9 ตุลาคม 2026: เว็บโครงการนักศึกษาเปิดบัญชีอีเมล/รหัสผ่านที่
[FINNTECH Personal](https://finntech-personal.onrender.com/) แล้ว ใช้ฐานแยกจาก DEMO
รอบล่าสุดแก้หุ้น/ETF ให้แสดงกล่องราคาขนาดเล็กก่อน และโหลดกราฟใหญ่เมื่อกดดู
จำนวนหุ้น ต้นทุน กำไรที่ขายแล้ว และประวัติอัปเดตหลังบันทึกซื้อ/ขาย
หลังยินยอมให้ TradingView ประเมินพอร์ต สูตรจำนวน/ต้นทุนจะอัปเดตอัตโนมัติขณะเปิดพอร์ตนั้น
หุ้นอาจหน่วงเวลา และราคาจาก widget ยังไม่รวมเป็นสินทรัพย์ THB อัตโนมัติ ดู
[ผลตรวจการโหลดราคาและอัปเดตหุ้น](docs/acceptance/stock-refresh-20261009.md)
ประวัติงานราคาคริปโตและกราฟฟรีอยู่ที่ [ผลตรวจรอบก่อน](docs/acceptance/free-market-20261009.md)
ไม่มี email verification/password recovery ในโหมดนี้ และยอมรับ free hosting ที่พักเมื่อไม่ใช้งาน
งานพอร์ตหุ้น/สินทรัพย์และ crypto stream รอบล่าสุด **deploy แล้วตามคำอนุญาตเจ้าของ** ดู
[ผลตรวจออนไลน์และข้อจำกัด](docs/acceptance/asset-portfolios-deploy-20261009.md)
และ [ผลตรวจในเครื่องก่อน deploy](docs/acceptance/asset-portfolios-review-20261009.md)
ฐาน/runtime real แยกจาก Beta/DEMO ไม่ย้ายบัญชีหรือข้อมูลเดิม ประวัติ readiness เดิมอยู่ที่
[readiness และผลตรวจจริง](docs/acceptance/real-use-readiness-20261008.md),
[private setup](docs/operations/real-use-setup.md) และ
[Google Drive backup/Gmail alerts](docs/operations/real-use-backup.md)
การส่งอีเมลจริงและสำรองนอกเครื่อง/schedule เป็น integrations ทางเลือกที่ยังไม่พร้อม
ไม่ใช่เงื่อนไขบังคับสำหรับ registration/login ตามขอบเขตโครงการนักศึกษาล่าสุด

เว็บหลักคือ **tracker** ใน `apps/web` + `apps/api` + `packages/`: บันทึกการเงิน THB
และประวัติคริปโต USDT ด้วยมือ แยกพอร์ต ใช้ PostgreSQL และ Better Auth ไม่มี execution
ฝากถอน หรือเครดิตเริ่มต้น ไม่ย้าย DEMO จากเว็บเดิมเป็นข้อมูลจริง

## เปิดเว็บหลักในเครื่อง

Prerequisites: Node.js **22.12+ ในสาย 22 หรือ 24.x**, npm และ dependencies ที่ติดตั้ง
จาก lockfile; Docker Desktop พร้อม Compose สำหรับ PostgreSQL local สังเคราะห์
และ server configuration ตาม [Auth UI decision](docs/decisions/006-auth-ui.md)
ใช้ `apps/api/.env.example` และ `.env.auth.local.example` เป็นแบบเท่านั้น
อย่าทับ `.env` เดิมหรือใช้ placeholder เป็น credential จริง ห้ามใส่ secrets ใน `VITE_*`
ติดตั้ง dependencies ครั้งแรกด้วย `npm ci` จาก root ตาม lockfile; หากติดตั้งไว้แล้วไม่ต้องรันซ้ำ

จาก root repository หลังเตรียม configuration และ DB แล้ว:

```powershell
docker compose --env-file .env.auth.local -f compose.auth.local.yaml up -d --wait
```

ก่อน `npm run tracker:dev` ครั้งแรก ฐานใหม่ต้องเตรียมด้วย
`npm run tracker:auth:local:prepare` **ครั้งแรกกับ empty synthetic DB ที่ตรวจ target แล้วเท่านั้น**
ฐานที่มีข้อมูลต้องตรวจ target และใช้ forward migrations ตาม decisions/007 และ 008
ไม่รัน prepare ซ้ำ ไม่ reset และไม่ลบ volume เพื่อให้เริ่มได้
หลังเตรียมฐานแล้วเริ่ม Web/API ด้วย `npm run tracker:dev`
จากนั้นเปิด [เว็บ tracker](http://127.0.0.1:4173/) สมัคร/เข้าสู่บัญชีสังเคราะห์ของคุณ

Desktop ใช้ sidebar; mobile มี ภาพรวม, รายการ, พอร์ต, เพิ่มเติม
ในเพิ่มเติมเลือกงบประมาณ สำรองข้อมูล บัญชีและดูแลข้อมูล หรือราคาหุ้นสหรัฐ
หน้าบัญชีแสดงชื่อจาก session และใช้ logout/backup เดิม ยังไม่มี recovery หรือเปลี่ยนรหัสผ่าน

ตรวจ health ใน terminal อีกหน้าต่าง:

```powershell
Invoke-RestMethod http://127.0.0.1:4174/api/health
Invoke-RestMethod http://127.0.0.1:4173/api/health
```

ต้องตรวจทั้ง API ตรงและผ่าน Web proxy; HTTP 200 ไม่ได้ยืนยัน login/ledger readiness
ดูค่า `checks.database` ด้วย ส่วน Auth health เป็น `not_checked` เมื่อ configured
จึงต้องตรวจ signup/login แยก หาก `not_configured` ยังบันทึกข้อมูลไม่ได้
API ค่าเริ่มต้น 4174, Web 4173; Vite ใช้ `strictPort` จึงหยุดหากพอร์ต Web ถูกใช้อยู่
ตรวจ process ที่ครองพอร์ตและ `TRACKER_ORIGIN` ให้ตรง Web โดยไม่หยุด process อื่นโดยเดา

หยุด Web/API ด้วย `q` แล้ว Enter หรือ Ctrl+C ใน terminal ที่เริ่ม runner
ตรวจว่าพอร์ตของ process ที่เริ่มเองคืนแล้ว แล้วหยุดเฉพาะ DB local โดยรักษาข้อมูล:

```powershell
docker compose --env-file .env.auth.local -f compose.auth.local.yaml stop postgres-auth-local
```

สถานะปัจจุบัน: มี ledger/correction, เงินสด, assets เทียบบาทด้วย USDT_THB,
JSON backup v1/v2 และ restore; ราคา/อัตราเกิน 30 วินาทีไม่ใช้คำนวณปัจจุบัน
account recovery, พื้นที่ข้อมูลจริง, full backup operations และ online acceptance ยังมีงานค้าง
ดู [รายงานช่วง 1](docs/acceptance/phase1-review-20261007.md) และรายงาน audit เดิม
ใน `docs/acceptance/website-status-20261007.md`; ผล tests/build ไม่ยืนยัน L1/L2/O1 ทั้งหมด

## เว็บเดิม (legacy) และประวัติโครงการ

`src/` ใช้ `npm run dev` / `npm run build` (URL ตาม Vite output ปกติ localhost:3000)
เป็น Spot/PAPER/DEMO เดิม; Market/Limit ยังพัก เว็บหลักใช้ **`npm run tracker:dev`**
รายละเอียด legacy และบันทึก workspace แต่ละระยะด้านล่างเก็บไว้เป็นประวัติ
GitHub Pages deploy target และ ADR เดิมคงเดิม

## ขอบเขตและแหล่งข้อมูล

- Spot Terminal แสดงคู่คริปโต THB ที่รองรับด้วยข้อมูลสาธารณะจาก Bitkub เท่านั้น ไม่มี API key และไม่เรียก private, wallet, order, deposit หรือ withdrawal endpoints
- `src/services/liveMarketService.js` โหลด `/symbols`, `/ticker`, `/depth` และ `/trades` จาก REST v3 แล้วใช้ public WebSocket สำหรับ ticker และ order book/trades โดย mapping คู่และ pairing ID มาจาก `/symbols`; bootstrap `/symbols` ลองใหม่แบบ backoff และจะลองอีกครั้งในหน้าเดิมเมื่อ retry รอบแรกหมดจากปัญหาเครือข่ายชั่วคราว
- **ขณะนี้พักคำสั่ง PAPER ทั้ง Market และ Limit** เพราะยังยืนยันความหมายของ `base_asset_scale`, `quantity_scale` และ `quantity_step` จาก Bitkub ไม่ได้ Service และ UI ปฏิเสธคำสั่งพร้อมแสดงเหตุผล ห้ามถือค่าจาก `/symbols` เป็น precision หรือ step ของจำนวนเหรียญโดยไม่มีเอกสารยืนยัน
- ฟอร์ม BTC รองรับการกรอกจำนวนเศษได้ถึง 8 ตำแหน่งเพื่อแสดงผลในแอป แต่ค่านี้ไม่ใช่การยืนยันกฎจำนวนของ Bitkub และไม่ได้เปิดให้ส่งคำสั่ง
- สถานะราคาเป็น `LIVE`, `STALE` หรือ `UNAVAILABLE` ตาม feed และเวลาได้รับข้อมูล คำว่า `LIVE` ระบุเฉพาะข้อมูลตลาดสาธารณะ ไม่ได้หมายถึงมีการ execute หรือจับคู่คำสั่ง ปัจจุบันไม่มีคำสั่ง Spot ที่ส่งหรือจับคู่ได้
- Order Book, recent trades และกราฟใช้ Bitkub public feed; กราฟโหลด OHLCV ย้อนหลังจาก `GET https://api.bitkub.com/tradingview/history` โดยใช้ provider symbol ที่ได้จาก `/symbols` และ timeframe ที่ API ระบุได้ แท่งล่าสุดถูกรวมกับ matched trades จริงที่ได้รับเท่านั้น ([Bitkub REST docs](https://github.com/bitkub/bitkub-official-api-docs/blob/master/rest-v1.md#tradingviewhistory), [REST v3](https://github.com/bitkub/bitkub-official-api-docs/blob/master/rest-v3.md))
- Endpoint history เป็นเส้นทาง unversioned ที่เอกสาร Bitkub ระบุว่ายัง available และไม่มี endpoint replacement ใน v3; ต้องทดสอบ CORS/response จาก GitHub Pages origin ก่อนถือว่าใช้งานได้ หาก history ใช้ไม่ได้ กราฟจะแสดงเฉพาะแท่งจาก matched trades บางส่วนพร้อมช่วงเวลาที่ครอบคลุม และไม่เติมแท่งหรือราคาเอง
- ค่า `LIVE` หมายถึงข้อมูลตลาดสาธารณะจาก Bitkub; ไม่ได้หมายถึงคำสั่งถูกส่งไป exchange หรือคำสั่งซื้อขายจริง
- BUY/SELL ใช้ยอด DEMO ใน LocalStorage และค่าธรรมเนียมจำลอง 0.25%; ฝาก ถอน QR และข้อความธนาคารไม่มีการเชื่อมธนาคารหรือโอนเงินจริง
- Dashboard และ Portfolio ใช้ valuation rule เดียวกัน ราคา Spot ที่ไม่มี ticker สถานะ `LIVE` จะไม่ถูกนำไปประเมินเป็น THB
- บัญชีและข้อมูลผู้ใช้เก็บใน LocalStorage ของเบราว์เซอร์ ไม่มี backend หรือการเข้ารหัสข้อมูลที่ยืนยันได้

## ข่าวและปฏิทินเศรษฐกิจ

ปฏิทินเศรษฐกิจและข่าวบทความจะแสดง `UNAVAILABLE` จนกว่าจะกำหนด backend/proxy ที่มีสิทธิ์ใช้งานและส่ง source, timestamp และรายการจริงมาให้ UI โดยตรง FINNTECH ไม่ดึง Forex Factory feed มาทำซ้ำและไม่มีข้อมูลข่าวตัวอย่าง

### Provider ที่ประเมินสำหรับข่าวและปฏิทิน

Trading Economics เป็น candidate provider สำหรับทั้งปฏิทินเศรษฐกิจและข่าวบทความ ([calendar docs](https://docs.tradingeconomics.com/economic_calendar/), [news docs](https://docs.tradingeconomics.com/news/latest/), [authentication](https://docs.tradingeconomics.com/get_started/authentication/)). ยังไม่ได้สมัครหรือเชื่อมต่อ provider. หน้า pricing ปัจจุบันแสดง Standard trial 1 สัปดาห์ราคา USD 49, Standard USD 199/เดือน และ 500 REST requests/เดือน; Enterprise เป็นราคา custom และหน้า plan ระบุ white-label/data distribution ([official pricing](https://tradingeconomics.com/api/pricing.aspx)). สิทธิ์จาก Standard สำหรับนำข้อมูลมาแสดงต่อสาธารณะใน FINNTECH ยังไม่ได้ยืนยัน; Terms ระบุสิทธิ์เป็น personal/non-transferable จึงต้องขอคำยืนยันสิทธิ์ redisplay/attribution/cache จาก provider เป็นลายลักษณ์อักษรก่อนซื้อหรือแสดงข้อมูลจริง ([Terms](https://tradingeconomics.com/terms.aspx)). Trial ไม่คืนเงินและมีการเรียกเก็บเมื่อหมดช่วงทดลองหากไม่ยกเลิก

ขั้นตอนที่ทำได้เมื่อเจ้าของอนุมัติ provider/สิทธิ์และ hosting:

1. ขอ pricing/quotation และยืนยันสิทธิ์แสดงข่าวกับปฏิทินบนเว็บสาธารณะ รวมข้อกำหนด source attribution, caching, retention, user/access และ request quota
2. เลือก serverless/BFF hosting แยกจาก GitHub Pages; GitHub Pages ไม่มี server runtime สำหรับเก็บ API secret
3. เก็บ key ใน server-side environment secret และเรียก provider จาก backend ด้วย Authorization header ไม่ใส่ key ใน bundle, `VITE_*`, LocalStorage, URL query หรือ Git
4. ให้ backend จำกัด route เป็น `/calendar` และ `/news`, cache/rate-limit, validate upstream schema และคืน `status`, `source`, `updatedAt`, `items` ตาม contract ด้านล่าง
5. ตั้ง `VITE_FINNTECH_ECONOMIC_PROXY_URL` เป็น public base URL ของ proxy (ตัวแปรนี้มีได้เฉพาะ URL ไม่มี secret) แล้วตรวจ source, timestamp, stale/unavailable และสิทธิ์ก่อนเปลี่ยน UI ออกจาก `UNAVAILABLE`

Standard API quota 500 requests/เดือนอาจไม่พอหากทุก client เรียกซ้ำโดยตรง; proxy ต้อง cache และคุม quota. หากต้องการ public redistribution/white-label ให้ขอราคา Enterprise โดยตรงก่อนตัดสินใจ. ยังไม่มีการซื้อบริการ สร้าง proxy หรือเผยแพร่ข้อมูลจาก provider

GitHub Pages ไม่มี server runtime จึงไม่ควรเก็บ API secret ใน frontend หรือ `VITE_*`. เมื่อเลือก provider และมีสิทธิ์แสดงผลแล้ว ให้ตั้ง `VITE_FINNTECH_ECONOMIC_PROXY_URL` เป็น URL สาธารณะของ backend ที่โครงการควบคุม Backend ควรเก็บ key ใน environment secret, cache/rate limit provider, ตรวจสิทธิ์ redisplay และส่ง JSON ตามสัญญานี้:

```json
{
  "status": "LIVE",
  "source": "provider name",
  "updatedAt": "2026-09-26T10:00:00.000Z",
  "items": []
}
```

`GET {baseUrl}/calendar` ส่ง event ที่มี `title`, `date`, `currency` และค่า forecast/previous/actual ตามที่ provider มี; `GET {baseUrl}/news` ส่ง `title`, `source`, `publishedAt` และ URL ต้นทางแบบ HTTPS/HTTP. แอปจะปฏิเสธสถานะที่ขาด source/timestamp หรือข้อมูลที่เก่าเกินเกณฑ์. TradingView calendar เป็น widget ภายนอกแยกต่างหาก ไม่ใช่ API ข่าวที่ FINNTECH ควบคุม

## เริ่มเว็บ legacy

```bash
npm install
npm run dev
```

## ตรวจโค้ด

```bash
npm test
npm run build
```

## PWA และ GitHub Pages

manifest ใช้ `start_url` และ `scope` เป็น `/FINNTECH/` สำหรับ GitHub Pages project path

## เทคโนโลยี

React 18, Vite, Tailwind CSS, Vitest, Testing Library, Lightweight Charts และ Recharts

## FINNTECH tracker workspace (F1.2)

โครงสร้างใหม่อยู่ใน `apps/web`, `apps/api`, `packages/contracts` และ `packages/finance` แยกจากแอปเดิมใน `src/` แอปเดิมยังใช้คำสั่งเดิมด้านบนได้ และยังไม่มีการย้าย localStorage หรือบัญชีเดิม

### เริ่มและหยุด local web/API

```bash
npm install
npm run tracker:dev
```

- Web dev: `http://127.0.0.1:4173`
- API health: `http://127.0.0.1:4174/api/health`
- Vite proxy ส่ง `/api/*` ไป API ทำให้ browser เรียกผ่าน origin เดียวกับ Web
- `TRACKER_API_PORT` ค่าเริ่มต้นคือ `4174`; กำหนดใน `apps/api/.env` หรือ environment ก่อนเริ่มเพื่อเปลี่ยนพอร์ต API และ Vite proxy พร้อมกัน เช่น PowerShell: `$env:TRACKER_API_PORT='4184'; npm run tracker:dev` แล้วตรวจ API ที่ `http://127.0.0.1:4184/api/health` และ proxy ที่ `http://127.0.0.1:4173/api/health`
- runner อ่านจาก `apps/api/.env` เฉพาะค่าที่ใช้ตรวจ routing (`TRACKER_API_PORT`, `TRACKER_HOST`, และ `PORT`) โดย Vite รับเฉพาะ environment พื้นฐานของระบบกับ `TRACKER_API_PORT`; ค่า server อื่นโหลดให้ API เท่านั้นและไม่ถูกส่งเข้า frontend process/bundle ตัวแปร `PORT` ไม่รองรับและถูกปฏิเสธก่อนเริ่ม ให้ใช้ `TRACKER_API_PORT`; workspace นี้บังคับ `TRACKER_HOST=127.0.0.1`
- กด `Ctrl+C` หรือพิมพ์ `q` แล้วกด Enter เพื่อหยุดทั้ง web และ API
- ใช้ Node.js ตาม prerequisites ด้านบน; รอบช่วง 1 ใช้ 24.18.0
- API ที่ไม่ตั้ง Auth/DB เปิดได้เฉพาะ skeleton; tracker ที่บันทึกได้ต้องตั้ง server environment และ PostgreSQL ตามคู่มือด้านบน
- ปัจจุบันมี Prisma schema/migrations และ PostgreSQL persistence แล้ว; F1.2 เป็นประวัติระยะ skeleton

API health ตรวจ process และ connection ของ database เมื่อ configured; Auth ระบุ `not_checked`
เพราะไม่ได้ทดสอบ login ใน health request เมื่อไม่ตั้ง DB/Auth จะแสดง `not_configured`
ไม่ควรตีความ HTTP 200 เป็น readiness ของทุกฟังก์ชัน

Typecheck และ Vite dev alias ใช้ source mapping จึงไม่ต้องมี shared package `dist/` อยู่ก่อน; `npm run tracker:dev` และคำสั่ง dev แยกจะ build contracts/finance ก่อนเปิด API/Web. Production build สร้าง shared packages ก่อน API/Web และ production ใช้ JavaScript ที่ compile แล้ว ไม่ใช้ `tsx` หรือ Node TypeScript stripping. ตัวอย่างตัวแปร API อยู่ใน `apps/api/.env.example` (placeholder เท่านั้น). การเสิร์ฟแบบ same-origin หลัง build ใช้ `WEB_DIST_DIR=../web/dist` กับคำสั่ง API ใน workspace

### Local PostgreSQL (ข้อมูลสังเคราะห์เท่านั้น)

ต้องมี Docker Desktop/Docker Compose ก่อนจึงใช้คำสั่งนี้ได้:

```bash
docker compose up -d tracker-postgres
docker compose ps
docker compose down
```

compose ตัวอย่างดั้งเดิม bind `127.0.0.1:5433` และใช้ named volume `finntech_tracker_pgdata`; local Auth guide ปัจจุบันใช้ compose.auth.local.yaml แยกชุด ไม่ใช้ฐานนี้แทนโดยเดา

ถ้าเครื่องไม่มี Docker ให้ติดตั้ง/เปิด Docker Desktop โดยเจ้าของเครื่องเอง แล้วรันคำสั่งด้านบน; งานนี้ไม่ติดตั้ง Docker และยังไม่ได้ทดสอบฐานข้อมูลในเครื่องนี้

### ตรวจ workspace ใหม่

```bash
npm run tracker:typecheck
npm run tracker:test
npm run tracker:web-smoke
npm run tracker:build
npm run tracker:build:shared
node --no-experimental-strip-types scripts/tracker-package-smoke.mjs
```

`tracker:build` และ `tracker:build:shared` build ตาม dependency order: Finance, Contracts, API, Web. Contracts ใช้ decimal validation จาก Finance จึงไม่มีวงจร dependency. `tracker:typecheck` และ `tracker:test` เตรียม shared build ตามลำดับเดียวกันเพื่อทำงานได้แม้ยังไม่มี `dist/`; root `npm test` ใช้ `pretest` สร้าง shared build ก่อน repo-wide Vitest. Compiled package smoke import packages จาก `dist/index.js` โดยปิด Node type stripping และตรวจ schema/Decimal runtime; ทุก workspace ที่มี tests ใช้ `vitest run` ซึ่งล้มเหลวเมื่อ suite หาย

### Decimal foundation และ shared contracts (F1.3)

Finance values เป็น immutable facade ที่ไม่มี prototype; raw Decimal และ constructor อยู่ใน private WeakMap และไม่มี `constructor`, `set`, `config`, `clone`, `toNumber` หรือ raw fields ให้เข้าถึง ผ่าน facade เปลี่ยน precision/rounding ไม่ได้

Operations ที่รองรับ: `plus/add`, `minus/sub`, `times/mul/multipliedBy`, `div/dividedBy`, `abs`, `isZero`, `isFinite`; comparisons `greaterThan/gt`, `greaterThanOrEqualTo/gte`, `lessThan/lt`, `lessThanOrEqualTo/lte`, `equals/eq`; `toString/toJSON` คืน canonical decimal strings. Financial operands รับเฉพาะ Finance values ที่ package สร้าง หรือ strings ตามกฎ `parseCryptoDecimal` (scale ≤18, integer digits ≤20, ไม่มี exponent/whitespace/negative zero); THB input ต้องผ่าน `parseThbDecimal` (scale ≤2) ก่อน arithmetic. ไม่รับ JS numbers, foreign Decimal/clone หรือ facade ที่ปลอมขึ้น ทุก alias ตรวจ operand ก่อนคำนวณ

ผล arithmetic ใช้ precision ภายใน 80 โดยไม่ quantize ระหว่างทาง; `serializeThb`/`serializeCrypto` quantize ด้วย half-even และตรวจ range ก่อนจัดเก็บ. `toString/toJSON` ไม่ quantize ผลระหว่างทาง. ไม่มี numeric options ใน public arithmetic API; จำนวนตำแหน่งทศนิยมเป็น option ภายใน quantizer ตามสกุลเงิน ไม่ใช่ financial operand. ผล non-finite เช่นหารด้วยศูนย์ถูกปฏิเสธทันที

Finance ใช้ `decimal.js` clone ที่แยก config จากผู้ใช้ Decimal อื่น: precision 80 และ `ROUND_HALF_EVEN`. THB ใช้ขอบเขต `NUMERIC(20,2)`; ปริมาณ ราคา ยอด และ fee ของคริปโตใช้ `NUMERIC(38,18)`. Validation รับเฉพาะ plain decimal strings ที่ไม่มี whitespace, exponent, เครื่องหมายบวก หรือ leading zero; scale และ range เกินกำหนดถูกปฏิเสธก่อนบันทึก และผลคำนวณตรวจ range ซ้ำหลัง quantize เพื่อจับ rounding carry

การ serialize ใช้ fixed-point canonical strings โดยไม่ใช้ exponent, ตัดศูนย์ท้ายส่วนทศนิยมและไม่เติมเครื่องหมายบวก; zero แสดงเป็น `0`. Input negative zero ถูกปฏิเสธ ส่วนผลคำนวณที่ quantize แล้วเป็น negative zero serialize เป็น `0`. Zod contracts สำหรับ finance transaction และ crypto trade เรียก parser จาก Finance โดยตรงเพื่อไม่มีกฎ scale/range ซ้ำกัน: transaction ใช้ THB, trade ใช้ USDT, amount/quantity/price ต้องมากกว่าศูนย์ และ fee ต้องไม่น้อยกว่าศูนย์

F1.3 ยังไม่เพิ่ม cost-basis/replay engine, database/Prisma/migration, Auth, importer, market relay หรือฟอร์มใช้งานจริง; ไม่มี execution, wallet, starter credit, ฝาก/ถอน หรือ QR

### PostgreSQL persistence foundation (F1.4 ส่วนแรก)

Schema/migrations และ Decimal persistence helpers อยู่ฝั่ง API ใช้ Prisma 7.10.0; API ต้องใช้ Node 22.12 หรือ 24 และ generate client ก่อน build/typecheck/test ผ่าน package hooks. Auth/read authorization, cost-basis/replay, importer และ write endpoints ยังไม่เปิด `/api/health` ยังตรวจ process และไม่อ้าง database/Auth readiness

ตรวจ schema โดยไม่เชื่อม database: `npm run tracker:db:validate` และ `npm run tracker:db:generate`. Integration ใช้ฐานข้อมูลสังเคราะห์ใหม่ port 5434 และ volume ใหม่ผ่าน `compose.test.yaml`; runner ต้องพบ empty DB และ target ที่ตรงเงื่อนไขก่อน apply migrations ไม่ใช้ฐานข้อมูลเดิม

ดู decision, constraints, transaction/lock strategy และขั้นตอนเริ่ม/หยุด/รัน `npm run tracker:db:test` ใน [F1.4 persistence decision](docs/decisions/004-postgresql-persistence.md). รอบพัฒนานี้ไม่พบ Docker/PostgreSQL จึงยัง NOT TESTED สำหรับ DB runtime; unit boundary tests ไม่ทดแทน PostgreSQL integration proof

`tracker:test` รวม dev-server regression smoke ที่รัน Vite ด้วย `--force` บน `127.0.0.1:4175` เพื่อบังคับ cold dependency optimization แล้วตรวจว่า `main.tsx` โหลด `react-dom/client` จาก optimized dependency cache และ response เป็น ESM ที่ไม่มี CommonJS รูปแบบซึ่งเคยทำให้ browser พัง หากพอร์ตนี้มีผู้ใช้งานอยู่ smoke จะหยุดและไม่แย่งพอร์ต; `npm run tracker:web-smoke` ใช้รัน check นี้แยกได้

Production-style same-origin preview หลัง build ใช้ API server เสิร์ฟ `apps/web/dist` เมื่อกำหนด `WEB_DIST_DIR=../web/dist` ใน environment ของ API; unknown API paths คืน JSON 404, ไฟล์ asset ที่ไม่มีคืน 404 และ route หน้าเว็บใช้ SPA fallback. รายละเอียด Auth, database, Binance relay และ business logic ยังไม่พร้อมใน F1.2

### Auth และ authorization foundation (2026-10-04)

เพิ่ม Better Auth 1.7.7 แบบ database session และ HttpOnly cookie ฝั่ง API. Protected `GET /api/me` คืนเฉพาะ owner จาก server session; ไม่รับ owner override จาก client. ไม่มีฟอร์ม login หรือ finance write endpoints ในรอบนี้. อ่านขอบเขตและ production gates ใน [Auth decision](docs/decisions/005-auth-authorization.md).

หากต้องเปิด Auth ใน local API ให้ตั้ง `DATABASE_URL`, `BETTER_AUTH_SECRET` และ `TRACKER_ORIGIN=http://127.0.0.1:4173` ใน `apps/api/.env` ฝั่ง server พร้อมกันด้วยค่าจริงในเครื่องสำหรับ **ฐานข้อมูลสังเคราะห์ที่ apply migration แล้วเท่านั้น**. ห้ามใช้ VITE_* หรือส่งไฟล์ env ให้ reviewer. ถ้าไม่ตั้ง Auth env skeleton เดิมยังรันได้; production ต้อง HTTPS. เริ่ม/หยุด Web/API ด้วย `npm run tracker:dev` และ `q`/Ctrl+C ตามคู่มือเดิม.

PostgreSQL Auth acceptance ใช้ compose.auth.test.yaml และ .env.auth.test แยกจากหลักฐาน F1.4: loopback5435, volume ใหม่, no-reset runner. คำสั่ง: `npm run tracker:auth:test` (ต้อง empty DB), `npm run tracker:auth:smoke` (หลัง tracker build; compiled server4194 และหยุดอัตโนมัติ). เริ่ม DB ด้วย `docker compose --env-file .env.auth.test -f compose.auth.test.yaml up -d --wait` และหยุดเฉพาะ test service ด้วย `docker compose --env-file .env.auth.test -f compose.auth.test.yaml stop postgres-auth-test`; เก็บ volume ไม่ลบ. ขั้นตอนเต็มอยู่ใน decision.

F1.4 runtime ได้ตรวจ PostgreSQL16.15 จริงเมื่อ2026-10-04 แล้ว: 12 tests ผ่าน. ข้อความ NOT TESTED ในรายงานรอบพัฒนาด้านบนเป็นผลก่อน Docker พร้อม; ไม่ถือเป็นสถานะ runtime ล่าสุด. Auth health ใช้ not_checked เพื่อไม่อ้าง readiness จาก config และหน้าเว็บยังเป็น skeletonจนกว่างาน UI จะได้รับอนุญาต.

### หน้าสมัครบัญชี/เข้าสู่ระบบที่ลองใช้ได้ (Auth UI)

เปิด **http://127.0.0.1:4173/** แล้วเลือกสมัครบัญชี หรือเข้าสู่ระบบ. รองรับมือถือ, refreshคง session และ logout. ใช้เฉพาะบัญชี/ข้อมูลสังเคราะห์ในเครื่อง; รหัสผ่านทดสอบใหม่12–128ตัวอักษร ไม่ใช้ credential DEMO. หลัง login มีหน้ารายรับรายจ่าย THB งบประมาณรายเดือน และพอร์ต USDT ตามหัวข้อด้านล่าง ไม่มีเครดิตหรือข้อมูล DEMO เติมให้อัตโนมัติ.

Local environment แยกจากหลักฐานเดิม: compose.auth.local.yaml, ignored .env.auth.local และ apps/api/.env, DB loopback5436/volume finntech-auth-local_finntech_auth_local_pgdata. เริ่มฐานข้อมูลด้วย `docker compose --env-file .env.auth.local -f compose.auth.local.yaml up -d --wait` แล้ว `npm run tracker:dev`. `npm run tracker:auth:local:prepare` ใช้ครั้งแรกกับ empty DBเท่านั้น; guardจะปฏิเสธฐานข้อมูลไม่ว่างโดยไม่ reset. หยุด Web/API ด้วย q/Ctrl+C และหยุด DB ด้วย `docker compose --env-file .env.auth.local -f compose.auth.local.yaml stop postgres-auth-local`; รักษาvolume.

ดู environment setup, safe errors, acceptance และขอบเขตที่ยังไม่พร้อมใน [Auth UI decision](docs/decisions/006-auth-ui.md). Server envไม่ถูกส่งไป frontend; browserใช้relative same-origin APIและHttpOnly cookie ไม่มีlocalStorage token. หน้าAuthใช้ระบบจริงในเครื่อง ไม่ใช่หน้าloginจำลอง; email verification/resetและproduction gatesยังไม่พร้อม.

### Local tracker ที่บันทึกข้อมูลได้

1. เริ่ม DB ด้วย `docker compose --env-file .env.auth.local -f compose.auth.local.yaml up -d --wait` และ `npm run tracker:dev` จาก root; เปิด **http://127.0.0.1:4173/**. APIอยู่ loopback4174, Vite proxyส่ง `/api` และ `/ws/market` ไป API portเดียวกัน; overrideใช้ `TRACKER_API_PORT` ตามคู่มือเดิม.
2. สมัครบัญชีสังเคราะห์ใหม่หรือเข้าสู่บัญชีทดสอบของคุณ สร้างหมวดหมู่รายรับ/รายจ่ายแล้วบันทึกจำนวนเงินเป็นข้อความทศนิยม THB ≤2ตำแหน่ง เลือกเดือนเพื่อดูสรุป. เปลี่ยนชื่อหมวดหมู่ได้โดยไม่เปลี่ยน typeของประวัติ.
3. แท็บงบประมาณเลือกหมวดรายจ่ายและกำหนดงบของเดือนที่ดู การปรับงบเดิมไม่สร้างรายจ่าย. ใช้ Decimalคำนวณใช้ไป/เหลือ/เกินงบ.
4. แท็บพอร์ตสร้างพอร์ตUSDTแยก เลือกพอร์ตแล้วบันทึกประวัติซื้อ/ขาย จำนวน/ราคา/fee ≤18ตำแหน่ง; feeเป็นUSDT. ต้นทุนเฉลี่ยรวมfeeซื้อ กำไรรับรู้หักfeeขาย ขายเกินจำนวนหรือประวัติย้อนหลังที่ทำให้ขายเกินถูกปฏิเสธทั้ง transaction. ประวัติวันเดียวเรียงตามลำดับบันทึกที่serverกำหนด.
5. ราคาBTC/ETHมาจาก Binance publicผ่านbackendเท่านั้น หลังยืนยันmetadataจริง. Backendแชร์cacheREST มีtimeout/backoff และส่งราคาให้browserผ่านsame-origin WebSocketพร้อมHTTP fallback. เกิน30วินาทีเป็นSTALE; หากไม่พร้อม P&L/มูลค่า/สัดส่วนที่ต้องใช้ราคาเป็นN/A. ไม่รวมยอดUSDTกับTHB.
6. หากผลการบันทึกไม่ทราบเพราะtimeout ฟอร์มถูกล็อกและปุ่มลองส่งคำขอเดิมใช้body/keyเดิม ไม่มีการอ้างว่าrollbackจากtimeout. Receiptอยู่DBในscope owner+endpoint+key จึงไม่ผูกกับsession. เมื่อออกจากหน้า/ปิดbrowserขณะที่ผลยังไม่ทราบ ให้ตรวจประวัติก่อนสร้างคำขอใหม่ (v1เก็บpendingเฉพาะหน่วยความจำ ไม่ใช้localStorage).

หยุด Web/API ด้วย `q` หรือCtrl+Cในterminalที่เริ่มไว้; หยุดเฉพาะlocal DBด้วย `docker compose --env-file .env.auth.local -f compose.auth.local.yaml stop postgres-auth-local`. เก็บvolumeและข้อมูลเดิม ไม่ใช้down -v/reset. บัญชีใหม่เริ่มจากรายการว่าง ไม่มีstarter credit.

การตรวจรับ PostgreSQLของtrackerแยกอีกชุด: `compose.tracker.test.yaml`, ignored `.env.tracker.acceptance`, loopback5437, DB `finntech_tracker_acceptance`, role `tracker_acceptance`, volumeเฉพาะproject. รายละเอียดenvสังเคราะห์และguardฐานข้อมูลว่างใน [Local tracker decision](docs/decisions/007-local-tracker-ledger.md). หลังbuildรัน `node --no-strip-types --env-file=.env.tracker.acceptance scripts/tracker-acceptance.mjs`. ห้ามรันกับDBผู้ใช้จริงหรือresetฐานข้อมูลไม่ว่าง; เก็บหลักฐานแล้วstopเฉพาะtest service.

เวอร์ชันนี้มี FX อ้างอิง direct USDT_THB สำหรับ assets เทียบบาทตาม decision011 แต่ยังไม่เปิด legacy importer, execution หรือ production. การแก้/ยกเลิกประวัติใช้วิธีเก็บต้นฉบับตามหัวข้อด้านล่าง ไม่ลบข้อมูลจริง. ข้อมูลเดิมไม่มีการย้ายอัตโนมัติ; Auth HTTPS/email verification/reset, retention/deletion และproduction security gatesยังต้องตรวจตามdecision. เพิ่มเฉพาะAPI dependencyโดยตรง `ws@8.21.3` กับtypes `@types/ws@8.18.1`; ไม่เปลี่ยนเวอร์ชันdependenciesเดิม.
# ราคาหุ้นสหรัฐสำหรับใช้ส่วนตัว (Alpaca Basic / IEX)

หน้า tracker หลังเข้าสู่ระบบมีแท็บ **ราคาหุ้นสหรัฐ** แยกจากพอร์ตคริปโต
รายชื่อเริ่มต้นมีหุ้น/ETF 30 ตัว ซึ่งเป็นเพียง watchlist ไม่ใช่หลักฐานว่าผู้ใช้ถือสินทรัพย์นั้น:
`AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AVGO, AMD, INTC, QCOM, ORCL, CRM, ADBE, NFLX, JPM, BAC, V, MA, WMT, COST, KO, PEP, XOM, CVX, JNJ, PG, UNH, SPY, QQQ`.

ระบบไม่สมัครบัญชีให้ ไม่เชื่อม Trading API และไม่เพิ่มรายการหุ้นลง ledger คริปโต
ราคาเป็น USD ไม่ใช่ USDT และไม่แปลง/รวมเป็น THB; ยังไม่มีต้นทุนหรือ P&L หุ้น
ไม่มี key จะแสดง `NOT_CONFIGURED` และ N/A โดยไม่แต่งราคาหรืออ้างว่าเชื่อมต่อแล้ว

เจ้าของที่ต้องการใช้จริงต้องรับ free keys ด้วยตนเอง แล้วเพิ่มตัวแปรต่อไปนี้ใน
`apps/api/.env` ที่ถูก gitignore (ห้ามทับค่า Auth/DB เดิมและห้ามส่ง key ในแชต):

- `ALPACA_API_KEY_ID`: key ของเจ้าของ ใช้เฉพาะ server
- `ALPACA_API_SECRET_KEY`: secret ของเจ้าของ ใช้เฉพาะ server
- `ALPACA_OWNER_ID`: owner UUID ของบัญชี tracker เจ้าของ key จาก `/api/me` หลัง login
- `ALPACA_PERSONAL_USE=confirmed`: ยืนยันใช้ส่วนตัว โดยไม่แจกข้อมูลให้บัญชีอื่น
- `ALPACA_SYMBOLS`: optional CSV ของ ASCII symbols 1–30 ตัว เช่น `AAPL,MSFT,SPY`; ไม่ตั้งจะใช้รายชื่อเริ่มต้น 30 ตัว

ต้องตั้ง key/secret/owner/personal-use ให้ครบพร้อมกัน; ถ้าตั้งไม่ครบ/มี placeholder
API จะปฏิเสธ configuration ก่อนเปิด listener โดยไม่พิมพ์ค่า
ตัวแปรเหล่านี้ห้ามอยู่ใน `VITE_*` และไม่ถูกส่งเข้า web child process

เริ่มหลังตั้งค่าด้วย `npm run tracker:dev`; เปิด `http://127.0.0.1:4173/`
แล้วเข้าสู่ระบบบัญชี owner ที่ตั้งไว้ หยุดด้วย Ctrl+C หรือพิมพ์ `q`
เปลี่ยน env แล้วต้องเริ่ม API ใหม่ เส้นทางอ่านอย่างเดียวคือ `/api/stocks/market`
และ `/ws/stocks`; ทั้งสองใช้ Auth เดิมและจำกัดข้อมูลเฉพาะ owner ที่ตั้งค่า
บัญชีอื่นไม่ได้ใช้ key นี้ร่วมกัน ไม่มีฟอร์มรับ secret บนเว็บ

Backend ใช้ **IEX เท่านั้น**: upstream WebSocket รับ last trade ต่อเนื่อง,
REST latest-trades seed/reconcile ไม่เกินหนึ่งครั้ง/นาที และ WebSocket ของเรา
ส่ง snapshot เข้า browser ทุก 5 วินาที มี same-origin HTTP fallback ทุก 15 วินาที
จึงมีความหน่วงจากการส่งเข้า UI; ไม่อ้างว่าเป็น full-market SIP หรือทุก tick ถึง browser ทันที
เวลา trade จาก provider เป็นฐานของ stale threshold 30 วินาที ไม่ใช่เวลาที่เรารับ response
วันหยุด/ตลาดปิด/หุ้นไม่ค่อยซื้อขายจึงอาจเป็นราคาเก่า แม้ connection ยังทำงานอยู่
ไม่มีการสรุปว่า “ตลาดปิด” โดยไม่ทราบ calendar/status จริง
เมื่อหลุดจะ backoff สูงสุด 60 วินาที; ไม่เปิด upstream ซ้ำหลาย connection
และปิด upstream เมื่อไม่มีการอ่าน snapshot เกิน 60 วินาที

Provider ส่ง price เป็น JSON number: adapter อ่าน raw JSON numeric token เป็น string
ก่อนตรวจด้วย Finance (NUMERIC(38,18) boundary) จึงไม่ผ่าน JS Number/parseFloat
และไม่เสีย precision; serialization ไปเว็บเป็น decimal strings เท่านั้น
ไม่มี dependency ใหม่และไม่มี migration/schema ใหม่

ตรวจด้วย `npm run tracker:typecheck`, `npm run tracker:test`, `npm run tracker:build`
และ `node --no-strip-types scripts/tracker-package-smoke.mjs`.
Tests ของ Alpaca ใช้ข้อมูลสังเคราะห์และ local sockets ไม่ใช่หลักฐานว่า free key จริงใช้ได้
ต้องตรวจ live-provider authentication, symbol coverage และสิทธิ์ใช้จริงหลังเจ้าของตั้ง key
ก่อนเปิดให้คนอื่นใช้ต้องได้สิทธิ์เผยแพร่ข้อมูลที่เหมาะสม แพ็กเกจส่วนตัวไม่ถือเป็นสิทธิ์แจกต่อ

อ้างอิง: [Basic plan](https://docs.alpaca.markets/us/docs/about-market-data-api),
[IEX stream](https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data),
[redistribution](https://alpaca.markets/support/redistribute-alpaca-api).

## แก้ไขและยกเลิกรายการที่บันทึกผิด

หน้า **รายรับรายจ่าย** มีปุ่ม “แก้ไขรายการ” และ “ยกเลิกรายการ” ในประวัติ
หน้า **พอร์ตคริปโต** มีปุ่ม “แก้ไขประวัติ” และ “ยกเลิกประวัติ” หลังเลือกพอร์ต
ต้องระบุเหตุผล; การยกเลิกมีขั้นยืนยันและย้อนกลับได้ก่อนส่งคำขอ
รายการเดิมเก็บไว้พร้อมเหตุผล ไม่รวมในยอด/งบ/ต้นทุน การแก้ไขสร้างรายการทดแทน
คริปโตคำนวณประวัติใหม่ใน transaction เดียว หากขายเกินจำนวนจะปฏิเสธทั้งคำขอ
แก้คริปโตได้เฉพาะชนิดซื้อ/ขาย จำนวน ราคา fee และวันที่ ในพอร์ต/สินทรัพย์เดิม
รายการที่ถูกแก้พร้อมกันจากอีกหน้าให้โหลดข้อมูลล่าสุด; timeout ให้ retry key เดิม

ต้อง apply forward migration ใหม่ก่อนเปิด API รุ่นนี้ โดยใช้ `prisma migrate deploy`
กับฐานข้อมูล local **สังเคราะห์ที่ตรวจ target แล้วเท่านั้น** ห้าม reset หรือรัน
`tracker:auth:local:prepare` ซ้ำกับฐานข้อมูลไม่ว่าง รายละเอียดและคำสั่งตรวจรับ
อยู่ใน [History corrections decision](docs/decisions/008-history-corrections.md)
ไม่มีการเปลี่ยน dependency หรือ migration ที่เคย apply และยังไม่เปิด hard delete
# สำรองและกู้คืนข้อมูล tracker

เริ่มด้วย `npm run tracker:dev` แล้วเปิด `http://127.0.0.1:4173/`
หลังเข้าสู่ระบบเลือก **สำรองข้อมูล → ดาวน์โหลดไฟล์สำรอง** แล้วตรวจ Downloads.
ไฟล์ JSON มีรายการการเงิน/บันทึกช่วยจำของคุณ เก็บในที่ส่วนตัว; ไฟล์ไม่ได้เข้ารหัส.
รวมหมวดหมู่ รายรับรายจ่าย THB ทุกเดือน งบประมาณ พอร์ต/ประวัติคริปโต USDT
และรายการยกเลิก สูงสุดรวม 2,000 แถว / 2 MiB โดยไม่ตัดข้อมูลเงียบ ๆ.
ไม่รวมบัญชีล็อกอิน/รหัสผ่าน/session/server settings, legacy DEMO, ราคาตลาด หรือหุ้น.

เลือกไฟล์ใน **ตรวจไฟล์ก่อนกู้คืน** เพื่อดูจำนวนรายการและยอดก่อนบันทึก.
กู้คืนได้เฉพาะบัญชีที่ยังไม่มีหมวดหมู่/รายการ/งบประมาณ/พอร์ต/ประวัติ/holding
แม้รายการเดิมยกเลิกทั้งหมดก็ยังกู้คืนทับไม่ได้. ไม่มี merge/reset หรือลบต้นฉบับ.
หากบัญชีมีข้อมูล ใช้การสำรอง/preview ได้ แต่ต้องเตรียมบัญชีปลายทางว่างแยก
ก่อนกู้คืน. ตรวจยอดและเลือกช่องยืนยันแล้วจึงกด **ยืนยันกู้คืนข้อมูล**.
หาก timeout ให้กด **ตรวจผลด้วยคำขอเดิม** ไม่ส่งคำขอใหม่;
หากปิด/รีโหลดหน้าให้ตรวจข้อมูลปลายทางก่อน เนื่องจาก pending key อยู่ในหน่วยความจำ.

นี่คือสำเนาข้อมูล tracker ไม่ใช่การสำรอง PostgreSQL ทั้งฐานหรือกู้บัญชีล็อกอิน.
รายละเอียดขอบเขต/transaction/guard/ข้อจำกัดใน
[Backup decision](docs/decisions/009-financial-backup.md).
ทดสอบด้วย `npm run tracker:typecheck`, `npm run tracker:test`,
`npm run tracker:build`, `node --no-strip-types scripts/tracker-package-smoke.mjs`
และ compiled PostgreSQL acceptance บนฐานข้อมูลสังเคราะห์ว่างตาม decision;
ห้าม reset ฐานข้อมูลไม่ว่าง และ stop เฉพาะ test container โดยเก็บ volume.
# Local private-media increment

Receipt-assisted entry and custom avatars are implemented for local review. See [acceptance report](docs/acceptance/media-review-20261009.md) and [private-media setup/rollout notes](docs/operations/private-media.md). Pictures use bounded PostgreSQL storage; financial JSON does not contain pictures. This increment has not been deployed to the real or DEMO service.
