# R03: สร้าง PostgreSQL backup เข้ารหัสในเครื่อง

วันที่2026-10-06 — local synthetic backup creation/verification เท่านั้น
ไม่ใช่off-device backup, scheduled job หรือproduction disaster-recovery PASS
ใช้ประกอบกับ [restore rehearsal เดิม](postgresql-backup-recovery.md)
และ [นโยบายข้อมูลที่ยังต้องยืนยัน](data-retention-deletion.md)

## ใช้ทำอะไรและขอบเขต

`scripts/tracker-db-backup.ps1` สร้างสำเนาแยกหนึ่งชุดจากฐานสังเคราะห์เดิมที่กำลังเปิดอยู่
ไม่เขียนข้อมูลฐาน ไม่restore/reset/migrate ไม่เริ่มหรือหยุดcontainer/เว็บหลัก
ไม่ต้องหยุดtrackerเพื่อสร้างdump; pg_dumpใช้snapshotภายในของตัวเอง
ก่อน/หลังเก็บaggregate evidenceจริง แต่ไม่อ้างว่าข้อมูลสองเวลาตรงกับdump snapshotเดียวกัน
หากมีwriterอื่น `sourceEvidenceUnchanged` อาจfalse; ต้องวิเคราะห์ ไม่แก้ข้อมูลให้hashตรง
ผลรอบตรวจนี้ไม่มีsource changes และbefore/afterตรงกันทั้ง21publictables

ตรวจtargetก่อนสร้างdump: Dockerproject/service `finntech-auth-local/postgres-auth-local`,
loopback5436, database `finntech_auth_local`, role `ui_fixture`, PostgreSQL16.x
กำหนด `-ConfirmSynthetic` ทุกครั้ง; ตรวจAuth emailsมีเฉพาะfixture @example.invalid
email suffixอย่างเดียวไม่พิสูจน์ว่าข้อมูลสังเคราะห์ ผู้รันต้องรู้ที่มาของdatasetนี้ด้วย
ไม่รองรับdatabaseจริง/targetที่ผู้ใช้ส่งเองและไม่รับconnection URLหรือpasswordผ่านCLI

migrationทุกfolderในrepoต้องตรงชื่อ/checksumและfinishedในDB โดยไม่มีrolled_back
ไม่ใช้restore rehearsalvolumeเก่าที่ไม่ว่าง และไม่เรียกprepare/resetเพื่อทำให้ผ่าน

## วิธีรัน

PowerShell7.4+ บน Windows, Docker engine/Compose และsource containerเดิมต้องพร้อม
ใช้.env.auth.localที่มีอยู่ในเครื่องตามคู่มือเดิม ห้ามพิมพ์หรือส่งเนื้อหา

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Downloads\FINNTECH'
# Read-only preflight: ไม่สร้างdump/private directory หรือเปลี่ยนบริการ
pwsh -NoProfile -File scripts/tracker-db-backup.ps1 -ConfirmSynthetic -Preview

# Helper suite: ไม่ใช่PostgreSQLruntime acceptance
pwsh -NoProfile -File scripts/tracker-db-backup.test.ps1

