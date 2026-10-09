# FINNTECH — Finish real-use review, 8 ตุลาคม 2026

**สถานะ: NOT READY สำหรับข้อมูลจริง/public activation.** ทำ implementation และตรวจ local/synthetic ต่อจาก dirty checkout เดิม ไม่มี commit/push/deploy ไม่มีการแก้ฐาน Beta ไม่มี paid resource. เจ้าของแจ้งว่ายังไม่มี private Brevo/Drive setup และให้พัก machine-loss drill จึงไม่สร้าง fake delivery/restore PASS.

## สิ่งที่ส่ง review

- Staging allowlist ฝั่ง server ขณะ public signup ปิด: จำกัด signup/signin/HTTP/WS/recovery/delivery; health/UI เห็น boolean เท่านั้น ไม่เห็นอีเมล. สมัครจริงเริ่มว่าง ไม่มีการย้าย DEMO.
- Owner deletion: current password + explicit consent, derive owner จาก authenticated session, รอ pending dataset writes, revoke sessions/challenges/outbox และ block account ใน transaction. UI รักษา pending lock และ original UUID เมื่อ timeout/reload. แยก operator purge scope จาก API role ไม่ปิด audit/ledger guards ทั้งระบบ.
- Encrypted off-device deletion registry: persist reserved ID + ciphertext ก่อน send, authenticated index ระบุ case IDs/hashes, conditional append ก่อน purge; restore ปฏิเสธ registry หาย/incomplete/changed และ replay ก่อนอนุญาต staging rebind. Rebind ล้าง snapshot sessions/challenges/outbox เพื่อไม่ให้ token เก่ากลับมาใช้ได้.
- Backup runner durable journal/mutex/สอง attempts ต่อ run, original archive/Drive ID เดิม; Windows installerตรวจ setupก่อน activate, ไม่ทับ taskเดิม. Independent watchdogแยก CURRENT/ALERT_ACCEPTED/ALERT_UNCONFIRMED และไม่อ้าง received จาก provider201.
- Local/Drive retention dry-run + reviewed digest, hash/key/private ownership/current backup/conditional token checks; retry reconcile ID เดิม. ไม่มี automatic deletion เปิดใช้งาน. เพิ่ม Drive setup, private validation, full restore และ operator CLI.
- ไม่เปลี่ยน dependencies/lockfile จาก baseline งานนี้ ไม่ redesign ไม่แก้การคำนวณ Decimal/THB/USDT/USD หรือ stale30s.

## ผลรันจริงในงานนี้

จำนวนเป็นแต่ละ suite ไม่บวกกับ focused reruns หรือผลเก่า. คำสั่งที่ใช้ private `--env-file` ไม่มีค่า secrets ในหลักฐาน.

| คำสั่ง/การตรวจ | ผล | Exit code |
|---|---|---:|
| `npm test` | PASS 406 tests / 49 files | 0 |
| `npm run build` | PASS | 0 |
| `npm run tracker:typecheck` รอบสุดท้าย | PASS | 0 |
| `npm run tracker:test` รอบสุดท้าย | PASS 261 tests (finance21 + contracts13 + API124 + web103), dev smokeผ่าน | 0 |
| `npm run tracker:build` | PASS | 0 |
| `node --no-strip-types scripts/tracker-package-smoke.mjs` | PASS compiled package/Decimal/ledger | 0 |
| `node --no-strip-types --env-file=.finish-real-20261008.local/rehearsal.env --import tsx --test apps/api/db-test/real-use.integration.ts` | PASS 18/18 รวม restore/rebind และ invalidate snapshot sessions/challenges | 0 |
| `powershell.exe -NoProfile -NonInteractive -File scripts/finish-scheduler-smoke.ps1` | PASS triggerจริง + cross-process mutex; test taskถอดออก | 0 |
| Docker build `finntech-real-review:finish-20261008` | PASS local image | 0 |
| Package smoke ใน image ด้วย Node22 `--no-experimental-strip-types` | PASS | 0 |
| Image scan 4,713 files | PASS ไม่พบ known synthetic secrets/forbidden env/key/archive files; ไม่ใช่ universal secret detector | 0 |
| `git diff --check` | PASS tracked tree; incremental patch check แยกในหลักฐาน | 0 |
| `npm audit --json` | **FAIL 14 findings: 12 high, 2 moderate** | 1 |
| `node --no-strip-types scripts/real-private-setup-check.mjs inventory` | BLOCKED: ไม่มี owner private configuration ตามคำตอบเจ้าของ | 1 |

