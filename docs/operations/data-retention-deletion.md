> Current implementation update (2026-10-08): ดู [operator runbook](finish-real-operator-runbook.md) และ [ผลตรวจล่าสุด](../acceptance/finish-real-use-readiness-20261008.md). ข้อความ runtime NOT IMPLEMENTED ด้านล่างเป็น baseline/policy proposal เดิม ไม่ใช่สถานะโค้ดปัจจุบัน; ไม่ถือเป็น policy approval หรือ public activation.

# FINNTECH: Data retention, deletion and backup policy proposal

วันที่ 2026-10-05 — DESIGN READY / policy approval OPEN / runtime NOT IMPLEMENTED

เอกสารนี้เสนอ policy สำหรับ R03/R06 ก่อนข้อมูลจริงและ production
ยังไม่เปิด delete endpoint, cleanup job, schedule, storage หรือ secret rotation
ไม่ใช่คำสั่งให้ลบข้อมูลตอนนี้ ไม่แก้เอกสาร F1.1 หรือ migrations ที่เคย apply
ใช้ร่วมกับ [account recovery](../decisions/010-account-recovery.md)
และ [local PostgreSQL recovery](postgresql-backup-recovery.md)

## หลักที่คงไว้

ข้อมูลเป็นของ owner จาก server session; namespace/export ไม่ใช่หลักฐานยืนยันตัวตน
manual THB/USDT ledger ไม่มี FX หรือการสั่งซื้อขาย ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน
LEGACY_DEMO อยู่ archive แยก อ่านผ่าน server เฉพาะเจ้าของ ไม่รวม dashboard/budget/portfolio ใหม่
v1 ไม่ล้าง archive อัตโนมัติ การยืนยัน currency ไม่เปลี่ยน provenance
การ reverse legacy batch ไม่ใช่ account deletion และไม่แตะรายการใหม่ของผู้ใช้

การแก้/ยกเลิกรายการปกติคง audit/replay ตามระบบเดิม ไม่ใช่การลบบัญชี
JSON export ไม่ใช่ credential หรือ full database backup
ผู้ใช้ต้องรู้ว่าข้อมูลอาจอยู่ใน backup หลังลบจาก active database แล้ว
ห้ามสัญญาว่า “ลบหมดทันทีทุกสำเนา”

## Policy ที่เสนอให้ยืนยันก่อน implementation

ตัวเลขต่อไปนี้เป็น proposed defaults ไม่ใช่ค่า config ที่มีอยู่หรือข้อสรุปด้านกฎหมาย
ต้องบันทึกการอนุมัติและเงื่อนไขที่ใช้จริงก่อน production; ไม่ขวาง workspace/local design

| ชุดข้อมูล | ข้อเสนออายุ/การจัดการ | สถานะปัจจุบันและ gate |
| --- | --- | --- |
| Auth account / owner mapping | เก็บขณะบัญชี active; ลบตาม owner deletion ที่ผ่าน reauthentication | ยังปิด deleteUser; FK Restrict ต้องออกแบบ authorized purge |
| Database sessions | ใช้ expiry เดิม 7 วัน; revoke ทันทีในขั้นตอน reset/deletion ที่สำเร็จ; cleanup expired ภายใน 24 ชั่วโมง | ยังไม่มี cleanup job หรือ reset integration; expiry ไม่เท่ากับลบ row |
| Reset challenges | อายุเสนอ 15 นาที; consume ครั้งเดียว; invalidation ทุก challenge ของ subject หลัง reset/deletion; expired cleanup ภายใน 24 ชั่วโมง | ยังไม่เปิด reset; verification JWT มี semantics ต่างกันตาม decision010 |
| Email verification links | อายุเสนอ 24 ชั่วโมง; ไม่สร้าง session จาก link; revoked/deleted subject ใช้ไม่ได้ | ต้องเพิ่ม subject/deletion checks และทดสอบ signed JWT จริง |
| Finance / budgets / crypto history / holdings | เก็บจน owner ขอปิดบัญชี; ไม่มี idle-account deletion ใน v1 | ไม่ลบประวัติที่จำเป็นต่อ cost/replay อัตโนมัติ |
| Business audit / request receipts | เก็บร่วมกับ dataset ตลอดอายุบัญชี; ไม่ทำ TTL ทิ้ง receipts ที่ป้องกัน duplicate retry | append-only/receipt triggers ปิด DELETE; purge ต้องแยก scope โดยเฉพาะ |
| LEGACY_DEMO archive / imports / namespaces | ไม่มี automatic expiry v1; explicit account deletion ในอนาคตต้องรวม archive ด้วย consent ชัด | ถ้ายังไม่มี authorized purge ที่ผ่าน acceptance ห้ามเปิด account deletion |
| Security/operation metadata | เสนอ 90 วัน; เฉพาะ event/time/outcome และ identifier ที่จำเป็น; ไม่เก็บ raw body/notes/email/IP/token โดยปริยาย | แยกจาก business audit; ไม่มี storage/cleanup ที่ implement แล้ว |
| Encrypted full DB backups | เสนอ daily backup, rolling hard cap 30 วันนับจาก creation UTC รวมทุก replica; ไม่มีสำเนา permanent ที่หลุด policy | ยังไม่มี schedule/off-device location/automatic expiry; DPAPI local rehearsal เท่านั้น |
| Temporary plaintext dump | ลบเมื่อจบงานทุก exit path; ถ้า cleanup fail ต้อง quarantine/แจ้งผู้ดูแล | มี local recovery cleanup evidence รอบก่อน; production pipeline ยังไม่ทดสอบ |
| User-downloaded JSON | ระบบไม่ควบคุมสำเนาที่ผู้ใช้ดาวน์โหลด; UI ต้องแจ้งให้เจ้าของจัดเก็บ/ลบเอง | ไม่มีการอัปโหลด third-party โดยระบบ; ไม่สัญญาลบจากเครื่องผู้ใช้ |
| Deletion journal / receipt | เสนอ pseudonymous minimal evidence 90 วัน; ต้องยาวกว่า backup 30 วันและ recovery quarantine; จำกัดสิทธิ์ | ต้องกำหนด storage/key/access และ emergency case ก่อนเริ่มลบจริง |

