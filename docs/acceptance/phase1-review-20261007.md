# FINNTECH ช่วง 1: ส่งตรวจทบทวน

วันที่ 2026-10-07 (Asia/Bangkok). หยุดที่ช่วง 1; ยังไม่เริ่มช่วง 2 และไม่อ้างว่าเว็บสมบูรณ์ทั้งหมด

## ขอบเขตและฐานก่อนแก้

- Repository `C:\Users\Admin\Downloads\FINNTECH`, branch `main`, HEAD `bd1ba14a743853b19e0e8c9a3e51a60eed335c16`
- Node 24.18.0 / npm 11.16.0. ไม่พบ AGENTS.md ในรายการไฟล์ repository ที่ค้น
- มีงาน tracked/untracked เดิมจำนวนมาก รวม README, PositionsTable, root tests และทั้ง apps/packages/scripts/docs
  เก็บสำเนาสี่ไฟล์ก่อนแก้ใน `.phase1-review-20261007.local/before/` เพื่อสร้าง incremental patch
  ไม่ใช้ git diff เทียบ HEAD เป็น patch ของช่วงนี้ เพราะจะรวมงานเจ้าของเดิม
- อ่าน product spec, master prompt, website-status, work-status, core-features, decisions 009/010/011,
  operations PostgreSQL backup/retention, package manifests และ source/tests ที่เกี่ยวข้อง
- ผล audit เดิม 297 ผ่าน/2 fail และ tracker 170 เป็นประวัติ ไม่ใช่ผลรันก่อนแก้ของรอบนี้

## ไฟล์ที่เปลี่ยนในช่วงนี้

| ไฟล์ | เหตุผล |
| --- | --- |
| `src/components/trading/PositionsTable.jsx` | รับ orderRulesVerified และแสดง empty state ตามสถานะจริง |
| `apps/web/src/tracker/Dashboard.tsx` | ล้างข้อความเมื่อเปลี่ยนเมนูได้จริง รักษา pending/busy/backup locks |
| `apps/web/src/tracker/Dashboard.test.tsx` | เพิ่ม 3 regression tests สำหรับ message lifetime และ retry/locks |
| `README.md` | tracker quick start, prerequisites, URL/health/stop และแก้สถานะที่ล้าสมัย |
| `scripts/phase1-diagnostics-20261007.mjs` (ใหม่) | ตัวจำลอง FX และ loopback frontend download fixture ใช้ compiled code ไม่อ่าน env/DB |
| `docs/acceptance/phase1-review-20261007.md` (ใหม่) | รายงานนี้ |
| `docs/acceptance/phase1-review-20261007.patch` (ใหม่) | patch ของหกไฟล์ข้างต้น รวมไฟล์ใหม่; ไม่รวมตัว patch เอง |

Artifacts ชั่วคราว/logs/snapshots/runner copy อยู่ใน `.phase1-review-20261007.local/`
ซึ่งเข้ากฎ `*.local` เดิม ไม่เปลี่ยน .gitignore; เป็นหลักฐานในเครื่อง ไม่ใช่ application source
Patch นี้เทียบสำเนาก่อนเริ่มช่วงนี้ และมีเนื้อหาใหม่ครบแม้ apps/docs/scripts ยัง untracked

## A: Paper Trading

ก่อนแก้ Terminal ส่ง prop แต่ PositionsTable ไม่รับ จึงแสดงข้อความว่าใช้ Limit ได้เสมอเมื่อไม่มี order
หลังแก้ prop ค่าเริ่มต้น false; false แสดงข้อความตรงตามที่ขอ:

“ไม่มีคำสั่งรอจับคู่ในขณะนี้ — คำสั่ง PAPER พักอยู่ จึงยังตั้ง Limit ใหม่ไม่ได้”

true ยังคงข้อความเดิมสำหรับกรณียืนยันกฎแล้ว ไม่มีการเปลี่ยน service/order guards
หรือเปิด Market/Limit. ไม่แก้ root tests, ไม่ skip หรือลด assertions
สองไฟล์ที่เกี่ยวข้องผ่าน 64 tests รวมทั้ง paused และ verified empty state

## B: ข้อความค้างข้ามเมนู

ก่อนแก้ `message` เป็น state ร่วม แสดงนอก section; nav เรียกเพียง setSection
หลังแก้ `navigate` ล้าง message เฉพาะการเปลี่ยน section จริงที่ไม่ถูกล็อก
คลิกเมนูเดิมไม่ล้างข้อความ; backupLocked/busy/pending/writing.current ป้องกัน navigation
ไม่แตะ send/retry, payload, key, session, ownership หรือ ledger

Regression ใหม่พิสูจน์ว่า:

