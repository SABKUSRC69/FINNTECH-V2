# FINNTECH UI redesign: local acceptance

วันที่ 2026-10-05 — ปรับ UI จริงใน apps/web และตรวจด้วยข้อมูลสังเคราะห์
ไม่เปลี่ยน runtime API/Auth/Decimal/contracts/schema/dependencies หรือเอกสาร F1.1
ไม่มี broker execution, wallet, credits, deposit/withdrawal/QR, FX หรือ DEMO promotion

## สิ่งที่เปลี่ยน

- Sidebar บน desktop และ bottom navigation ห้าเมนูบนมือถือ ใช้ state/routes เดิม
  active menu มี aria-current/aria-pressed; มี keyboard focus และ skip-to-content
- ปรับ spacing, local Thai/system font, cards, controls และยอดสรุป THB
  เน้นคงเหลือจากรายรับหักรายจ่ายของเดือนที่เลือก ไม่เรียกยอดนี้ว่ายอดธนาคาร
- เพิ่ม light/dark และปุ่มซ่อนยอดใน React context เก็บเฉพาะใน memory
  reload กลับ light/แสดงยอด ไม่มีการอ่าน/เขียน localStorage บัญชีหรือ migrate ข้อมูล
- ซ่อน summary/history/budgets/crypto quantities/cost/prices/P&L/allocation,
  stock prices และยอด backup preview ผ่าน presentation ของ strings เท่านั้น
  N/A ยังเป็น N/A ไม่แปลงเป็นศูนย์และไม่ใส่ราคาจำลอง
- แจ้งเมื่อซ่อนยอดว่าช่องกรอก บันทึกช่วยจำ และไฟล์สำรองยังคงข้อมูลเดิม
  ไม่อ้างว่าการซ่อนนี้เข้ารหัสหรือกันผู้ที่เข้าถึง session/network/เครื่องได้
- ใช้ inline SVG/CSS ของโปรเจกต์ ไม่มี dependency หรือ external fonts/assets ใหม่
  รองรับ reduced motion; footer คงข้อความ “ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน”

summary ใช้ค่าจาก API เดิม ไม่สร้างกราฟตัวอย่างหรือสูตรการเงินใหม่
THB, USDT และ USD ยังแยกกัน การบันทึก/correction/void/preview/restore,
Origin/session ownership, Decimal strings และ unknown-outcome retry ใช้ logic เดิม

## ไฟล์ของงานนี้

สร้าง `apps/web/src/presentation.tsx`, `apps/web/src/presentation.test.tsx`
และเอกสารนี้; แก้ `apps/web/src/App.tsx`, `apps/web/src/index.css`,
`apps/web/src/tracker/Dashboard.tsx`, `StockPrices.tsx`, `Backup.tsx`
กับ `docs/acceptance/work-status.md`
ไฟล์ tests เดิมไม่ได้เปลี่ยน expectation หรือถูก skip

## Tests ที่เพิ่ม

6 cases ใน presentation.test.tsx ใช้ synthetic API doubles ไม่ใช่ DB acceptance:

1. Theme toggle ไม่ส่ง requests หรือเขียน localStorage
2. ซ่อน decimal strings ที่ยาวโดยคง N/A/input precision
3. Provider remount ไม่คง account/presentation state จากครั้งก่อน
4. THB totals/budgets ถูก mask, เดือนเดิมคงอยู่, navigation เปลี่ยน active state และไม่ส่ง write
5. Crypto quantity/cost/history ถูก mask; ราคาไม่พร้อมและ unrealized P&L ยัง N/A
6. เปิด hide แล้วยังบันทึก amount string `1.25`/THB/key ผ่าน write path เดิม

## ผลตรวจจริง

