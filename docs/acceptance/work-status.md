# FINNTECH: งานและสถานะที่ต้องติดตาม

อัปเดต 2026-10-06 หลังเปิดเว็บและตรวจrestore archiveใหม่ลงฐานสังเคราะห์แยก
รอบนี้เพิ่มrestore script/isolatedComposeและคู่มือ ไม่แก้web/APIหรือข้อมูลฐานต้นทาง
ไม่เปลี่ยน dependencies, env, src เดิม หรือเอกสาร F1.1 และไม่เผยแพร่ระบบ

## ขอบเขตผลิตภัณฑ์

ผู้ใช้บันทึกรายรับรายจ่ายและประวัติซื้อ/ขายเอง เว็บคำนวณยอด/ต้นทุน/P&L
และรับราคาอ้างอิงผ่าน backend ไม่มีการเชื่อมบัญชีเพื่อส่งคำสั่งซื้อขาย ฝากถอน
wallet หรือเครดิตเริ่มต้น บัญชีรายรับรายจ่าย/เงินสดใช้ THB และต้นทุนคริปโตใช้ USDT
หน้า assets เทียบ USDT เป็น THB เพื่อแสดงมูลค่าประมาณด้วย direct USDT_THB ตาม decision011
ไม่แปลง ledger/cost basis ไม่ถือ USDT เท่ากับ USD และไม่รวม stock watchlist เป็นสินทรัพย์ที่ถือ
การรับราคาอัตโนมัติไม่ใช่การเชื่อมบัญชีลงทุน ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน

## สถานะและหลักฐาน

DONE = มี implementation และหลักฐานผ่านในขอบเขตที่ระบุ ไม่ใช่รับรอง production
PARTIAL = มีบางส่วนแต่ยังมีเงื่อนไขค้าง OPEN = ยังต้องทำหรือตัดสิน
NOT TESTED = ไม่มีหลักฐาน runtime สำหรับสภาพนั้น FAIL = ตรวจแล้วล้ม
DESIGN READY = มีแผนตรวจได้ ยังไม่ implement/ทดสอบ runtime และไม่เท่ากับ DONE