1. Validation ไม่หายเมื่อคลิกเมนูเดิม แต่หายเมื่อเปลี่ยน/กลับเมนู และไม่มี write
2. Success ที่จบแล้วไม่ติดไปหน้าใหม่หรือย้อนกลับ ไม่มีการส่ง write เพิ่ม
3. ระหว่าง in-flight และ unknown outcome ซ้ำ navigation/logout ยังล็อก ข้อความยังอยู่
   retry ทั้งสามครั้งใช้ body/headers (รวม Idempotency-Key) เดิม หลังยืนยันสำเร็จจึงปลดล็อก
   และเปลี่ยนหน้าได้โดยไม่มี write เพิ่ม

Dashboard suite ผ่าน 8 tests. เป็น UI tests ด้วย synthetic fetch ไม่ใช่ PostgreSQL/browser acceptance ของ write
Pending ยังอยู่ใน memory ตามระบบเดิม; reload/ปิดหน้าไม่ได้เพิ่ม persistence ในช่วงนี้

## C: คู่มือ

README เดิมขึ้นต้นด้วย legacy และ npm run dev พร้อมข้อความ F1.2 ว่ายังไม่มี persistence
และ Node minimum 22.9 ทำให้ขัดกับ tracker ปัจจุบัน
ตอนนี้หน้าแรกระบุเว็บหลักและ `npm run tracker:dev`, Node ตาม API engines (^22.12 หรือ ^24),
Docker/Compose, server env และ DB preparation ที่แยกจากฐานไม่ว่าง
มี Web 4173/API 4174, health ตรงและผ่าน proxy, q/Ctrl+C และ stop DB แบบเก็บ volume
health HTTP 200 ต้องอ่าน checks.database และ Auth not_checked ไม่เท่ากับ login ผ่าน
Web strictPort จะปฏิเสธพอร์ตชน ไม่ย้ายพอร์ตเงียบ ๆ
แก้ข้อความ current status ว่ามี Prisma/PostgreSQL และ FX แล้ว ส่วน legacy/F1.2/ADR ยังเก็บประวัติ
ไม่เปลี่ยน npm scripts, dependencies หรือ GitHub Pages deploy target

## D1: ความต่อเนื่อง USDT/THB

ตรวจ `apps/api/src/tracker/fx.ts`, routes.ts, `packages/contracts/src/index.ts`,
`apps/web/src/tracker/Assets.tsx` และ decision011

- Contract: base USDT, quote THB, positive decimal string/null, receivedAt datetime/null,
  FRESH/STALE/UNAVAILABLE, Bitkub public, LAST_PRICE_SNAPSHOT; ไม่ตี USDT=USD
- ตรวจ active pair/base/quote ก่อน ticker; parse numeric lexemes เป็น string; รับราคา >0 เท่านั้น
- snapshot เริ่ม async refresh แล้วคืน cache ทันที ไม่มี background timer ของ FX ใน backend
  มี single-flight; request timeout 5s ต่อ request (metadata/ticker เรียงกัน)
- สำเร็จรอ 15s; failure backoff 30/60/120/240/300s จากเวลาจบ attempt
  failure/invalid ไม่เลื่อน receivedAt ไม่เปลี่ยน stale threshold 30s
- Frontend Assets load ตอน mount และทุก 15s เมื่อไม่ได้ writing; unmount หยุด polling
  load ใช้ Promise.all cash+reference-rate จึงล้าง cash/rate ใน UI ถ้า request ใดล้ม
  Dashboard clock ทุก 1s ส่ง now ให้ Assets ตัดอายุเอง; ไม่มี FX WebSocket

รัน `node --no-strip-types scripts/phase1-diagnostics-20261007.mjs fx` exit 0:
ที่ t=0 snapshot แรก UNAVAILABLE; หลัง refresh FRESH. Inject 429 ที่ t=15s
ที่ t=30.001s เป็น STALE และยังไม่มี fetch เพิ่มเพราะ backoff. t=45s recovery snapshot
ยังคืน STALE ก่อน async เสร็จ จากนั้น FRESH. Invalid zero และ timeout ไม่เลื่อน timestamp
AbortSignal timeout ที่วัดจริง 5001ms; หลักฐาน `.phase1-review-20261007.local/fx-analysis.json`

CONFIRMED: กลไก cache-before-refresh และ backoff ทำให้เกิดช่วงไม่มีอัตราสดได้ตาม reproduction
UNCONFIRMED: เหตุของช่วง N/A ที่พบในการตรวจวันที่ 2026-10-06 ว่าเกิดจาก provider, timeout,
429, schema rejection, cash request หรือจังหวะ polling ใด เพราะไม่มี telemetry จำแนกย้อนหลัง
Live-provider/continuous soak/background throttling NOT TESTED รอบนี้ ไม่แก้ FX แบบเดา

