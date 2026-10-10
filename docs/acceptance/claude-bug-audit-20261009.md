# FINNTECH — independent bug audit (Claude), 2026-10-09

หลักฐานทั้งหมดอยู่ใน [`claude-bug-audit-20261009/`](claude-bug-audit-20261009/) · รายงานนี้ไม่ได้แก้โค้ดแอป, dependencies, schema, config บน Render หรือ commit/push/deploy ใดๆ

## สรุปผล

**ใช้งานได้จริงสำหรับผู้ใช้คนเดียว:** สมัคร/เข้าสู่ระบบ/ออกจากระบบ, บันทึกรายจ่าย → เปลี่ยนหน้า → reload ข้อมูลอยู่ครบ, กรองหมวดตามรายรับ/รายจ่าย, ซื้อหุ้นแบบเศษหุ้นแล้วมูลค่าเข้า "สินทรัพย์รวม" จริง (ทั้ง ECB รายวันและราคา/อัตราที่กรอกเอง), ขาดราคาแล้วยอดรวมเป็น N/A พร้อมบอกสาเหตุ, เน็ตหลุดระหว่างบันทึกแล้วลองซ้ำด้วย key เดิมได้รายการเดียว, แยกเจ้าของข้อมูล/รูปใบเสร็จถูกต้อง, CSRF (Origin) และ session หมดอายุถูกปฏิเสธ, ขอลบบัญชีแล้ว session ถูกเพิกถอน

**บั๊กที่กระทบการใช้งานปกติ (เรียงตามความรุนแรง):**

1. **HIGH — login/สมัครได้แค่ 3 ครั้งต่อ 10 วินาทีสำหรับทั้งเว็บ** ทุกคนใช้ bucket เดียวกัน (ทำซ้ำได้ในเครื่องด้วยโค้ดและ config path เดียวกับ production)
2. **MEDIUM-HIGH — โควตาเขียนข้อมูล 120 ครั้ง/นาทีใช้ร่วมกันทุกบัญชี** คนหนึ่งใช้หมดแล้วคนอื่นบันทึกไม่ได้ (ทำซ้ำได้ 2 รอบ)
3. **MEDIUM — flow หมวดหมู่สำหรับผู้ใช้ใหม่ยังไม่เสร็จ** ไม่มี empty state, สร้างหมวดแล้วค่าที่กรอกค้างหาย, ไม่เลือกหมวดใหม่ให้ (prompt แก้ของเจ้าของมีแล้วแต่ยังไม่ได้ทำ)
4. **MEDIUM — backup ใช้ไม่ได้เลยเมื่อข้อมูลเกิน 2,000 แถว**
5. **MEDIUM/LOW — เวลาบันทึกเทรดโตตามจำนวนประวัติ** (O(N) ต่อครั้ง)
6. LOW — deadlock จากลำดับล็อกไม่ตรงกัน, ป้ายราคา "ERROR" ทั้งที่ไม่ได้ตั้ง feed, ยอดรวมขึ้น "ข้อมูลไม่ครบ" ระหว่างโหลด, ราคาคริปโต REST ล้มทั้งชุดเมื่อเหรียญเดียวล้ม, ข้อความ login หลังขอลบบัญชีไม่ชัด

**ไม่ได้ทดสอบ (NOT TESTED):** flow ที่ต้อง login บนเว็บ live ทั้งหมด (ผู้ตรวจไม่สร้างบัญชี/กรอกรหัสผ่านบนโดเมนที่ไม่ใช่ localhost — ทดสอบด้วย build เดียวกันในเครื่องแทน), cold start ของ Render, OCR อ่านรูปจริง, อัปโหลด avatar ผ่าน UI, งบประมาณ/พอร์ตคริปโตผ่าน UI, อุปกรณ์จริง/Safari/screen reader

**ถอนข้อกล่าวหาจากการรีวิวรอบก่อน:** "Dashboard แสดงข้อมูลผิดเดือนเมื่อเปลี่ยนเดือนเร็ว" — **ไม่ใช่บั๊ก** ช่องเลือกเดือนถูก `disabled` ระหว่างโหลด ([Dashboard.tsx:236](../../apps/web/src/tracker/Dashboard.tsx))

## เวอร์ชันที่ทดสอบ

