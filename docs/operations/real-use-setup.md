# Real-use: private setup และ release gates (8 ตุลาคม 2026)

สถานะ: **เตรียมโค้ดแล้ว ยังไม่เปิดรับข้อมูลจริง** ไม่มีการสร้างบริการ cloud ใหม่หรือแก้ฐาน Beta ในงานนี้ อ่านรายงานล่าสุด `docs/acceptance/finish-real-use-readiness-20261008.md` และ checklist `docs/operations/finish-real-private-setup.md` ก่อนใช้คำสั่ง ต้องอนุมัติ release ที่ระบุ source/image จริงแยกจากงาน implementation นี้

## ทรัพยากรและ secrets

ใช้ฐาน Neon **ใหม่และว่าง** และ app role ใหม่ แยกจาก `finntech_beta` / `beta_app` และทุก rehearsal ชื่อ/host/role ต้องได้จาก discovery จริง ไม่ใช้ IDs ของ Beta อ้างเป็น real-use เลือก Free เท่านั้น ไม่เพิ่มบัตรหรือ auto-upgrade ถ้ามีค่าใช้จ่ายให้หยุด

เก็บ configuration ต่อไปนี้ใน private secret store ของ **บริการ real-use ใหม่** เท่านั้น ไม่ใส่ `.env` ใน release, `VITE_*`, URL, browser storage, chat หรือ log:

| Variable | ค่า/เงื่อนไข |
|---|---|
| NODE_ENV / TRACKER_RUNTIME_MODE / TRACKER_DATA_MODE | production / cloud-real / real |
| TRACKER_ORIGIN | HTTPS origin ตรง URL บริการใหม่ ไม่มี path/trailing slash |
| PORT | provider เป็นผู้กำหนด listener; bind 0.0.0.0 |
| WEB_DIST_DIR | /app/apps/web/dist ใน Dockerfile.real |
| DATABASE_URL | selected DB/role/password, sslmode=verify-full |
| TRACKER_REAL_DATABASE_HOST/NAME/ROLE | host ไม่รวม -pooler, DB และ app role ตรง URL |
| BETTER_AUTH_SECRET | random อย่างน้อย 32 characters เก็บ server-only |
| TRACKER_RECOVERY_MODE / TRACKER_MAIL_PROVIDER | real-email / brevo |
| TRACKER_MAIL_API_KEY / TRACKER_MAIL_SENDER | private API key / sender ที่ owner ยืนยันแล้ว |
| TRACKER_MAIL_SENDER_CONFIRMED | owner-verified หลังยืนยัน sender จริง |
| TRACKER_RECOVERY_OUTBOX_KEY | random 32 bytes เป็น 64 hex; สำรอง key แยกจาก ciphertext |
| TRACKER_REAL_REGISTRATIONS_OPEN | false ตลอด preparation/review |
| TRACKER_REAL_ACCOUNT_LIMIT | 100 default, hard max 1000; เริ่มต่ำสำหรับ pilot |
| TRACKER_REAL_MAIL_ATTEMPT_LIMIT | 100 default/hard max ต่อ rolling 24h รวม retry |
| TRACKER_REAL_DATABASE_LIMIT_BYTES | 268435456 default (256 MiB); hard max 512 MiB |
| TRACKER_REAL_SUPPORT_EMAIL | ช่องทางติดต่อสาธารณะที่ owner ยินยอม ไม่อนุมานจาก Gmail alerts |

อย่าตั้ง `FINNTECH_DEMO_ENABLED` แม้เป็น false ใน real runtime ไม่ติดตั้ง synthetic recovery หรือเปิด recovery ให้บัญชี Beta เดิม เมื่อและเฉพาะเมื่อ gates ผ่านและมีคำสั่ง activation: `TRACKER_REAL_ACCEPTANCE_APPROVED=review-approved`, `TRACKER_REAL_ENROLLMENT_MODE=public`, ล้าง private staging list และ `TRACKER_REAL_REGISTRATIONS_OPEN=true` เป็นการยืนยันจาก operator ไม่ใช่หลักฐาน acceptance อัตโนมัติ

## Brevo Free โดยไม่มีโดเมนของตนเอง

Owner เลือกทดสอบก่อน public: สมัคร Free โดยเจ้าของ → Settings / Senders, domains & dedicated IPs → Senders → เพิ่ม sender จาก mailbox ที่ควบคุม → ยืนยันใน mailbox ด้วยตนเอง → สร้าง transactional API key และใส่ใน private store ห้ามส่ง key/ลิงก์ในแชต ไม่เลือก trial/paid/add-on

[Free limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan): 300 อีเมล/วัน มี branding โค้ดกำหนดเพดาน attempts ต่ำกว่า quota; quota account จริงยังไม่ได้ตรวจ Brevo [เปลี่ยน free/unauthed sender เป็นโดเมนของตนชั่วคราว](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders) เป็น stopgap ไม่รับรองการส่งระยะยาว Domain ของ Render เป็นเว็บ URL ไม่ใช่ DNS ที่ owner ใช้ตั้ง DKIM/DMARC ได้

ดังนั้นทดสอบแบบงบศูนย์ได้โดยไม่ซื้อโดเมน **ถ้า Brevo อนุมัติ sender/account และส่งถึง mailbox จริง** แต่ยังรับรอง public verification/recovery ไม่ได้ ตัวเลือกคือ restricted pilot หลังทดสอบจริง, รอโดเมนที่มีสิทธิ์ควบคุมโดยไม่ซื้อ, หรือเลือก identity provider พร้อม recovery ของ provider ในงานแยก (ไม่แอบเปลี่ยนไป fake verification)

