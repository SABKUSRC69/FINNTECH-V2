# FINNTECH ช่วง 2 — ส่ง review วันที่ 2026-10-07 (Asia/Bangkok)

สถานะ: ทำ UX/navigation ตามขอบเขตช่วง 2 แล้ว รอ independent review ยังไม่เริ่มช่วง 3
ผลนี้เป็น frontend/UI acceptance ด้วยข้อมูลสังเคราะห์ ไม่ใช่การรับรอง DB/Auth/provider หรือพร้อมเก็บข้อมูลจริง/ออนไลน์

## Baseline และไฟล์ที่เปลี่ยน

Repository เดิม HEAD `bd1ba14a743853b19e0e8c9a3e51a60eed335c16` มี tracked/untracked ของเจ้าของอยู่ก่อน
เก็บ initial-status.txt/head.txt และ baseline ของห้าไฟล์ก่อนแก้ใน `.phase2-review-20261007.local/before/`
ชื่อสำเนาลงท้าย `.baseline.txt` จึงไม่เข้า test discovery ไม่ใช้ git diff HEAD เป็น patch ของช่วงนี้
incremental patch คือ [phase2-review-20261007.patch](phase2-review-20261007.patch)

| ไฟล์ | การเปลี่ยนช่วงนี้ |
| --- | --- |
| apps/web/src/tracker/Dashboard.tsx | nav ใหม่ผ่าน guard เดิม, title ตามหน้า, account, native void dialog; retry อยู่ใน dialog ระหว่าง pending |
| apps/web/src/App.tsx | brand หลัง login ไม่ reload ข้าม guard; อธิบาย hide อย่างตรงขอบเขต |
| apps/web/src/index.css | responsive nav/dialog, wrapping/min-width:0, target44px/inputมือถือ16px, safe-area และพื้นที่ท้ายหน้า |
| apps/web/src/presentation.tsx | เพิ่ม icon บัญชีและเพิ่มเติม ใช้ provider/theme/hide เดิม |
| README.md | แผนที่เมนูและข้อจำกัดบัญชี; ลำดับ prepare ฐานใหม่ก่อนเริ่ม runner |
| apps/web/src/tracker/TrackerNavigation.tsx (ใหม่) | sidebar7หน้า/mobile4จุด/More พร้อม active และ shared guard |
| apps/web/src/tracker/ModalDialog.tsx (ใหม่) | native modal, background inert, Tab trap, Escape/close, focus restoration |
| apps/web/src/tracker/Account.tsx (ใหม่) | authenticated name, logout เดิม, backup ผ่าน guard, ขอบเขตการดูแลข้อมูล |
| apps/web/src/tracker/Dashboard.navigation.test.tsx (ใหม่) | regression11tests ของทางเข้าใหม่/messages/locks/retry/account |
| docs/acceptance/phase2-review-20261007.md (ใหม่) | รายงานนี้ |

ไฟล์ใหม่ข้างต้นรวมเต็มใน patch; local logs/screenshots/harness เป็นหลักฐานเสริมที่ ignored ตาม .gitignore เดิม
ไม่แก้ .gitignore, package.json/lockfile, backend/contracts/schema/migrations, legacy src หรือ ADR ในช่วงนี้
ไม่มี dependency/commit/push/deploy และไม่ได้เชื่อม DB เจ้าของ ไม่มี reset/delete/volume operation

## ก่อน/หลัง และแผนที่เมนู

ก่อน: มี mobile bottom nav 6 รายการและ sidebar เดิมอยู่แล้ว ยังไม่มีหน้าบัญชีหรือ keyboard modal ที่ครบ การเปลี่ยน mobile คือ 6 รายการ → 4 + More
หลัง: ตั้งแต่768px ใช้ sidebarเดิมเพิ่มบัญชี ต่ำกว่า768px ใช้ bottom nav4จุด

| Mobile | หน้า/ทางเข้า desktop |
| --- | --- |
| ภาพรวม | สินทรัพย์รวม (assets) |
| รายการ | รายรับรายจ่าย (finance) |
| พอร์ต | พอร์ตคริปโต (crypto) |
| เพิ่มเติม | งบประมาณ, สำรองข้อมูล, บัญชีและดูแลข้อมูล, ราคาหุ้นสหรัฐ |

