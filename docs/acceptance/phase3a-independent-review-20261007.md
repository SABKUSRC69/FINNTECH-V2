# FINNTECH ช่วง 3A — ผลตรวจทวนอิสระ

2026-10-07 Asia/Bangkok — ตรวจงานและทำพรอมป์ส่งต่อ ไม่แก้ application source

## ข้อสรุป

รับ implementation ช่วง 3A ในขอบเขต isolated synthetic recovery/verification
จาก source/patch/tests และหลักฐานที่ตรวจ ไม่พบประเด็นที่ขวางการรับงานภายใน scope นี้
ไม่เท่ากับปิด account-recovery สำหรับข้อมูลจริง ไม่รับรอง production และไม่เปิด 3B
feature ยังต้อง OFF สำหรับ owner/data จริงตาม configuration ปัจจุบัน

## สิ่งที่ตรวจเอง

- อ่านรายงาน, changed-files, final-results, integration-summary, lifecycle และ harness ทั้งสอง
- อ่าน RecoveryService, runtime/config, delivery, authorization, app/server, WS subject gate,
  forward migration, target/prepare guards และ RecoveryPanel/client/App/Account integration
- `git apply --check --reverse docs/acceptance/phase3a-review-20261007.patch` exit0
  ตรวจอย่างเดียว ไม่มี apply/reverse เปลี่ยน source
- รัน focused regression 7 files รวม 78 tests ผ่าน exit0:
  recovery-config, auth-config, authorization, RecoveryPanel, auth/client, App, Dashboard.navigation
- ครั้งแรก sandbox มี EPERM realpath ทั้ง7 files และไม่มี test execute exit1;
  คำสั่งเดียวกันนอก sandbox ผ่าน ไม่ตี permission failure เป็น bug
- npm pretest สร้าง shared builds/Prisma generated client ตาม scripts เดิม ไม่ apply migration
- ดูภาพ reset390 dark และอ่าน browser evidence summary; ไม่ทำ browser interact/กรอก credential ใหม่

Logs: `.phase3a-independent-review-20261007.local/focused-tests.log` และ `focused-tests-host.log`
ไม่ได้เปิด PostgreSQL/recovery runtime, อ่าน private runtime.env/mailbox,
รัน PG harness หรือ full suites/build/browser matrix ใหม่ในรอบนี้
root322/tracker193/PG14+1 และ browser40 เป็นหลักฐานผู้ทำ ไม่ใช่ผล rerun ของผู้ตรวจ

## ผล review

| ส่วน | ผล | เหตุผลและขอบเขต |
| --- | --- | --- |
| Default off/isolation | ACCEPT | config จำกัด mode/confirmation/exact DB role port origin/non-production; routes/UI เปิดจาก server capability; ไม่เปลี่ยน env owner |
| Outer transaction | ACCEPT ตาม code + PG evidence | runtime ใช้ transaction client/adapter transaction:false ภายใน outer transaction; AuthUser row lock ก่อน consume; password/challenge/hook/session/outbox อยู่ใน scope เดียว; fault hooks/assertions ครอบคลุม rollback จริงตาม logs |
| Verification/reset | ACCEPT synthetic | library JWT + digest binding, expiry/replay/password policy/subject checks; password proof ก่อน enrollment เดิม; ไม่เปลี่ยน owner mapping และไม่ auto-login |
| Session revocation | ACCEPT ในกรณีที่พิสูจน์ | HTTP rejection + WS periodic revalidation/subject gate; PG harness ตรวจทั้ง market/stocks; latency5008ms ไม่อ้างว่า immediate หรือ SLA≤5s |
| Lost response | ACCEPT | actual HTTP body aborted after commit ตาม harness; token replay rejected/passwordใหม่ใช้ได้; frontend unknown ไม่ resubmit และล้าง password/token |
| Durable local delivery | ACCEPT synthetic sink | encrypted outbox, unique fingerprint, row lock/SKIP LOCKED, bounded retry และ expiry เดิม; process restart/ack-loss assertions; ไม่ใช่ real mail provider acceptance |
| Rate/Origin | ACCEPT loopback | persistent account/peer buckets และสองprocessตามharness; spoof/callback rejection; peerเป็น loopbackร่วมกันโดยตั้งใจ ยังไม่ใช่ production IP/proxy policy |
| Browser/frontend | ACCEPT เฉพาะ layout + unit flows | query cleared, explicit confirmation, busy locks/default-off tests; browser40ไม่ได้กรอก reset credential ไม่ถือเป็น full end-to-end recovery |
| A11 blocked gate | ACCEPT เฉพาะ gate | HTTP/get-session + authSubjectAllowed assertion; ยังไม่ใช่ deletion workflow/restore tombstones และไม่ได้เห็น blocked-subject WS runtime assertion แยก |
| Preservation/migration | ACCEPT ตาม patch/evidence | forward migrationใหม่, target guardไม่reset, privatefilesไม่อยู่ในรายการส่งมอบ; ledger/hash evidenceเป็นผลharnessผู้ทำ ไม่อ้างตรวจ DB ownerเอง |

