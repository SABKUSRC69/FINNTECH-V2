# ความพร้อม FINNTECH tracker ก่อนใช้งานจริง

วันที่ตรวจ: 2026-10-05; อ้างอิง ADR-002 และ acceptance/migration โดยไม่แก้เอกสาร F1.1

## ข้อสรุปและขอบเขต

ระบบมีหลักฐานรองรับการทดลอง **ในเครื่องด้วยข้อมูลสังเคราะห์** สำหรับรายรับรายจ่าย THB,
งบประมาณ และพอร์ตคริปโต USDT แยกต่อพอร์ต พร้อมราคาสาธารณะ BTC/ETH ผ่าน backend
และการแสดง N/A เมื่อราคาหมดอายุหรือเชื่อมต่อไม่ได้ ยังไม่อนุมัติการเก็บข้อมูลจริงหรือเผยแพร่
ออนไลน์จากผลตรวจนี้

ผู้ใช้ยังไม่ได้เลือกว่าจะใช้เฉพาะเครื่องนี้หรือเตรียมออนไลน์ จึงใช้เกณฑ์ทดลองในเครื่องเป็นหลัก
และแยก gate ออนไลน์ไว้ นี่ไม่ใช่การตัดสินนโยบาย retention หรืออนุญาต deploy

ไม่มี execution, wallet, starter credit, ฝาก/ถอน หรือ QR ไม่มี FX และไม่รวม THB,
USDT หรือ USD เป็นยอดข้ามสกุล ราคาหุ้นเป็น watchlist ไม่ใช่หลักฐานการถือสินทรัพย์
ข้อมูล DEMO และ fixture credentials ห้ามนำมาเป็นบัญชีหรือประวัติลงทุนจริง
UI ยังคงข้อความ “ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน”

## หลักฐานการตรวจรอบนี้

ใช้ Node **24.18.0**, PostgreSQL **16.15**, compiled packages ผ่าน Node
`--no-strip-types`, เว็บหลัก `http://127.0.0.1:4173/` และ database สังเคราะห์ที่มีอยู่
บน loopback 5436 โดย guard ตรวจ target ก่อนใช้ สร้าง session ชั่วคราวสำหรับบัญชี
สังเคราะห์สองบัญชีและ logout เฉพาะ session ของ audit ไม่เปลี่ยน browser session เดิม

หลักฐานอยู่ใน `.readiness-review-20261005.local/` ซึ่งถูก ignore:
`runtime-audit.mjs`, `runtime-results.json`, `data-before.json`, `data-after.json`,
`before.json`, `after.json`, `comparison.json` และรายงาน diff/checks
ผลตามตารางมาจาก HTTP/WebSocket และ PostgreSQL จริง ไม่ใช้ mocks หรือ SQLite
แทนผลเหล่านี้