| ID | งาน | สถานะ | หลักฐาน/ข้อจำกัด |
| --- | --- | --- | --- |
| D01 | Workspace, TypeScript, Decimal และ shared contracts | DONE สำหรับ local | รอบ headers: typecheck/build, compiled smoke ปิด type stripping และ cold Vite smoke ผ่าน; minimum Node 22.12 ยังไม่ทดสอบ |
| D02 | PostgreSQL persistence/ownership/constraints/locks | DONE สำหรับฐานข้อมูลสังเคราะห์ | หลักฐาน PostgreSQL จริงใน decisions/004 และรอบ backup; ไม่ใช้ unit mocks แทน DB runtime |
| D03 | Signup/login/logout และแยกข้อมูลเจ้าของ | DONE สำหรับ local | readiness audit จริงตรวจ A/B, anonymous, Origin และ cookie replay; ไม่มี account recovery |
| D04 | รายรับรายจ่าย THB หมวดหมู่ งบประมาณและสรุปรายเดือน | DONE สำหรับ local | ledger/correction tests และ browser synthetic evidence; ไม่มี FX |
| D05 | พอร์ตคริปโต USDT บันทึกเอง ต้นทุนเฉลี่ย/P&L แยกพอร์ต | DONE สำหรับ local | ledger/replay, history corrections และ browser พอร์ตสังเคราะห์; ไม่มี execution |
| D06 | ราคา BTC/ETH ผ่าน backend และสถานะเก่า/หลุด/ฟื้น | DONE ในขอบเขตที่ตรวจ | actual provider snapshots และ browser local fault injection; ราคาเกิน30sเป็นN/A; WS-only reconnectผ่านขณะ HTTPmarket503; acceptance/backup-network |
| D07 | JSON backup/preview/restore ข้อมูล tracker | DONE ในขอบเขต local | browser v1 เคยผ่านรอบ browser-review; รอบนี้ v2 พร้อมเงินสด/consent/commit/lost response/retry ลงบัญชีใหม่ว่างผ่าน PostgreSQL16.15 จริง; receipt/auditอย่างละ1และจำนวนแถวไม่เพิ่ม; ไม่ใช่ full DB backup |
| D08 | Security headers/CSP | DONE ในขอบเขต local ที่ตรวจ | compiled preview/regression ผ่านรอบก่อน; R01 ตรวจ API ตรงและ proxy มีสาม headers หลัง restart; CSP ใช้กับเว็บ build ไม่ใช่ Vite dev; HTTPS ยังไม่ทดสอบ |
| D10 | สินทรัพย์รวม เงินสด และสัดส่วนรายจ่าย | DONE สำหรับ local ที่ตรวจ | เงินสด THB บันทึกเอง; รวมทุก crypto portfolio เทียบ THB ด้วย direct USDT_THB public relay; ไม่แก้ cost basis; decision011 และ acceptance/assets-overview; ไม่รวม stock watchlist/หนี้ |
| D09 | Stock watchlist | PARTIAL | มี UI/relay boundary และรายการสูงสุด 30; actual provider NOT_CONFIGURED, ราคาจริง NOT TESTED; ไม่ใช่หุ้นที่ถือและไม่มี stock cost-basis |
| V01 | tracker tests ล่าสุด | PASS รอบ backup/network | 170 tests; Finance21/Contracts13/API83/Web53; cold Vite smokeผ่าน; typecheck/build/compiled smoke --no-strip-typesผ่าน; ไม่ใช้แทน PostgreSQL/browser evidence |
| V02 | root npm test ล่าสุด | FAIL เดิม | 297 passed, 2 failed ใน allComponents.test.jsx และ spotTrading.integration.test.jsx; ไม่ skip/แก้ expectation |
| V03 | root build ล่าสุด | PASS รอบ backup/network | exit0 บน host; ไม่เปลี่ยน src/dependencies เดิม; tracker build และ compiled package smoke ปิด type strippingผ่านด้วย |

หลักฐานเดิม: `.headers-review-20261005.local/review-report.md`,
`.readiness-review-20261005.local/runtime-results.json`,
`.market-browser-20261005.local/review-report.md`,
`.backup-review-20261004-232436.local/review-report.md`
อ้าง source ปัจจุบัน: `apps/api/src/tracker/routes.ts`, `apps/api/src/auth/runtime.ts`,
`apps/api/src/app.ts` และ `docs/decisions/009-financial-backup.md`

## งานที่เหลือและเงื่อนไขปิดงาน