# สร้างbackupใหม่หนึ่งชุด ไม่ทับชุดเดิม
pwsh -NoProfile -File scripts/tracker-db-backup.ps1 -ConfirmSynthetic
```

exit0พร้อม `PREVIEW_READY` หมายถึงตรวจpreflightผ่านเท่านั้น
exit0พร้อม `BACKUP_CREATED_AND_VERIFIED` หมายถึงสร้างและตรวจencryption/cleanupผ่าน
exit1/`INCOMPLETE` ให้ตรวจstage/errorCodeที่ปกปิดรายละเอียด ไม่ใช่backupสำเร็จ
ไม่ต้องstopcontainerหลังคำสั่งนี้ เพราะrunnerไม่เริ่มcontainerใหม่หรือเขียนฐานปลายทาง
ไม่ฆ่าprocessอื่นเพื่อให้lock/portว่าง ไม่มีbackgroundjobต้องเปิดหรือปิด

## ไฟล์และการป้องกันข้อมูล

เขียนเฉพาะ `backups.private.local/<unique-id>/` ภายในrepo ซึ่งGitignoreอยู่แล้ว
ไม่รับexternal/UNC/output override และปฏิเสธrootที่เป็นreparse point
โฟลเดอร์แต่ละbackupจำกัดACLให้WindowsuserปัจจุบันกับSYSTEMก่อนมีplaintext
container dumpใช้umask077; hostplaintextอยู่ในprivate directoryจนเข้ารหัสเสร็จ
lockแบบexclusiveทำให้backupซ้อนไม่เริ่มdump; ใช้CreateNew/renameที่ไม่overwrite

สำเร็จแล้วมี `database.dump.dpapi`, `result.json`, source-before/source-after.evidence.txt
DPAPI CurrentUserเข้ารหัสbytesและตรวจจากciphertextที่อ่านกลับจากdiskด้วยSHA-256
ตรวจcustom archiveheaderและpg_restore --list โดยไม่แสดงarchive list/rawrows
TABLE DATApublicครบตามsourceinventoryรวมcash/Auth/legacy/audit/receipts ไม่ใช่subsetเงียบๆ

ผลสำเร็จถูกpublishหลังcleanup plaintextทั้งhostและcontainer; ถ้าcleanupล้มเหลวไม่รายงานPASS
เก็บencrypted pending/partial artifactsไว้ตรวจ ไม่ลบbackupหรือdirectoryอื่นอัตโนมัติ
เฉพาะไฟล์ชั่วคราวที่runnerสร้างเองใช้ชื่อGUIDและตรวจparentก่อนRemove-Item -LiteralPath
nativeerror/stdout/stderrไม่ถูกส่งออกเป็นlog; reportเฉพาะstage/error class/code
timeoutหยุดเฉพาะchildclientของrunner และcontainercommandsมีtimeoutที่สั้นกว่า

ขนาดdumpจำกัด128MiBก่อนอ่านเข้าmemory; `-MaximumDumpBytes` เป็นnumeric option
รับ1–512MiB ไม่ใช่ค่าทางการเงิน; large dataset/memory/diskfull acceptanceยังNOT TESTED
runnerไม่คำนวณหรือแปลงเงิน: NUMERIC/DecimalคงในPostgreSQLcustomdump

## ข้อจำกัดที่ต้องรู้

- DPAPIนี้ผูกWindowsprofile/เครื่องเดิม จึงไม่ช่วยพิสูจน์การกู้เมื่อเครื่องหรือprofileสูญหาย
  อย่าcopyไฟล์นี้ไปexternal/cloudแล้วนับว่าoff-device recoveryผ่าน
- backupมีข้อมูลAuthและการเงินอยู่ภายในciphertext ห้ามแชร์dump/env/key/token/credentials
  aggregate hashesยังเป็นข้อมูลที่ต้องจำกัดสิทธิ์ ไม่เรียกanonymous data
- ไม่สำรองcluster roles/grants, server.env/signingsecret/providerkeys หรือlocalStorageเก่า
  dumpใช้no-acl; deployment/recoveryต้องมีขั้นตอนroles/secretและป้องกันoldsessionฟื้นแยก
- pg_restore --list/encryptionroundtripไม่ใช่restore-to-PostgreSQL acceptance
  รอบสร้างarchiveยังไม่ได้restore; รอบถัดมา2026-10-06ตรวจrestoreจริงผ่านตามหัวข้อด้านล่าง
  volumerehearsalเดิมมีข้อมูลอยู่และไม่ได้reset/reuse
- RPO/RTO, retention, portability/key custody, locationนอกเครื่อง, scheduleและalertsยังOPEN
  ไม่มีauto deletion/rotation/TTL ไม่มีTaskSchedulerregistrationหรือส่งข้อมูลcloudในงานนี้
- การลบplaintextไม่ได้เป็นการรับรองsecure eraseของRAM/disk/OSสำเนาทุกแห่ง

## ผลตรวจรอบ2026-10-06

| Check | ผล | หลักฐาน |
| --- | --- | --- |
| Helper suite | PASS13cases | targetconfirmation/path, scalar executable, nooverwrite, lock, migrationhash/state, archivecompleteness, DPAPI/corruption, ACL, cleanup, stderrredaction/warnings/deadline |
| Previewจริง | PASS | PostgreSQL16.15, Docker29.8.1, Compose5.5.1, PowerShell7.6.5, sixmigrations |
| สร้างarchiveจริง | PASSเฉพาะcreation | 21publicTABLE DATA, persistedDPAPIroundtrip, sourceevidenceunchanged, plaintextcleanup |
| Inject encryption failureหลังdumpจริง | PASS failure handling | ไม่คืนsuccessfulreceipt ไม่มีfinalarchive/hostplaintextเหลือ |
| Backupซ้อนขณะถือlockจริง | PASS refusal | childexit1, errorCodeBACKUP_ALREADY_RUNNING_OR_LOCK_UNAVAILABLE ก่อนสร้างprivatebackupdir |
| Archiveเดิมไม่ถูกทับจากfailurecases | PASS | SHAตรงกับcreationreceiptเดิม |
| เว็บหลักที่4173/api/health | FAIL ณ04:49น.2026-10-06 | connection refused; ไม่พบlistener4173/4174 ไม่มีการหยุด/เริ่มบริการในงานbackupนี้ |
| Fresharchive restore | PASS รอบถัดมา2026-10-06 | ดูหัวข้อrestoreด้านล่าง; ไม่ใช่การนับlistเป็นrestorePASS |
| Off-device/scheduling | NOT TESTED/ยังไม่ทำ | ไม่มีการส่งarchiveหรือตั้งjob |
| Nodeขั้นต่ำ/tracker/root suites | ไม่รันซ้ำรอบนี้ | ไม่เปลี่ยนTS/JS/dependencies; ผลก่อนหน้า170trackerPASS/rootสองFAILคงตามwork-status |

แรกเริ่มsandboxอ่านDockerpipeถูกปฏิเสธสิทธิ์ แต่host engineพร้อมจริง
previewแรกหยุดเพราะPATHมีGitสองexecutable; แก้เลือกหนึ่งตัวตามPATHและเพิ่มregression
ไม่ผ่อนtarget/migration/archive assertionsเพื่อให้ผ่าน

หลักฐาน `.backup-create-review-20261006.local/`: sanitizedlogs, manifests,
comparison, incremental changes.patch และcomplete-files.md รวมuntracked
ข้อมูลarchive/private payloadไม่รวมในไฟล์reviewเหล่านี้

## Restore archive ใหม่: 2026-10-06

เปิดweb/APIเดิมกลับและตรวจหน้าเว็บจริงผ่านที่ `http://127.0.0.1:4173/`
ตรวจhost HTML200, proxy/directhealth200 และunknownAPI JSON404
browserแสดงเนื้อหาแอป/ข้อความติดตาม ไม่ค้างโหลดและไม่พบconsoleerrorในรอบตรวจ
ไม่เขียนบัญชีหรือข้อมูลผ่านUI; ถ้าต้องเริ่มใหม่ใช้ `npm run tracker:dev` และหยุดด้วยq/Ctrl+C
ผลHTTPจากsandboxเชื่อมต่อไม่ได้ถูกเก็บแยกจากผลhostที่ผ่าน