| รายการ | ค่า |
|---|---|
| Live | https://finntech-personal.onrender.com/ · `/api/health` 200 (`real.authenticationMode=email-password`, `registrationsOpen=true`) · `/api/ready` 200 |
| Live assets | `index-D3vtIgU1.js` sha256 `53c26490…34db2`, `index-BS-Aa3p3.css` sha256 `e40ad9f5…84b07` ([live-version.json](claude-bug-audit-20261009/live-version.json)) |
| Deployed release | `SABKUSRC69/finntech-beta` branch `codex/student-real-use` commit `8058bb7b1d480600035c44f2021f69270cf11a0a` (checkout ที่ `C:\Users\Admin\Downloads\FINNTECH\.student-real-20261008.local\release-source`) — hash asset ตรงกับ live |
| Local checkout | `C:\Users\Admin\Downloads\FINNTECH` branch `main` commit `aafadab` (remote `origin` = `SABKUSRC69/FINNTECH-V2`) + untracked งาน stock-valuation และ prompt ของเจ้าของ (ไม่ได้แตะ) |
| ความต่าง local vs production | runtime source ทุกไฟล์ใน `apps/api/src`, `apps/api/prisma`, `apps/web/src`, `apps/web/public`, `packages/*/src`, `package.json`, `package-lock.json` **ตรงกันทุกไฟล์** (เทียบ SHA-256, ไม่รวม `generated/` และ `*.test.*`) ต่างกันเฉพาะ scripts/ไฟล์เทสต์ที่ release checkout ไม่มี |
| Runtime ทดสอบในเครื่อง | `node apps/api/dist/server.js` + `apps/web/dist` โหมด `real-rehearsal` + `TRACKER_REAL_AUTH_MODE=email-password` บน `127.0.0.1:4199` กับ PostgreSQL 18 ใน container ใหม่ของ audit (tmpfs ลบแล้ว) |
| Node / Docker | Node v24.18.0, npm 11.16.0, Docker 29.8.1 |

## PASS / FAIL / NOT TESTED / BLOCKED

| การตรวจ | ผล | หลักฐาน |
|---|---|---|
| `npm test` | PASS exit 0 (65 files, 467 tests) | [check-npm-test.log](claude-bug-audit-20261009/check-npm-test.log) |
| `npm run build` | PASS exit 0 | check-npm-build.log |
| `npm run tracker:typecheck` | PASS exit 0 | check-tracker-typecheck.log |
| `npm run tracker:test` | PASS exit 0 (web 27 files/145 tests + dev smoke) | check-tracker-test.log |
| `npm run tracker:build` | PASS exit 0 | check-tracker-build.log |
| `node --no-strip-types scripts/tracker-package-smoke.mjs` | PASS exit 0 | check-package-smoke.log |
| `git diff --check` | PASS exit 0 | check-diff-check.log |
| `apps/api/db-test/assets.integration.ts` (PostgreSQL 16, audit container :5448) | PASS 12/12 exit 0 | integration-assets.log |
| `scripts/tracker-db-test.mjs` → `postgres.integration.ts` (:5434) | PASS 12/12 exit 0 | integration-f14-db-test.log |
| `apps/api/db-test/password-mode.integration.ts` (rehearsal :5446) | PASS 5/5 exit 0 | rehearsal-password-mode.log |
| Integration อื่น (`auth`, `beta`, `demo`, `recovery*`, `real-use` full restore) | NOT TESTED — ต้องใช้ target/compose เฉพาะของงานเก่าที่ไม่ใช่โหมด production ปัจจุบัน | — |
| Service reproducers R1–R5 | 5/5 รันสำเร็จ (ยืนยัน F4, F5, F6, F9 และ valuation PASS) | [service-reproducers.json](claude-bug-audit-20261009/service-reproducers.json) |
| สมัคร/เข้าระบบผ่าน UI (local) | PASS | — |
| บันทึกรายจ่าย → เปลี่ยนหน้า → reload | PASS (250.75 THB ยังอยู่, ยัง login) | local-mobile-light-finance.jpg |
| กรองหมวดรายรับ/รายจ่าย | PASS | — |
| สร้างหมวดระหว่างกรอก draft | **FAIL** (F3) | — |
| หุ้น → สินทรัพย์รวม (ECB จริง) | PASS 0.5×200×33.5302516509 = **3,353.03 THB** | — |
| หุ้น → สินทรัพย์รวม (กรอกเอง 35) | PASS **3,500.00 THB** สถานะครบ | local-desktop-light-assets-3500.jpg, local-mobile-dark-assets-3500.jpg |
| ขาดราคา/ขาด FX | PASS ยอดรวม N/A + "ขาดราคาอ้างอิง AAPL" (UI) / `totalThb=null` + state `MISSING` (R5) | service-reproducers.json |
| เซิร์ฟเวอร์ล่มระหว่างบันทึก → retry | PASS ข้อความ "ยังไม่ทราบผล", ล็อกเมนู, เก็บค่า, retry 2 ครั้งได้ 1 แถว (ตรวจ DB) | — |
| แยกเจ้าของ (รายการ/รูป/attachment/correction), anonymous, foreign Origin | PASS 404/404/404/401/403 | probe-isolationAndIdempotency.json |
| Idempotency key เดิม / payload เปลี่ยน | PASS receipt เดิม / 409 `IDEMPOTENCY_CONFLICT` | เดียวกัน |
| Session หมดอายุฝั่งเซิร์ฟเวอร์ | PASS 401 `AUTH_REQUIRED` | เดียวกัน |
| ขอลบบัญชี | PASS (รหัสผิด 401, session เดิม 401, เขียนต่อ 403, สมัครซ้ำ 422) + LOW F10 | probe-deletion.json |
| Backup v4 round-trip | PASS (assets integration) / **FAIL** ที่ 2,001 แถว (F4) | — |
| Dialog คีย์บอร์ด (ยกเลิกรายการ) | PASS focus เข้าช่องเหตุผล, Escape ปิด, focus คืนปุ่มเดิม | — |
| Mobile 375 px light/dark (local, หลัง login) | PASS ไม่มี horizontal overflow | screenshots |
| Live หน้าแรก mobile light/dark | PASS ไม่มี overflow, ไม่มี console error, ไม่มี service worker เก่าควบคุม | live-mobile-*.jpg |
| Secret ใน `apps/web/dist` | PASS ไม่พบ | — |
| `npm audit` | 14 (2 moderate, 12 high) — **ไม่อยู่ใน runtime ของ server/browser** ดูหัวข้อความปลอดภัย | npm-audit.json |
| Flow ที่ต้อง login บน live | NOT TESTED (ไม่สร้างบัญชีบนโดเมนจริง) | — |
| Render cold start | NOT TESTED (เว็บตื่นอยู่ตอนตรวจ, ตอบ 637 ms) | — |
| OCR อ่านรูปจริง / avatar UI / quota รูป | NOT TESTED ผ่าน UI (ตรวจโค้ด: OCR ต้องเลือกช่องแล้วกด "ใช้ช่องที่เลือก" เอง และไม่บันทึกอัตโนมัติ — [ReceiptAssist.tsx](../../apps/web/src/media/ReceiptAssist.tsx)) | — |
| Live provider ราคาหุ้นอัตโนมัติ (Alpaca) | NOT CONFIGURED ใน production ตามรายงาน release — ใช้ราคากรอกเองแทน (เส้นทางที่ยืนยันแล้วคือ manual + ECB) | — |