| ลำดับ/ID | งาน | สถานะ | ต้องได้อะไรจึงปิดงาน |
| --- | --- | --- | --- |
| 1 / R01 | โหลด API headers ใหม่ | DONE / PASS | หยุด runner เดิมด้วย q (exit 0), ยืนยันคืนพอร์ต 4173/4174 ก่อนเริ่ม; health/proxy/headers/JSON 404 ผ่าน และ browser session/ข้อมูลคงเดิม |
| 2 / R02 | Dependency vulnerability audit | NOT TESTED / รออนุญาต | อนุญาต names/versions ไป registry.npmjs.org; แยก runtime/dev/legacy advisories แล้วพิจารณา fixes โดยไม่อัปเกรดเดิมเกินจำเป็น |
| 3 / R03 | PostgreSQL backup/disaster recovery | PARTIAL / fresharchive restore PASS | rehearsalเดิม20tablesคงไว้; archiveใหม่21publictables/6migrations restoreจริงผ่านPostgreSQL16.15ในtargetใหม่ไม่มีnetwork/ports และfullaggregateตรง; ต้นทางคงเดิม/targetstopped/volumepreserved; nonemptyretryปฏิเสธไม่resetและdataSHAคงเดิม; off-device storage/schedule/retention ยังต้องตัดสิน |
| 4 / R04 | Account recovery/verification | DESIGN READY / runtime OPEN | decision010 มี flow/rollout/expiry/replay/session revocation/failure gates; เลือก mail delivery และยืนยัน policy ก่อน implement; runtime ยัง NOT TESTED |
| 5 / R05 | พื้นที่ข้อมูลจริง | OPEN | แยกบัญชี/database/volume จาก fixture โดยไม่ใช้ DEMO credentials หรือย้ายข้อมูลอัตโนมัติ; ใช้เมื่อ gates สำหรับข้อมูลจริงผ่าน |
| 6 / R06 | Retention/deletion/secret rotation | DESIGN READY / policy approval OPEN | operations/data-retention-deletion มี proposed defaults, purge/schema blockers และ journal กัน restore resurrect; ยังไม่มี delete/job/rotation runtime; v1 ไม่ล้าง legacy archive อัตโนมัติ |
| 7 / R07 | ราคาหุ้น actual provider | OPTIONAL / NOT TESTED | เจ้าของตั้ง key ฝั่ง server แล้วตรวจ entitlement, freshness/reconnect และ owner access จริง; ไม่ขอ key ผ่านแชต |
| 8 / R08 | บันทึกพอร์ตหุ้นเอง | OPTIONAL / ยังไม่ทำ | ต้องกำหนดสกุล, fees, cost-basis และ acceptance แยกก่อนพัฒนา; ไม่เชื่อม broker และไม่เพิ่ม FX โดยปริยาย |
| 9 / R09 | สอง failures ของแอปเดิม | OPEN / FAIL | เปิดงานแยกตรวจสาเหตุและแก้ behavior ในขอบเขตที่ได้รับอนุญาต; ไม่ skip หรือแก้ expected เพียงให้เขียว |
| 10 / R10 | HTTPS/Secure cookie/reverse proxy | NOT TESTED / ก่อนออนไลน์ | target จริง, cookie/Origin/WS/headers และ IP trust ผ่าน; ต้องอนุญาต deploy แยก |
| 11 / R11 | Rate limit/monitoring/release rollback | OPEN / ก่อนออนไลน์ | ทดสอบ topology จริง, alerts, migration/release/rollback runbook ที่รักษาข้อมูล |
| 12 / R12 | Coverage ที่ยังไม่ยืนยัน | PARTIAL | browser restore v2 สู่บัญชีว่างและ WS-only reconnectผ่าน; Node22.12/physical mobile/production HTTPSยัง NOT TESTED |
| 13 / R13 | Legacy DEMO importer | DEFERRED / ไม่เปิดในรุ่นปัจจุบัน | หากเลือกทำ ยึด ADR-002/migration archive แยก preview/consent/dedupe/reversal; ไม่รับ credential/raw dump โดยปริยาย |
| 14 / R14 | นำ UI redesign ไปใช้จริง | DONE เฉพาะ local ที่ตรวจ | sidebar/bottom nav, summary, light/dark/hide พร้อม6tests; browser viewport1280/390/320ไม่มี overflow/errors; physical mobile/production ยัง NOT TESTED |

## Snapshot ก่อน restart: 2026-10-05 04:33 น.

อ่าน HTTP อย่างเดียว: `http://127.0.0.1:4173/`, `/api/health` ผ่าน proxy
และ API ตรง 4174 ได้ 200 ทั้งสามรายการ process/database เป็น ok
แต่ health ระบุ Auth เป็น not_checked จึงไม่ใช้ health เป็นหลักฐาน login สำเร็จ
headers สามตัวไม่อยู่ใน response ของ API ที่เปิดค้าง และไม่ restart ในงาน checklist นี้

ไฟล์ 176 paths เทียบ SHA-256 กับ manifest หลังรอบ headers ตรงทั้งหมด ไม่มีหาย
หลักฐานใหม่อยู่ใน `.status-review-20261005.local/`: prior-evidence-comparison.json,
current-http-check.json, before.json, after.json, comparison.json และ changes.patch
ไม่อ่าน/แสดง credentials และไม่สร้าง session หรือเปลี่ยนข้อมูลผู้ใช้ในรอบนี้

