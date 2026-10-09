# ตรวจสถานะเว็บไซต์ FINNTECH วันที่ 2026-10-07

วันที่รายงานใช้ Asia/Bangkok ตามเครื่องผู้ใช้ การตรวจนี้อ่านโค้ด เอกสาร และรัน checks;
ไม่แก้ application source, dependency, env หรือข้อมูลผู้ใช้ และไม่ commit/push/deploy

## ข้อสรุป

ยังไม่เสร็จสมบูรณ์สำหรับเปิดใช้งานออนไลน์และเก็บข้อมูลการเงินจริง
ชุด tracker มีฟังก์ชันหลักและ automated tests ผ่าน แต่ยังมีงานด้านบัญชี
backup/operations, production security และการตรวจใช้งานจริงค้างอยู่
ผล local tests/build ไม่ใช่หลักฐานว่าระบบที่เผยแพร่อยู่เป็นโค้ดเดียวกันหรือพร้อม production

โครงการมีสองแอป:

| ชุด | ที่อยู่โค้ด/คำสั่ง | สถานะ |
| --- | --- | --- |
| เว็บเดิม | `src/`, `npm run dev`, `npm run build` | ตลาด/พอร์ต/Paper Trading; คำสั่ง Market และ Limit ยังพัก; ข่าวต้องมี provider/proxy; root suite ยัง fail |
| Finance tracker | `apps/web`, `apps/api`, `packages/`, `npm run tracker:dev` | บันทึกการเงินและประวัติลงทุนด้วยมือ มี PostgreSQL/Auth; ไม่ส่งคำสั่งซื้อขายหรือเชื่อมธนาคาร |

## Checks ที่รันรอบนี้

| Check | ผล | รายละเอียด |
| --- | --- | --- |
| `npm test` | FAIL | 297 ผ่าน / 2 ล้มเหลว รวม 299 tests, 31/33 test files ผ่าน |
| `npm run build` | PASS | Vite สร้าง build เว็บเดิมสำเร็จ |
| `npm run tracker:typecheck` | PASS | Finance, Contracts, API และ Web ผ่าน |
| `npm run tracker:build` | PASS build output | shared/API compile สำเร็จ และ Vite build เว็บ tracker สำเร็จ; session ที่ใช้รันไม่สามารถเรียกคืน exit code ตอนติดตามภายหลัง |
| `npm run tracker:test` นอก sandbox | PASS test/smoke output | Finance 21, Contracts 13, API 83, Web 53 รวม 170 tests; cold Vite smoke ผ่านและคืน port 4175 |
| `node --no-strip-types scripts/tracker-package-smoke.mjs` | PASS | compiled imports, Decimal และ ledger accounting ผ่าน |
| `git diff --check` | PASS | exit 0; ตรวจ tracked diff ไม่ใช่การรับรองเนื้อหา untracked ทุกไฟล์ |
| browser เปิด `http://127.0.0.1:4173/` | CONNECTION REFUSED | ไม่สามารถตรวจ UI ที่กำลังทำงานรอบนี้; ไม่สรุปว่าเป็นบั๊กโค้ดหรือเว็บไซต์ออนไลน์ล่ม |

Workspace tests และ Vite smoke ใน sandbox พบ EPERM/Access denied จึงตรวจซ้ำนอก sandbox
หลังได้รับอนุญาต ผลนอก sandbox ผ่าน ความล้มเหลวด้าน permission ไม่นับเป็น product FAIL
Logs อยู่ใน `.audit-20261007.local/` ซึ่ง git ignore
ไม่ได้รัน PostgreSQL integration, Auth runtime, restore หรือสร้าง fixture เพิ่มในรอบนี้

## ปัญหาที่พิสูจน์จากโค้ดและ tests รอบนี้

1. `src/components/trading/PositionsTable.jsx:97` ยังบอกว่าตั้ง Limit ล่วงหน้าได้
   แม้คำสั่ง PAPER ถูกพัก Component ไม่รับ `orderRulesVerified` ที่ Terminal ส่งมา
   ทำให้ `allComponents.test.jsx` และ `spotTrading.integration.test.jsx` ล้มเหลว
   เป็นปัญหาข้อความ/สถานะ UI; ไม่ใช่หลักฐานว่าคำสั่งทะลุ service guard
2. `apps/web/src/tracker/Dashboard.tsx:192` เปลี่ยน section อย่างเดียว ส่วน message
   เป็น state ร่วมและแสดงนอก section ที่บรรทัด 200 จึงมีโครงสร้างรองรับปัญหา
   banner ค้างข้ามเมนูที่รายงานไว้ใน core-features; ยังไม่ได้ตรวจ browser ซ้ำรอบนี้
3. README ยังมีข้อความระยะ F1.2 ว่าไม่มี database/schema พร้อมกับหัวข้อระยะใหม่
   ที่มี persistence แล้ว ควรทำหน้าเริ่มต้น/สถานะปัจจุบันให้ชัดเพื่อไม่สับสนสองแอป