## Findings

### F1 — HIGH · login/สมัครถูกจำกัด 3 ครั้งต่อ 10 วินาทีรวมทั้งเว็บ

- **ผลกระทบ:** ถ้ามีคนพยายาม login/สมัครพร้อมกันเกิน 3 ครั้งใน 10 วินาที (เช่น ทั้งห้องเรียนสมัครพร้อมกัน หรือมีคนพิมพ์รหัสผิดซ้ำ) คนอื่นจะได้ 429 "ทำรายการถี่เกินไป" แม้รหัสถูก และคนเดียวก็บล็อก login ของทุกคนได้
- **สถานะ:** reproduced locally (build/โหมดเดียวกับ production) · live inferred (config path `config.real` เดียวกัน; ไม่ได้ทดลองบน live)
- **ขั้นตอน:** สมัคร 4 บัญชีห่างกัน 11 วินาที → logout ทุกบัญชี → ทั้ง 4 คน login ด้วยรหัสถูกต้องภายใน 10 วินาที
- **คาดหวัง:** ทั้ง 4 คน 200 · **ผลจริง:** `[200,200,200,429]` ([probe-sharedSigninBucket.json](claude-bug-audit-20261009/probe-sharedSigninBucket.json))
- **ไฟล์:** `C:\Users\Admin\Downloads\FINNTECH\apps\api\src\auth\runtime.ts:62` ตั้ง `ipAddress: { ipAddressHeaders: [] }` เมื่อ `config.beta || config.real` → Better Auth หา IP ไม่ได้และใช้ key `no-trusted-ip` ร่วมกัน (`C:\Users\Admin\Downloads\FINNTECH\apps\api\node_modules\better-auth\dist\api\rate-limiter\index.mjs:236-248`) กับ special rule `/sign-in`, `/sign-up` = 3 ครั้ง/10 วินาที (`:305-312`) · นอกจากนี้ guard ของแอปเองก็จำกัดรวม 60 คำขอ auth/นาที (`C:\Users\Admin\Downloads\FINNTECH\apps\api\src\auth\real.ts:92`)
- **แนวทางแก้:** ใช้ IP ผู้ใช้จริงจาก header ของ proxy ที่เชื่อถือได้ใน `cloud-real` เท่านั้น (Render ส่ง `X-Forwarded-For`) แล้วตั้ง `ipAddressHeaders`/`trustedProxies` ให้ถูก หรือถ้าไม่ต้องการพึ่ง IP ให้ override `rateLimit.customRules` ของ `/sign-in/email` และ `/sign-up/email` เป็นเพดานรวมที่สูงพอ (เช่น 30/10s) แล้วพึ่ง bucket ต่ออีเมลแบบ HMAC ที่มีอยู่แล้วใน `createRealAuthGuard` ยกเพดาน `auth:global` ให้สอดคล้องกัน

