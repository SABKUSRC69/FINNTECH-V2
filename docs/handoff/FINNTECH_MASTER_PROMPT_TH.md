# พรอมป์หลัก: พัฒนา FINNTECH ให้ครบสำหรับใช้ส่วนตัวในเครื่อง

คัดลอกตั้งแต่บรรทัดถัดไปส่งให้ AI ที่เข้าถึง repository ได้

---

คุณเป็น AI ผู้ลงมือพัฒนา FINNTECH ต่อจากโครงการที่มีอยู่ ทำหน้าที่ implement
และตรวจงานจริง ส่วนผมเป็นเจ้าของผลิตภัณฑ์และจะให้ AI ผู้ตรวจอีกตัวทบทวนผล
เป้าหมายที่ผมยืนยันคือ **ใช้ส่วนตัวในเครื่องก่อน แล้วเตรียมเปิดออนไลน์ภายหลัง**
ดำเนินงานเป็นช่วงที่ review ได้ เริ่มช่วง 1 ให้เสร็จก่อนส่งรายงาน อย่าสรุปว่าเสร็จทั้งเว็บ
เพียงเพราะ build/tests ผ่าน และอย่าเริ่มเขียนใหม่ทับระบบที่มีแล้ว

## บริบทและขอบเขต

Repository บนเครื่องเดิม: `C:\Users\Admin\Downloads\FINNTECH`
หากคุณอยู่ environment อื่นให้ใช้ checkout ที่มีไฟล์ชุดเดียวกัน
ถ้าไม่มี source ให้แจ้งไฟล์ที่ต้องใช้ก่อน ห้ามแต่งผลตรวจหรือสร้างคำตอบเหมือนลงมือแล้ว

เว็บหลักคือ tracker: `apps/web`, `apps/api`, `packages/contracts`, `packages/finance`
Stack เดิม React/Vite/TypeScript/Tailwind, Express/ws, Better Auth, Prisma/PostgreSQL,
Zod และ Decimal ใช้ implementation ปัจจุบันเป็นฐานและตรวจ API/library version ที่ติดตั้งก่อนใช้
เว็บ `src/` เป็น legacy ซึ่งยังมี root regression ที่ต้องแก้เฉพาะจุด

อ่านก่อนทำ:
- `AGENTS.md` ที่ใช้กับ checkout ถ้ามี
- `docs/handoff/FINNTECH_PRODUCT_SPEC_TH.md`
- `docs/acceptance/website-status-20261007.md`
- `docs/acceptance/work-status.md` และ `docs/acceptance/core-features.md`
- decision009/010/011 และ operations เรื่อง PostgreSQL backup/retention ที่อ้างใน spec
- `package.json` ของ root/workspaces และ source จริงของ flow ที่แก้

ผล audit ก่อนหน้าวันที่ 2026-10-07: tracker tests 170 ผ่าน, root tests 297 ผ่าน/2 fail,
root/tracker build และ tracker typecheck ผ่านตาม output
ตอนเปิด local4173 ได้ connection refused; ห้ามยืมสถานะนี้เป็นผล environment ของคุณ
ตรวจใหม่เฉพาะที่จำเป็นและเก็บ exit codeจริง; counts นี้เป็น baseline ไม่ใช่ expected คงที่

## หลักผลิตภัณฑ์และข้อมูลที่ต้องรักษา

1. เป็น tracker บันทึกด้วยมือ ไม่ส่งคำสั่งซื้อขาย ไม่เชื่อม private exchange/bank,
   ไม่เพิ่ม wallet/เครดิต/ฝากถอน/QR และไม่ย้าย DEMO เป็นบัญชีหรือรายการจริง
2. Finance/budget/cash ใช้ THB; crypto ledger/cost/P&L ใช้ USDT แยกพอร์ต
   หุ้น watchlist เป็น USD แยก ไม่ใช่ holdings อัตรา USDT_THB ใช้เทียบมูลค่าโดยประมาณ
   ตาม decision011 ไม่ตี USDT=USD และไม่เปลี่ยน cost basis เป็น THB
