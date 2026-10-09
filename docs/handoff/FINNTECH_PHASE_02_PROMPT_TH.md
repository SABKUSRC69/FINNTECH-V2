# พรอมป์ช่วง 2: UX และการนำทาง FINNTECH สำหรับใช้ในเครื่อง

คัดลอกข้อความหลังเส้นคั่นส่งให้ AI ผู้ลงมือทำ

---

ช่วง 1 ผ่าน review สำหรับ A/B/C แล้ว ให้เริ่มช่วง 2 ของ FINNTECH:
ปรับ UX/navigation และหน้าบัญชี/การดูแลข้อมูลให้ครบสำหรับเว็บ tracker ในเครื่อง
ส่งงานให้ review เมื่อจบช่วงนี้ ยังไม่ทำ account recovery runtime/backup scheduler/hosting

เป้าหมายเจ้าของ: ใช้ส่วนตัวในเครื่องก่อน แล้วเตรียมออนไลน์ภายหลัง
Repository เดิม `C:\Users\Admin\Downloads\FINNTECH`
เว็บหลัก `apps/web`, backend `apps/api`, shared `packages/`
ถ้าคุณไม่มี checkout/source ให้ขอไฟล์ก่อน ไม่สร้างผลตรวจที่ไม่ได้รัน

อ่านก่อนทำ:
- AGENTS.md ถ้ามี และ package.json
- docs/handoff/FINNTECH_PRODUCT_SPEC_TH.md
- docs/acceptance/phase1-independent-review-20261007.md
- docs/acceptance/phase1-review-20261007.md
- apps/web/src/App.tsx, index.css, presentation.tsx
- apps/web/src/tracker/Dashboard.tsx, Assets.tsx, Backup.tsx, StockPrices.tsx และ tests

Baseline ที่ review แล้ว: root 302 tests และ tracker 173 ตาม logs ของผู้ทำช่วง1;
ผู้ตรวจรัน focused3files72tests ผ่านเอง ไม่ได้ตรวจ browser/DB ใหม่
นี่เป็น baseline ไม่ใช่ expected count คงที่ ให้รายงานผลจริงของคุณ

## ขอบเขต A: Navigation ที่ใช้ได้ทั้ง desktop/mobile

1. Desktop: ต่อยอด sidebar เดิม เพิ่มหน้าบัญชี/ดูแลข้อมูล และแสดง active page ชัด
   ไม่ทำ redesign ทั้งระบบหรือเปลี่ยนสี/ฟอนต์โดยไม่มีเหตุผล
2. Mobile: bottom nav 4 จุด — “ภาพรวม”, “รายการ”, “พอร์ต”, “เพิ่มเติม”
   ภาพรวม→assets, รายการ→finance, พอร์ต→crypto
   เพิ่มเติมเปิด sheet/dialog ที่มีงบประมาณ สำรองข้อมูล บัญชี/ดูแลข้อมูล และราคาหุ้น
   หน้าเดิมทั้งหมดต้องยังเข้าถึงได้ หุ้นไม่พร้อมมี empty state ไม่เปิด provider ใหม่
3. เมื่ออยู่หน้ารองให้ “เพิ่มเติม” มีสถานะ active และชื่อหน้าปัจจุบันอ่านได้
   icon/ปุ่มมี accessible names ห้ามให้ nav ซ้ำจาก desktop/mobile ทำให้ keyboard tab ผ่านปุ่มที่ซ่อน
4. Sheet มี Escape/ปุ่มปิด/focus trap/คืน focus และ aria semantics ที่ถูกต้อง
   ปุ่ม “เพิ่มเติม” ใช้ aria-expanded; ถ้า sheet เปิดอยู่เมื่อ lock เกิด ห้ามเลือกหน้า/ออกจากระบบหลุด lock
5. การเข้าแต่ละหน้าผ่าน navigation guard เดียวกันที่ช่วง1แก้ไว้
   ไม่ bypass backupLocked/busy/pending/writing.current; กดเมนูเดิมไม่ล้าง message
   sheet ปิดได้โดยไม่ยกเลิก pending หรือเขียนข้อมูล การปิด sheet ไม่ใช่การเปลี่ยน section
6. คงหน้าเริ่มต้นและ write flows เดิมสำหรับช่วงนี้
   ยังไม่เพิ่ม router/deep-link dependency เพียงเพื่อเปลี่ยนเมนู

## ขอบเขต B: เก็บ UX หน้าหลักและสถานะต่าง ๆ

- ต่อยอด teal/light/dark/hide จาก CSS variables และ PresentationProvider เดิม
  theme/hide ยังอยู่ใน memory ไม่ย้ายไป localStorage หรือนำข้อมูลบัญชีมา persist
- หน้า assets แยกเงินสด/คริปโต/รวมประมาณและความไม่ครบให้เข้าใจ
  ไม่เติมยอดใหม่เมื่อ FX/market ไม่พร้อม ไม่ถือ missing เป็น0