### F2 — MEDIUM-HIGH · โควตาเขียนข้อมูลเป็นของทั้งระบบ ไม่ใช่ต่อบัญชี

- **ผลกระทบ:** บัญชีหนึ่งบันทึก/แก้ไข 120 ครั้งในหนึ่งนาที (เช่น นำเข้าหรือกรอกย้อนหลังรัวๆ หรือสคริปต์) ทุกบัญชีอื่นบันทึกไม่ได้ (429) จนครบนาที
- **สถานะ:** reproduced locally 2 ครั้ง · live inferred (โค้ดเดียวกัน)
- **ขั้นตอน:** บัญชี A สร้างหมวด 125 ครั้งติดกัน → บัญชี B สร้างหมวดแรก
- **คาดหวัง:** B 200 · **ผลจริง:** A `{200:120, 429:5}`, B `429 WRITE_RATE_LIMITED` ([probe-writeBudget.json](claude-bug-audit-20261009/probe-writeBudget.json), [probe-writeBudget-run1.json](claude-bug-audit-20261009/probe-writeBudget-run1.json))
- **ไฟล์:** `C:\Users\Admin\Downloads\FINNTECH\apps\api\src\tracker\service.ts:62` (`consumeRealBudget(tx, 'writes:global', 120, 60)`)
- **แนวทางแก้:** เพิ่ม bucket ต่อเจ้าของ (`writes:owner:<ownerId>` เช่น 60/นาที) และยกเพดานรวมให้สูงกว่าผลรวมการใช้งานปกติหลายเท่า (หรือคง global ไว้เป็น circuit breaker ระดับสูง) ข้อความ 429 ต้องบอกว่าเป็นโควตาของบัญชีตัวเอง

### F3 — MEDIUM · flow หมวดหมู่สำหรับผู้ใช้ใหม่ไม่สมบูรณ์ และค่าที่กรอกค้างหาย

- **ผลกระทบ:** บัญชีใหม่ทุกบัญชีเริ่มที่ dropdown หมวดว่างโดยไม่มีคำอธิบาย ฟอร์มสร้างหมวดอยู่อีกการ์ดด้านล่าง และถ้ากรอกจำนวนเงิน/บันทึกไว้แล้วไปสร้างหมวด ค่าที่กรอกจะถูกล้าง และต้องเลือกหมวดใหม่เอง
- **สถานะ:** reproduced locally ผ่าน UI · live code เหมือนกันทุกไฟล์ (hash)
- **ขั้นตอน:** login บัญชีใหม่ → รายรับรายจ่าย → กรอก "จำนวนเงิน THB" `250.75` และบันทึกช่วยจำ → "ชื่อหมวดหมู่" `อาหาร` → "เพิ่มหมวดหมู่"
- **คาดหวัง:** หมวดใหม่ถูกเลือก, จำนวนเงิน/บันทึก/วันที่ยังอยู่ · **ผลจริง:** "บันทึกสำเร็จ" แต่จำนวนเงิน `""`, บันทึก `""`, หมวด `""`; สลับเป็นรายรับแล้ว dropdown มีแค่ "เลือกหมวดหมู่" ไม่มีข้อความ empty state หรือปุ่มหมวดพื้นฐาน
- **ไฟล์:** `C:\Users\Admin\Downloads\FINNTECH\apps\web\src\tracker\Dashboard.tsx:174-176` (`send()` ล้าง amount/note/quantity/price และชื่อหมวดทุกครั้งที่เขียนสำเร็จ ไม่ว่า endpoint ไหน) · ฟอร์มหมวดที่ `:257` · ไม่มี empty state ในฟอร์มบันทึก
- **หมายเหตุ:** ตรงกับงานที่เจ้าของเขียนไว้แล้วใน `C:\Users\Admin\Downloads\FINNTECH\FINNTECH_CATEGORY_EMPTY_FIX_AND_DEPLOY_PROMPT_EN.md` ซึ่งยังไม่ได้ implement/deploy
- **แนวทางแก้:** ล้างเฉพาะฟิลด์ของฟอร์มที่เขียนสำเร็จ; หลังสร้างหมวดให้เลือกหมวดใหม่ถ้าประเภทตรง; เพิ่ม empty state แยก loading/error/ไม่มีหมวดของประเภทนั้น พร้อมปุ่มสร้างหมวดข้าง selector และปุ่ม "เพิ่มหมวดหมู่พื้นฐาน" แบบ idempotent ตาม prompt เดิม