## R01: โหลด API headers ใหม่และตรวจสถานะ

เริ่มด้วย manifest 177 paths และ snapshot สองเอกสารที่อนุญาตแก้
ใช้ q หยุดเฉพาะ session ของ dev runner เดิม ไม่เรียก Stop-Process หรือ taskkill
ตรวจ bind loopback ยืนยันพอร์ต 4173/4174 ว่างก่อน `npm run tracker:dev`
ไม่หยุด Docker/DB, ไม่ reset และไม่เปลี่ยน env

HTTP เวลา 2026-10-05 04:38:32 น. ผ่านห้า checks:
API health และ unknown API ทั้งตรง 4174/ผ่าน proxy 4173, กับ HTML เว็บหลัก
API responses มี nosniff, DENY, no-referrer และไม่มี X-Powered-By
unknown API ตอบ JSON 404; health process/database เป็น ok แต่ auth เป็น not_checked
Vite dev ไม่ได้ใช้ CSP ของเว็บ build ตามการออกแบบ

Browser หลัง reload ยังมี session สังเคราะห์เดิม รายรับรายจ่ายและพอร์ตโหลดได้
ราคาอ้างอิงพร้อม; captured errors/module errors หลัง restart เป็นศูนย์
ไม่ส่ง write requests หรือสร้างบัญชีใหม่ ผล SHA-256/count ทั้งแปดตาราง
finance/audit/idempotency ตรงกันก่อน/หลัง; session metadata ไม่รวมในการเทียบนี้
compiled package smoke `--no-strip-types` ผ่าน หลัง predev build ของ shared packages
ไม่รัน full tracker/root suites ซ้ำ เพราะไม่มี source change; ผลเก่าคงตาม V01–V03

หลักฐาน: `.restart-review-20261005.local/` มี before.json, after.json, comparison.json,
listeners-stopped.json, http-results.json, browser-results.json, browser-after-restart.png,
data-before.json/data-after.json และ changes.patch
dev runner ใหม่เปิดไว้ให้ใช้เว็บ `http://127.0.0.1:4173/` หยุดด้วย q/Ctrl+C ใน terminal
ไม่มี periodic monitoring; R02 ยังรออนุญาต ไม่ถือคำว่าเริ่มได้เป็นอนุญาต payload ภายนอก

## วิธีรายงานงานถัดไป

รอบเตรียม R03 วันที่ 2026-10-05 พบ Compose 5.5.1/PowerShell 7.6.5 แต่ Docker engine
ไม่ตอบ (ไม่พบ dockerDesktopLinuxEngine pipe) จึงไม่หยุด runner/DB ไม่สร้าง container,
volume, credential หรือ dump และไม่ตรวจ prerequisites ซ้ำโดยไม่มีการเปลี่ยนสถานะ
owner ต้องเปิด Docker Desktop ให้ Engine running ก่อน runtime acceptance

เพิ่ม compose.backup.test.yaml, .env.backup.test.example,
scripts/tracker-db-recovery.ps1, scripts/sql/tracker-db-recovery-evidence.sql
และ operations/postgresql-backup-recovery.md ไม่เปลี่ยน dependencies/source แอปเดิม
Compose config/no-network/no-ports/volume isolation, PowerShell syntax,
missing-confirmation guard และ Windows DPAPI synthetic byte round-trip ผ่าน
checks เหล่านี้ไม่ใช่ PostgreSQL backup/restore PASS และไม่ใช่ข้อพิสูจน์ disaster recovery
หลักฐาน: .pg-recovery-review-20261005.local/ พร้อม manifests/diff/sanitized checks
ข้อมูลเต็มใน archive ต้องไม่ถูกแสดงหรือแนบ แสดงเฉพาะ aggregate counts/checksums