- หน้า finance แสดงเดือน/รายรับ/รายจ่าย/คงเหลือเดือนและช่องบันทึกที่มีลำดับอ่านง่าย
  คงเหลือเดือนไม่ใช่ยอดธนาคาร และเงินสดไม่ได้เปลี่ยนตามรายรับรายจ่ายอัตโนมัติ
- งบประมาณมีป้ายคงเหลือ/เกินและหน่วย THB; งบไม่สร้าง transaction
- คริปโตใช้คำ “บันทึกประวัติซื้อ/ขาย” ให้ชัดว่าไม่ได้ส่งคำสั่ง
  คงฟอร์มแก้/ยกเลิกและคำยืนยันเดิม ไม่ปรับสูตร cost/P&L/replay
- ฟอร์มมี label/หน่วย/help/validation ที่อ่านได้ ไม่ใช้ placeholder แทน label
  ยังใช้ schema เดิมเป็น authority ไม่แก้ contract เพื่อให้อินพุตที่ invalid ผ่าน
- มี loading, empty, validation error, unavailable, stale, success,
  session expired และ unknown-outcome ตาม behavior จริงของแต่ละ flow
  ไม่สร้าง status ที่ไม่มีข้อมูล API รองรับ และไม่อ้างว่า connection200คือทุก feature พร้อม
- Resolved message ไม่ข้ามหน้า; pending/unknown outcome ยังเห็นและตรวจต่อได้
- รักษาค่าที่กรอก/เดือน/พอร์ตเมื่อสลับหน้าตาม behavior เดิม
  ถ้าพบว่าต้องป้องกันการสูญ draft ให้เลือกแนวทางจำกัด scope และอธิบายก่อน/หลัง
  ห้ามทำให้ปุ่มบันทึกของหน้าอื่นรับ draft ผิดชนิดหรือสร้าง write เองตอนเปลี่ยนหน้า
- ไม่เพิ่ม chart ตัวอย่าง/external fonts หรือ dependency เพื่อความสวย
  ไม่เพิ่ม search/filter/pagination ใหม่ที่ต้องแก้ API ในช่วงนี้

## ขอบเขต C: หน้าบัญชี/การดูแลข้อมูลแบบอ่านอย่างเดียว

เพิ่มหน้าที่เข้าได้จาก sidebar/เพิ่มเติม แสดง:
1. ชื่อผู้ใช้จาก authenticated state ปัจจุบัน
   readAccount คืน name เท่านั้น ห้ามแต่ง email/verified status/owner ID หรือเพิ่ม API เพียงเพื่อเติมหน้าจอ
2. ปุ่มออกจากระบบใช้ callback เดิมและ lock เดิม
3. ลิงก์ภายในไปสำรองข้อมูล และวิธีใช้เว็บในเครื่องเป็นข้อความสั้นสำหรับผู้ใช้
4. ขอบเขต JSON backup เทียบ full database backup โดยไม่ใส่คำสั่ง driver/secret ลง product flow
5. แจ้งว่าระบบกู้คืนบัญชี/ยืนยันอีเมลยังไม่เปิดในรุ่นที่ตรวจ
   ไม่ทำปุ่มใช้งานได้เสมือนมี backend แล้ว
6. แสดงสถานะเวอร์ชันทดลองในเครื่องและข้อความการติดตามเดิม
   อย่าเปลี่ยนเป็นพร้อมใช้ข้อมูลจริง/ออนไลน์จากงาน UX

ไม่เพิ่มการเปลี่ยนรหัสผ่าน เปลี่ยนอีเมล ลบบัญชี/ข้อมูล หรือระบบ admin ในช่วงนี้
ไม่เพิ่มข้อมูลส่วนตัวที่จำเป็นต้องขอเพิ่ม

## ขอบเขต D: Responsive/accessibility

- ตรวจ widths 320/390/768/1280/1440px และ light/dark
- ไม่มี horizontal overflow ของทั้งหน้า; ตารางกว้าง scroll เฉพาะพื้นที่ตารางได้
- bottom nav ไม่บังท้ายฟอร์ม ปุ่ม submit ข้อความ pending หรือ footer; รองรับ safe-area
- touch targets หลักอย่างน้อย44×44px; input mobile16px ขึ้นไป
- desktop/tablet layout ใช้ min-width:0/wrapping กับ decimal string ยาวอย่างเหมาะสม
  ไม่ตัดค่าจนความหมายผิด และไม่แปลงเป็น Number เพื่อทำให้ข้อความสั้น
- keyboard ใช้ได้ focus ชัด skip-to-content/heading order/reduced motion ยังคงทำงาน
- การซ่อนยอดคง N/A/input precision และไม่อ้างว่าเข้ารหัสหรือซ่อน Network/ไฟล์