## D2: Backup download

ตรวจ backend exportBackup/readDocument: owner scope, RepeatableRead และ field whitelist
ไม่ส่ง AuthUser/password/session/token/server env/receipts/audit เป็น backup
contract strict ไม่รับ fields แปลกปลอม; free-text notes อาจมีข้อมูลที่ผู้ใช้พิมพ์เอง
จึงไม่กล่าวว่าทุก note ปราศจาก secret โดยอัตโนมัติ
Frontend parse schema ก่อน JSON Blob, anchor.download ชื่อวันที่, click/remove,
revoke ObjectURL หลัง 1s และข้อความเตือนตรวจ Downloads (ไม่อ้าง saved)

เปิด compiled frontend จริงกับ fixture HTTP เฉพาะ 127.0.0.1:4293 ผ่าน diagnostics script
ใช้ synthetic backup v2 มี cash 123.45 THB; fixture ผ่าน backupDocumentSchema
ไม่มี DB/env/credentials จริง ไม่มี write/restore. Edge ไม่พร้อมใช้งานผ่านเครื่องมือ
จึงใช้ Codex in-app browser เปิดหน้า backup และคลิกปุ่มดาวน์โหลด
UI แสดง “ส่งไฟล์สำรองให้ browser แล้ว…” แต่ download event timeout หลัง 15s
และค้นชื่อ finntech-backup-2026-10-07*.json ใน Downloads ไม่พบไฟล์

NOT TESTED: ไฟล์จาก browser ที่บันทึกจริง/parse readback/credential scan บนไฟล์ที่บันทึก
UNCONFIRMED: browser save failure เทียบกับ tooling/download-event limitation
ไม่ตี timeout ของเครื่องมือเป็น product bug. Source whitelist และ fixture schema ผ่าน
ไม่ใช้แทนการพิสูจน์ exported file จริงจาก PostgreSQL. ปิด tab และ fixture process ที่เริ่มเองแล้ว

## D3: Runner lifecycle

อ่าน scripts/tracker-dev.mjs และ API server shutdown. ใช้สำเนา runner byte-identical
ใน `.phase1-review-20261007.local/isolated-runner/`, คัด source/config ที่จำเป็นโดยไม่มี env
และอ้าง installed dependencies ผ่าน junction ไม่ติดตั้ง/อัปเกรด package
ล้าง Auth/DB/provider config เฉพาะ process environment ของ test ใช้ Web4173/API4294
ไม่เปิด owner DB, ไม่แตะ service เดิม; ก่อนเริ่มไม่พบ listeners ในพอร์ตที่ตรวจ

สอง attempts แรก exit 1 เป็น harness setup failure: sandbox ปฏิเสธ junction และ
workspace-specific better-auth dependency ยังไม่ได้เชื่อม; ไม่ใช่ product failure
หลังเชื่อม installed workspace dependencies:

| หลักฐาน | ผล |
| --- | --- |
| start ใน TTY | Vite ready, API listening; Web PID22296 / API PID18524 |
| GET API4294/api/health | 200; process ok, database/auth not_configured |
| GET Web4173/api/health | 200 ผ่าน proxy มีค่าเดียวกัน |
| GET Web4173/ | 200 HTML |
| พิมพ์ q ใน TTY | “Stopping tracker web and API”, runner exit 0 |
| หลังหยุด | PID ทั้งสองไม่อยู่, listeners4173/4294=0 |
| cold Vite smoke ใน tracker:test | ผ่าน และคืน port4175 |
| fixture cleanup | ตรวจ command line ของ PID2504 ให้ตรง script ก่อนหยุด; คืน port4293 |

สำเนา harness ขาด tailwind .cjs จึงมี warning content config; ใช้ตรวจ lifecycle/health
เท่านั้น ไม่อ้างผล UI styling ของสำเนานั้น (browser download ใช้ compiled app จริงคนละ server)
หลักฐาน runner-health.json/runner-stopped.json ใน local artifacts; terminal tool output มี start/stop/exit จริง
Ctrl+C path, sibling-crash fault, occupied-port fault, long-running soak และ configured DB/Auth lifecycle
NOT TESTED. เหตุ connection refused ในรอบเดิม UNCONFIRMED; ไม่แก้ runner จากการคาดเดา

## คำสั่งและผลจริง