| การตรวจ | ผล | หลักฐาน/ขอบเขต |
| --- | --- | --- |
| anonymous อ่าน `/api/me`, finance, crypto, market, stocks และ backup ไม่ได้ | PASS | ทั้งหก endpoints คืน JSON 401 |
| cookie ที่ดัดแปลงไม่สร้าง session | PASS | `/api/me` คืน 401 |
| cookie/JSON ของ login | PASS | HttpOnly, host-only, SameSite=Lax; JSON ไม่มี token/password/secret; HTTP loopback ไม่มี Secure โดยตั้งใจ |
| แยกข้อมูล A/B และไม่รับ owner override จาก query | PASS | เปรียบเทียบ categories/transactions/portfolios/trades/holdings กับ owner ใน PostgreSQL |
| wrong/missing Origin สำหรับ Auth และ write route | PASS | คืน 403 ก่อนทำงาน; ใช้ payload ว่างที่สร้างรายการไม่ได้ |
| WS authentication/Origin | PASS | anonymous upgrade 401; session ที่ถูกต้องกับ foreign Origin ได้ 403 |
| export backup รุ่นปัจจุบัน | PASS | ตรวจครบด้วย shared schema; amount/quantity/price/fee เป็น strings; no-store |
| logout และ cookie replay | PASS | logout สอง session ของ audit แล้ว cookie เดิมอ่าน `/api/me` ได้ 401 |
| local env และ frontend build boundary | PASS | env สี่ไฟล์ถูก ignore; ไม่พบค่าลับ server ที่ตั้งอยู่จริงใน HTML/JS/CSS; ไม่ใช่ universal secret scanner |
| configuration Auth สำหรับ production ปฏิเสธ HTTP | PASS | เรียก compiled configuration; ไม่ใช่หลักฐาน HTTPS runtime |
| compiled static preview | PASS | HTML/JS/CSS 200 และ MIME ถูกต้อง; missing asset 404; unknown API JSON 404; ปิด preview หลังตรวจ |
| financial/audit/idempotency records | PASS | จำนวนและ SHA-256 ตรงกันก่อน/หลังทั้งแปดตาราง; session metadata ไม่อยู่ในการเทียบนี้ |
| stock provider runtime | NOT TESTED | API จริงเป็น NOT_CONFIGURED; 30 symbols มีราคา null/UNAVAILABLE โดยไม่สร้างราคาจำลอง |
| dependency vulnerability audit | NOT TESTED | automatic approval review ปฏิเสธ npm audit เพราะยังไม่อนุญาตส่ง dependency names/versions ไป npm registry |
| HTTPS/reverse proxy และ Node 22.12 ขั้นต่ำ | NOT TESTED | ยังไม่ทดสอบ environment เหล่านี้ |

Typecheck, tracker tests/build, compiled package และ cold optimizer smoke ใช้ผลรอบก่อน
จาก `.market-fix-20261005.local/review-report.md` เพราะรอบนี้ไม่แก้ source/dependencies
ไม่รายงานว่าได้รันซ้ำ Root `npm test` รอบก่อนมี 230 ผ่านและสอง failures เดิม:
`src/__tests__/allComponents.test.jsx` และ `src/__tests__/spotTrading.integration.test.jsx`
ไม่มีการแก้ expectation, skip หรือแก้ `src/` เพื่อกลบผล

การตรวจ browser ราคา stale/outage/recovery อยู่ใน
`.market-browser-20261005.local/review-report.md`: ใช้ production frontend build และ
ราคาจริงใน test origin แยก, ไม่เปลี่ยนนาฬิกาหรือปิดอินเทอร์เน็ตเครื่อง; คืน N/A และฟื้น
การคำนวณเองโดยไม่ reload Test server ถูกปิดและพอร์ตคืนแล้ว การตรวจนั้นไม่แยก
browser WS-only recovery ออกจาก HTTP polling fallback

## สิ่งที่ต้องทำก่อนใช้ข้อมูลจริงในเครื่อง

| Gate | สถานะ | งานที่ต้องตัดสินหรือทำ |
| --- | --- | --- |
| แยก fixture จากพื้นที่จริง | OPEN | เจ้าของเตรียมบัญชีและ database/volume ใหม่แยก; รักษาหลักฐานเดิม ไม่ reset หรือใช้ DEMO credential |
| สำรองข้อมูลเมื่อเครื่อง/ฐานข้อมูลเสีย | PARTIAL / runtime NOT TESTED | R03 เตรียม guarded encrypted rehearsal และ isolated restore แล้ว แต่ engine ไม่ตอบ; ต้องตรวจ PostgreSQL จริงและตัดสิน off-device storage/schedule/retention ตาม operations/postgresql-backup-recovery.md |
| recovery ของบัญชี | OPEN | กำหนดการกู้คืนเมื่อจำรหัสผ่านไม่ได้; ยังไม่มี email verification/reset-password หรือ mail delivery ตาม Auth decision |
| retention/deletion | OPEN | ต้องตัดสินระยะเวลา, actor, audit, การจัดการ backup และขั้นตอนลบก่อน production; v1 ไม่ล้าง legacy archive อัตโนมัติ |
| dependency advisories | OPEN | ขออนุญาตส่งรายชื่อและเวอร์ชัน dependencies ไป `https://registry.npmjs.org`; ตรวจและทบทวนผลก่อนเปลี่ยนแพ็กเกจ |
| scope ราคาหุ้น | OPTIONAL สำหรับรุ่น finance/crypto | หากจะเปิดหุ้นต้องมี owner-bound server key และ actual provider acceptance ก่อนแสดงว่าพร้อม |