## ช่องว่างที่ต้องคงไว้ก่อนเปิดข้อมูลจริง

1. Browser end-to-end signup→verify→login→reset→loginใหม่, authenticated Account,
   storage/network/referrer audit และ test session-revocation ผ่านหน้าเว็บจริงยังค้าง
   การห้ามกรอกรหัสผ่านใน computer-use เป็นข้อจำกัดของ workflow ไม่ใช่ product bug
   จัดขั้นตอนให้มนุษย์ takeover ในจุด credential แล้วเก็บเฉพาะผลที่ไม่เผยความลับ
2. Kill process ระหว่าง transaction, blocked-subject WS runtime และ long-duration/load
   ยังต้องตรวจตามความเสี่ยงก่อน rollout; fault rollback/restart ที่มีไม่ใช่หลักฐานทุก crash scenario
3. Real delivery, failed-job expiry/cleanup, key-loss/key rotation และ outbox retention ยังไม่มี acceptance
   ไม่ยก encrypted local sink เป็นช่องทางกู้บัญชีจริง
4. Deletion/restore tombstones ไม่ได้ implement; อย่าเปิด account deletion หรือสัญญาป้องกัน resurrection
   จนมี workflow/backup integrationและหลักฐานที่เกี่ยวข้อง
5. Hardcoded synthetic restrictions ต้องรักษาไว้ การเปิดจริงเป็น implementation/policy อีกช่วง
   ไม่ใช่เปลี่ยน env flagหรือแทนชื่อDBแล้วใช้ได้ทันที
6. Owner rollout/recovery lifetimes/mail/storage/proxy decisions ยังไม่ถูกอนุมัติจากการรับ3Aนี้

ข้อสังเกต frontendที่ควรเก็บไว้ในงานปิด acceptance:
`readAccount()` branch `/api/me`=401 คืน signed-out โดยไม่มี recovery capability
แม้ healthเพิ่งประกาศ feature=true; หากsessionหมดอายุระหว่างreadจะซ่อนrecovery controls
ชั่วคราวจนreload/recheck ควรรักษา capabilityเดิมและเพิ่ม regression สำหรับกรณีนี้
ไม่ขวาง default-off synthetic implementation แต่ควรแก้ก่อนเปิด recovery ให้ผู้ใช้จริง

ชื่อ test A11 ที่รวมคำว่า WS/deletion-pending กว้างกว่าข้อassertionท้ายtest
ให้ยึดรายละเอียดรายงานที่แยกNOT TESTEDไว้ ไม่ใช้ชื่อtestเป็นหลักฐานdeletion/WSทุกกรณี

## งานถัดไป

ทำ 3B ขั้นเตรียมแผนและรวบรวม input ก่อน activation ใช้
`docs/handoff/FINNTECH_PHASE_03B_PREPARATION_PROMPT_TH.md`
ยังไม่ทำดีไซน์รอบใหม่ ไม่ซื้อบริการ ไม่ deploy และไม่ migrate/เปลี่ยนข้อมูลจริงอัตโนมัติ
งาน backup/FX/configured runner/release acceptance เดิมไม่ได้ถูกปิดด้วยการรับ recovery3A
