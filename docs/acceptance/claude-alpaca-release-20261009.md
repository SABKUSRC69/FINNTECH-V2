# FINNTECH — Alpaca IEX real-time stock valuation, 2026-10-09

หลักฐาน: [`claude-alpaca-release-20261009/`](claude-alpaca-release-20261009/)

## สถานะ (แยกให้ชัด)

| เรื่อง | สถานะ |
|---|---|
| **โค้ด deploy แล้ว** | ✅ commit `edc96845b1d44696c1ec12595da0e8a896a32e46` (`SABKUSRC69/finntech-beta` / `codex/student-real-use`) → Render `srv-db3pcll9fdbs73enrmg0` deploy `dep-db4he7flot8c7390pisg` **Deploy succeeded \| Live** (1m36s, 23:32 น.) · https://finntech-personal.onrender.com/ |
| Release identity | ✅ live `index-DRGFJhiJ.js` sha256 `970b6721…1a9d9e` ตรง release build · CSS เดิม `index-C6G3rOc3.css` · `/api/ready` true |
| **Alpaca credentials ใน Render** | ❌ **ยังไม่ได้ตั้ง** — ไม่มีตัวแปร `ALPACA_*` (ตรวจเฉพาะชื่อ ไม่ได้ดูค่า) |
| **Real IEX observations** | ❌ NOT TESTED / BLOCKED — ไม่มี key; ทดสอบด้วย fake IEX upstream ในเครื่องเท่านั้น |
| **มูลค่าหุ้น USD แบบสด** | ⏸ พร้อมทำงานเมื่อมี key (ตอนนี้แสดง "ยังไม่มี feed ราคาอัตโนมัติ · ตั้งราคาอ้างอิงเองได้" เหมือนเดิม) |
| แปลงเป็นบาท | ECB รายวัน หรืออัตราที่กรอกเอง — **ไม่เรียลไทม์** (ติดป้ายบอกในหน้า Assets) |
| ขอบเขตผู้ใช้ | **เจ้าของ key คนเดียว** (`ALPACA_OWNER_ID`) ตามเงื่อนไข Alpaca "personal and non-commercial"; ผู้ใช้อื่นใช้ราคาที่กรอกเอง/กราฟ TradingView ต่อไป · ไม่มีสิทธิ์เผยแพร่ข้อมูลต่อ |

ไม่มีการเปลี่ยน schema/migration · ไม่แตะ DEMO · ไม่ใช้บริการเสียเงิน · ไม่เรียก trading/order endpoint ใดๆ

## แหล่งอ้างอิงที่ตรวจ