หน้าเริ่มต้นยัง finance หน้ารองทำให้เพิ่มเติมเป็น active และ sheet ระบุหน้าปัจจุบัน
nav ที่ซ่อนใช้ display:none จึงไม่อยู่ใน keyboard/AX tree ส่วนที่แสดงมี accessible names
ปุ่มและหัวเรื่องใช้ teal/light/dark เดิม ไม่มี font/chart/dependency ใหม่

ทุก destination รวม account→backup ผ่าน navigate ที่ป้องกัน backupLocked/busy/pending/writing.current/authBusy
same-page ไม่ล้างข้อความ การเปลี่ยนหน้าจริงล้าง resolved message; sheet close ไม่เปลี่ยน section หรือ pending
More เปิดดูและปิดได้ระหว่าง lock แต่เลือกปลายทางไม่ได้ logout และ account actions ใช้ lock เดิม
theme/hide ยัง memory-only ไม่เปลี่ยน request; header brand หลัง login ไม่มี reload link
ฟอร์ม เดือน พอร์ต และ draft คงพฤติกรรม state เดิม ไม่สร้าง writes ตอน navigation
ไม่ได้เพิ่ม draft persistence ให้ component ที่เดิม unmount แล้วสูญ draft

void confirmation ใช้ native modal เช่นเดียวกับ sheet ระหว่าง busy/pending ปิดไม่ได้
ย้าย feedback/retry เดิมเข้า modal เพราะพื้นหลัง native dialog เป็น inert หากยังอยู่นอก dialog จะ retry ด้วย keyboard ไม่ได้
หลังผลชัดเจน dialog ปิดและคืน focus ให้ opener หรือเนื้อหาหลักเมื่อ opener ถูก disabled/ถอดออก
request body/idempotency key/send/retry ไม่เปลี่ยน

บัญชีแสดง name จาก session จริงที่ App ส่งให้ ไม่มี email/verification/owner ID แต่งขึ้น
logout ใช้ callback เดิม ลิงก์ backup ใช้ guard เดิม ไม่มีปุ่ม recovery/change-password/delete
อธิบาย JSON ไม่รวม login ไม่ใช่ full database backup ไม่เข้ารหัส และรุ่นทดลองยังไม่รับรองข้อมูลจริง
ค่าการเงินยัง Decimal strings และหน่วยเดิม THB/USDT แยกพอร์ต ราคา/FX stale30s ไม่เปลี่ยน
long decimal wrap โดยไม่แปลง Number/ตัดตัวเลข N/A ยังใช้เมื่อราคาเก่า ข้อมูลไม่พร้อมไม่เติมยอด0

## Tests และคำสั่ง — ผลสุดท้ายจริง

Logs และ manifests อยู่ใน `.phase2-review-20261007.local/`
final-results.json เป็นรอบสุดท้าย; batch-results.json เก็บผล batch เดิมก่อน CSS responsive rerun

| คำสั่ง | ผล | Exit code | Log |
| --- | --- | --- | --- |
| npm test | 34 files / 313 passed / 0 failed | 0 | final-1.log |
| npm run build | legacy Vite build ผ่าน | 0 | final-2.log |
| npm run tracker:typecheck | shared/API/Web ผ่าน | 0 | final-3.log |
| npm run tracker:test | Finance21 + Contracts13 + API83 + Web67 = 184 passed; cold Vite smoke ผ่านและคืน4175 | 0 | final-4.log |
| npm run tracker:build | shared/API/Web ผ่าน หลังจำกัด CSS sheet รุ่นสุดท้าย | 0 | tracker-build-sheet-rerun.log |
| node --no-strip-types scripts/tracker-package-smoke.mjs | compiled package smoke ผ่าน | 0 | final-6.log |
| git diff --check | tracked diff ผ่าน | 0 | diff-check-final.log |
| git apply --check --reverse docs/acceptance/phase2-review-20261007.patch | incremental patch ตรง working tree (check เท่านั้น) | 0 | patch-check.log |