ข้อผิดพลาดที่พบและแยกสาเหตุ:

- Build ใน sandbox resolve Vite ไม่ได้; คำสั่งเดียวกันนอก sandbox ผ่าน โดยไม่เปลี่ยน dependency — environment failure.
- Typecheck รอบแรกไม่มี `.d.mts` สำหรับ helper ใหม่; เพิ่ม declarations แล้ว rerun ผ่าน — แก้ code/test integration.
- Restore rebind รอบแรกใช้ reason ยาวเกินคอลัมน์ delivery job ทำให้ rollback; ย่อเป็น `RESTORE_REAUTH_REQUIRED` แล้ว rerun PostgreSQL18/18ผ่าน โดยไม่เปลี่ยน schema/assertions.
- Staging test คาด401แต่ API ปฏิเสธสมาชิกด้วย403ตาม semantics เดิม; แก้ expected code เป็น403 ยัง assert denial/job count/data unchanged.
- Windows default task ไม่เริ่มขณะ BatteryStatus1 (discharging), LastTaskResult267011/0x41303; เพิ่ม explicit battery settings แล้ว triggerจริงผ่าน. ไม่มี backupจริงถูกตั้ง schedule.
- `--no-strip-types` ใช้กับ Node22 ใน imageไม่ได้ (exit9); ใช้ `--no-experimental-strip-types` ที่ Node22 รองรับแล้ว smokeผ่าน ไม่เปลี่ยน runtime dependency.
- งานถูก interrupt และ Docker engineหยุด; retryหนึ่งครั้ง connect5446ไม่ได้ exit1. Restartเฉพาะ Docker/fixturecontainersและใช้ retained volumes ไม่resetฐาน. บันทึก rerunสุดท้ายแยก ไม่อ้าง interrupted run ว่า PASS.

## PostgreSQL, restore และ browser evidence

Rehearsalเฉพาะloopback5446/5447, project `finntech-finish-real-20261008`, fresh credentials/private env, volumeใหม่สองชุด. Source testsเพิ่มบัญชีสังเคราะห์ใหม่แต่ละรอบ ไม่ reuseเจ้าของ/DEMO และไม่reset/drop/truncateฐาน. Testsลบเฉพาะ ownerที่สร้างและ consent ภายใน case.

ตรวจ atomic reset rollback, token expiry/replay/scanner GET, exact Decimal ownership/receipts, logout/expiry/restart persistence, HTTP/market+stocks WS revocation. Deletionทดสอบ current password/consent/foreign owner denied, pending write lock, full purge rollback, operator/API deny direct audit DELETE, lost upload/idempotent purge, missing registry inventory และ old backup replay. Snapshotเต็ม **30 tables** เทียบรวม columns/NUMERIC/constraints/functions/triggers/indexes/sequences และ all-row aggregate hashes; ไม่พิมพ์ records/password hashes/tokens. RTOที่วัดเป็น local synthetic เวลาใน `integration-summary.json` ไม่ใช่ production RTO.

Browserจริงในเครื่อง: compiled app + synthetic database ที่390px ไม่มี page horizontal overflow (`scrollWidth=innerWidth=390`); fragmentถูกลบก่อน interaction, tokenที่ไม่ถูกต้องแสดง errorหลัง explicit confirmation. ภาพ `login-390.jpg` และ `rejected-token-390.jpg`. นี่ไม่ใช่ controlled mailbox delivery, authenticated independent browser/device acceptance หรือ HTTPS/WSS cloud PASS. หน้าบัญชี/deletion locks ตรวจด้วย component tests; ไม่มีการอ้างว่า physical mobile ผ่าน.

## Release identity และ security assessment

Local image: `finntech-real-review:finish-20261008`

Image ID: `sha256:508aed54e722783203199a7bfcec6f93e38c22870ae40b9e1923c2e66bdc04fb`

