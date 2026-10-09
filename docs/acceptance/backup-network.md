# Browser backup v2 และการฟื้นตัวของราคา: 2026-10-05

## ขอบเขตและความปลอดภัย

ใช้ compiled web/API บน `http://localhost:4198/` แยกจากเว็บหลัก
`http://127.0.0.1:4173/` เพื่อไม่เปลี่ยน cookie/session ของเว็บที่ผู้ใช้เปิดอยู่
ใช้ Better Auth/database session จริงและบัญชีสังเคราะห์ใหม่สองบัญชีในฐานทดสอบ local ที่ตรวจ target ก่อนเริ่ม
PostgreSQL16.15 / Node24.18.0; migrationsหกรายการ finished และไม่มี rolled_back
ไม่ reset/deleteฐานหรือvolume ไม่เปิด Auth bypass ไม่ใช้mock/SQLiteแทนหลักฐานDB

หลักฐานอยู่ใน `.backup-network-review-20261005.local/` ซึ่ง Git ignore อยู่แล้ว
ไฟล์ fixture/session และ backup สังเคราะห์ไม่รวมใน patch/complete-code และไม่เผย credentials
manifest รวม tracked/untracked และ hash local env โดยไม่อ่านเนื้อหาออกมารายงาน
ข้อมูลfinance/cash/audit/idempotency ของเจ้าของเดิมทั้งเก้าตารางต้องตรง SHA/count ก่อน/หลัง
Auth session metadata ไม่รวมใน comparison นี้; เพิ่มข้อมูลเฉพาะ fixtureใหม่โดยตั้งใจ

## Backup v2 ผ่าน browser และ PostgreSQL จริง

- บัญชี target ว่างทั้งเก้าตารางก่อนเริ่ม และหลัง browser preview ยังมีศูนย์แถวทั้งหมด
- ดาวน์โหลดจริงจากปุ่มบน browser ได้ไฟล์version2ขนาด4902bytes มีcashAccountsสองบัญชี
  `download` event ของเครื่องมือtimeout10s แต่ตรวจไฟล์ที่บันทึกจริงในDownloadsและexportedAt/nameของfixtureได้
  จึงแยกข้อจำกัดของeventออกจากผลไฟล์จริง; SHAอยู่ในdownload-evidence.json
- เลือกไฟล์ผ่านfilechooserจริง Preview: categories2 / transactions4(ยกเลิก1) / budgets1 /
  portfolios2 / trades4(ยกเลิก1) / cash2; ต้องให้consentก่อนปุ่มcommitใช้งานได้
- เดือน2026-10: income100 / expense0.2 / balance99.8 THB
  แถวexpense0.1เหมือนกันสองแถวคงอยู่ครบ ไม่ตัดด้วยcontent hash
- เงินสด0.2THBและบัญชียอด0THBพร้อมasOf2026-10-05คงค่า
  BTCพอร์ตA quantity2 / cost2.666666666666666667 / realizedPnl0.566666666666666667USDT;
  พอร์ตB quantity0.00000001 / cost0.0006USDT; source IDsถูกremap
- Fault server ตัดresponseหลังrestore transactioncommitจริง Browserแจ้งผลยังไม่ทราบและล็อกฟอร์ม
  PostgreSQLมีreceipt/auditอย่างละ1 จากนั้นกดตรวจผลคำขอเดิมโดยไม่reload
  คืนreceiptเดิมและbrowserแจ้งสำเร็จ; SHA/countทั้งเก้าตารางของtargetไม่เปลี่ยนจากหลังcommit
- ตัวตรวจreceiptรอบแรกใช้JSON.stringifyซึ่งไวต่อลำดับkeyของJSONB ทำให้retryถูกตัวตรวจนับผิดและส่ง503
  แก้เฉพาะharnessให้canonicalizeobject keys โดยคงarray order; ใช้key/บัญชี/ข้อมูลเดิม ไม่สร้างrestoreใหม่
  เป็นข้อผิดพลาดของharness ไม่ใช่การเปลี่ยนassertionของแอปหรือresetข้อมูล

หลักฐาน: target-empty.json, preview-zero-writes.json, source-summary.json,
after-lost-response.json, after-retry.json, events.json, preview.png,
lost-response.png, restore-success.png; retryreceiptใช้SHAแทนเนื้อหาkey/session

## ราคาและการเชื่อมต่อ

ใช้snapshotจริงจาก Binance public และ direct Bitkub USDT_THB ผ่านbackendเท่านั้น
fault injectionทำในserverตรวจรับlocal ไม่ปิดWi-Fi/Docker/firewall ไม่เปลี่ยนproviderจริง
จึงเป็นbrowser transport/cache failure acceptance ไม่ใช่หลักฐานว่าproviderจริงล่มหรือฟื้น

1. Live: HTTP market/rate200, WS101และสองframesที่ราคาไม่ว่าง/อายุไม่เกิน30s
2. Frozen: backendยังส่งป้ายLIVE/FRESHแต่timestampคงเดิมเกิน30s
   browserแสดงcryptoและยอดเทียบบาทN/A; cash0.2และquantityสองพอร์ตยังคงค่า