3. Money/quantity เป็น decimal strings ตาม contracts, คำนวณด้วย Decimal,
   ไม่ใช้ Number/parseFloat กับ ledger และไม่อ่านค่าปัดเพื่อแสดงผลกลับไปคำนวณ
4. ทุก record ดึง owner จาก authenticated server session ไม่รับ owner override จาก client
   รักษา audit/history/correction/replay/constraints และ idempotency เดิม
5. ราคาเกิน 30 วินาทีหรือ invalid ไม่ใช้คำนวณปัจจุบัน; ห้ามใส่ราคาหรือข่าวจำลอง
   และห้ามเพิ่ม stale threshold หรือเลื่อน timestamp เพื่อทำให้สถานะดูสด
6. หลัง write timeout อาจ commit แล้ว ให้ตรวจผล/ลอง payload+key เดิม
   ห้าม auto-resubmit ด้วย key ใหม่ อ้าง rollback หรือล้าง pending เพื่อให้กดซ้ำ
7. เก็บข้อมูลเดิมและงาน uncommitted/untracked ของเจ้าของ; ห้าม reset/drop/truncate
   ลบ volumes หรือใช้ฐานจริงทำ destructive tests ใช้ isolated synthetic DB พร้อม target guard
8. ไม่แสดง secret/password/session token/raw backup/PII ใน chat/logs/screenshots
   secret อยู่ server environment; ไม่ใส่ใน frontend/VITE_*/Git และไม่ขอให้ส่ง key ผ่านแชต
9. รักษา Paper Trading legacy ที่ถูกพักไว้ ไม่เปิดเพื่อแก้ test

## ลำดับงานที่ให้ทำ

### ช่วง 1 — แก้ปัญหาที่พิสูจน์แล้วและยืนยัน baseline

- บันทึก branch/SHA/status และขอบเขต tracked/untracked ก่อนแก้ โดยไม่ dump secrets
- แก้ `src/components/trading/PositionsTable.jsx` ให้รับ/ใช้ `orderRulesVerified`
  ซึ่ง TradingTerminal ส่งอยู่แล้ว ข้อความ empty orders ต้องตรงกับสถานะพัก/พร้อม
  ทำสอง tests ที่ fail ให้ผ่านด้วย behavior จริง ไม่ skip หรือลด assertion
- แก้ message lifetime ใน `apps/web/src/tracker/Dashboard.tsx`
  ข้อความสำเร็จ/validation ของเมนูเดิมไม่ติดไปเมนูใหม่; pending/unknown outcome ยังตรวจต่อได้
  สลับหน้าอย่างเดียวต้องไม่สร้าง write หรือทำ payload/key เปลี่ยน
- ทำคู่มือเริ่ม tracker ให้ชัดเจน แยกจาก legacy และแยก current status จากเอกสารประวัติ
  ไม่เปลี่ยน deploy target หรือสลับ root scripts ที่เจ้าของใช้โดยไม่จำเป็น
- ตรวจ FX/download/runner เป็นสามงานวิเคราะห์ มี reproduction/evidence แยก
  หากยังไม่พบสาเหตุอย่าแก้แบบเดา; ทำเฉพาะ fix ที่สาเหตุพิสูจน์แล้วและอยู่ scope ช่วงนี้
- รัน checks เหมาะกับ change และจบด้วยรายงานช่วง 1 ตามรูปแบบท้ายพรอมป์

### ช่วง 2 — UX ของเว็บหลักให้ครบตาม spec

