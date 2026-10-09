# R03: PostgreSQL backup/recovery rehearsal

วันที่เตรียม: 2026-10-05; PostgreSQL runtime รอบนี้ **NOT TESTED**
Docker CLI/Compose มีอยู่ แต่ engine ไม่ตอบ (ไม่พบ dockerDesktopLinuxEngine pipe)
อย่าใช้ configuration/syntax/encryption checks แทนหลักฐาน restore บน PostgreSQL

## ขอบเขตและ target

เป็น rehearsal ด้วยข้อมูลสังเคราะห์เท่านั้น ไม่เปิด backup endpoint หรือ UI ใหม่
ไม่เปลี่ยน schema, source แอปเดิม, dependencies หรือเอกสาร F1.1

| รายการ | ต้นทางที่อ่านเท่านั้น | ปลายทางทดสอบที่อนุญาตเขียน |
| --- | --- | --- |
| Compose | compose.auth.local.yaml | compose.backup.test.yaml |
| Project/service | finntech-auth-local / postgres-auth-local | finntech-backup-rehearsal / postgres-recovery |
| Database/role | finntech_auth_local / ui_fixture | finntech_restore_test / restore_fixture |
| Network | loopback 5436 | network_mode: none, ไม่มี published ports |
| Volume | finntech_auth_local_pgdata ภายใต้ project เดิม | finntech_backup_rehearsal_pgdata ภายใต้ project ใหม่ |

ทั้งสองต้องเป็น PostgreSQL 16 และ image ID เดียวกัน การเริ่ม test ใช้ pull never
หาก image ยังไม่มีหรือไม่ตรงให้หยุด ห้าม pull/update/install เพื่อกลบ prerequisite
source auth_users ต้องมีเฉพาะอีเมล fixture ที่ลงท้าย @example.invalid และต้องยืนยัน
ว่าข้อมูลทั้งหมดสังเคราะห์ เงื่อนไขอีเมลอย่างเดียวไม่ใช่หลักฐานว่าข้อมูลจริงปลอดภัย

## ก่อนรันจริง

1. เปิด Docker Desktop เองและรอ Engine running; docker version ต้องเห็น Server
   ไม่ใช่แค่ CLI ใช้ docker compose version ตรวจ Compose ไม่ต้องสมัครบริการ
2. ใช้ PowerShell 7.4+ บน Windows; รอบนี้มี 7.6.5 ใช้ DPAPI ของ Windows ที่มีอยู่
3. ต้นทางเป็น container สังเคราะห์เดิมที่รันอยู่ ตรวจ target ตามตารางก่อน
   ไม่เรียก prepare/reset/migration หรือใช้ฐานข้อมูลผู้ใช้จริง
4. หยุดเฉพาะ FINNTECH tracker runner ด้วย q/Ctrl+C ไม่หยุด DB
   หยุด scripts/tests อื่นที่เขียนต้นทางด้วย -WritersStopped เป็นคำยืนยันของผู้รัน
   ไม่ได้บังคับหยุด process ใดเอง โปรแกรมเทียบ snapshot ก่อน/หลังและปฏิเสธ PASS
   หากข้อมูลเปลี่ยนระหว่าง rehearsal
5. .env.backup.test ต้องถูก ignore ถ้าไม่มี script จะสร้าง credential สังเคราะห์
   ใหม่และจำกัด ACL โดยไม่พิมพ์ค่า ถ้ามีจะไม่เขียนทับ; template ที่ยังมี placeholder
   ทำให้หยุด แก้เฉพาะไฟล์ในเครื่อง ไม่ส่ง password/connection URL มาแชต
6. ถ้า test database/volume เคย restore แล้วให้คาดว่า script จะหยุดเพราะไม่ว่าง
   ห้าม reset, --clean, --create, down --volumes หรือเลือก DB ใหม่เองเพื่อกลบผล
   ต้องวางแผน isolated target ใหม่แยกโดยรักษาหลักฐานเดิมก่อน rehearsal รอบใหม่