3. Offline: HTTP market/rate503, WSupgrade503; browserไม่แทนราคาหรือยอดด้วย0
   cash/read formอาจเป็นN/A/disabledเพราะcashกับrateโหลดพร้อมกัน ไม่ใช่ข้อมูลถูกลบ
4. WS-only: เปิดWSกลับโดยคง HTTP market503; rate HTTP200
   เก็บtransport evidenceและbrowser snapshotแยกเพื่อยืนยันว่าไม่ได้ฟื้นด้วยmarket polling
   รอบwarm-upแรกได้รับsnapshotSTALEระหว่างasyncrefresh จึงไม่ผ่านfresh-frames check;
   ตรวจซ้ำหลังrefreshจริงโดยไม่ผ่อนfreshness predicateได้สองfreshframes

พบและแก้สองbugในapps/web พร้อมregression-before.log (2failed/5passed):

- HTTP pollingที่ล้มล้างfreshWSprice: เก็บobservationที่ผ่านvalidationเดิมจนreceivedAtหมดอายุ
  ไม่สร้างtimestampใหม่เมื่อpollล้ม; regressionตรวจยังใช้ได้ที่15sและเป็นN/Aที่30,001ms
- ข้อความread errorยังค้างหลังcash/rateกลับมา: แยกloadFailedจากmutationfeedback
  successของbackgroundloadล้างเฉพาะread error และไม่ล้างข้อความ/คำขอเขียนที่ผลยังไม่ทราบ

ผลbrowserของbuildหลังแก้: offlineแสดงN/Aและreaderror จากนั้นWSฟื้นอัตโนมัติโดยไม่reload
browserแสดงcrypto/ยอดบาทเมื่อrateสดและreaderrorหาย HTTPmarketยัง503ตลอดช่วงตรวจ
สองsnapshotห่างกันเกิน30sยืนยันnativeUSDTยังแสดงขณะpollล้มหลายครั้ง
snapshotหลังrateอายุเกิน30sเปลี่ยนเฉพาะTHBเป็นN/A โดยnativecryptoยังสด เป็นexpiryที่ถูกต้อง
listener4198หยุดและbindตรวจพอร์ตว่างแล้ว เว็บหลัก4173health200
รายละเอียดเวลาและหลักฐานบันทึกในreview-report.mdของevidence directory
ไม่อ้างcontinuous connection healthจากป้ายLIVEซึ่งเป็นfreshnessของobservation

## คำสั่งและผลตรวจ

| Check | ผล | หลักฐาน |
| --- | --- | --- |
| npm run tracker:typecheck | PASS exit0 | tracker-typecheck.log |
| npm run tracker:test | PASS exit0 | 170tests + coldoptimizer --force; tracker-test.log |
| npm run tracker:build | PASS exit0 | tracker-build.log |
| node --no-strip-types scripts/tracker-package-smoke.mjs | PASS exit0 | compiled-smoke.log |
| npm test | FAIL สองเดิม | 297passed/2failed; allComponents.test.jsx, spotTrading.integration.test.jsx |
| npm run build | PASS exit0 | build.log |
| npm run tracker:runtime-smoke | คำสั่งไม่มีในpackage.json | เรียกชื่อผิด; ใช้compiled commandข้างบนจริงแทน ไม่ถือเป็นcode failure |
| Node22.12, physical mobile, productionHTTPS, actualprovider outage | NOT TESTED | ไม่ใช้ผลlocalแทน |

shell sandboxรอบแรกถูกEACCES ก่อนserverเริ่ม ใช้hostที่ได้รับอนุญาตกับtarget guardเดิมแล้วรันได้
ไม่รวมsandbox prerequisite failureกับผลassertionของโค้ด

## Working tree และข้อค้าง

เปลี่ยนเฉพาะapps/web recovery source/testsกับเอกสารสถานะ ไม่แก้srcเดิม/F1.1/dependencies/env
before.json/after.json/comparison.json, changes.patch และcomplete-files.mdเทียบincrementกับก่อนงานนี้
sourceของharnessที่ไม่มีcredentialsเก็บในcomplete-scripts.mdแยกจากfixtures
git diff --checkและnew/untracked whitespaceตรวจแยก ไม่ถือstatusเพียงอย่างเดียวเป็นหลักฐานคงsource

ผลcomparison: baseline205 / after206 / protected199; changed5และadded1เฉพาะallowed
protectedChanged0 / missing0 / unexpected0 / trailing whitespace0
runtime-comparison.jsonยืนยันexisting owners/source unchanged, retry rows unchanged,
testportreleased, mainhealth200 และไม่พบknownserver/fixture secretsในfrontend build

ยังไม่ทำaccount recovery, off-device/scheduledbackup, retention/deletionruntime,
พื้นที่เงินจริง, stockproviderจริง, HTTPS/deploy หรือแก้สองrootfailures งานเหล่านี้คงตามwork-status
serverตรวจรับ4198ต้องหยุดและยืนยันพอร์ตว่างหลังงาน; เว็บหลัก4173คงเปิดให้ผู้ใช้ดู