## สิ่งที่อยู่นอกงานนี้และต้องรักษา

- ไม่แก้ backend/Auth/contracts/schema/migrations/Decimal/ledger/cost basis
- ไม่แก้ FXrelay/backoff หรือ stale threshold30s เพื่อทำให้ UX ดูดี
- ไม่ย้าย/รวมข้อมูล DEMO ไม่เพิ่ม wallet/เครดิต/ฝากถอน/execution
- ไม่ปรับ response-loss retry/payload/key หรือเปิด nav ระหว่าง pending
- ไม่ reset/drop/delete DB/volumes ไม่ใช้งานข้อมูลจริงเพื่อสร้าง screenshots
- ไม่เผย env/password/token/raw exports/HAR ในหลักฐาน
- ไม่เปลี่ยน dependency, commit/push/deploy หรือซื้อบริการ
- เคารพงาน uncommitted/untracked ที่มีอยู่

FX instrumentation/real-provider soak, saved browser file/credential scan,
configured DB/Auth runner lifecycle ยังค้างจากช่วง1 เป็นงานแยก
ไม่ต้องแก้ให้ครบเพื่อปิดช่วง2 และอย่าเปลี่ยนสถานะเป็น PASS จากการตรวจ layout

## วิธีดำเนินงานและเกณฑ์ตรวจรับ

1. เก็บ baseline เฉพาะไฟล์ที่เกี่ยวข้องก่อนแก้ และทำ incremental patch เทียบ baseline นี้
   อย่าใช้ git diff HEAD เป็น patch ทั้งช่วงเมื่อมีงานเจ้าของเดิมรวมอยู่
   สำเนา test ใน artifacts ใช้ชื่อที่ test discovery ไม่จับ เช่น .baseline.txt
2. ใช้ synthetic fixtures; browser ตรวจ compiled frontend ได้โดย mock routes
   แต่ต้องระบุว่าเป็น UI acceptance ไม่ใช่ database/Auth/provider acceptance
   หากใช้ PostgreSQL ต้องเป็น isolated target ที่ตรวจ guard แล้ว ห้ามแก้ฐาน owner
3. ทำ tests จำเป็นสำหรับ nav ทุกหน้าผ่าน mobileเพิ่มเติม, active states,
   locks/pending ผ่านทางเข้าใหม่, message lifetime และ theme/hide ไม่เปลี่ยน write
   ตรวจ focus/keyboard ใน browser จริงหรือ harness ที่รองรับ;
   อย่าอ้าง focus-trap PASS จาก jsdom/happy-dom assertions เพียงอย่างเดียว
4. ไม่ต้องคง tests ที่ผูก layoutเก่าแบบผิด semantics แต่เปลี่ยน assertion ได้เฉพาะ
   เมื่อ behavior UX ใหม่มีเหตุผลและมี coverage เทียบเท่าหรือดีกว่า
   ห้าม skip/ลด expected ผลการเงิน/idempotency/ownership เพื่อให้ tests ผ่าน
5. รัน npm test, npm run build, npm run tracker:typecheck,
   npm run tracker:test, npm run tracker:build,
   node --no-strip-types scripts/tracker-package-smoke.mjs และ git diff --check
   เก็บ exit code จริงกับ final-results แยกจาก attempts ที่ fail ไม่แก้ประวัติรอบแรก
6. Screenshot desktop/mobile light/dark, overflow widths, keyboard/sheet focus,
   pending state และ account screen; console errors summary โดยไม่มีข้อมูลจริง
   physical mobile ที่ไม่ทดสอบให้ NOT TESTED ไม่ใช้ viewport emulationแทน

## รายงานส่ง review

สร้าง docs/acceptance/phase2-review-20261007.md และ incremental .patch
ถ้าวันทำงานเปลี่ยนใช้วันที่จริง Asia/Bangkok
รายงานต้องมี:
- ไฟล์ที่เปลี่ยนและเหตุผล รวม untracked
- ก่อน/หลังของ navigation/UX และแผนที่เมนู desktop/mobile
- ผล tests/commands/counts/exit code และ logs รอบสุดท้าย
- Browser evidence ตาม width/theme/focus พร้อมข้อจำกัดของ environment
- ยืนยัน scope ว่า backend/ข้อมูล/guards เดิมไม่ได้ถูกแก้หรือ bypass
- งานค้าง แยก UXbug/environment limitation/owner decision/optional feature
- สถานะ L1/L2/O1: ไม่อ้าง complete เมื่อ gates อื่นยังค้าง

เริ่มลงมือช่วง2ได้เลย ทำ A/B/C/D ให้ครบแล้วหยุดส่ง review
อย่าเริ่มช่วง3โดยอัตโนมัติและอย่าอ้างว่าทั้งเว็บไซต์เสร็จจากงาน UX นี้

---