JSON backup ใน UI เป็นสำเนาข้อมูล tracker สูงสุด 2 MiB/2,000 records รวมประวัติยกเลิก
ไม่ใช่ full database backup และไม่รวม Auth credentials/session, server config, legacy,
ราคาตลาด หรือหุ้น ไฟล์ JSON ไม่ได้เข้ารหัสโดยระบบ จึงต้องเก็บในพื้นที่ส่วนตัวที่ป้องกัน
การเข้าถึงได้ การ restore รับเฉพาะบัญชีที่ยังไม่มีข้อมูลการเงินและต้องมี preview/consent
ไม่มี merge หรือ overwrite ดู `docs/decisions/009-financial-backup.md:10`, `:41`, `:116`
รอบนี้ตรวจ export อย่างเดียว ไม่ทำ restore ลงบัญชีที่มีข้อมูลเพื่อสร้างหลักฐานใหม่

## ราคาหุ้น: owner ต้องตั้งค่าเองในเครื่อง

พบจาก `apps/api/src/tracker/stocks.ts:15` และ API จริงว่ายังไม่ได้ตั้งค่า provider
จึงยืนยันราคาสดหรือสิทธิ์ feed ไม่ได้ การตั้งค่าต้องอยู่ใน `apps/api/.env` ฝั่ง server:
`ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `ALPACA_OWNER_ID`,
`ALPACA_PERSONAL_USE=confirmed` และ optional `ALPACA_SYMBOLS` (1–30 symbols)

เจ้าของตรวจสิทธิ์ข้อมูลและเงื่อนไขการใช้ส่วนตัวก่อนกรอกค่าที่ได้รับในเครื่อง
ใช้ owner ID ของบัญชีที่ authenticated จริงจาก `/api/me` ไม่เดาหรือรับ owner จากชื่อ
แสดงผล ไม่คัดลอก key/secret มาแชต ไม่ใช้ VITE_* และไม่รวม env ใน backup ที่ส่งตรวจ
รอบนี้ไม่สมัครบริการ รับ key เปลี่ยน env หรือ restart server เพื่อเปิด provider ให้

หลังเจ้าของตั้งค่าจึงตรวจ actual IEX authentication/subscription, quote timestamp,
stale/outage/reconnect และ owner access เทียบผู้ใช้สองบัญชีโดยไม่สร้าง order ใด ๆ
STREAMING หมายถึงเชื่อม feed สำเร็จ ไม่รับประกันว่าจะมี trade ใหม่ตลอดเวลา
ข้อจำกัด 30 symbols คือ guard ของระบบปัจจุบัน ไม่ใช่คำยืนยันโควตาหรือราคา provider ล่าสุด
ยังไม่เพิ่มหุ้นเป็น holding/cost-basis หรือ FX ใน ledger

## Gate เพิ่มเติมก่อนเปิดออนไลน์

| Gate | สถานะ | หลักฐาน/งานถัดไป |
| --- | --- | --- |
| HTTPS/Secure cookie/reverse proxy | NOT TESTED | ต้องตรวจบน target จริง; ห้ามเปิด HTTP แบบ public หรือปิด Origin/CSRF checks เพื่อให้ผ่าน |
| HTTP security headers | PASS ใน compiled local preview | เพิ่ม CSP, nosniff, frame protection และ Referrer-Policy แล้ว; หลักฐานรอบถัดไปด้านล่าง ไม่ใช่ผลตรวจ HTTPS/reverse proxy จริง |
| rate limit/IP trust | OPEN | Better Auth ใช้ memory rate limit; ยังไม่พิสูจน์ multi-process/distributed behavior หรือ reverse-proxy IP trust |
| recovery/retention/backups/secret rotation | OPEN | ต้องมีนโยบายและ runbook ที่ทดสอบได้; ห้ามใช้ JSON export แทน DB/session recovery ทั้งระบบ |
| release/rollback/monitoring | OPEN | กำหนด target, ownership, health/readiness, migration review, rollback ที่รักษาข้อมูล และ alert; ยังไม่ deploy |

หลักฐาน source ปัจจุบัน: `apps/api/src/app.ts:40` เพิ่ม defensive headers และ `:47`
เพิ่ม CSP เมื่อเสิร์ฟเว็บ build; `apps/api/src/auth/config.ts:22` บังคับ HTTPS นอก local;
`apps/api/src/auth/runtime.ts:20`, `:24`, `:29` กำหนด session/cookies และ memory rate limit;
`scripts/tracker-dev.mjs:65` ส่ง env whitelist ให้ web; `apps/api/src/auth/authorization.ts:35`
กำหนด owner จาก server session

## รอบแก้ HTTP security headers: 2026-10-05

เพิ่ม `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` และ
`Referrer-Policy: no-referrer` ก่อน routes ของ API ส่วน CSP ใช้เฉพาะเมื่อกำหนด
`webDistDir` สำหรับเว็บ build ไม่บังคับ CSP นี้กับ Vite dev/HMR
`script-src` และ `style-src` อนุญาตเฉพาะ origin เดียวกัน ไม่มี unsafe-inline/eval,
`object-src/base-uri/frame-ancestors` เป็น none และ form-action เป็น self

`connect-src` ใช้ self กับ ws/wss ของ public origin ที่ตั้งไว้ใน Auth เท่านั้น
ไม่ใช้ Host หรือ forwarded headers จาก request เพื่อสร้างข้อยกเว้น
ต้องระบุ ws/wss ชัดเจนเพราะ self ไม่ครอบคลุม WebSocket ในทุก browser ตาม
[MDN connect-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src)
ไม่เปิดให้ browser ติดต่อ provider โดยตรงและไม่เพิ่ม HSTS ให้ HTTP loopback

หลักฐานใหม่อยู่ใน `.headers-review-20261005.local/`:
`http-results.json`, `browser-results.json`, `browser-crypto.png`, logs ของ checks,
`data-before.json`, `data-after.json`, manifests และ diff เทียบ preimage ของงานนี้
ตรวจเวลา 2026-10-05 02:29 น. Asia/Bangkok (timestamps ใน JSON เป็น UTC)
ผ่าน compiled static origin ชั่วคราว `http://127.0.0.1:4197/` ด้วย Node 24.18.0
และ PostgreSQL สังเคราะห์ 16.15; server ทดสอบปฏิเสธ write requests