| Check | Result | หลักฐาน/ขอบเขต |
| --- | --- | --- |
| npm run tracker:typecheck | PASS exit0 | strict ทุก workspace; Node24.18.0 |
| npm run tracker:test | PASS exit0 | 155 cases: Finance16 / Contracts11 / API78 / Web50 รวมใหม่6 |
| Cold Vite optimizer smoke | PASS | อยู่ใน tracker:test; --force React DOM ESM ไม่มี raw require; คืน port4175 |
| npm run tracker:build | PASS exit0 บน host | Vite6.4.3; build CSS/JS ใหม่สำเร็จ |
| node --no-strip-types scripts/tracker-package-smoke.mjs | PASS exit0 | compiled Finance/Contracts, Decimal guards/arithmetic/ledger smoke เดิม |
| npm test | FAIL เดิม exit1 | 282 passed / 2 failed รวม284; allComponents และ spotTrading.integration สองกรณีเดิม |
| npm run build | PASS exit0 บน host | แอปเดิม build ได้; ไม่แก้ src เดิม |
| Browser default desktop1280 | PASS ในขอบเขตที่ตรวจ | sidebar sticky, layout/light/dark และไม่มี horizontal overflow |
| Browser viewport390/320 | PASS ในขอบเขตที่ตรวจ | nav fixed ทั้ง5เมนูใน viewport ไม่มี horizontal overflow; ไม่ใช่หลักฐานเครื่องมือถือจริง |
| Browser hide/navigation | PASS แบบ read-only | THB summary/budget/crypto holdings mask; input คงเดิม; backup controls เข้าได้; ไม่มี submit/write/upload/download |
| Browser console errors | PASS | captured error count0; ไม่ใช้แทน security/network acceptance ทั้งระบบ |
| Stock actual feed | NOT CONFIGURED / NOT TESTED | หน้าเดิมแสดง N/A; ไม่ตั้ง key/ส่งข้อมูลไป provider ใหม่ |
| Minimum Node22.12 / physical mobile / HTTPS / fresh login | NOT TESTED รอบนี้ | browser ใช้ session fixture ที่มีอยู่; Auth UI tests ไม่แทน browser login ใหม่ |
| PostgreSQL mutation/constraints/locks/restore | NOT TESTED รอบนี้ | ไม่เรียก Docker หรือรัน DB acceptance; ไม่มีหลักฐานใหม่ด้าน DB records |

เริ่ม Web tests และ builds ใน sandbox พบ module resolution failures
สำหรับ vitest/config, vite และ root build พบ EPERM realpath ของ src/main.jsx
รันคำสั่งเดิมบน host ด้วย dependencies เดิมจึงผ่าน ยกเว้นสอง root assertions เดิม
ไม่อ้างว่า sandbox failures เป็น code failures หรือแก้ assertion เพื่อกลบผล

## วิธีดู/รันและทดสอบ

Dev runner เดิมเปิดอยู่: http://127.0.0.1:4173/; proxy ไป API loopback4174
ตรวจ browser จริงวันที่ 2026-10-05 ช่วง21:07–21:13 น. Asia/Bangkok
HMR โหลด source ใหม่ ไม่ restart backend/container หรือเปลี่ยน env
เมื่อกลับมาใช้เครื่องให้เปิด URL นี้; ถ้า runner หยุดให้ใช้ `npm run tracker:dev`
ตามคู่มือเดิมและหยุดเฉพาะ runner ของตนด้วย q/Ctrl+C
ไม่มีคำสั่งที่เจ้าของต้องรันเพื่อให้งาน UI รอบนี้เสร็จ

คำสั่งตรวจซ้ำ: tracker:typecheck, tracker:test, tracker:build,
compiled package smoke ข้างต้น, npm test, npm run build และ git diff --check
full logs เก็บใน evidence; root tests เก็บเฉพาะ sanitized summary
ไม่ให้ผู้ใช้เปิด production/data จริงเพื่อทดสอบหน้าตา

## Preservation และ evidence

`C:\Users\Admin\Downloads\FINNTECH\.ui-redesign-20261005-205334.local\`
เก็บ before.json/after.json/comparison.json, incremental changes.patch รวม untracked,
complete-files.md, logs และ desktop/mobile JPG ของ synthetic account เท่านั้น
ไม่รวม env contents, credentials, cookies หรือ DB dump

baseline ก่อน187 paths/SHA-256 รวมไฟล์ untracked nonignored และ known local env ถ้ามี
เทียบหลังงานตาม report โดยไม่อ้างว่า git status อย่างเดียวพิสูจน์ source คงเดิม
generated ignored build artifacts/dependency trees ไม่อยู่ใน inventory
ไม่ได้ snapshot DB rows จึงไม่รายงาน database checksums ว่าคงเดิมจาก file manifests
ตรวจ trailing whitespace ของ task files แยก เพราะ git diff ไม่รวม untracked files

## สิ่งที่ยังเหลือ

UI ใหม่ผ่าน local checks ที่ระบุ แต่ไม่ปิด R02–R13 ที่ค้างอยู่
account recovery/retention ยังเป็นแผน, off-device backup/mail ยังไม่เลือก,
actual stock provider ยังไม่ตั้ง, root failures2ยังอยู่ และไม่มี production deploy
หน้าเว็บไม่ได้รับ email recovery/delete features เพียงเพราะเปลี่ยนดีไซน์