### F4 — MEDIUM · backup export ใช้ไม่ได้เมื่อรวมเกิน 2,000 แถว

- **ผลกระทบ:** ผู้ที่บันทึกวันละ ~5 รายการจะ export ไม่ได้อีกเลยภายใน ~1 ปี (รายการที่ถูกยกเลิก/แก้ไขก็นับ) ไม่มี export บางส่วนหรือแบ่งไฟล์
- **สถานะ:** reproduced locally (service)
- **ขั้นตอน:** owner ใหม่ 1 หมวด + 2,000 รายการรายจ่าย → `exportBackup`
- **ผลจริง:** `413 BACKUP_TOO_LARGE` (R2)
- **ไฟล์:** `C:\Users\Admin\Downloads\FINNTECH\packages\contracts\src\index.ts:217-218`, `C:\Users\Admin\Downloads\FINNTECH\apps\api\src\tracker\backup.ts:75`
- **แนวทางแก้:** ยกเพดานแถวและขนาดให้สอดคล้องกับการใช้งานหลายปี (เช่น 50,000 แถว/20 MiB) พร้อมทำให้ restore ทำงานเป็น batch (ดู F5) หรือเพิ่ม export รุ่นที่แบ่งไฟล์ตามช่วงเวลา; ต้องยังอ่าน v1–v4 ได้

### F5 — MEDIUM/LOW · เวลาบันทึกเทรดและ restore โตตามประวัติ

- **ผลกระทบ:** ทุกการบันทึก/แก้เทรดจะคำนวณประวัติใหม่ทั้งชุดและ `UPDATE` ทีละแถวใน transaction (timeout 15 วินาที) ผู้ที่ DCA สินทรัพย์เดียวหลายพันครั้งจะบันทึกช้าลงเรื่อยๆ จนอาจ timeout (503 แล้วต้องลองซ้ำ)
- **สถานะ:** reproduced locally (เวลาวัดบนเครื่องที่ RTT 0.71 ms) · production inferred
- **ผลวัด (R3):** createTrade เมื่อมีประวัติ 10/300/1,000/1,990 รายการ = 44/532/1,448/3,005 ms; restore 1,991 เทรด 4,963 ms บน Neon ที่ RTT สูงกว่ามาก ตัวเลขเหล่านี้จะคูณขึ้นตามจำนวน round-trip (ประเมินจากโค้ด ยังไม่ได้วัดบน production)
- **ไฟล์:** `C:\Users\Admin\Downloads\FINNTECH\apps\api\src\tracker\service.ts:174-182`, `C:\Users\Admin\Downloads\FINNTECH\apps\api\src\tracker\stock-ledger.ts:12-19`, `C:\Users\Admin\Downloads\FINNTECH\apps\api\src\tracker\backup.ts:133,145-148`, timeout `service.ts:72`
- **แนวทางแก้:** อัปเดตเฉพาะแถวที่ค่าเปลี่ยน และใช้ bulk update (`UPDATE … FROM (VALUES …)`) แทนการ update ทีละแถว; restore ให้ insert accounting ที่คำนวณแล้วในครั้งเดียว

### F6 — LOW · deadlock จากลำดับล็อกไม่ตรงกัน

- **ผลกระทบ:** ถ้าแก้เทรดพร้อมแนบรูปใหม่ ขณะที่อีกแท็บ/อุปกรณ์บันทึกเทรดในพอร์ตเดียวกันพร้อมกัน หนึ่งคำขอจะถูก PostgreSQL ยกเลิก (ผู้ใช้เห็น 503 แล้วต้องลองซ้ำ)
- **สถานะ:** reproduced locally โดยบังคับจังหวะด้วย session ที่สาม (R1 ได้ `["ok","P2010 40P01"]`)
- **ไฟล์:** `createTrade` ล็อก media ก่อนพอร์ต (`C:\Users\Admin\Downloads\FINNTECH\apps\api\src\tracker\service.ts:194-195`) แต่ `correctTrade` ล็อกพอร์ต (`:215`) แล้วค่อยล็อก media ผ่าน `linkReceipt` (`:229` → `C:\Users\Admin\Downloads\FINNTECH\apps\api\src\media\store.ts:18`); `correctStockTrade` เป็นแบบเดียวกัน (`C:\Users\Admin\Downloads\FINNTECH\apps\api\src\tracker\stock-ledger.ts:40,48` เทียบกับ `:27`)
- **แนวทางแก้:** เรียก `mediaLock(tx)` เป็นอย่างแรกใน `correctTrade` และ `correctStockTrade` ก่อนล็อกพอร์ต (ลำดับเดียวกับ create)