เมื่อทำแต่ละ ID เสร็จ ต้องรายงาน: สิ่งที่เปลี่ยน, ไฟล์/diff, คำสั่งกับ exit code,
PASS/FAIL/NOT TESTED, evidence path, baseline comparison, ข้อจำกัดและงานที่ยังเหลือ
อัปเดตสถานะเป็น DONE เมื่อผ่าน acceptance ของ ID นั้นจริงเท่านั้น
ยังไม่มี periodic monitoring; checklist นี้เป็น snapshot ตามเวลา ไม่รับรองสถานะตลอดเวลา

## งานที่ทำได้เมื่อเจ้าของไม่ได้อยู่กับเครื่อง

| งาน | สถานะล่าสุด | ขั้นต่อไป |
| --- | --- | --- |
| Owner/input static review และ regression tests | PASS เฉพาะ scope | ใหม่ 42 cases; ตรวจ anonymous/owner spoof/mapping failure/Origin/input/body bounds; ไม่ใช่ PostgreSQL runtime |
| Account recovery/verification | DESIGN READY / runtime OPEN | decision010; verified email, exact same-origin links, expiry/replay/session revocation และ partial-failure gates; delivery ยังไม่เลือก |
| Retention/deletion | DESIGN READY / รอยืนยัน policy | proposed age/actor/grace/purge/journal/backup effects พร้อม scenarios; ไม่เปิด endpoint ลบหรือ job ล้าง archive |
| Scheduled/off-device backups | OPEN | manual local creation PASS ตาม operations/postgresql-backup.md; ตั้ง RPO/RTO/storage/key custody/alerts ก่อน implementation; DPAPI local ยังผูกเครื่อง/Windows user |
| UI redesign | DONE สำหรับ local ที่ตรวจ | apps/web ใช้ sidebar/bottom nav, summary, light/dark/hide;6 regression tests; viewport1280/390/320ผ่าน; ไม่เปลี่ยน API/business logic |
| Browser/DB/online acceptance | NOT TESTED ในรอบ offline | แยกจาก tests ใน task; ไม่เรียก Docker/browser/provider และไม่ให้เจ้าของเปิดเครื่องระหว่างนี้ |

รายละเอียดและตำแหน่งโค้ด: `docs/acceptance/offline-security-review.md`
หลักฐานรอบใหม่: `.offline-security-20261005-200718.local/`
หลักฐาน R03 local restore ก่อนรอบนี้: `.pg-recovery-runtime-20261005-192002.local/`
ยังไม่ทำ account recovery, auto backup/deletion, UI จริง หรือ deploy ในรอบนี้

## รอบ recovery/data policy design: 2026-10-05

เพิ่ม `docs/decisions/010-account-recovery.md` และ
`docs/operations/data-retention-deletion.md` เท่านั้นนอก checklist นี้
ตรวจ source Better Auth ที่ติดตั้ง 1.7.7 และเอกสารทางการ/OWASP
reset ใช้ database consume แต่ email verification ใช้ JWT มี replay semantics ต่างกัน
adapter transaction:true ยังไม่เป็นหลักฐานว่า password/session revocation ทั้ง flow atomic
การลบบัญชีถูกปิดและ append-only/FK Restrict ต้องมี forward migration ก่อนเปิด purge

ข้อเสนอให้ยืนยันก่อน implementation: reset15นาที/verification24ชั่วโมง,
grace7วัน/active purge24ชั่วโมง, backup cap30วัน/minimal journal90วัน
ไม่มี cleanup อัตโนมัติหรือแก้ค่าปัจจุบันจากตัวเลขในเอกสารนี้
ไม่กำหนด provider/storage แทนเจ้าของ ไม่สมัครหรือส่งข้อมูลไปบริการใหม่
R04/R06 จึงยังไม่ DONE; R03 ยัง PARTIAL แม้ local restore เคยผ่าน

หลักฐานรอบนี้: `.recovery-policy-20261005-202926.local/`
มี manifests ก่อน/หลัง, comparison, changes.patch รวม untracked และ complete-files.md
tests/build/DB/browser/provider NOT TESTED รอบเอกสาร; V01–V03 เป็นผลรอบ offline review ก่อนหน้า
ตรวจ git diff --check และ trailing whitespace แยกสำหรับสามเอกสารใน evidence report

