# ตรวจรับสินทรัพย์รวมและสัดส่วนรายจ่าย

2026-10-05 · ข้อมูลสังเคราะห์เท่านั้น · หลักฐาน `.assets-review-20261005.local/`

| Check | ผล | หลักฐาน |
| --- | --- | --- |
| Finance percentages, cancelled exclusion, zero denominator, rounding/overflow, two portfolios, missing rate/price | PASS unit | Finance21 tests (analytics5ใหม่) |
| Cash strict decimal/date/ownership body rejection; backup v1/v2 whitelist | PASS unit | Contracts13 tests (assets2ใหม่) |
| HTTP owner/origin, owner-scoped read, optimistic update; FX pair/age/failure/concurrency; backup cash summary | PASS unit | API83 tests (cash2/fx2/backup1ใหม่); doubles ไม่แทน PostgreSQL |
| UI40% expense example, invalid cash overscale, lost response retry/key, local expiry | PASS unit | Web52 tests (assets1/expense1ใหม่) |
| Prisma validate/generate, tracker typecheck/build, compiled package smoke without type stripping | PASS | prisma-validate.log, typecheck-final.log, tracker-build-host.log, compiled-smoke.log |
| Cold Vite optimization/ESM and process cleanup | PASS | ท้าย tracker-test-host.log; ไม่พึ่ง cache เดิม |
| PostgreSQL actual forward migration/checksums, NUMERIC maximum/0.1, constraints/ownership, concurrent writes/rollback | PASS | runtime.json/runtime.log; PostgreSQL16.15 synthetic local5436 |
| v2 cash backup/readback/restore/idempotent receipt/nonempty target; v1 compatible empty cash | PASS PostgreSQL | runtime.json; fixtures ใหม่แยกเจ้าของ ไม่ reset หรือลบ volume |
| Public USDT_THB actual metadata/ticker | PASS ณเวลาตรวจ | runtime.json, source Bitkub public, receivedAt2026-10-05T15:00:06.853Z rate33.63; ไม่ใช่ราคา ณเวลาที่อ่านเอกสาร |
| Web/API URLs through same-origin | PASS | http-checks.log; web4173, API4174; health Auth not_checked ไม่ใช้ยืนยัน login |
| Browser synthetic cash add/edit/persist, two portfolios, expense breakdown, mobile/dark/privacy | PASS | browser-results.json, assets-desktop.png, assets-mobile-dark-hidden.png; เพิ่ม0.10/แก้0.20THBแล้วreloadยังคงอยู่; รายจ่ายเดือนเดิม0.10THBไม่เปลี่ยน; 390/320pxไม่ล้น; errorsหลังrestart0; ใช้บัญชี E2E เดิมที่เป็น fixture |
| npm test แอปเดิม | FAIL สองเดิม | root-test-summary.log: 296passed/2failed; allComponents.test.jsx และ spotTrading.integration.test.jsx ไม่แก้/ข้าม |
| npm run build แอปเดิม | PASS host | root-build-host.log; sandbox EPERM แยก root-build-sandbox.log |
| Sandbox tracker tests/build | environment failure | Vite resolve module ไม่ได้; tracker-test-sandbox.log/tracker-build-sandbox.log; host rerun ผ่าน assertions เดิม |
| Node22.12, physical phone, production HTTPS, true provider outage/recovery browser | NOT TESTED | ไม่ยืม unit/desktopผลมาอ้าง |

## ตัวอย่างที่ตรวจ

- รายจ่ายอาหาร4000 + บ้าน6000 → รวม10000THB; อาหาร40%, บ้าน60%; income/รายการยกเลิกไม่อยู่ในตัวหาร
- เงินสด100.10THB + BTCสองพอร์ต0.00000001และ0.1 ที่60000USDT/BTC และ33.62THB/USDT → รวม201820.12THB (ปัดแต่ละ holding HALF_EVEN)
- FX/ราคา unavailable หรือ >30s → holding/รวม N/A; cashยังแสดงตามที่บันทึก ไม่ยกต้นทุนซื้อมาแทน ไม่มี FXpeg1:1
- same key+payloadคืนreceiptเดิม; same key+payloadเปลี่ยนconflict; ownerอื่นแก้cashไม่ได้; same expectedVersion concurrentสำเร็จหนึ่ง

## วิธีใช้

เปิด http://127.0.0.1:4173/ และเข้าบัญชี tracker ของคุณ เลือก **สินทรัพย์รวม** เพื่อกรอกเงินสด/ยอดบัญชี THB ด้วยชื่อที่ไม่เปิดเผยเลขบัญชี เลือกวันที่ ณยอดแล้วบันทึก แก้ยอดด้วยปุ่มของบัญชีนั้น หากไม่ใช้บัญชีแล้วบันทึกยอด0ได้ โดยไม่ลบประวัติ audit รายรับรายจ่ายไม่ปรับเงินสดให้อัตโนมัติ

เลือก **รายรับรายจ่าย** และเดือนเพื่อดูสัดส่วนรายจ่ายตามหมวด **สำรองข้อมูล** ส่งออกv2รวมเงินสดและยังอ่านv1ได้ อย่ากรอกยอดเดียวกันซ้ำสองบัญชี ไม่รวมwatchlistหุ้น/หนี้/สินทรัพย์นอกระบบ

ยอด fixture E2E เป็นสังเคราะห์ทั้งหมด ยังไม่เปิดพื้นที่ production/เงินจริง ใช้ข้อความ “ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน” บนเว็บเดิม

## การรักษา working tree

before.json/after.json/comparison.json เทียบSHA-256ทั้งtrackedและuntrackedรวมlocalenvhash โดยไม่เปิดเนื้อหาenv; changes.patch เป็น incremental diffกับก่อนรอบนี้ complete-files.mdมีโค้ดครบไฟล์ที่เปลี่ยน ไม่เทียบgitHEADอย่างเดียว ไม่แตะsrc/เดิมหรือF1.1 ไม่เปลี่ยนdependencies ไม่commit/push/deploy

DB runtime เพิ่มเฉพาะcash schemaและfixturesแยกownerในฐานสังเคราะห์เดิม ไม่อ้างว่าฐานข้อมูลไม่มีการเปลี่ยน ไม่มีreset/delete volume; devserverเริ่มใหม่เพื่อโหลดgeneratedPrismaClientและเปิดค้างให้ผู้ใช้ดู