### F7 — LOW · ป้ายสถานะราคาหุ้นเป็น "ERROR" ทั้งที่ยังไม่ได้ตั้ง feed

- **สถานะ:** reproduced locally (UI แสดง "ราคา N/A USD ต่อหุ้น · Alpaca IEX · ERROR") · live inferred (release report ระบุว่า feed ไม่ได้ตั้งค่า)
- **ไฟล์:** `C:\Users\Admin\Downloads\FINNTECH\apps\web\src\tracker\valuationPolicy.ts:16` ใช้ `status==='UNAVAILABLE'` แปลเป็น `ERROR` โดยไม่ดู `connection==='NOT_CONFIGURED'`
- **แนวทางแก้:** แสดง "ยังไม่มี feed อัตโนมัติ · กรอกราคาเอง" (state `MISSING`/`NOT_CONFIGURED`) เมื่อ connection เป็น `NOT_CONFIGURED`; ใช้ `ERROR` เฉพาะกรณี provider ล้มจริง

### F8 — LOW · ยอดรวมแสดง "ข้อมูลยังไม่ครบ" ระหว่างโหลด

- **สถานะ:** reproduced locally (เปิดหน้า "สินทรัพย์รวม" บนมือถือ ก่อนโหลดเสร็จเห็น "N/A THB · ข้อมูลยังไม่ครบ · ราคา/อัตราไม่พร้อม" แล้วค่อยเปลี่ยนเป็น 3,500.00) — บน Render ที่ช้ากว่าจะเห็นนานขึ้น
- **ไฟล์:** `C:\Users\Admin\Downloads\FINNTECH\apps\web\src\tracker\Assets.tsx:82` (ไม่ดู `loading` ก่อนเลือกข้อความ)
- **แนวทางแก้:** แสดง "กำลังโหลด…" เมื่อ `loading && !mixed`

### F9 — LOW · ราคาคริปโต REST ไม่อัปเดตทั้งชุดเมื่อเหรียญเดียวล้ม

- **สถานะ:** reproduced locally (R4: BTC ตอบ 500 → ทั้ง 7 เหรียญไม่มีราคา)
- **ไฟล์:** `C:\Users\Admin\Downloads\FINNTECH\apps\api\src\tracker\crypto-stream.ts:74-83` (`throw` ใน loop ทำให้หยุดทั้ง loop)
- **แนวทางแก้:** จับ error ต่อสัญลักษณ์ ทำต่อกับเหรียญที่เหลือ และนับ failure แยก

### F10 — LOW · login หลังขอลบบัญชีได้ข้อความทั่วไปที่ทำให้สับสน

- **สถานะ:** HTTP reproduced locally (sign-in `200` แต่ `get-session` = `null`, เขียน `403 ACCOUNT_NOT_READY`); ข้อความ UI inferred จากโค้ด
- **ไฟล์:** `C:\Users\Admin\Downloads\FINNTECH\apps\web\src\App.tsx:128-131` แสดง "ยืนยันการเข้าสู่ระบบไม่ได้…" และตั้ง uncertain; `C:\Users\Admin\Downloads\FINNTECH\apps\api\src\auth\real.ts:98` ไม่ได้ปฏิเสธ sign-in ของบัญชีที่ `blocked` ก่อนสร้าง session
- **แนวทางแก้:** ใน real guard ให้ปฏิเสธ `/sign-in/email` ของบัญชีที่ enrollment `blocked` ด้วยรหัสเฉพาะ (เช่น `ACCOUNT_DELETION_PENDING`) โดยไม่สร้าง session และให้ UI แสดงข้อความที่บอกสถานะคำขอลบ

### ข้อสังเกต (ไม่ใช่บั๊กที่ยืนยัน)

- หน้า "สินทรัพย์รวม" โหลดใหม่ทุก 15 วินาทีและ `disabled` ปุ่ม/ช่องทั้งหมดชั่วคราว (วัดในเครื่อง ~100 ms ต่อรอบ) ยังไม่พบว่าทำให้ผู้ใช้กดพลาดได้จริง
- ระหว่างทดสอบ ราคา AAPL เคยถูกบันทึกเป็น 20,035 แต่**เกิดจากเครื่องมืออัตโนมัติพิมพ์เร็วกว่า React สลับฟอร์ม** ไม่ใช่บั๊กของแอป แก้ข้อมูลสังเคราะห์กลับแล้ว
- อัตรา ECB แสดงทศนิยม 18 ตำแหน่ง และวันอ้างอิงแบบรายวันแสดงเป็นเวลา 07:00 เป็นเรื่องการแสดงผลเท่านั้น