Build input SHA-256: `5428616345ba15f024e78df6c2e0ec5a52a855736622aad164ea6f287483c30d` (89 release input files; current tracker source, ไม่ใช่ legacy Git HEAD). Manifestและinventoryอยู่ evidence. ไม่มี registry push หรือ cloud URL ใหม่.

Runtime inventory119 packages ไม่พบ14 package namesที่auditระบุ แต่ **auditยังFAIL**. รายการ build/tool dependenciesรวม Prisma config/mysql2/deepmerge-ts, Tailwind/chokidar/braces/micromatch/fast-glob/globby/gh-pages, postcss parsers และ source-map-js. ตรวจบน final runtime inventoryแล้ว;ไม่ใช้ `audit fix --force`, ไม่downgradePrisma, ไม่เปลี่ยนtemplate. Build pipelineรับเฉพาะtrusted repository inputs;ต้อง review/แก้ findingsก่อนactivation ไม่อ้าง zero vulnerabilities. ไม่มี local OS CVE scanner จึง base-image CVE scan NOT TESTED (เก็บOS package inventoryเท่านั้น).

## สิ่งที่ยัง BLOCKED / NOT TESTED

| Workstream | ขอบเขตที่ยังไม่ผ่านจริง |
|---|---|
| Brevo | Owner account/sender/API key ยังไม่ตั้ง; received verify/reset/notice, inbox/spam/delays/quota/rejection จริง NOT TESTED |
| Google Drive | Exact folders/OAuth/capacity/permissions/refresh lifecycle/conditional ETag semantics/upload/download/retention จริง NOT TESTED; mocksไม่ใช่provider acceptance |
| Disaster recovery | Ownerพัก second-device/VM/key custody; machine-loss restore NOT TESTED และไม่ยกเว้นreadinessgate |
| Backup scheduling | Synthetic Windows trigger/mutex PASS; actual owner backup scheduleไม่activateเพราะsetup/restore/alert acceptanceไม่ครบ |
| Independent Gmail alerts | Code/mockครอบคลุมmissing/offline/failure/expired auth; runnerนอกเครื่องและmailbox receiptจริง NOT TESTED |
| Deployment | New Render/Neon targetยังไม่สร้าง, stagingapprovalยังไม่มี, HTTPS/WSS/cookie/proxy/cold wake/redeploy/rollback/device acceptanceจริง NOT TESTED |
| Security | npm auditFAIL14; base-imageCVE scanยังไม่ทำ |

งาน code ส่วนที่ทำได้อิสระถูกส่ง reviewแล้ว; external tools/CLIsที่ยังไม่เคยรันกับผู้ให้บริการระบุข้อจำกัดไว้ ไม่ถือ configuration present เป็น readiness. การ public activationต้องแยกจาก old DEMO approval และ staging approval.

## ส่งมอบและขั้นต่อไป

Incremental patch: `finish-real-use-incremental-20261008.patch` เทียบ `.finish-real-20261008.local/before/` ณเริ่มงาน (418ไฟล์baseline), รวมไฟล์ใหม่ ไม่ใช่ whole Git HEAD diff. Manifestระบุbefore/after hashesและไฟล์ที่เปลี่ยน ตรวจforward-applyกับสำเนาbaselineแยกและreverse-applyกับcurrent treeผ่าน (check-only ไม่มีการrevert) รวม85ไฟล์ในpatchเพื่อให้reviewได้. ไฟล์private env/keys/backup/raw recordsไม่อยู่patch.

เจ้าของทำเฉพาะ [private setup checklist](../operations/finish-real-private-setup.md) เมื่อพร้อม โดยแจ้งเพียงpath ไม่ส่งcredentials. Reviewerตรวจ [operator/restore/incident/rollback runbook](../operations/finish-real-operator-runbook.md), patch และrelease identityก่อนอนุมัติบริการใหม่. เมื่อมีactualproviderinputsจึงทดสอบรับอีเมล/Drive/Gmail และmachine-lossตามgate จากนั้นจึงขอstagingdeploymentและHTTPSacceptance ไม่ขอเลือกโฮสต์/งบซ้ำ ไม่เปิดpublicหรือdeployในงานนี้.