## รอบ UI redesign local acceptance: 2026-10-05

นำแนวทางจากแบบจำลองมาใช้ใน apps/web ด้วย CSS/inline SVG และ presentation context
ไม่มี dependency/assets/provider ใหม่ ไม่เก็บค่าหรือย้ายบัญชีผ่าน localStorage
ฟอร์ม/Decimal/session/unknown-outcome retry เดิมคงอยู่; hide เปลี่ยนเฉพาะ display strings
runtime account recovery/deletion ยังไม่ implement และไม่ได้รับสถานะ DONE จากงาน UI

tests155ผ่าน, root tests282ผ่าน/2failเดิม, strict typecheck/build/compiled smoke ผ่าน
Web tests/builds ใน sandbox ติด module resolution; root build EPERM realpath
host runs ด้วย dependencies เดิมผ่านตามผลแยกใน acceptance/ui-redesign.md
browser session E2E สังเคราะห์ตรวจ5เมนู/light-dark/hideโดยไม่ submit ข้อมูล
คืน viewport และหน้า finance/light/แสดงยอด; dev runner เดิมยังเปิดที่127.0.0.1:4173
ไม่ใช้ผล unit หรือ browser layout เป็น PostgreSQL/production acceptance

หลักฐาน: `.ui-redesign-20261005-205334.local/`
manifests/diff รวม untracked/logs/screenshots และ report ระบุข้อจำกัดตามจริง

## รอบ browser backup/network: 2026-10-05 22:30–22:55 น.

browser backup v2/cash/consent/commit ลงบัญชีสังเคราะห์ใหม่ว่างผ่าน PostgreSQL16.15
จำลองresponseหายหลังcommit แล้ว retryคำขอเดิมคืนreceiptเดิม จำนวนแถว/ยอดไม่เพิ่ม
ตรวจprice/rateเกิน30s แม้serverยังส่งLIVE/FRESH: browserไม่ใช้ยอดเก่าคำนวณ
จำลองHTTP/WS503แล้วฟื้นอัตโนมัติ และแยกWS-onlyด้วย HTTPmarketที่ยัง503

พบfreshWSถูกล้างเมื่อpollล้ม และreaderrorค้างหลังฟื้น แก้เฉพาะapps/webพร้อมregression
หลังแก้tracker170tests/coldoptimizer/typecheck/build/compiledsmokeผ่าน
root297passed/2failเดิม; rootbuildผ่าน ไม่แก้src/dependencies/env/F1.1
เทียบSHA/countข้อมูลเจ้าของเดิมทั้งเก้าตารางและsourcefixtureตรง ไม่มีreset/deletevolume
หยุดtestserver4198และยืนยันคืนพอร์ตแล้ว เว็บหลัก4173health200และคงเปิดอยู่

หลักฐาน: `.backup-network-review-20261005.local/` และ `acceptance/backup-network.md`
เป็นlocal fault injection ไม่ใช่การทดสอบproviderจริงล่มหรือproduction network
publicrateอาจstaleระหว่างrefresh/backoff จึงยังเป็นN/Aตามอายุข้อมูล แม้cryptoWSสด

## รอบ manual PostgreSQL backup creation: 2026-10-06

เพิ่ม `scripts/tracker-db-backup.ps1`, `scripts/tracker-db-backup.test.ps1`
และ `docs/operations/postgresql-backup.md` ไม่แก้web/API/Prisma/dependencies/env
ตรวจsynthetic sourceเดิมบนPostgreSQL16.15/Docker29.8.1/Compose5.5.1/PowerShell7.6.5
previewผ่านและสร้างcustomdumpจริงครบ21publicTABLE DATA/6migrations
ตรวจpersisted DPAPI ciphertextอ่านกลับ/SHAผ่าน และลบเฉพาะplaintextชั่วคราวที่สร้างเอง
source aggregate/hashก่อนและหลังตรงกัน; ไม่อ้างว่าevidenceสองเวลาคือdump snapshotเดียวกัน

