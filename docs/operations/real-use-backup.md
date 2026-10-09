# Encrypted backup, Google Drive, Gmail และ machine-loss recovery

**ยังไม่พร้อมใช้งานจริง** ทดสอบเต็มเฉพาะ PostgreSQL 18 สังเคราะห์ในเครื่อง ไฟล์ dump/keys/private receipts อยู่ ignored `.real-use-20261008.local/` ไม่อยู่ใน patch หรือ image สำเนา key อีก path บนเครื่องเดียวไม่ใช่ off-device drill

Owner เลือก Google Drive ที่มีอยู่และ Gmail alerts จะระบุ folder/recipient แบบส่วนตัวระหว่าง setup เจ้าของรับผิดชอบ alert/restore ไม่ส่ง DB URL, OAuth refresh token, encryption key หรือ Gmail address ในแชต

## Private prerequisites

1. โฟลเดอร์เก็บ local archives และ private env ที่ Windows owner-only NTFS ACL จริง (Node mode 0600 ไม่ยืนยัน ACL บน Windows) key file random 32 bytes อยู่คนละ directory และมี independent recovery copy ในที่ส่วนตัวนอกเครื่องที่ owner เข้าถึงได้ **แม้ Windows นี้เสีย** key ห้าม upload พร้อม Drive archives; key location/custody ยังไม่ได้กำหนด
2. Read-only backup role ของฐาน real ใหม่ แยก app role: operator ตรวจ/grant CONNECT, USAGE schemas และ SELECT ทุก application/migration tables พร้อม default privileges สำหรับ future tables ไม่มี write/DDL/owner grant ตรวจ role ด้วย SQL จริงก่อน backup ไม่ใช้ superuser ของ app
3. Google OAuth app ของ owner ใช้ scope ที่จำกัด `drive.file` และเลือก/grant folder ให้ app ผ่าน owner-controlled consent/Picker หรือสร้าง app folder ที่ owner ยืนยัน ห้ามอ้างว่ารู้ existing folder จาก browser URL ให้ private folder ID ไม่ใช่ shared/public folder
4. ตรวจจริงด้วย `about.storageQuota` และ `files` owner/shared/canAddChildren; ห้ามสันนิษฐานพื้นที่ว่าง ตั้งไม่มี billing/paid quota increase [Drive limits](https://developers.google.com/workspace/drive/api/guides/limits)
5. OAuth client secret/refresh token อยู่ private backup env นอก web runtime: `FINNTECH_DRIVE_CLIENT_ID`, `FINNTECH_DRIVE_CLIENT_SECRET`, `FINNTECH_DRIVE_REFRESH_TOKEN`, `FINNTECH_DRIVE_FOLDER_ID`, `FINNTECH_DRIVE_RECEIPT_FILE_ID` receipt เป็น private application/json ที่สร้างโดย app/grant ให้อยู่ folder นี้แล้ว ต้องไม่ใช่ shared file [OAuth external Testing refresh tokens อาจหมดอายุ 7 วัน](https://developers.google.com/identity/protocols/oauth2) ต้องพิสูจน์ renewal/expiry/alert ก่อน unattended readiness

## Run และ schedule (ยังไม่เปิดงานจริง)

Private backup env ต้องมี `FINNTECH_BACKUP_DATABASE_URL/ROLE` (read-only), `TRACKER_REAL_DATABASE_HOST/NAME/ROLE` (app marker identity), `TRACKER_ORIGIN`, `FINNTECH_BACKUP_DIRECTORY`, `FINNTECH_BACKUP_KEY_FILE`, `FINNTECH_BACKUP_PRIVATE_DIRECTORY_CONFIRMED=owner-only`, `FINNTECH_BACKUP_LAST_RECEIPT_FILE` (absolute JSON path ใน backup directory) และ Drive variables ข้างต้น ไม่ต้องมี Better Auth/mail keys

`node --no-strip-types --env-file=<private-env> scripts/real-db-backup.mjs` → custom pg_dump ใน RAM (limit 128 MiB/120s), AES-256-GCM, authenticated local round-trip, unique archive/receipt ไม่มี plaintext disk ตั้ง `FINNTECH_BACKUP_ARCHIVE` จาก private pointer → `node --env-file=<private-env> scripts/real-drive-backup.mjs` ตรวจ quota/permissions, reserve+journal file ID **ก่อน upload**, timeout ตรวจ file ID เดิม, download hash/decrypt, publish coarse receipt ไม่มี key/credentials/records ใน receipt

Wrapper ที่เตรียมแล้ว: `powershell.exe -NoProfile -File <repo>\scripts\real-backup-scheduled.ps1 -PrivateEnvFile <private-env>` ห้าม redirect private env/error detail ไป public logs ข้อผิดพลาด node boundaryถูก redact แต่ตรวจ provider logs อีกครั้ง ก่อน schedule ต้องรัน wrapper จริงครบหนึ่งครั้ง ปิดเครื่องแล้วตรวจ independent alertและ StartWhenAvailable

ตัวติดตั้ง `scripts/real-backup-install.ps1 -PrivateEnvFile <private-env>` ตรวจ setup โดยยังไม่ติดตั้ง; เพิ่ม `-Install` หลัง actual acceptance ผ่านเท่านั้น ใช้ daily 02:00 local, interactive owner, StartWhenAvailable, IgnoreNew, อนุญาตแบตเตอรี่, restart 15 นาทีหนึ่งครั้ง, execution limit 15 นาที ไม่ overwrite task เดิม Runner ใช้ named mutex และ durable journal/retry 30 วินาทีหนึ่งครั้งกับ archive เดิม งานสังเคราะห์ Windows trigger/mutex ผ่านแล้วและถูกถอดออก ไม่ใช่ actual backup schedule หรือ Gmail delivery PASS

เป้าหมายเริ่มต้นเสนอ RPO ≤24h และ RTO ≤4h หลัง machine-loss drill ผ่าน (ยังไม่วัดจริง) daily scheduleกับ missed threshold 24h มีโอกาสเตือนใกล้เวลา batch; ต้องเลือก grace/alert policy หลังวัด runtime ไม่แอบเพิ่ม threshold เพื่อซ่อน missing backup

## Independent alerts

`scripts/real-backup-watchdog.mjs` รัน **นอกเครื่อง Windows และนอก Render ที่ sleep** ตรวจ Drive coarse receipt ≤24h ถ้าเครื่องปิด/upload failed/token expired/fileหายแจ้ง Brevo HTTPS ไป private `FINNTECH_BACKUP_ALERT_EMAIL` ของ Gmail ใช้ sender/key ที่ verify แล้ว Provider 201 คือ accepted ไม่ใช่ delivered ต้องทดสอบ Gmail inbox/spamและผู้ดูแลรับทราบจริง ถ้า sender setup ไม่พร้อม exit2 บอก alert unconfirmed

Review template `docs/operations/templates/real-backup-monitor.yml` อยู่ **นอก .github/workflows** ยังไม่เปิด cron ใช้ GitHub Linux runner ทุก6h, timeout2min (~240 nominal minutes/month ก่อน setup overhead) ต้องตรวจ private-repo free minutes/no billing, pin verified action commitsก่อน activation และทดสอบ scheduled/delayed jobs ไม่ upload archive/key ไป Actions ไม่ ping Render เพื่อ keep alive [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

Watchdog successยังไม่หมายถึง full restoreผ่าน; code envelope/receipt tests เป็น mock ไม่ใช่ Google Drive จริง Outbound alert delivery/watchdog activation ทั้งหมด NOT TESTED

## Retention และ restore

`scripts/real-retention-cli.mjs` ทำ dry-run local/Drive แล้วใช้ digest ของแผนเดิมเพื่อ apply ภายใน 24h กำหนด 7–90 วัน (default 30) ตรวจ key/hash/current authenticated copy และ conditional token ก่อน Drive DELETE; timeout ตรวจ ID เดิม ห้ามแตะ unrelated files หรือ deletion registry `pruneExpiredBackups` แบบเดิมถูกปิดเพื่อไม่ให้ข้าม reviewed plan ไม่มี automatic pruning เปิดไว้ การทำงานกับ Drive จริงยัง NOT TESTED

Machine-loss drill: เครื่องอื่นที่ปลอดภัยซึ่งไม่พึ่ง Windows secret store นี้ → auth Drive ด้วย owner grant → download ciphertextและoriginal metadataจาก ID ที่พิสูจน์แล้ว → retrieve independently held key → authenticate AES-GCM **ก่อน pg_restore** → fresh isolated PostgreSQL compatible target networkแยก → single transaction restore → เทียบ30tables/auth/audit/ledger/idempotency/columns/constraints/functions/triggers/indexes และสองเจ้าของเข้าได้ด้วยตนเอง จับเวลา RPO/RTO; ไม่พิมพ์ records/keys/tokensลงreport ไม่ทับ production source

`scripts/real-backup-rehearsal.mjs` เป็น executable isolated full drill ที่ตรวจ fresh network-none target และปฏิเสธ nonempty target ไม่ใช้เป็น productionrestore shortcut Fixture volumesคงไว้ ไม่มี down -v ข้อมูลเทียบเป็นaggregate hashes ระบุ canonicalization whitelistของ delivery CHECK cast สองชื่อเท่านั้นและทดสอบinvalid enum rollback ไม่มีการละเว้นledger/audit mismatch

ถ้าเครื่องเสียและ keyมีแต่ในเครื่อง: **กู้ ciphertext ไม่ได้**; ถ้า off-device keyยังไม่พร้อม ห้ามรับข้อมูลจริง สำเนา encrypted archive ไม่ช่วยแก้ key custody การสูญหาย

## Current executable restore/deletion workflow

ดู [private setup/checklist](finish-real-private-setup.md) และ [operator runbook](finish-real-operator-runbook.md). `real-full-restore.mjs` ดาวน์โหลด ciphertext จาก Drive ที่ตรวจสิทธิ์/hash แล้ว ถอดรหัสใน RAM และ restore ไปฐานใหม่ว่างแบบ transaction เท่านั้น จากนั้น provision operator, replay current authenticated registry, ตรวจครบและใช้ `real-restore-activate.mjs` เพื่อ rebind เฉพาะ staging ตามการอนุมัติ ไม่เปิด runtime จาก marker เก่าและไม่ฟื้น sessions/outbox เก่า คำสั่ง cloud เหล่านี้ยังไม่รันจริงเพราะไม่มี private setup.
# Private media addition — 2026-10-09 local review

See [private-media storage and recovery](private-media.md). Full PostgreSQL archives now include avatar/receipt bytes, whereas financial JSON v1/v2/v3 excludes pictures and media IDs. The existing dynamic restore evidence enumerates the new media tables; compare current source-snapshot evidence, including their constraints/bytes, before replaying the authenticated deletion ledger and activating any restored target. Retain the updated operator purge function during application rollback. This addition has not been migrated on the live database or connected to external backup automation.
