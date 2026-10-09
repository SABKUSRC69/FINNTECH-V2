# พรอมป์ 3B — เตรียมระบบสำหรับข้อมูลจริงในเครื่อง ยังไม่เปิดใช้งานจริง

คัดลอกข้อความหลังเส้นคั่นส่งให้ AI ผู้ลงมือทำ

---

ช่วง3Aรับreviewในscopeisolatedsyntheticแล้ว อ่าน:
docs/acceptance/phase3a-independent-review-20261007.md
docs/acceptance/phase3a-review-20261007.md
docs/acceptance/system-remaining-20261007.md
docs/operations/recovery-3a-local.md
docs/decisions/010-account-recovery.md
docs/operations/data-retention-deletion.md
docs/operations/postgresql-backup.md และ postgresql-backup-recovery.md

Repository: C:\Users\Admin\Downloads\FINNTECH
บทบาทของคุณในรอบนี้คือเตรียม3Bให้เลือกได้และปิดข้อบกพร่องเล็กใน3A
เป้าหมายเจ้าของคือใช้ส่วนตัวในเครื่องก่อน เตรียมออนไลน์ภายหลัง
พักredesign/template/dependencyupgradeที่ไม่จำเป็น ใช้ทรัพยากรฟรีอย่างถูกสิทธิ์

## A. แก้ข้อสังเกต3Aที่ไม่ต้องมีpolicyใหม่

- readAccount branch /api/me=401 ต้องคง recovery capabilityจากhealth
  เพิ่ม regression เมื่อ sessionหมดอายุระหว่าง get-session กับ /api/me
  ไม่เปลี่ยน owner/auth guard และไม่ทำให้ featureปิดกลายเป็นเปิด
- แก้ชื่อ/คำอธิบาย test A11 ให้ตรงassertions หากยังไม่ได้ยิง blocked WS จริง
  คง NOT TESTED deletion/restore tombstones; อย่าเปลี่ยนexpectedเพื่อกลบผล
- baseline snapshotเทียบก่อนงานโดยรวม untracked ห้าม reset/ทับงานเดิม
- รัน checks ที่เหมาะกับsourcechangeตามscriptsเดิม และส่งผลจริง ไม่ยึดcount322/193เป็นexpectedคงที่

## B. เตรียมแผนที่ตรวจได้ก่อนถามเจ้าของ

จัดเอกสารหนึ่งฉบับแยก local-real-dataจากonline พร้อมค่าใช้จ่ายและtradeoff:

1. แผนพื้นที่ข้อมูลจริง: account/DB/role/volume/configแยกจากfixture,
   first-run/forwardmigration/verification/rollback และวิธีพิสูจน์target
   ตรวจเฉพาะชื่อ/โครงสร้างหรือตัวอย่าง ไม่เปิดอ่านsecretsหรือเริ่มฐานจริง
2. แผนrecoveryที่ใช้งานจริงได้: ช่องทางเข้าถึง/ส่งข้อความ,
   lifetimes/rolloutบัญชีเก่า/no-auto-promoteและsessionrevocation
   localencrypted sinkใน3Aเป็นrehearsal ไม่ใช่ช่องทางจริงสำหรับowner
   ถ้าเสนอemailproviderให้ตรวจofficial pricing/license/limitsปัจจุบัน
   ใช้free-tierเฉพาะเมื่อเพียงพอและไม่ต้องสมัครtrialใส่บัตร ไม่สมัครบริการเอง
   หากไม่มีวิธีฟรีที่เหมาะให้บอกข้อจำกัดและเสนอทางเลือกที่ต้องออกแบบต่อ
3. แผนfullbackup: อุปกรณ์/ที่เก็บที่มีอยู่, off-device, ความถี่/retention,
   custody/recoveryของkeys และrestoreบนเครื่องหรือWindowsuserใหม่
   ห้ามสรุปว่าDPAPICurrentUserย้ายเครื่องได้เอง; ห้ามส่งdump/keyไปแชตหรือcloud
4. นโยบายข้อมูลขั้นต่ำสำหรับรุ่นส่วนตัว: เก็บ/ส่งออก/ลบและsecrets rotation
   แยกproposeddefaultsจากapprovedvalues; ไม่สร้างauto-deletejobหรือเปิดdeleteendpoint
5. acceptanceรุ่นสุดท้าย: browserresetให้มนุษย์กรอกcredentialในจุดที่จำเป็น,
   storage/network/referrer, blockedWS, crashระหว่างtransaction,
   backupfileparse/restore, FXoutage/recovery และconfiguredrunnerlifecycle
   ระบุsource/buildhash, target, criteria และ PASS/FAIL/NOT TESTED
6. dependencyaudit: แยกruntime/dev/legacyและขั้นตอนตรวจ
   อย่าอ้างผลถ้ายังไม่มีregistryresponse อย่าอัปเกรดอัตโนมัติ/ส่งsourceหรือenvภายนอก
7. onlinegatesแยกไว้ภายหลัง: HTTPS/proxy/rate/monitoring/release/rollback
   ไม่บังคับให้ซื้อโฮสต์หรือทำstock/news/tradingจริงเพื่อปิดรุ่นส่วนตัว

ทำdraftและตารางทางเลือกให้เสร็จก่อนถามinput
ถามเฉพาะสิ่งที่มีผลต่อactivation เช่นที่เก็บสำรอง/ช่องทางrecovery/rollout
แนะนำทางเลือกที่ค่าเพิ่ม0บาทเมื่อทำได้ ไม่เดาว่าownerมีexternaldriveหรือmailproviderใด
รักษางานที่ไม่ขึ้นกับinputและทำต่อได้ขณะรอ แต่dependentactivationต้องรอคำตอบจริง

## C. ขอบเขตที่ยังไม่เปิดในรอบนี้

ไม่เปิด recovery บัญชีเดิม ไม่เปลี่ยน apps/api/.env ไม่ทำ owner migration
ไม่สร้างบัญชี/ข้อมูลจริง ไม่ promote DEMO ไม่ reset/drop/deletevolume
ไม่ซื้อ/สมัครprovider/ส่งmailจริง ไม่deploy ไม่เริ่ม3Bactivationเพียงเพราะdraftเสร็จ
ห้ามอ่อนค่าข้อจำกัดsyntheticเพื่อให้test/ownerใช้งานได้ทันที
ยังไม่implementdeletionหรือrestoretombstonesโดยปริยาย

## D. ส่งมอบและหยุดรอreview

- incrementalpatchรวมไฟล์ใหม่สำหรับข้อAและเอกสาร
- reportพร้อมผลchecks/attempts/ข้อจำกัด แยกผลรันเองจากหลักฐานเก่า
- draftplan + choices/inputที่ยังขาด + งานแต่ละgate/เกณฑ์ปิดงาน
- ระบุว่า feature ownerยังOFF และไม่มีDB/env/provider/deployจริง

จบ3Bpreparationแล้วหยุดรอreview/input ไม่activateอัตโนมัติ