ทำต่อเมื่อผลช่วง 1 ได้รับ review; ใช้ spec เป็นเกณฑ์และไม่ทำ redesign ใหม่ทั้งระบบ
ต่อยอดภาพรวม/รายการ/งบ/พอร์ต/backup เพิ่มบัญชีและคู่มือดูแลข้อมูลให้เข้าถึงได้
Desktop sidebar; mobile4เมนู+เพิ่มเติม; ทุกหน้าเข้าได้ ไม่มี horizontal page overflow
มี empty/loading/error/stale/session-expired/unknown-outcome states, labels/หน่วย/validation
keyboard/focus/accessible names, responsive และข้อความไทยที่ตรงความหมายการเงิน
อย่าเพิ่ม API หรือเงินจำลองเพื่อให้ภาพเต็ม; อย่ารวม wallet/ยอดคงเหลือเดือน/เงินสดผิดความหมาย
tests ต้องครอบคลุมพฤติกรรมที่เสี่ยงจริง ไม่ทดสอบ mirror markup เพียงเพื่อเพิ่มจำนวน

### ช่วง 3 — บัญชีและพื้นที่ข้อมูลส่วนตัว

ทำตาม decision010 ตรวจ installed Better Auth/source และ official docs ก่อนเรียก options/API
สร้าง recovery/verification flow ด้วย auth เดิมและ local mail sink เพื่อทดสอบ
ไม่ใช้ sink กับบัญชีจริงหรือเปิด route recovery ที่คืน token ให้ browser/log
ทดสอบ expiry/replay/account-enumeration/origin/redirect/password policy/session revocation
รวม fault injection ใน PostgreSQL adapter จริงก่อนอ้างว่าปลอด partial failure
ค่าอายุ token/rollout ที่เอกสารเขียนว่าเสนอ ต้องบันทึกและขอคำตัดสินจากเจ้าของก่อน activate จริง
ออกแบบ env/DB/volume ของข้อมูลจริงแยก synthetic แต่ยังไม่ย้ายหรือกรอกข้อมูลจริงให้เจ้าของ
ถ้าช่องทาง recovery จริงยังไม่เลือก ให้ทำส่วน local test ที่ไม่ขึ้นกับ provider ต่อได้
รายงาน gate ที่ยังค้างอย่างเจาะจง ไม่แสดงปุ่มลืมรหัสผ่านที่ใช้งานไม่ได้เสมือนพร้อม

### ช่วง 4 — Backup/restore และการดูแลเครื่อง

ต่อยอด encrypted full PostgreSQL backup/archive restore scripts เดิม
ตรวจ JSON download เป็นไฟล์จริง, v1/v2 preview/restore/consent/empty-target/idempotent retry
ตรวจ full DB restore ใน isolated target โดยไม่แก้ source DB; readback/aggregates/schema ต้องตรง
ระบุข้อจำกัด DPAPI CurrentUser และออกแบบ key custody/กู้เมื่อเครื่องหรือ profile เสีย
ทำ configuration/runbook สำหรับ backup schedule, retention, secondary storage และ failure alerts
ขอคำตัดสินค่าที่ต้องขึ้นกับเจ้าของก่อนเปิด scheduler/ส่งสำเนาภายนอก/ลบ backup ใด ๆ
สำหรับ L2 ต้องมีวิธีกู้จากสำเนาที่ไม่หายพร้อมเครื่องหลัก โดยเลือกวิธีที่เหมาะกับเจ้าของ
ยังไม่ซื้อบริการ ไม่ส่งข้อมูลจริงไป cloud และไม่ลบข้อมูล/backup อัตโนมัติจาก defaults ที่เดา
ทำขั้นตอน retention/deletion/rotation ตาม policy ที่อนุมัติ; design READY ไม่เท่ากับ runtime DONE

### ช่วง 5 — ตรวจรับ local และเตรียมออนไลน์

ทบทวน dependency advisories โดยส่งเฉพาะชื่อ/เวอร์ชันแพ็กเกจไป official npm registry
ไม่ส่ง source, env หรือข้อมูลผู้ใช้; แยก runtime/dev/legacy และอัปเดตเฉพาะที่มีเหตุผล
ทำ checklist L1/L2, start/stop/health/lifecycle และ runbook ที่ผู้ใช้ทำตามได้
เตรียม online config/hosting requirements/HTTPS/proxy/cookie/WS/rate limit/monitoring/rollback
แต่ไม่ซื้อบริการ ไม่เปิด public exposure และไม่ deploy จนเจ้าของระบุ target และอนุญาต
อย่านับการเตรียม config ว่า O1 ผ่าน ต้องทดสอบบน target จริงภายหลัง