| การตรวจรอบแก้ headers | ผล | ขอบเขต |
| --- | --- | --- |
| regression tests headers/CSP | PASS | เพิ่มสี่ cases รวม HTTP/HTTPS origin และ Host/forwarded spoof; fake Auth เฉพาะ unit policy ไม่ใช้แทน DB/runtime |
| compiled HTML/navigation/JS/CSS/errors/health | PASS | เจ็ด HTTP checks มี headers; MIME ถูกต้อง; missing asset และ unknown API เป็น JSON 404 ไม่คืน SPA |
| browser ภายใต้ CSP | PASS | หน้า finance, crypto, stocks และ backup render; พบ captured error logs ศูนย์ ไม่ใช่การรับประกันทุก browser; ไม่ทำ restore หรือดาวน์โหลดซ้ำ |
| real provider transport | PASS | รับสอง WebSocket frames ที่มีราคา LIVE และอายุไม่เกิน 30 วินาที; browser แสดงมูลค่าพอร์ตสังเคราะห์ |
| tracker typecheck/test/build | PASS | 107 tests ผ่าน; cold Vite force optimizer smoke และ compiled smoke ปิด type stripping ผ่าน |
| root build | PASS | ไม่เปลี่ยน source แอปเดิม; ยังมี warning ขนาด bundle |
| root npm test | FAIL เดิม | 234 ผ่าน สอง failures เดิมใน allComponents และ spotTrading.integration; ไม่แก้หรือข้าม tests |
| financial/audit/idempotency records | PASS | จำนวนและ SHA-256 แปดตารางก่อน/หลังตรงกัน; session metadata ไม่รวมใน inventory |
| dependency audit / HTTPS target / Node ขั้นต่ำ | NOT TESTED | audit ยังถูก automatic approval review ปฏิเสธ; HTTP/HTTPS policy unit test ไม่ใช่ HTTPS runtime |