## คำสั่งและพฤติกรรม

จาก C:\Users\Admin\Downloads\FINNTECH ใน PowerShell 7.4+:

```powershell
pwsh -NoProfile -File scripts/tracker-db-recovery.ps1 -ConfirmSynthetic -WritersStopped
$LASTEXITCODE
```

`pwsh` ต้องเป็น PowerShell 7 ที่มีอยู่ ห้ามติดตั้งระบบเพิ่มถ้าไม่มี
หาก engine/prerequisite ไม่พร้อมให้หยุด ไม่รันซ้ำอัตโนมัติ
exit 0 หมายถึง rehearsal และ cleanup ที่ script ตรวจผ่าน ไม่ใช่ production readiness
exit 1 หมายถึงยังปิด R03 ไม่ได้ ดูข้อความ guard ที่ไม่มีข้อมูลลับก่อนแก้

Script ทำงานดังนี้:

- ตรวจ project/service, loopback port, database/role, fixture accounts และ major version
- เริ่มเฉพาะ postgres-recovery จาก Compose ใหม่ ไม่มี network; ตรวจ image ID ตรงกัน
- ตรวจ public schema ของ target ไม่มี tables/indexes/sequences/functions/enums/domains
  ถ้าไม่ว่างหยุดโดยไม่เปลี่ยนข้อมูล ไม่เรียก pg_restore กับ target นั้น
- อ่าน aggregate snapshot ต้นทาง แล้วใช้ pg_dump custom format สำหรับฐานข้อมูลเดียว
  คัดลอก binary ด้วย docker cp ไม่ใช้ PowerShell text redirection กับ dump
- เก็บ encrypted archive แบบ DPAPI CurrentUser ใน backups.private.local/<unique-id>
  สร้างโฟลเดอร์ใหม่และ ACL เฉพาะ Windows user ปัจจุบันกับ SYSTEM ไม่ทับ backup เดิม
- decrypt และตรวจ checksum ของ bytes ก่อน restore เข้าปลายทางว่างด้วย
  pg_restore --single-transaction --exit-on-error --no-owner --no-acl
- เทียบ source-before/source-after/restored evidence แบบตรงตัว; ไม่ปัดหรือแปลงเงิน
- ลบเฉพาะ plaintext temporary files ที่ script สร้าง ตรวจ path ก่อนลบ host files
  ไม่ลบ archive เข้ารหัส, source records หรือ volume ใด; stop เฉพาะ postgres-recovery
  ใน finally รวมกรณี failed startup/restore; cleanup ล้มทำให้ไม่รายงาน PASS

pg_dump มี snapshot consistency ภายใน แต่หลักฐาน before/after ใช้ตอน writers หยุด
เพื่อให้การเทียบ deterministic ไม่อ้างว่าการเทียบนี้พิสูจน์ concurrent backup ได้
อ้าง [PostgreSQL pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html)
และ [pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html)

## หลักฐานที่ต้องตรวจ

scripts/sql/tracker-db-recovery-evidence.sql เป็น read-only transaction ผ่าน psql
ใช้ชื่อ table, count เป็น string และ SHA-256 รวมต่อ table เท่านั้น ไม่ส่ง raw rows,
password hashes หรือ session tokens ออกมา ถึงแม้ archive จะมีข้อมูล Auth อยู่ภายใน
การ checksum ไม่คำนวณเงิน/ปริมาณด้วย float/Number และไม่ใช่ API serialization