4. workspace ใหม่และเอกสารหลายไฟล์ยังเป็น untracked ใน Git รวมถึง `apps/`,
   `packages/`, `scripts/`, `docs/`; ต้องรวมไฟล์จำเป็นในการ review/release
   ไม่ถือว่า `git diff` ปกติแสดงงานใหม่ครบแล้ว

## งานที่เหลือก่อนใช้ข้อมูลจริงหรือเปิดออนไลน์

| ลำดับ | งาน | เกณฑ์ปิดงาน |
| --- | --- | --- |
| 1 | ทำบัญชีและฐานข้อมูลจริงแยกจาก fixture | แยก database/volume/บัญชีและค่าตั้งต้น ไม่มี DEMO credentials หรือการย้ายประวัติจำลองเป็นข้อมูลจริงอัตโนมัติ |
| 2 | กู้คืนบัญชีและยืนยันอีเมล | มี mail delivery และ UI/API/runtime tests สำหรับ expiry, replay, session revocation และ failure; ปัจจุบันมี design แต่ Auth routes ยังไม่เปิด reset/verification |
| 3 | backup สำหรับการกู้ระบบ | local encrypted archive/restore มีหลักฐานก่อนหน้าแล้ว แต่ยังต้องมี off-device storage, key custody, schedule, retention และ alert เมื่อ backup ล้มเหลว |
| 4 | retention/deletion/secret rotation | เปลี่ยน policy/design เป็น runtime ที่ตรวจได้ รวมบัญชีถูกลบและผลต่อ backup/restore |
| 5 | production HTTPS/hosting/reverse proxy | ทดสอบ Secure cookie, Origin, CSP/headers, WebSocket และ proxy/IP trust บน target จริง; ปัจจุบันเป็น local evidence |
| 6 | rate limit/monitoring/release rollback | ตรวจ topology จริง มี alerts และ runbook migration/release/rollback ที่รักษาข้อมูล |
| 7 | dependency vulnerability audit | ยังไม่มี advisory audit ล่าสุดในรอบนี้; ตรวจ runtime/dev/legacy ก่อนเลือกแก้เวอร์ชัน ไม่สรุปว่าปลอดภัยจาก build/tests |
| 8 | regression/UX/availability | แก้สอง root failures และ banner; ตรวจความต่อเนื่อง FX, runner lifecycle, ไฟล์ backup ที่ดาวน์โหลดจริง, physical mobile และ failure/retry flows |

Auth code ปัจจุบัน `apps/api/src/auth/runtime.ts` ปิด deleteUser และใช้ memory rate limit;
`apps/api/src/app.ts` allowlist เฉพาะ signup/signin/signout/get-session/ok
จึงไม่มีการกู้คืนบัญชี/ยืนยันอีเมลตาม flow ที่ออกแบบไว้ใน decision010

ข้อจำกัด FX, download และ runner lifecycle อ้างหลักฐานวันที่ 2026-10-06 ใน
`docs/acceptance/core-features.md` ไม่อ้างว่าได้ทดสอบซ้ำหรือทราบสาเหตุใหม่แล้ว

## ฟังก์ชันที่เป็นทางเลือกหรืออยู่นอกขอบเขตรุ่น tracker

- ราคาหุ้นสหรัฐ: มี watchlist/relay/UI; ต้องตรวจ actual provider/key/entitlement
  ก่อนเปิดฟังก์ชันจริง สถานะการตั้งค่าปัจจุบันไม่ได้ตรวจซ้ำรอบนี้
- พอร์ตหุ้นพร้อมจำนวนถือ/ต้นทุน/P&L: ยังไม่ได้ implement แยกจาก watchlist
- ข่าวและปฏิทินของเว็บเดิม: ยังต้องมี provider และ backend/proxy พร้อมสิทธิ์แสดงข้อมูล
- Paper Trading ของเว็บเดิม: Market/Limit ยังคงถูกพัก ต้องยืนยัน order rules ก่อนเปิด
- นำข้อมูล DEMO เดิมเข้า tracker: deferred; ไม่ใช่งานจำเป็นของรุ่นนี้
- execution/wallet/ฝากถอน/เชื่อมธนาคาร: ไม่ใช่ขอบเขตของ tracker

## ฟังก์ชันหลักที่มีแล้วและหลักฐานเดิม

Signup/login/logout, แยกข้อมูลเจ้าของ, รายรับรายจ่าย THB, หมวดหมู่,
งบประมาณ, ประวัติคริปโต USDT/ต้นทุน/P&L, เงินสด, สินทรัพย์รวมเทียบบาท,
JSON backup v2/restore และ desktop/mobile viewport redesign มี implementation
และหลักฐาน local ตาม work-status/core-features/backup-network/assets-overview
tracker tests 170 cases ผ่านรอบนี้ แต่ไม่ได้แทนการทดสอบ PostgreSQL/browser ทั้งหมด

เอกสารสำหรับรายละเอียดต่อ: `docs/acceptance/work-status.md`,
`docs/acceptance/core-features.md`, `docs/decisions/010-account-recovery.md`,
`docs/operations/postgresql-backup.md`, `docs/operations/data-retention-deletion.md`