| คำสั่ง | ผล / จำนวน | Exit code |
| --- | --- | --- |
| focused root Vitest ใน sandbox | EPERM realpath; 0 tests executed / 2 suites failed (environment) | 1 |
| focused root Vitest หลัง escalation | 2 files / 64 passed | ไม่ได้เก็บแยก* |
| npm --workspace apps/web run test -- src/tracker/Dashboard.test.tsx | 1 file / 8 passed | 0 |
| npm test รอบแรก | 302 passed แต่ 1 suite failed จาก baseline snapshot ของผู้ทำงาน ถูก test discovery จับ | 1 |
| npm test หลัง rename snapshot | 33 files / 302 passed, 0 failed | 0 |
| npm run build | legacy Vite build ผ่าน | 0 |
| npm run tracker:typecheck | Finance/Contracts/API/Web ผ่าน | 0 |
| npm run tracker:test | Finance21 + Contracts13 + API83 + Web56 = 173 passed; cold Vite smoke ผ่าน | 0 |
| npm run tracker:build | shared/API/Web build ผ่าน | 0 |
| node --no-strip-types scripts/tracker-package-smoke.mjs | compiled imports/Decimal/ledger ผ่าน | 0 |
| node --no-strip-types scripts/phase1-diagnostics-20261007.mjs fx | synthetic cache/backoff/invalid/5s timeout ผ่าน | 0 |
| git diff --check | tracked diff ผ่าน; ตรวจ incremental patch/untracked เพิ่มก่อนส่งงาน | 0 |
| git apply --check --reverse docs/acceptance/phase1-review-20261007.patch | patch ตรงกับ working tree ปัจจุบัน; check อย่างเดียว ไม่ apply | 0 |

*Focused root command พิมพ์ PASS64 และ shell เดียวกันรัน Dashboard ต่อจน exit0;
ไม่มี capture exit ของ root command แยก ณ ขณะนั้น ผล full npm test exit0 ยืนยันซ้ำครบแล้ว
Logs check-1..7.log, check-1-rerun.log และ check-results.json เก็บใน local artifacts
check-results.json เป็นผลรอบแรกทั้งเจ็ด; ใช้ rerun log + ตารางนี้สำหรับ root ผลสุดท้าย
ไม่มี tests skip/ลด assertions. ไม่มี commit/push/deploy, dependency change, DB mutation/reset/drop/truncate/delete หรือ volume deletion
Build/generate ทำเฉพาะ generated artifacts ตาม scripts เดิม
ตรวจ whitespace ของบรรทัดเพิ่มใน incremental patch และไฟล์ใหม่แยกจาก tracked diff:
ไม่มี trailing whitespace ใหม่/conflict markers; PositionsTable บรรทัดว่างที่มี spaces เดิม
นอกส่วนแก้ยังคงไว้ตาม baseline
`git diff --no-index --check /dev/null <new-file>` คืน 1 เพราะมี diff แต่ไม่มี whitespace diagnostics
ไม่รายงาน exit1 นี้เป็น code/test failure

## ข้อจำกัดและงานต่อ

- ช่วงนี้ไม่เชื่อม DB เจ้าของหรือสร้าง fixtures ในฐานเดิม จึงไม่มี before/after DB hash comparison
  ไม่อ้างว่าผ่าน ownership/session/audit/ledger runtime ใหม่จาก mocks/build
- NOT TESTED รอบนี้: PostgreSQL/Auth/restore integration, real-provider soak, saved browser file,
  physical mobile, Nodeขั้นต่ำ22.12, recovery, full backup/restore, off-device และ online target
- A/B/C ปิดตามขอบเขตที่ตรวจ. D เป็นผลวิเคราะห์ มี UNCONFIRMED/NOT TESTED ตามข้างต้น
- L1 ยังไม่ตรวจครบทุก gate; L2/O1 ยังไม่ผ่าน ช่วงแรกไม่ใช่การรับรองพร้อมเก็บข้อมูลจริง/ออนไลน์
- เสนอหลัง review: ช่วง 2 ตรวจ UX/navigation desktop/mobile ตาม spec; แยกงาน FX instrumentation
  แบบ reason codes ที่ไม่บันทึก payload/secret พร้อม synthetic/soak tests, และ saved-file acceptance
  ใน browser ที่รองรับ download จริง โดยยังคง stale30s
- ช่วง 3 ต้องแยกพื้นที่จริง/ทดสอบและ account recovery ตาม decision010;
  ช่วง 4 saved download/full restore/key custody/off-device/schedule/retention;
  ช่วง 5 local acceptance และ online preparation บน target ที่เจ้าของเลือก
  policy/provider/storage ที่ยังไม่เลือกไม่ถูกเดาหรือเปิดใช้ในช่วงนี้

หยุดส่ง review ไม่มีการมอบงานหรือส่งข้อความให้ AI ผู้ตรวจภายนอกโดยอัตโนมัติ