## ความปลอดภัย

- **Owner isolation:** PASS สำหรับรายการ, รูป (`media/objects`), attachment, correction ข้ามเจ้าของ (404) และ anonymous (401)
- **CSRF:** PASS เขียนด้วย Origin อื่นได้ 403; cookie `HttpOnly; SameSite=Lax` (password-mode integration)
- **Input validation:** Decimal string, scale และ UUID ผ่าน zod; ราคาอ้างอิงในอนาคตถูกปฏิเสธ
- **Secrets:** ไม่พบใน `apps/web/dist` และในหลักฐานของ audit นี้
- **`npm audit` 14 รายการ:** ทั้งหมดเป็นเครื่องมือ build/dev หรือ optional peer (`tailwindcss`/`micromatch`/`braces`, `vite`/`source-map-js`, `prisma` CLI/`deepmerge-ts`/`mysql2`, `gh-pages`) ซึ่ง `scripts/beta-runtime-dependencies.mjs` ตัด optional peer และ dev ออกจาก runtime image (`@prisma/client` ระบุ `prisma` เป็น optional peer; `better-auth` ระบุ `mysql2`/`vitest`/`prisma` เป็น optional) จึง**ไม่ถึงได้จากเบราว์เซอร์หรือ API ที่รันอยู่** ความเสี่ยงอยู่ที่เครื่องที่ build/รัน migration เท่านั้น
- **Rate limit:** ดู F1/F2 ซึ่งเป็นปัญหาด้าน availability มากกว่าการเจาะระบบ

## ข้อจำกัด

- ไม่ได้สร้างบัญชีหรือเขียนข้อมูลบน live; ความเท่ากันระหว่าง local กับ live อ้างจาก hash ของ asset และ source runtime ที่ตรงกันทุกไฟล์ ไม่ใช่การทดสอบบน live
- โหมด `real-rehearsal` ตั้ง `NODE_ENV=test` และ host 127.0.0.1 แทน `cloud-real`/Neon แต่ใช้ config path `config.real` และ `email-password` เดียวกัน
- เวลาที่วัดใน F5 เป็นของเครื่องนี้ ไม่ใช่ Neon/Render
- ทดสอบด้วยหลายบัญชีและหลาย HTTP session ในเครื่องเดียว ไม่ได้ใช้หลายอุปกรณ์จริง
- container (`claude-audit-portfolio`, `claude-audit-f14`, `claude-audit-rehearsal`), server :4199, ไฟล์รหัสผ่านชั่วคราว และแท็บเบราว์เซอร์ถูกหยุด/ลบแล้ว ข้อมูลสังเคราะห์อยู่บน tmpfs จึงหายไปพร้อม container ไม่ได้แตะ container/volume เดิมของเจ้าของ

**การเปลี่ยนแปลงระหว่าง audit:** ไม่ได้แก้โค้ดแอป, tests ที่ track ไว้, dependencies, schema, config บน Render หรือ live data; ไม่ได้ commit/push/deploy ไฟล์ที่เพิ่มมีเพียงรายงานนี้และโฟลเดอร์ `docs/acceptance/claude-bug-audit-20261009/`

## Implementation prompt (copy-ready)