11testsใหม่ครอบคลุม4หน้ารอง active state/no-write, validation lifetime/draft/month, finance/cash unknown retries,
theme/hide กับ payload/key เดิม, void pending retry ใน modal, session name/logout/backup,
sheet ที่เปิดก่อน lock และ account actions disabled ไม่มี skip หรือลด assertions การเงิน/ownership/idempotency

Attempts แยกจากผลสุดท้าย: focused existing3files23tests exit0; navigation รอบแรก10tests exit0
จากนั้น web typecheck พบ test ใช้ Testing Library getByRole option `exact` ที่ชนิดนี้ไม่รองรับ (tsc exit2 / npm exit1)
แก้ test query options แล้ว final typecheck exit0 ไม่ได้แก้ schema/assertion เพื่อกลบปัญหา
checks ใช้ execution นอก sandbox เพื่อรองรับ Vite/process spawning ตามข้อจำกัดเครื่องเดิม ไม่มี dependency install
ไม่พบ environment failure ใน final checks; การวัด DOM รอบแรกมีข้อจำกัด evaluate runtime (`parseFloat` unavailable)
แก้เครื่องมือวัดเป็นอ่าน computed fontSize strings ไม่ใช่ product code bug

## Browser evidence (compiled frontend + synthetic HTTP fixture)

ใช้ Codex in-app browser ที่127.0.0.1:4295 ด้วย `browser-fixture.mjs` ใน local artifacts
serve apps/web/dist จริง fixtures validate ผ่าน compiled contracts ใช้ memory-only ไม่อ่าน env/credentials/DB
FX/crypto quotes เก่า60s, ชื่อไทย/decimalยาว, budgetเกิน, stocks NOT_CONFIGURED ไม่มี provider จริง
หลักฐานไม่มี HAR/raw backup/request body/key/ข้อมูลจริง

`browser/matrix.json` มี70cells = 7หน้า × 5widths × light/dark
ทุก cell scrollWidth เท่ากับ clientWidth (320pxมี scrollbar จึง clientWidth305px), smallTargets=[]
mobileมี4ปุ่ม nav desktopมี0 mobilebuttons; visible inputs320/390px computed16px
mobile footer clearanceประมาณ88px มากกว่า nav70.8px และ CSSเพิ่ม safe-area-inset-bottom
ภาพเต็มหน้า fixed nav อาจอยู่ตำแหน่ง viewport แรก; ท้ายหน้า/ปุ่มเลื่อนเข้าถึงได้และมีพื้นที่สำรอง
รอบแรก320px overflow เพราะ body min-width320 รวม scrollbar; เปลี่ยน min-width0 แล้ว rerunครบ70cells
เก็บ matrix-attempt1.json แยก ไม่อ้างผลรอบนั้นผ่าน

หลัง matrix70cells ตรวจภาพพบว่า mobile nav CSS ใช้กับรายการ sheet ด้วย จึงจำกัด selector ให้เฉพาะ bottom nav
sheet กลับเป็นแถว13px (เดิม10pxแบบคอลัมน์) ตรวจรุ่นสุดท้าย320/390px × light/dark4cells:
no overflow, ทุก destination targetสูง44.8px, focusอยู่ปุ่มปิด; sheet-final.json และ sheet-<width>-<theme>.png
การรัน matrix70cellsซ้ำแบบรวมหลังเปลี่ยน selector ใช้เกิน60sจน browser tool timeout ไม่อ้างรอบที่ไม่จบผ่าน
matrix.json ใช้รอบ70cellsที่จบก่อนการจำกัด selector นี้; CSSส่วน page/bottom navคงเดิม
ภาพบางไฟล์ถูกถ่ายซ้ำก่อน timeout ส่วน final sheet/pendingแยกชื่อชัดเจน

ภาพ finance และ account ครบทุกwidth/theme: `browser/<width>-<light|dark>-<finance|account>.png` (20ภาพ)
ตัวอย่าง [desktop dark account](../../.phase2-review-20261007.local/browser/1280-dark-account.png),
[desktop light finance](../../.phase2-review-20261007.local/browser/1440-light-finance.png),
[mobile light account](../../.phase2-review-20261007.local/browser/390-light-account.png),
[mobile dark finance320](../../.phase2-review-20261007.local/browser/320-dark-finance.png)