แผนtargetใหม่แยกจากrehearsalเก่าซึ่งไม่ว่าง:

| รายการ | Targetใหม่เฉพาะตรวจarchive |
| --- | --- |
| Compose | compose.backup.archive.test.yaml |
| Project/service | finntech-archive-restore-20261006 / postgres-archive-restore |
| Database/role | finntech_archive_restore_test / restore_fixture |
| Volume | finntech-archive-restore-20261006_archive_restore_20261006_pgdata |
| Network/ports/image | none / ไม่มีpublishedports / sourceimageIDตรงกัน, pullnever |
| Credential | .env.backup.testเดิมสำหรับฐานสังเคราะห์ ไม่แก้/พิมพ์ค่า |

```powershell
# อ่านarchiveที่สร้างไว้ ไม่สร้างdumpใหม่และไม่แก้receiptเดิม
pwsh -NoProfile -File scripts/tracker-db-archive-restore.ps1 `
  -ConfirmSynthetic -BackupId 2cf1da4162b84228be650511a9f914c3
```

BackupIdรับเฉพาะ32ตัวอักษรhex ไม่มีpath/targetoverride ตรวจreceipt/hash/DPAPI
ก่อนrestore; ไม่รับarchiveจากบุคคลภายนอก สำเนาที่restoreต้องมาจากsourceสังเคราะห์ที่รู้ที่มา
ตรวจconfig/identity/image/empty public schemaก่อนเขียน ใช้singletransaction/no-owner/no-acl
ไม่มีclean/create/reset อ้าง [PostgreSQL16 pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html)
DBobjectownerเป็นrestore_fixtureตามตั้งใจ แต่ownerUUIDในrowsต้องตรงarchive
เก็บplaintextเฉพาะprivateACLและtargetที่ไม่มีnetwork ลบเฉพาะtemporaryของrunตัวเอง
backup lockร่วมกันป้องกันbackup/restoreรันซ้อน;ไม่เปิดwriteendpoint/UIของtarget

ผลจริง: PostgreSQL16.15 restore21publictables/6migrations ตรงarchiveevidenceทุกบรรทัด
ทั้งrowcount/SHA, NUMERIC20/2และ38/18, FK/check/unique/index/trigger/function/sequence
ตรวจmigrationname/checksum/finishedstateอีกครั้ง ต้นทางก่อน/หลังrestoreและarchiveSHAคงเดิม
หยุดเฉพาะtargetและรักษาvolume; cleanupผ่านและreceipt `RESTORE_AND_CLEANUP_VERIFIED` exit0
การเรียกซ้ำtargetเดิมต้องexit1 `TARGET_NOT_EMPTY_NO_RESET` ก่อนdecrypt/restore
ตรวจfullaggregateหลังrefusalยังตรงกับผลrestoreและstoptargetคืนแล้ว ไม่มีreset/dropvolume

หลักฐานใหม่ `.archive-restore-review-20261006.local/` มีrestore.json, nonempty.json,
post-refusal.json, http-host.json, comparison.json และchanges.patchรวมuntracked
ผลนี้เป็นrestorefidelityในเครื่อง ไม่ใช่mutation/lock/AuthHTTPsuiteบนrestoredDBหรือproductionDR
archive/keyยังผูกprofile/เครื่อง; off-device/schedule/retention/large-datasetยังOPEN

## แหล่งอ้างอิง

snapshot/customformat/logicalbackupใช้ตาม [PostgreSQL16 pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html)
CreateNewไม่overwriteตาม [Microsoft FileMode](https://learn.microsoft.com/en-us/dotnet/api/system.io.filemode?view=net-9.0)
ข้อจำกัดDPAPIตาม [Microsoft ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata?view=netframework-4.8)