```text
# FINNTECH: fix confirmed audit findings F1–F10 and deploy the personal Render service

Context: independent audit docs/acceptance/claude-bug-audit-20261009.md (evidence in
docs/acceptance/claude-bug-audit-20261009/). Production runs SABKUSRC69/finntech-beta branch
codex/student-real-use at 8058bb7 on Render service srv-db3pcll9fdbs73enrmg0 (Free), checkout
C:\Users\Admin\Downloads\FINNTECH\.student-real-20261008.local\release-source. Its runtime source is
identical to the owner's main checkout at C:\Users\Admin\Downloads\FINNTECH (main → SABKUSRC69/FINNTECH-V2).
Read AGENTS.md if present. Inspect git status in both checkouts first; preserve every owner change; never use
destructive checkout/reset/clean. Do not touch real user data. Keep secrets, cookies and private exports out
of Git, logs and evidence.

Fix, with focused regressions for each item:

F1 (HIGH) Shared Better Auth bucket: apps/api/src/auth/runtime.ts sets ipAddress.ipAddressHeaders=[] for
beta/real, so every client shares Better Auth's "no-trusted-ip" key and /sign-in, /sign-up allow only 3 per
10 s site-wide. Make rate limiting per client: in cloud-real only, trust the client IP that Render's proxy
supplies (X-Forwarded-For, configured so a client cannot spoof it past Render), or set rateLimit.customRules
for /sign-in/email and /sign-up/email to a sane global ceiling and rely on the existing per-email HMAC
buckets in apps/api/src/auth/real.ts. Revisit auth:global (60/min) consistently. Regression: four distinct
correct sign-ins within 10 s all succeed; repeated failures for one email are still throttled for that email.

F2 (MEDIUM-HIGH) apps/api/src/tracker/service.ts:62 uses one global 'writes:global' 120/min budget for all
owners. Add a per-owner budget (e.g. writes:owner:<ownerId>) and keep only a much higher global circuit
breaker. Regression: owner A exhausting its budget does not block owner B's first write; 429 copy explains
it is the user's own limit.

F3 (MEDIUM) Implement FINNTECH_CATEGORY_EMPTY_FIX_AND_DEPLOY_PROMPT_EN.md (already in the repo):
distinguish loading/error/no categories for the selected type with copy beside the selector, inline
creation that preserves amount/date/note/receipt, auto-select the new category when its type matches, and an
idempotent owner-scoped "เพิ่มหมวดหมู่พื้นฐาน" action. Root cause of draft loss: Dashboard.tsx send() clears
amount/note/quantity/price after every successful write (lines ~173-176); clear only the submitted form.

F4 (MEDIUM) Backup hard cap BACKUP_MAX_ROWS=2000 (packages/contracts/src/index.ts:217-218) makes export fail
permanently (413) for ordinary multi-year use. Raise row/byte limits to a documented multi-year budget
(e.g. 50,000 rows) with bounded memory, keep v1–v4 import compatibility, and ensure restore completes
within its transaction budget (see F5). Regression: 2,001+ rows export and round-trip.

F5 (MEDIUM/LOW) replayScope/replayStockScope update every trade row one by one on every write
(service.ts:174-182, stock-ledger.ts:12-19, backup.ts restore loops). Update only changed rows using a single
bulk statement; restore should insert precomputed accounting. Regression: timing smoke at ~2,000 trades
in one scope stays well under the 15 s transaction timeout; accounting results unchanged (Decimal exact).

F6 (LOW) Lock-order inversion: correctTrade/correctStockTrade lock the portfolio row and later take
mediaLock via linkReceipt, while createTrade/createStockTrade take mediaLock first. Take mediaLock(tx)
first in both correction paths. Regression: forced interleaving (third session holding the trade row) no
longer produces 40P01.

F7 (LOW) valuationPolicy.ts labels a NOT_CONFIGURED stock feed as 'ERROR'. Show a not-configured/manual
guidance state; reserve ERROR for real provider failures.

F8 (LOW) Assets.tsx shows "ข้อมูลยังไม่ครบ" before the first load completes; show a loading state.

F9 (LOW) crypto-stream.ts refresh(): one failing REST ticker aborts the loop; handle errors per symbol.

F10 (LOW) After an account deletion request, sign-in returns 200 and creates a session though get-session is
null; the UI shows a generic uncertainty message. Reject sign-in for blocked enrollments in the real guard
with a specific code, create no session, and show clear Thai copy about the pending deletion.

Do not add paid services, new external providers, or change DEMO. Keep idempotency, owner isolation, CSRF
Origin checks, Decimal rules and existing features intact. If a schema change is unavoidable, use a forward
migration only, rehearse it on an isolated synthetic PostgreSQL, and take/verify the existing encrypted
pre-migration backup before applying it to production.

Checks (record exact commands and exit codes): npm test; npm run build; npm run tracker:typecheck;
npm run tracker:test; npm run tracker:build; node --no-strip-types scripts/tracker-package-smoke.mjs;
git diff --check; the PostgreSQL suites assets.integration.ts, tracker:db:test and password-mode.integration.ts
on isolated synthetic containers; plus the new regressions above.

Release (owner-authorized; do not ask again): apply the scoped runtime changes in the isolated release
checkout (.student-real-20261008.local/release-source, branch codex/student-real-use), commit only the
intended runtime/test files, push to SABKUSRC69/finntech-beta, and deploy the existing personal Render
service srv-db3pcll9fdbs73enrmg0 using the current release process documented in
docs/acceptance/stock-valuation-20261009.md. Do NOT run root `npm run deploy` (legacy gh-pages). Mirror the
same changes to the owner's main checkout without disturbing unrelated work. After deploy verify: released
asset hashes match the isolated build, /api/health and /api/ready, and with synthetic accounts only: four
near-simultaneous sign-ins, cross-account write independence, empty-category guidance and inline creation
preserving the draft, transaction save → navigate → reload, stock reference valuation (0.5 × 200 USD × 35 =
3,500.00 THB) and missing-input N/A. Clean up synthetic accounts through supported flows. Save a sanitized
acceptance report under docs/acceptance/ with PASS/FAIL/NOT TESTED and remaining limits.
```