proposed deletion grace period 7 วันเริ่มจากคำขอที่ยืนยันแล้ว
จากนั้นลบ active data ภายใน 24 ชั่วโมง หากทำไม่สำเร็จให้ BLOCKED/alert/retry
ไม่เปลี่ยนเป็น COMPLETED เพื่อให้ตัวเลขดูผ่าน; ไม่มีการล้าง archive รายวันตามอายุ
กติกาบัญชีปิดโดยสมัครใจนี้ยังเป็นข้อเสนอ ไม่ใช่ exception ที่เปิดใช้แทน ADR-002 แล้ว

## Account deletion flow ที่ต้องสร้างภายหลัง

1. เจ้าของที่ล็อกอินขอ preview: แสดงจำนวนต่อ table, THB/USDT แยกกัน,
   archive, Auth/sessions, audit/receipts และผลต่อ backups/JSON downloads
   เสนอ export ก่อน แต่ไม่บังคับให้ดาวน์โหลด private data
2. ยืนยัน password ปัจจุบันใหม่ พร้อม exact Origin และ explicit consent
   server ดึง owner จาก session ไม่รับ owner UUID จาก body
   loss of password ไม่ใช้ deletion เป็นทางลัดกู้บัญชี
3. บันทึก request แบบ idempotent และ durable state PENDING_GRACE
   revoke ทุก session/ปิด owner writes และ streams หลังยืนยัน
   ต้องเพิ่ม owner/account lifecycle guard ก่อน requireOwner สร้าง mapping ใหม่
   การเปิดบัญชีอีเมลเดิมใหม่ต้องสร้าง owner ใหม่ว่าง ไม่ผูก dataset เก่า
4. ใน grace period อนุญาตเฉพาะหน้าสถานะ/ยกเลิกคำขอผ่าน restricted reauthentication
   ไม่ให้ session นี้เข้าถึง ledger หรือ authorize APIs ปกติ
   ยกเลิกสำเร็จกลับ ACTIVE และต้อง login ใหม่; ห้ามยกเลิกเมื่อ PURGING เริ่มแล้ว
5. หลัง grace worker ตรวจ state/owner และใช้ exclusive owner-dataset lock
   ตามลำดับล็อกเดียวกับ restore; serialize กับ Auth changes และทุก ledger write
   regular mutations ปัจจุบันใช้ shared dataset lock ใน `apps/api/src/tracker/service.ts:41`
   ต้องเพิ่ม lifecycle check ภายใต้ lock เพื่อไม่ให้คำขอที่รออยู่เขียนหลัง purge
6. ลบใน owner-scoped transaction ตาม FK dependency ที่ตรวจจริง รวม
   audit ที่อ้าง receipts/identities, receipts, holdings ก่อน trades,
   budgets/transactions ก่อน categories, trades/holdings ก่อน portfolios,
   legacy summaries/rows ก่อน imports ก่อน namespaces แล้ว identity/owner
   revoke/ลบ Auth sessions/accounts/user และ challenges ของ subject ด้วยวิธี Auth ที่รองรับ
   shared crypto_assets/provider metadata ไม่ใช่ข้อมูลส่วนตัวของ owner ห้ามลบของคนอื่น