- [About Market Data API](https://docs.alpaca.markets/us/docs/about-market-data-api): Basic = real-time IEX เท่านั้น, WebSocket 30 symbols, REST 200 calls/min
- [Streaming market data](https://docs.alpaca.markets/us/docs/streaming-market-data): auth ภายใน 10 วิ, error 402 auth failed / 405 symbol limit / 406 connection limit / 409 insufficient subscription / 410 invalid action; หลาย subscription อนุญาต 1 connection; `subscription` ack; test stream `v2/test` + FAKEPACA
- [Real-time stock pricing](https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data): trade `T=t` (i,p,t), correction `T=c` (oi→ci, cp), cancel `T=x` (i, a=C/E)
- [Market data FAQ](https://docs.alpaca.markets/us/docs/market-data-faq): IEX เป็นตลาดเดียว
- [Terms and Conditions](https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf): ใช้ส่วนตัวไม่ใช่เชิงพาณิชย์; ให้ผู้อื่นใช้ผ่านแอปต้องแจ้ง 30 วันล่วงหน้า; ห้ามเผยแพร่โดยไม่มี written consent; "intended for United States residents only" — สิทธิ์จริงยืนยันได้จากการ auth ของ key เท่านั้น

## สิ่งที่ทำ (ต่อยอด relay เดิม ไม่มี relay ที่สอง)

- **Backend `stocks.ts`**: หนึ่ง connection `wss://stream.data.alpaca.markets/v2/iex` ต่อบัญชี; REST seed `feed=iex`; subscribe **หุ้นที่เจ้าของถืออยู่ก่อน** (จาก DB, รีเฟรช 60 วิ และทันทีหลังบันทึกเทรด) แล้วตามด้วย watchlist ภายใน 30; ส่วนเกินรายงานใน `excluded`; ส่งเฉพาะส่วนต่าง subscribe/unsubscribe; error 402→`AUTH_FAILED` (ลองใหม่ 10 นาที), 406→`CONNECTION_LIMIT` (30 วิ ระหว่าง deploy ซ้อน), 409/410→`NOT_ENTITLED` (30 นาที); correction/cancel ตาม trade id; ปฏิเสธ out-of-order (ระดับ nanosecond), อนาคต > 2 วิ, ราคา ≤ 0/รูปแบบผิด; ตลาดปิด (นอก 09:30–16:00 New York) → `CLOSED` พร้อมเวลาจริง; idle 60 วิตัดการเชื่อมต่อ (ไม่มี keepalive); log สถานะแบบ sanitized (`Alpaca IEX: authenticated`, `subscribed N symbols`, `first trade observed for X (provider-to-receipt N ms)`, รหัส error) ไม่มี key/payload
- **`server.ts`**: ตั้งค่า Alpaca ไม่ครบ → ปิดเฉพาะ feed (log ชื่อตัวแปรที่มี ไม่ใช่ค่า) แทนที่จะทำให้ทั้งเว็บล่ม; probe auth หนึ่งครั้งตอน start เพื่อดูผลใน log
- **`stream.ts`**: ส่งราคาใหม่ให้ socket ของเจ้าของภายใน ~1 วิ (รวบได้สูงสุดวินาทีละครั้ง เก็บค่าล่าสุดเสมอ); loop 5 วิเดิมยังตรวจ session และ reconcile
- **Web `stockMarket.ts`** (ใหม่): store เดียวต่อแท็บ ใช้ร่วมกันระหว่างหน้า Assets และหุ้น; REST reconcile ทุก 30 วิ; บัญชีที่ไม่ใช่เจ้าของ (403) หรือ server ไม่มี key **ไม่เปิด WebSocket**
- **`valuationPolicy.ts` / `Assets.tsx` / `StockPrices.tsx` / `StockHoldings.tsx`**: ใช้ราคา last trade (ไม่ใช่ bid/ask/mid) เมื่ออายุ ≤ 30 วิทั้งเวลาตลาดและเวลารับ (ยอมนาฬิกาคลาด 2 วิ); สถานะ LIVE / STALE / CLOSED / MISSING / ERROR(+เหตุผล); แสดง "ราคาล่าสุดที่ทราบ … ไม่นับในยอดรวม"; เมื่อราคาที่กรอกเองบังราคาสด แสดงแจ้งเตือนและปุ่ม **"กลับไปใช้ราคา Alpaca อัตโนมัติ"** (ปิดใช้ ไม่ลบ); ปุ่มกรอกราคาเปลี่ยนเป็น "กรอกราคาเองแทน (ไม่จำเป็น)" เมื่อมีราคาสด; ป้ายแปลงบาทด้วย ECB ณ วันที่ ไม่เรียลไทม์
- **contracts**: สถานะ connection/quote ใหม่ + `session`, `excluded` (optional, เข้ากันได้ย้อนหลัง)

## ผลตรวจ

| คำสั่ง / ชุด | ผล |
|---|---|
| `npm test` | PASS exit 0 (67 files, 489 tests) |
| `npm run build` | PASS exit 0 |
| `npm run tracker:typecheck` | PASS exit 0 |
| `npm run tracker:test` | PASS exit 0 (finance 25, contracts 16, api 147, web 156 + dev smoke) |
| `npm run tracker:build` | PASS exit 0 |
| `node --no-strip-types scripts/tracker-package-smoke.mjs` | PASS exit 0 |
| `git diff --check` | PASS exit 0 |
| Release checkout typecheck / build / diff-check | PASS exit 0 |
| `stocks.test.ts` (ใหม่ 9 ข้อ: held-first+limit, subscription diff, 402/406/409 + backoff + ไม่มี key ใน log, out-of-order/correction/cancel, CLOSED, listener, NY session/DST, push ≤ 2 วิ) | PASS 24/24 |
| `alpacaLive.test.tsx` (ใหม่: stream → Assets/P&L โดยไม่ poll เพิ่ม, override + กลับอัตโนมัติ, ตลาดปิด, non-owner ไม่เปิด socket) | PASS 4/4 |
| **ใหม่** `alpaca-relay.integration.ts` (Auth+PostgreSQL จริง, fake IEX upstream): held AAPL subscribe ก่อน, connection เดียว, push ถึง owner 776 ms, REST LIVE พร้อม observedAt, owner B REST 403 / WS 401, anonymous WS 401, retry key เดิม = 1 เทรด, ไม่มี key ใน response | PASS 1/1 |
| `audit-fixes` / `password-mode` / `assets` / F1.4 | PASS 7/7, 5/5, 12/12, 12/12 |
| UI ในเครื่อง (build จริง): mobile 375 dark + desktop light, ไม่ล้นจอ, สถานะ "ยังไม่มี feed…" | PASS |
| Live: release identity, ready, anonymous `/api/stocks/market` 401, WSS anonymous 401, foreign origin 403 | PASS |
| Secret scan release + bundle | PASS 0 found |
| Real Alpaca auth / subscription / IEX trades / USD valuation live | **BLOCKED — ต้องตั้ง key ใน Render** |

## ตั้งค่าให้ใช้งานจริง (เจ้าของทำเอง ห้ามส่ง key ทางแชท)

1. Login FINNTECH ด้วยบัญชีของคุณ แล้วเปิด `https://finntech-personal.onrender.com/api/me` คัดลอกค่า `ownerId` (เป็นรหัส UUID ไม่ใช่อีเมล)
2. Render → `finntech-personal` → **Environment** → Edit → เพิ่ม
   - `ALPACA_API_KEY_ID` = Key ID (แนะนำ key จาก Paper account; ข้อมูลราคาเป็นราคาจริงของ IEX)
   - `ALPACA_API_SECRET_KEY` = Secret Key
   - `ALPACA_OWNER_ID` = ค่า `ownerId` จากข้อ 1
   - `ALPACA_PERSONAL_USE` = `confirmed` (การตั้งค่านี้คือการยืนยันว่าใช้ส่วนตัวเฉพาะคุณ)
   - (ไม่บังคับ) `ALPACA_SYMBOLS` = เช่น `AAPL,MSFT,NVDA,SPY,QQQ` ไม่เกิน 30 ตัว; หุ้นที่คุณถือจะถูกติดตามก่อนเสมอ
3. กด **Save, rebuild, and deploy**
4. ตรวจใน Render → Logs: ควรเห็น `Alpaca IEX configured for one owner`, `Alpaca IEX: authenticated`, `subscribed N symbols` · ถ้าเห็น `provider error 402` = key ผิด, `409` = บัญชีไม่มีสิทธิ์, `406` = มีโปรแกรมอื่นใช้ key เดียวกันอยู่
5. เปิดหน้า "ราคาหุ้นสหรัฐ" หรือ "สินทรัพย์รวม" ช่วงตลาดเปิด (ประมาณ 20:30–03:00 น. ไทย; หลังเปลี่ยนเวลาสหรัฐต้นพฤศจิกายนเป็น 21:30–04:00 น.) จะเห็น "ราคาสด IEX" และยอดอัปเดตเอง

## ข้อจำกัด

- ราคาเป็น IEX ตลาดเดียว (ไม่ใช่ราคารวมทุกตลาด); หุ้นที่ซื้อขายใน IEX น้อยอาจกลายเป็น "ไม่สด" เมื่อไม่มีรายการใหม่ใน 30 วิ
- วันหยุดตลาดสหรัฐแสดงเป็น STALE (ไม่มีปฏิทินวันหยุดโดยไม่ใช้ trading API)
- Render Free หลับเมื่อไม่มีผู้ใช้ — ครั้งแรกรอ ~50 วิ แล้ว relay จึงเชื่อม Alpaca; ไม่มี keepalive
- ใช้ key เดียวกันพร้อมกันได้ 1 connection: ถ้ารันเว็บในเครื่องด้วย key เดียวกันจะเห็น `CONNECTION_LIMIT`
- บัญชีอื่นไม่ได้ราคาอัตโนมัติ (ตามเงื่อนไขผู้ให้บริการ)
- การแก้ใน checkout หลัก `FINNTECH` ยังไม่ commit (convention เดิม); release อยู่ใน `.student-real-20261008.local/release-source`