ตรวจ keyboard ใน browser จริง ไม่อ้าง happy-dom พิสูจน์ focus trap:
- More: native background inert; Shift+Tabจาก close→หุ้น, Tabจากหุ้น→close, Escape→focusเพิ่มเติม; keyboard.json
- More ระหว่าง unknown:4ปลายทาง disabled closeยังได้ Escapeคืนfocus โดย pendingยังอยู่
- Void idle: Shift+Tabจากclose→กลับ, Tabกลับ→close, Escapeปิดและคืนfocusยกเลิกรายการ
- Void unknown: Escapeยังเปิด close disabled retryอยู่ในmodalและใช้งานได้; void-keyboard.json
- Financeและvoid retry ผล fixture writes2 payloadSame=true keySame=true; pending.json/void-pending.json

[pending sheet รุ่นสุดท้าย](../../.phase2-review-20261007.local/browser/pending-sheet-390-light-final.png),
[pending full page](../../.phase2-review-20261007.local/browser/pending-390-light.png),
[void unknown](../../.phase2-review-20261007.local/browser/void-pending-390-light.png),
[loading](../../.phase2-review-20261007.local/browser/loading-390-light.png),
[unavailable](../../.phase2-review-20261007.local/browser/unavailable-390-light.png)
loadingแสดงจริงระหว่าง delay2s; unavailable503ไม่เติมยอดและ write controls disabled; successเห็นหลังretry
console error entries ที่ browser API รายงานระหว่าง flow ตรวจ =0; ไม่ใช่การรับรองว่าไม่มี network failures (fixtureจงใจ503/500)
final sheet retry: pending-final.json writes2/payloadSame/keySame=true, console-summary-final.json=[]
stock emptyและstaleแสดงจาก fixtures ตาม behaviorเดิมใน matrix; session-expiredมี coverageเดิม ไม่ทำ browser401ใหม่

## ข้อจำกัด งานค้าง และ gates

- NOT TESTED: physical mobile/iOS safe-area/virtual keyboard, screen reader, OS high contrast, browser enginesอื่น
- NOT TESTED รอบนี้: PostgreSQL/Authจริง/session expiryในbrowser, real-provider/FX soak, downloadไฟล์จริง/credential scan,
  full database restore/off-device/scheduler/key custody, configured runner lifecycle และ Nodeขั้นต่ำ22.12
- UI fixture lifecycle: agentเริ่มเฉพาะ4295 แล้วตรวจ command line/PIDก่อนหยุดและตรวจคืนport ทั้งสองรอบ; lifecycle.json/lifecycle-final.json
  tracker:test cold Vite4175 start/stopผ่านเอง ไม่อ้างว่า configured DB/Auth runnerผ่านจาก fixture
- UXbugที่พบ320overflow/mobilemonth14px/sheetตัวอักษรเล็กแก้และตรวจซ้ำแล้ว ไม่พบ UXbugค้างในเคสที่ตรวจ
- environment limitation: viewport emulationไม่ใช่physical device; ช่วง1 saved-file/real-provider/configured lifecycleยังค้าง
- owner decision: recovery/storage/provider/online targetตาม decisionsเดิม ไม่ตัดสินใจหรือเปลี่ยน target ในช่วงนี้
- optional feature: draft persistenceข้าม unmount ยังไม่เพิ่ม (คงเดิม), router/deep-link/search/paginationไม่อยู่scope
- L1 ยังไม่ครบ runtime/data/restore gates; L2/O1 ยังไม่ผ่าน ไม่เรียกเว็บไซต์ทั้งหมด complete
- หลัง review ค่อยอนุมัติช่วง3เรื่อง recoveryและแยกพื้นที่จริง/ทดสอบ งานFX instrumentation/saved-file acceptance
  ยังควรแยกตรวจตามผลช่วง1 ไม่เปลี่ยน stale threshold เพื่อกลบปัญหา

หยุดส่ง review ไม่มีการส่งข้อความไป AI ผู้ตรวจภายนอกหรือเริ่มช่วง3โดยอัตโนมัติ