หุ้น holdings/P&L, ข่าว/calendar, legacy importer และ exchange execution ไม่อยู่ local core
ไม่ต้องรอสิ่งเหล่านี้เพื่อปิด L1 ให้ระบุเป็น optional roadmap แยก

## วิธีทำงานและการทดสอบ

- งานหนึ่งช่วงต้องมี diff ที่ review ได้; แยก refactor ใหญ่จาก fix
  ไม่ commit/push/deploy ในพรอมป์นี้ เว้นแต่ผมสั่งเพิ่มโดยชัดเจน
- ทำงานที่ไม่ติด input ต่อได้ ถามเฉพาะการตัดสินที่มีผลจริง เช่น provider/storage/policy
  รวมคำถามที่เกี่ยวข้องและบอกว่าข้อมูลนั้นขวางส่วนไหน ห้ามถามอนุญาตทุก routine edit
- ถ้า sandbox/network/permission ทำให้ checks ล้ม ให้แยก environment failure
  ขอ escalation ตามเครื่องมือ; ห้าม bypass และอย่านับเป็น product bug โดยไม่มีหลักฐาน
- คำสั่งตรวจพื้นฐาน: `npm test`, `npm run build`, `npm run tracker:typecheck`,
  `npm run tracker:test`, `npm run tracker:build`,
  `node --no-strip-types scripts/tracker-package-smoke.mjs`, `git diff --check`
  ใช้ชุดที่สัมพันธ์กับ change และตรวจชุดเกี่ยวข้องครบก่อนจบช่วง
- Database/Auth integration ใช้ `tracker:db:test`/`tracker:auth:test` ตาม target guards
  และ isolated configuration ที่อ่านแล้วเท่านั้น ไม่เรียก reset/migrate บน DB owner โดยเดา
- Browser/DB/provider tests ต้องเป็น runtime จริงใน synthetic scope
  สำหรับ fault tests ใช้ mocks ได้ แต่ห้ามรายงานว่าแทน provider/DB acceptance จริง
- ไม่เก็บ HAR/raw exports หรือรูปที่มีข้อมูลจริงเป็นหลักฐาน; ใช้ synthetic และ summary/redaction
- Physical mobile/online/provider ที่ทดสอบไม่ได้ให้ NOT TESTED พร้อมวิธีทดสอบที่เหลือ

## รูปแบบส่งงานทุกช่วง

1. ช่วงที่ทำและผลที่เปลี่ยนสำหรับผู้ใช้
2. ไฟล์ที่แก้และเหตุผล พร้อม diff/patch ที่ผู้ตรวจอ่านได้ รวม untracked ที่สร้าง
3. ปัญหาแต่ละข้อ: สาเหตุ หลักฐานก่อนแก้ behavior หลังแก้ ข้อจำกัด
4. Checks: คำสั่ง จำนวน tests จริง exit code และ PASS/FAIL/NOT TESTED
5. Browser/DB evidence ที่ไม่เปิดเผยข้อมูลลับ และผลว่าข้อมูล owner เดิมคงอยู่ตาม scope
6. สิ่งที่ยังเหลือ แยก bug, environment limitation, owner decision และ optional feature
7. สถานะ L1/L2/O1 ตาม spec โดยไม่ให้เปอร์เซ็นต์เดา
8. ข้อเสนอช่วงถัดไป พร้อม dependencies ที่ต้องตัดสิน; หยุดที่จุดส่ง review ของช่วงนี้

**เริ่มลงมือช่วง 1 ตอนนี้ ให้จบครบ scope แล้วส่งผลจริงตามรูปแบบข้างต้น**

---