Acceptance ต้องเห็นอีเมล verify/reset/notice จริงทั้ง inbox/spam ใน owner-controlled test mailboxes และ click fragment link ใน browser: scanner GET ไม่ consume; POST ยืนยัน, expiry/replay, provider rejection/timeout/restart, lost response ต้องใช้ job UUID เดิมภายใน dedupe TTL 15 นาที รหัสผ่านและ token ไม่เก็บในหลักฐาน [Brevo API](https://developers.brevo.com/reference/send-transac-email)

## เตรียมฐานและ image (ยังไม่รัน cloud)

หลัง release/resource authorization และ private setup ที่ระบุ target แล้ว: `npm ci` ใน isolated release checkout, `npm run tracker:build`, `node --no-strip-types --env-file=<private-real-env> scripts/real-use-prepare.mjs` ตัว prepare ปฏิเสธ public schema ที่ไม่ว่าง, ตรวจ current database/role, forward migrations 10 ชุด และเขียน singleton boundary ไม่มี seeding/promoting accounts หาก failed ให้เก็บฐานและ receipt ห้าม reset เพื่อ retry

Build `docker build -f Dockerfile.real -t <reviewed-tag> .` ตรวจ source digest/inventory/bundle/logs เทียบ report image ก่อน publish Deploy เป็นบริการใหม่ที่ registration ปิด ใช้ `/api/ready` สำหรับ readiness (`503` เมื่อ capacity ไม่พร้อม), `/api/health` ไม่เผย secrets ห้าม artificial keep-alive traffic

Staging ใช้ `TRACKER_REAL_ENROLLMENT_MODE=staging`, private `TRACKER_REAL_STAGING_EMAILS` ไม่เกิน 20 อีเมล และ `TRACKER_REAL_REGISTRATIONS_OPEN=false` บังคับสมาชิกที่ signup/signin/session/recovery/delivery; health เปิดเผยเพียง boolean ไม่เผยรายชื่อ ทดสอบบน HTTPS/WSS จริงหลังอนุมัติ target: 2 browser profiles/devices, Secure cookies/Origin/proxy, finance/cash/crypto corrections, payload/key retry เมื่อ network ขาด, JSON saved file/restore, expiry/reset/WS revocation, restart/redeploy/cold wake และ persistence ไม่ใช้ local mocks แทน acceptance นี้

## Incident / rollback / rotation

Pause signup ด้วย registrations=false ไม่ลบ records; storage gate หยุด write ใหม่แต่ให้ existing receipt ตรวจผลได้ ถ้า mail quota หมดให้ตรวจ outbox status/attempts แบบไม่เผย envelope; ไม่ resend job เกิน dedupe window เดิมโดยเดาว่า timeout คือ rollback

Application rollback ใช้ **real-boundary-compatible image ที่ตรวจแล้ว** กับฐานเดิมหลัง backup ห้าม rollback เป็น Dockerfile.beta หรือใช้ Beta credentials Migration เพิ่ม tables/column แบบ forward; rollback binary ไม่ drop schema/volumes หาก restore ต้องเลือก fresh isolated target ตรวจ auth/audit/ledger แล้วจึงแผน switch ที่ได้รับอนุมัติ ไม่มี DB restore command ใน public API

Rotate Brevo key ใน private store, pause mail ระหว่างเปลี่ยน หากเปลี่ยน outbox key ต้อง drain/เก็บ key เก่าให้ pending jobs ถอดรหัสได้ก่อน ไม่ทิ้ง challenges แบบเงียบ Rotate auth secret ต้องวางแผน session re-login และตรวจ HTTP/WS revoke แยก; เปลี่ยน app DB passwordต้องตรวจ listener/reconnect Backup key ใหม่ใช้ key fingerprint ใหม่ เก็บ keys เก่าจน archives ทุกชุดพ้น retention และ tested restore แล้ว

## บริการฟรีและข้อจำกัด

[Render Free](https://render.com/docs/free) ระบุไม่ควรใช้ production, idle 15 นาทีแล้ว sleep, cold wake ~1 นาที, ephemeral disk, 750 ชั่วโมง/workspace/เดือน; SMTP ถูกบล็อก ใช้ HTTPS Brevo API Owner ยอมรับ sleep/no SLA แต่ไม่ทำให้บริการนี้ผ่าน production gate หากคงใช้ ให้ review เป็น hobby/personal pilot ที่มีข้อจำกัด ไม่อ้าง public production SLA

[Neon Free ปัจจุบัน](https://neon.com/blog/neon-free-plan-1-gb-per-project) 1 GB/project และ 100 CU-hours/project/month ต้องตรวจ actual quota และพื้นที่จริงก่อนตั้ง size cap ไม่ใช้ provider restore window แทน full backups ไม่อนุมาน commercial permission/account approval จาก quota page: provider agreement/account eligibility ของ setup จริง **NOT TESTED**

ทางเลือกงบศูนย์ที่เข้ากับ Node/Express/WS/PostgreSQL คือเครื่อง/VM เดิมที่ owner มี พร้อม public TLS/network/backup แต่ขณะนี้ยังไม่มี resource ดังกล่าวให้ตรวจ การย้ายไป edge/static runtime ต้องออกแบบ adapter ใหม่และไม่ได้ทำในงานนี้ ไม่เสนอ free credit/card trial เป็นงบศูนย์ถาวร ไม่มีโฮสต์ทางเลือกที่ได้พิสูจน์ production compatibility ในงานนี้