| Acceptance | หลักฐานที่ต้องได้ | ผลรอบนี้ |
| --- | --- | --- |
| Target isolation และ empty-target refusal | project/service/image/DB guard; test network none; ต้องไม่เรียก restore เมื่อไม่ว่าง | NOT TESTED runtime |
| Archive encryption/decryption | archive bytes checksum ตรงกันก่อน/หลัง DPAPI | DPAPI synthetic byte check PASS; actual DB archive NOT TESTED |
| Migration/ทุก table รวม Auth/legacy/audit/receipts | TABLE:public._prisma_migrations และ table counts/SHA เทียบครบทั้งสาม snapshots | NOT TESTED |
| Decimal และ UUID ownership คงค่า | ทุก row hash ตรง; NUMERIC precision/scale เป็น 20/2 และ 38/18 | NOT TESTED |
| FK/check/unique/index/trigger/function คงอยู่ | constraint validation flag และ definition hashes ตรง พร้อม index/trigger/function evidence | NOT TESTED |
| ต้นทางไม่เปลี่ยน | source-before เท่ากับ source-after; ไม่ใช้ mock/SQLite | NOT TESTED |
| Cleanup | stop test container, volume คงอยู่, plaintext copies ถูกเก็บกวาด | NOT TESTED |

SQL ใช้ sha256/encode ตาม
[PostgreSQL binary string functions](https://www.postgresql.org/docs/16/functions-binarystring.html)
การเทียบ snapshots เป็น restore fidelity evidence ไม่ใช่การรัน Auth HTTP,
concurrent lock หรือทุก constraint mutation suite ใหม่บน restored DB
ถ้าระบบมี schema ใหม่ต้องทบทวน scope ของ evidence ก่อนอ้างว่าครอบคลุม

ไฟล์สำคัญหลังรันสำเร็จใน private directory: database.dump.dpapi,
source-before.evidence.txt, source-after.evidence.txt, restored.evidence.txt และ result.json
แชร์ได้เฉพาะ sanitized summary/counts/checksums ไม่แนบ dump, decrypted bytes, env,
keys, cookies หรือข้อมูลบัญชี การแสดง container env/pg_restore data list ไม่จำเป็น
รูปแบบ custom บีบอัดไม่ใช่ encryption; DPAPI เป็นชั้น encryption แยก

ถ้า FAIL ให้ส่ง command, exit code, versions และข้อความ guard ที่ปกปิดข้อมูลก่อน
แก้โค้ด/targets อย่าผ่อน assertions ห้ามแก้ฐานข้อมูลต้นทางเพื่อทำให้ checksum ผ่าน
หลังจบเริ่มเฉพาะ tracker runner เดิมด้วย npm run tracker:dev แล้วตรวจ health/proxy
script ไม่ restart หรือ kill process อื่นเอง

## ข้อค้างของ disaster recovery ก่อนข้อมูลจริง/production

- DPAPI CurrentUser ผูกกับ Windows user/เครื่องนี้ เหมาะกับ rehearsal เท่านั้น
  สำเนานี้ไม่ใช่หลักฐานว่ากู้คืนเมื่อเครื่องหรือ Windows profile สูญหายได้
  ต้องเลือก portable encrypted off-device backup และทดสอบ recovery/key custody
  อ้าง [Microsoft ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata?view=netframework-4.8)
- เป็น logical backup ฐานข้อมูลเดียว ไม่รวม cluster roles/tablespaces, server env,
  Better Auth signing secret, provider keys หรือไฟล์ localStorage เดิม
  --no-owner/--no-acl เปลี่ยน database object owner เป็น role ของ test โดยตั้งใจ
  owner UUID ของข้อมูลผู้ใช้ยังต้องตรง; production roles/grants ต้องมี runbook แยก
- ยังไม่มี scheduled backup, alert, disk-space/large-dataset acceptance หรือ RPO/RTO
  ที่อนุมัติ retention/deletion ของ archive/backup ต้องตัดสินก่อน production
- ระหว่างนี้ไม่ลบ encrypted backup อัตโนมัติ ไม่มี background cleanup job
  ไม่ใช้ JSON backup ใน UI แทนระบบนี้ และไม่เปิด restored Auth ผ่าน network/API

R03 จึงยัง PARTIAL แม้ rehearsal ผ่าน จนกว่าจะปิด gates สำหรับ storage, scheduling,
off-device recovery และ retention ที่เลือกจริง ดู acceptance/work-status.md