7. เก็บ minimal receipt แยกจาก FK ของ owner ที่ถูกลบแล้ว และ deletion journal
   สำหรับกัน resurrect; ห้ามคง note, ledger, email, credential หรือ token เพื่อเป็น receipt
   publish journal ก่อน COMMITTED ด้วย durable protocol ที่ตรวจ failure ได้
   ถ้า storage ต่างระบบ ต้องกำหนด pending/reconcile ไม่อ้าง atomic cross-system โดยไม่มีหลักฐาน
8. retry key/payload เดิมคืนสถานะเดิม; ต่าง payload conflict
   timeout หลังส่ง commit คือ UNKNOWN จนตรวจ journal/receipt ไม่อ้าง rollback
   completion หมายถึง active purge สำเร็จ; backup expiry ยังแสดง deadline แยก

ไม่มี flow ข้างต้นอยู่ใน runtime ตอนนี้ การลบโดยผู้ดูแลไม่ใช่ bypass ให้ข้าม reauth/consent
incident/legal exception ถ้าต้องมี ต้องกำหนด actor/authority/evidence แยกก่อนใช้งาน

## Schema blockers ที่พบจริง

`apps/api/prisma/migrations/20261001000001_tracker_invariants/migration.sql:96`
มี append-only triggers ของ legacy rows/summaries/audit
line111/127 ปิด DELETE ของ imports/receipts; schema มี owner FK Restrict
และ `AuthIdentity.authUserId` Restrict ใน `apps/api/prisma/schema.prisma:87`
ดังนั้นเปิด Better Auth deleteUser flag อย่างเดียวลบ dataset ไม่ครบและอาจล้ม

ก่อน implementation ต้องมี forward migration สำหรับ privileged owner-scoped purge
และ lifecycle/journal ตาม design ที่ตรวจแล้ว ห้ามแก้ migration เก่าหรือปิด triggers
ทั้งระบบด้วย session_replication_role, disable trigger, table truncation หรือ cascade ใหม่
role ของ API ปกติต้องยังลบ append-only records โดยตรงไม่ได้
ต้องพิสูจน์ด้วย PostgreSQL roles/constraints/locks จริง ไม่ใช้ unit mocks แทน

## ผลต่อ backup และการ restore

- local DPAPI CurrentUser ที่ทดสอบแล้วผูก Windows profile/เครื่องเดิม
  ยังไม่รองรับ machine-loss recovery; ไม่มี portable key custody/off-device schedule
- เป้าหมายเสนอ RPO 24 ชั่วโมง / RTO 4 ชั่วโมง ยังไม่อนุมัติและไม่ผ่าน load/recovery test
  ให้เลือก encrypted off-device storage, portable keys แยกจาก backup, ผู้รับผิดชอบ
  และ alert เมื่อ backup/expiry/decrypt/recovery fail ก่อนใช้งานข้อมูลจริง
- ทุก replica/snapshot รวม manual recovery evidence ที่มีข้อมูลต้องอยู่ใน inventory
  ระบุ creation/expiry UTC; operator ไม่เก็บสำเนาเพิ่มนอก inventory โดยไม่กำหนด policy
  ไม่ purge private rehearsal archive/volume ที่มีอยู่ในรอบเอกสารนี้
- deletion journal ต้องอยู่นอกชุด snapshot ที่นำ restore และตรวจความครบได้
  ห้าม restore journal เก่าแล้วปล่อยข้อมูลที่ผู้ใช้ลบภายหลังกลับ online
  identifier/digest ใน journal เป็น pseudonymous และเป็นข้อมูลควบคุมสิทธิ์ด้วย
- restore ไป target แยกที่ยืนยัน empty/ไม่เปิด network เท่านั้น
  reconcile journal ใหม่กับ restored owner scopes ก่อนให้ API เปิด
  ถ้า journal/key/expiry evidence ไม่พร้อมให้ quarantine และหยุด ไม่ประกาศ restore ready
- ก่อนเปิด target ต้อง purge owner ที่ลบหลัง snapshot ด้วย authorized flow,
  invalidate restored sessions/reset challenges และ rotate signing secret ตามแผน
  ไม่คืน credentials/recovery links ที่ยกเลิกแล้ว; ไม่ส่งเมลจาก restored outbox เก่า
- ทดสอบยอด/count/hash ของ owner ที่เหลือหลัง reconcile แยกจาก fidelity ก่อน reconcile
  การ purge ตาม journal ทำให้ snapshot hash เปลี่ยนโดยตั้งใจ ต้องมีหลักฐานแยก
- full dump ไม่รองรับ selective immediate erasure ของผู้ใช้หนึ่งรายตามแผนปัจจุบัน
  ข้อมูลใน encrypted backups หมดอายุตาม hard cap 30 วันเมื่อ policy เปิดใช้จริง
  ไม่อ้างว่าแค่ revoke key หนึ่งตัวเท่ากับพิสูจน์ว่าลบทุกสำเนาแล้ว

