# พรอมป์งานแรก: แก้ regression และข้อความ UI ของ FINNTECH

คัดลอกพรอมป์ด้านล่างส่งให้ AI ผู้ลงมือทำได้โดยตรง

---

ช่วยลงมือแก้ FINNTECH ใน repository ที่มีอยู่ เป้าหมายคือเว็บ tracker สำหรับใช้ส่วนตัว
ในเครื่องก่อน แล้วเตรียมออนไลน์ภายหลัง งานรอบนี้จำกัดเฉพาะ regression และ UX ที่พิสูจน์แล้ว
อย่าเริ่มเขียนเว็บไซต์ใหม่ และยังไม่ทำ Auth recovery/backup scheduler/hosting

Repository เดิม `C:\Users\Admin\Downloads\FINNTECH`
เว็บหลัก: `apps/web` + `apps/api` + `packages/`
เว็บเดิม: `src/` ซึ่งยังมี tests เกี่ยวกับ Paper Trading ที่ต้องแก้เฉพาะข้อความ
อ่าน `AGENTS.md` ถ้ามี, `package.json`, `docs/handoff/FINNTECH_PRODUCT_SPEC_TH.md`,
`docs/acceptance/website-status-20261007.md` และ source/tests ที่เกี่ยวข้องก่อนแก้
หากไม่มีไฟล์ repo ให้แจ้งสิ่งที่ต้องการ ห้ามแต่งผลการรัน

Baseline จาก audit วันที่ 2026-10-07: tracker 170 tests ผ่าน; root 297 ผ่าน / 2 fail;
build ทั้งสองชุดและ tracker typecheck ผ่านตาม output นี่เป็นข้อมูลก่อนหน้า ให้ตรวจสถานะใน checkout ของคุณ
working tree มีงานเจ้าของและ untracked จำนวนมาก ห้าม reset/delete/overwrite งานเดิม

งาน A: ข้อความสถานะ Paper Trading

- `src/components/trading/TradingTerminal.jsx` ส่ง `orderRulesVerified` ให้ PositionsTable อยู่แล้ว
  แต่ `src/components/trading/PositionsTable.jsx` ไม่รับค่านี้
- เมื่อไม่มี open orders component ยังบอกว่าสามารถตั้ง Limit ล่วงหน้าได้
  ทั้งที่คำสั่งถูกพักอยู่ เป็นสาเหตุที่สอง cases ใน `allComponents.test.jsx`
  และ `spotTrading.integration.test.jsx` ล้มเหลว
- แก้ให้ component รับและใช้สถานะจริง ถ้าไม่ verified ให้ข้อความตรงตามข้อกำหนดเดิม:
  “ไม่มีคำสั่งรอจับคู่ในขณะนี้ — คำสั่ง PAPER พักอยู่ จึงยังตั้ง Limit ใหม่ไม่ได้”
- กรณี verified ต้องยังแสดงข้อความที่ตรงกับ behavior ของระบบ ตรวจ cases ที่เกี่ยวข้อง
  อย่าเปิด Market/Limit หรือแก้ tests ให้ยอมรับข้อความที่ขัดสถานะ

งาน B: ข้อความแจ้งผลค้างข้ามเมนู

- ใน `apps/web/src/tracker/Dashboard.tsx`, message เป็น state ร่วม
  ปุ่มเมนูเรียก setSection อย่างเดียวและ render message นอก section
- แก้ resolved success/validation ให้ผูกกับงาน/หน้าที่เกี่ยวข้อง
  เมื่อเปลี่ยนเมนูต้องไม่เห็นข้อความบันทึกสำเร็จหรือขายเกินของหน้าก่อน
- เก็บ pending/unknown-outcome warning จนตรวจผลครบ และรักษา nav/write locks เดิม
  ห้ามล้าง key/payload หรือทำให้ timeout ถูกตีความว่า rollback
- ทำ regression test ที่จำเป็น: resolved message ไม่ข้ามหน้า, pending ยังตรวจต่อได้,
  navigation ไม่สร้าง write, payload+idempotency key ของการตรวจซ้ำยังเดิม
  ยึด behavior เดิมที่ห้ามเปลี่ยนเมนูระหว่าง pending; ไม่เพิ่มการ unlock เพื่อให้ test ผ่าน

งาน C: ทำ start guide ให้ผู้ใช้รู้ว่าเปิดเว็บชุดไหน

- ปรับส่วนเริ่มต้น README ให้ใช้ `npm run tracker:dev` สำหรับเว็บหลัก
  web `http://127.0.0.1:4173/`, API4174 ตาม configuration ปัจจุบัน
  ระบุ environment prerequisites และวิธี q/Ctrl+C ที่ตรวจได้