helper13casesผ่าน; failureหลังdumpจริงไม่publishreceipt/archiveสำเร็จและcleanupผ่าน
backupซ้อนถูกปฏิเสธก่อนdumpด้วยexclusive lock; completedarchiveเดิมSHAคงเดิม
ไม่หยุดtrackerหรือฐานต้นทาง ไม่สร้าง/reset/reuseฐานrestoreเก่าที่ไม่ว่าง
archiveใหม่นี้ยังไม่ได้restore: การตรวจpg_restore --listและencryptionไม่ใช่restorePASS
DPAPI CurrentUserผูกprofile/เครื่อง จึงยังไม่ใช่off-device disaster recovery
ไม่มีscheduler/auto deletion/ส่งข้อมูลนอกเครื่อง และรอเจ้าของเลือกstorage/key custody

หลักฐาน `.backup-create-review-20261006.local/` มีsanitizedlogs/manifests/comparison
และdiff/codeครบสำหรับงานนี้ ไม่แนบdump/env/ข้อมูลAuthหรือrawrecords
V01–V03 เป็นผลก่อนหน้าที่ยังไม่ได้รันซ้ำรอบนี้ เพราะไม่มีTS/JS/dependencychanges
rootสองfailuresยังOPEN; R03ยังPARTIAL และไม่รับรองproductionหรือข้อมูลจริง
ตรวจhealthเว็บหลัก2026-10-06เวลา04:49น.ได้connectionrefused ไม่พบlistener4173/4174
ไม่มีการหยุด/เริ่มบริการในงานbackupนี้; ผลเว็บรอบก่อนหน้าไม่ใช้แทนสถานะเวลานี้

## รอบเปิดเว็บและrestore archiveใหม่: 2026-10-06 05:34–05:36น.

เปิดlocalrunnerด้วยnpm run tracker:dev (sharedbuildผ่านก่อนเริ่ม) web4173/API4174
host HTML/healthผ่านproxyและAPIตรง200, unknownAPIเป็นJSON404; browserแสดงแอป
ไม่มีloading/readerrorและconsoleerrorในรอบตรวจ ไม่submitข้อมูลหรือสร้างบัญชีผ่านUI
sandboxHTTPเชื่อมต่อไม่ได้ แต่host/browserผ่าน จึงแยกenvironmentfailureจากcodefailure
runnerเปิดไว้ใช้ต่อ หยุดด้วยq/Ctrl+Cในterminal ไม่restart/killprocessอื่น

เพิ่มscripts/tracker-db-archive-restore.ps1และcompose.backup.archive.test.yaml
targetfinntech-archive-restore-20261006แยกvolumeจากsourceและrehearsalเก่าที่ไม่ว่าง
อ่านarchive2cf1da4162b84228be650511a9f914c3เดิม;restore21publictables/6migrations
บนPostgreSQL16.15แล้วfullaggregateตรงกับarchive ทั้งrows/ownerUUID/NUMERIC/schema
ต้นทางก่อน/หลังตรงและarchiveSHAคงเดิม;targetไม่มีnetwork/portsและstopเก็บvolumeแล้ว
nonemptyretryexit1 TARGET_NOT_EMPTY_NO_RESET ก่อนrestore;ตรวจaggregateหลังrefusalคงเดิม
ไม่มีreset/drop/clean/create หรือเปิดrestoredAuth/API;ไม่แก้source/dependencies/env/F1.1

หลักฐาน .archive-restore-review-20261006.local/ มีsanitizedlogs/manifests/diffรวมuntracked
เป็นlocalrestorefidelity ไม่ใช่productionDR/ใหม่lockmutationหรือAuthsuiteบนrestoredDB
R03ยังPARTIALรอoff-device/keycustody/schedule/retention;R04/R05/R06/R07–R11ยังคงเดิม
V01–V03ไม่รันซ้ำรอบนี้ สองrootfailuresคงOPEN; minimumruntime/large-datasetยังNOT TESTED