ถ้าการเก็บจริงเกิน 30 วัน เช่น expiry job ล้ม ต้องแจ้ง breach ของ policy ภายใน
และไม่ทิ้ง deletion journal ที่ยังจำเป็นต่อสำเนานั้นตามวันที่ 90 อัตโนมัติ
ให้ระงับ restore และแก้ inventory/retention ก่อน ลดช่อง resurrect อย่างมีหลักฐาน

## Secret rotation ที่ยังต้อง implement

server-only secrets ไม่อยู่ VITE_* หรือ frontend; แยก env/key custody จาก DB dump
rotation เป็นงานที่มี rollback และ version tracking โดยไม่ log value
Auth signing-secret rotation ต้อง invalidate sessions/challenges ที่ได้รับผล
และทดสอบกับ installed Better Auth จริง ไม่อ้างว่าเปลี่ยน env อย่างเดียวครบทุกขั้น
DB credential rotation ต้องเลือก role/grants และ reconnect อย่างควบคุม
provider key rotation เป็นงานแยกและยังไม่ตั้ง actual stock provider
backup-key rotation ต้องยืนยันว่า decrypt สำเนาที่เก็บอยู่ได้บน recovery environment
การกลับไปใช้ secret เก่าต้องไม่ทำ revoked sessions/tokens กลับมาถูกยอมรับ

## Acceptance และสถานะรอบเอกสาร

| ID | กรณีตรวจ runtime ในเฟส implementation | ผลรอบนี้ |
| --- | --- | --- |
| P01 | preview/consent/reauth/Origin และ owner A/B; anonymous/spoof ปฏิเสธ; archive แยก | NOT TESTED |
| P02 | grace cancellation ผ่าน restricted auth; ไม่อ่าน/เขียน ledger; reject cancellation หลัง PURGING | NOT TESTED |
| P03 | lifecycle/locks กัน ledger write, restore, reset แข่ง deletion; foreign owner ไม่เปลี่ยน | NOT TESTED |
| P04 | PostgreSQL purge ครบ FK/append-only scope ด้วย role จำกัด; regular API ไม่มีสิทธิ์ลบ audit/archive | NOT TESTED |
| P05 | duplicate key/conflicting payload/timeout/worker restart กลับสถานะถูก; no resurrection หรือ partial-success report | NOT TESTED |
| P06 | active purge และ journal publish fail แต่ละจุด: fail closed/reconcile; ไม่ lose deletion evidence | NOT TESTED |
| P07 | snapshot ก่อน deletion restore แยก แล้ว journal ใหม่ purge account ก่อน online; owner อื่นคง counts/totals | NOT TESTED |
| P08 | revoked/deleted identity, sessions, reset/verification links และ queued emails ใช้ไม่ได้หลัง restore/rotation | NOT TESTED |
| P09 | retention 30 วันครบทุก replica; expiry failure แจ้งและคง journal ที่จำเป็น; RPO/RTO วัดจริง | NOT TESTED |
| P10 | machine/profile loss decrypt portable backup ได้; keys แยก; target nonempty ต้องหยุด ไม่ reset | NOT TESTED |
| P11 | audit/log/receipt ไม่รั่ว secrets/notes/PII; browser/API ระบุ active purge กับ backup expiry แยก | NOT TESTED |

รอบนี้ตรวจเฉพาะความสอดคล้องของเอกสาร/หลักฐาน source และ baseline/whitespace
ไม่เรียก Docker/DB/browser/provider หรือเปลี่ยน runtime configuration
local restore PASS ในรอบก่อนอ้างได้เฉพาะ fidelity/rehearsal ตาม evidence เดิม
ไม่ใช้เป็น production retention/deletion/portable recovery PASS

## จุดที่ต้องตัดสินก่อนเปิดใช้

1. ยืนยันค่าที่เสนอ: reset 15 นาที, verification 24 ชั่วโมง, deletion grace 7 วัน,
   active purge ภายใน 24 ชั่วโมง, backups สูงสุด 30 วัน, minimal metadata/journal 90 วัน
   และผู้รับผิดชอบรับ alert/ดำเนินการเมื่อ failure
2. เลือก mail delivery กับ encrypted off-device storage/key custody ที่เข้าถึงได้
   โดยไม่ส่ง secret ผ่านแชตหรือสมัครบริการในงานนี้
3. ยืนยันขอบเขต retention/ข้อยกเว้นตามการใช้งานจริงก่อน production
   ออกแบบ forward migration/privileged purge/atomic reset integration แล้วตรวจ acceptance

เมื่อยังไม่ยืนยัน: R04/R06 เป็น design พร้อมแต่ runtime OPEN,
R03 เป็น local rehearsal PASS และ production backup PARTIAL
ห้ามทำให้สถานะ DONE จากการเขียนแผนนี้