- แยกวิธีเปิด legacy ด้วย npm run dev และข้อมูลเอกสาร historical
  แก้ข้อความ current status ที่ขัดกับ persistence/schema ปัจจุบัน โดยไม่ลบประวัติ ADR
- อย่าเปลี่ยน deploy scripts/target หรือทำให้ root scripts เก่าหายไป

งาน D: วิเคราะห์และส่งหลักฐานสำหรับงานถัดไป

1. FX: อ่าน `apps/api/src/tracker/fx.ts`, ฝั่ง client/marketFreshness และ `fx.test.ts`
   ตรวจสาเหตุที่อัตราไม่สด: metadata/ticker schema, refresh cadence, timeout/backoff
   และ frontend trigger แยก provider/network failure ออกจาก code defect
2. Backup download: อ่าน flow export/blob/anchor ของ `apps/web/src/tracker/Backup.tsx`
   ตรวจด้วย synthetic account/isolated runtime เท่านั้นว่าได้ไฟล์จริง parse ได้
   มีข้อมูล v2 ถูกต้องและไม่มี credentials อย่าเขียนทับบัญชีที่มีข้อมูล
3. runner lifecycle: ตรวจ start/stop/health/ports/logs ของ runner ที่คุณเริ่มเอง
   อย่าฆ่า process เจ้าของ; connection refused จากบริการไม่ได้เปิดไม่ใช่ข้อพิสูจน์ code bug

งาน D เป็นการวิเคราะห์ หากไม่มีสาเหตุที่ยืนยันให้ NOT TESTED/UNCONFIRMED พร้อมเหตุผล
อย่าเปลี่ยน provider/schema/stale threshold หรือทำ refactor ใหญ่ในงานนี้
กรณีพบ fix ที่ชัด ให้รายงาน patch ที่เสนอแยกเพื่อส่ง review งานถัดไป

ข้อจำกัดข้อมูลและระบบ

- Finance THB และ crypto USDT ใช้ decimal strings/Decimal ตาม contract เดิม
- รักษา ownership/session/ledger/audit/idempotency และ history เดิม
- ราคา/อัตราเกิน30s ไม่ใช้คำนวณ ห้ามใส่ราคา fallback หรือเลื่อน timestamp
- ไม่มีการเทรดจริง ฝากถอนหรือเครดิต ไม่ย้าย DEMO เป็นข้อมูลจริง
- เก็บ source/ข้อมูลเดิม; ไม่ reset/drop/truncate/delete DB หรือ volumes
- secrets server-only ไม่พิมพ์ env/password/token/raw export/HAR ลงรายงาน
- งานทดสอบ write ใช้ isolated synthetic target ที่ตรวจ guard แล้วเท่านั้น
- ไม่ commit/push/deploy/ซื้อบริการ/เปลี่ยน dependency ในงานรอบนี้

การตรวจรับ

รัน checks ที่สัมพันธ์กับ change และจบด้วย `npm test`, `npm run build`,
`npm run tracker:typecheck`, `npm run tracker:test`, `npm run tracker:build`,
`node --no-strip-types scripts/tracker-package-smoke.mjs`, `git diff --check`
root suite ต้องไม่เหลือสอง failures เดิมจากข้อความ PositionsTable
tracker suite ต้องไม่เพิ่ม regressions; อย่าอ้าง countเดิมถ้ายังไม่ได้รัน
หาก environment ทำให้ไม่สามารถรัน ให้แยกข้อจำกัดจาก code bugและแนบ error summary
เก็บ exit code และ output สำคัญ ไม่ใช้ภาพ “ผ่าน” โดยไม่มีคำสั่ง/ผลจริง

ส่งกลับ:
1. ไฟล์ที่เปลี่ยนและ diff/patch ที่ตรวจได้ รวมไฟล์ใหม่
2. สาเหตุและผลก่อน/หลังของงาน A/B/C
3. ผลวิเคราะห์ D ทั้งสามข้อ พร้อมข้อไหนยังไม่ยืนยัน
4. ตารางคำสั่ง/exit code/test counts/PASS-FAIL-NOT TESTED
5. หลักฐาน browser/DB ที่มีจริงและไม่เปิดเผยข้อมูลส่วนตัว
6. งานค้างและข้อเสนอ scope รอบถัดไป

เริ่มลงมือได้เลย ทำ A/B/C ให้จบ แล้วส่งรายงานพร้อม D เพื่อให้ AI ผู้ตรวจทบทวน
อย่าเปลี่ยน tests ด้วยการ skip หรือลด expectation และอย่าอ้างว่าเสร็จทั้งเว็บไซต์จากรอบนี้

---