HTTP harness ครั้งแรกคาด missing asset เป็น text/html แต่ระบบตอบ application/json 404
จึงแก้ MIME ที่คาดไว้ใน harness ชั่วคราวและตรวจซ้ำผ่าน ไม่เปลี่ยน source เพื่อกลบ failure
ปิดเฉพาะ preview ชั่วคราวและคืนพอร์ต 4197; dev server/DB เดิมยังทำงาน
ตอนจบรอบ headers API เดิมยังต้อง restart เพื่อโหลด middleware ใหม่ ส่วน CSP ต้องเสิร์ฟเว็บ build
ยังคง gate สำหรับข้อมูลจริง/ออนไลน์และนโยบาย backup/recovery/retention ตามด้านบน
ไม่ได้เปลี่ยน dependencies, env, F1.1, src เดิม หรือ deploy

ต่อมารอบ R01 วันที่ 2026-10-05 เวลา 04:38 น. restart dev runner เดิมด้วย q
ตรวจคืนพอร์ต 4173/4174 ก่อนเริ่ม `npm run tracker:dev` แล้วตรวจห้า HTTP checks ผ่าน
API ตรงและ Vite proxy มี nosniff/DENY/no-referrer แล้ว unknown API ยังคง JSON 404
Browser session สังเคราะห์เดิมยังใช้ได้ รายรับรายจ่าย/พอร์ตและราคาโหลดได้
SHA-256/count แปดตาราง finance/audit/idempotency ตรงกันก่อน/หลัง ไม่ reset DB
หลักฐานอยู่ใน `.restart-review-20261005.local/` และสถานะ R01 ใน `work-status.md`
รอบนี้ไม่แก้ source หรือรัน full suites ซ้ำ; compiled package smoke ผ่าน
dev server/DB เดิมยังเปิดให้ใช้ และยังไม่ทดสอบ HTTPS/reverse proxy จริง

## วิธีทดลองในเครื่องและเก็บหลักฐาน

1. จาก root โปรเจกต์ เริ่มเฉพาะฐานข้อมูลสังเคราะห์เดิมด้วย
   `docker compose --env-file .env.auth.local -f compose.auth.local.yaml up -d --wait`
   เมื่อยืนยัน target ตาม README แล้ว ห้ามเรียก prepare/reset กับฐานข้อมูลที่ไม่ว่าง
2. รัน `npm run tracker:dev` เปิด `http://127.0.0.1:4173/` API loopback 4174 อยู่หลัง
   Vite proxy; Browser เรียก relative `/api` และ `/ws` origin เดียวกัน
3. ใช้บัญชีสังเคราะห์เพื่อทดลองข้อมูลและสำรอง JSON เก็บไว้ในพื้นที่ส่วนตัว ไม่ส่งไฟล์
   การเงินหรือ credentials ให้ reviewer สำหรับตรวจ schema/จำนวน ให้ใช้ข้อมูลสังเคราะห์
4. หยุด dev runner ด้วย `q`/Ctrl+C และเมื่อเลิกทดสอบหยุดเฉพาะ
   `docker compose --env-file .env.auth.local -f compose.auth.local.yaml stop postgres-auth-local`
   รักษา volume ไม่ down --volumes ไม่หยุดบริการอื่น

ในรอบ readiness นี้ dev server และ DB เดิมยังทำงาน; session ชั่วคราวของ audit ถูก logout
และ static preview ชั่วคราวถูกปิด ไม่มี commit/push/deploy, DNS change หรือบริการใหม่
