# สินทรัพย์รวม เงินสด และอัตราอ้างอิงเงินบาท

วันที่ 2026-10-05 · ตามคำขอเจ้าของให้รวมเงินสดกับพอร์ตและแสดงมูลค่าบาทโดยประมาณ

## ความสัมพันธ์กับแผนเดิม

เพิ่มความสามารถแสดงมูลค่าเทียบ THB แทนข้อจำกัด “ไม่มี FX/cross-currency total” สำหรับหน้าใหม่เท่านั้น ไม่แก้หรือลบ ADR-002 / acceptance/migration ซึ่งเก็บการตัดสินใจ F1.1 เดิม Ledger รายรับรายจ่ายยังเป็น THB; trade, fee, cost basis และ replay ยังเป็น USDT ไม่มี execution, wallet, เครดิต หรือการนำเข้า DEMO

## ขอบเขตและการคำนวณ

- เงินสดเป็น snapshot บันทึกด้วยมือ: ชื่อที่ไม่ต้องมีเลขบัญชี ยอด THB ไม่ติดลบ และวันที่ ณ ยอด รองรับหลายบัญชี รายรับรายจ่ายไม่เปลี่ยน snapshot นี้อัตโนมัติ ยอดศูนย์เป็นข้อมูลที่ผู้ใช้บันทึกจริง ไม่ให้ starter credit
- หน้ารวมใช้ทุก portfolio holding ที่เป็น READY; แต่ละ `(portfolio, asset)` นับครั้งเดียว ปริมาณ × ราคาตลาดเป็นมูลค่า USDT ไม่ใช้ต้นทุนแทนราคาปัจจุบัน
- มูลค่า THB = ปริมาณ × ราคา USDT × อัตรา USDT/THB คำนวณ precision 80 แล้ว HALF_EVEN ที่ THB ราย holding ก่อนรวมเงินสด ใช้ Finance facade; API และ backup ส่ง decimal strings ทุกตัว NUMERIC(20,2) สำหรับเงินสด ไม่มี Number/toNumber ในเส้นทางเงิน
- หากราคา/อัตราไม่พร้อมหรือ stale >30 วินาที มูลค่า holding เป็น N/A และยอดรวมเป็น incomplete แสดงยอดที่ประเมินได้บางส่วนแยกชัดเจน ไม่เอา stale มาคิด ไม่ใส่ศูนย์แทนข้อมูลหาย ศูนย์จำนวนถือไม่ต้องมีราคา/FX Aggregate overflow เป็น N/A
- ไม่รวม stock watchlist เป็น holdings ไม่รวมสินทรัพย์นอกระบบหรือหนี้ จึงไม่เรียกว่า net worth ครบทั้งหมด USD/สกุลอื่นและการแปลงต้นทุนยังไม่ทำ
- สัดส่วนรายจ่ายของเดือน API ที่เลือก = ยอด active expense ของหมวด / ยอด active expense ทั้งหมด ×100 ไม่รวม income/voided/legacy ศูนย์รายจ่ายเป็น empty state เปอร์เซ็นต์ปัดแสดงผลสองตำแหน่ง ไม่ใช้ค่าปัดย้อนคำนวณ ผลรวมเปอร์เซ็นต์อาจไม่เท่ากับ100พอดี

## Public source และ freshness

ราคา BTC/ETH ยังมาจาก Binance relay เดิม อัตราใช้ [Bitkub public REST v3](https://github.com/bitkub/bitkub-official-api-docs/blob/master/rest-v3.md): backend ตรวจ `/api/v3/market/symbols` ให้ USDT_THB มี base USDT, quote THB และ active ก่อนรับ `/api/v3/market/ticker?sym=usdt_thb` ราคาล่าสุด ไม่ตี USDT=USD ไม่ส่ง owner/ยอดถือหรือ credential ไป provider ไม่มี API key/บริการที่ซื้อในงานนี้

Parse JSON numeric lexemes เป็น string ก่อน parse เพื่อไม่สูญเสีย precision แล้วตรวจ Finance scale/range; wrong pair/nonpositive/exponent/overscale ถูกปฏิเสธ Backend share cache + single in-flight refresh + 5-second timeout + bounded exponential backoff; UI poll15วินาทีและตัดอายุเองตาม clock แม้ API ขาด

Ticker ไม่ระบุเวลา trade ของ last จึงระบุ LAST_PRICE_SNAPSHOT กับเวลาที่ backend รับข้อมูล ไม่รับประกันความสดของ actual trade, execution rate หรือค่าธรรมเนียม และไม่ติดป้าย FX ว่า LIVE การเกิน30วินาทีของ receipt time ทำให้ใช้คำนวณไม่ได้

## Ownership, concurrency และ backup

`cash_accounts` มี owner FK Restrict/immutable trigger, currency THB, nonnegative balance, unique(owner,name), version positive; input ตรวจ scale ก่อน Prisma เขียน PostgreSQL typmod อย่างเดียวไม่ได้รับประกัน input scale

GET/POST/PATCH ผ่าน requireOwner และ same-origin สำหรับ write ไม่รับ owner จาก body การแก้ใช้ compare-and-swap `(owner,id,expectedVersion)` + version increment ใน ownedMutation transaction พร้อม audit และ owner+endpoint+key receipt สอง concurrent updates จะสำเร็จเพียงหนึ่ง ไม่มี lost update Timeout ไม่สรุป rollback ต้องส่ง payload/key เดิม

Forward migration `20261005000000_cash_accounts` ไม่แก้ห้า migration เดิม JSON backup export เป็น v2 เพิ่ม cashAccounts whitelist/count limitรวมทุก section พร้อม preview ชื่อ/ยอด/วันที่ แล้ว verify readback ใน transaction; restore v1 ยังคงรับและไม่สร้างยอดเงินสดขึ้นเอง Target ที่มี cash ก็ไม่ใช่ empty target ไม่ merge/overwrite

## Local operation

เริ่มด้วย `npm run tracker:dev` ตาม README เดิม (same-origin web4173/API4174 ค่าเครื่องนี้) ต้อง apply forward migration บน synthetic local DB หลังตรวจ target/checksum เท่านั้น ไม่ reset database/volume

Regression/runtime: `npm run tracker:typecheck`, `npm run tracker:test`, `npm run tracker:build`, `node --no-strip-types scripts/tracker-package-smoke.mjs` และ guarded `node --no-strip-types --env-file=apps/api/.env scripts/tracker-assets-runtime-smoke.mjs` จาก root ตัวหลังยอมรับเฉพาะ synthetic ui_fixture / loopback5436 / finntech_auth_local / confirm synthetic-only ตรวจ checksum เดิมก่อน deploy และรักษา fixtures เป็นหลักฐาน ไม่ควรใช้กับฐานข้อมูลจริง

อ่านผลแต่ละ environment ใน acceptance/assets-overview ก่อนอ้างว่า production พร้อม ยังไม่ได้ publish ระบบ
