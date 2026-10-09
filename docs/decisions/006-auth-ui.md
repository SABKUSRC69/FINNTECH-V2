# Auth UI และ local environment ที่เปิดลองใช้ได้

วันที่ 2026-10-04. ต่อจาก Auth foundation ใน decision005; ใช้ ADR-002/acceptance เดิมโดยไม่แก้ F1.1 หรือ root src.

## ขอบเขต

- หน้าไทยบน apps/web: สมัครบัญชี/เข้าสู่ระบบ/ออกจากระบบ, restore session เมื่อ reload และพื้นที่บัญชีที่ตรวจ server ownership แล้ว.
- ใช้ relative same-origin /api/auth/* และ /api/me ผ่าน Vite proxy เดิม. ไม่เพิ่ม dependency, Auth SDK, browser token storage, localStorage migration หรือ credential DEMO. ไม่แก้ backend/schema/migrations ของ Auth ที่ผ่านการตรวจแล้ว.
- ยังไม่มีฟอร์มรายรับรายจ่าย, budget, crypto/cost-basis, importer หรือ relay. การ์ด THB/USDT แสดง “กำลังพัฒนา”; ไม่มีตัวเลขยอดจำลอง, starter credit, execution, wallet, ฝาก/ถอน หรือ QR. ข้อความ “ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน” คงอยู่.

## Client boundary และ errors

เริ่มด้วย health contract เดิมและ get-session จริง; health configuration ไม่ถือเป็นการยืนยันผู้ใช้. Session null/owner401 กลับสู่ฟอร์ม login. เมื่อมี session ต้อง GET /api/me ผ่าน server ก่อนแสดงพื้นที่บัญชี; client ไม่ส่ง/เก็บ owner ID เป็นสิทธิ์.

Fetch ใช้ credentials:same-origin/cache:no-store. มี AbortController timeout8วินาทีครอบทั้ง response headers และ JSON body; cleanup ตอน unmount ยกเลิก initial read. Password อยู่เฉพาะ React form memory, masked และล้างหลัง action/เปลี่ยนโหมด. ไม่ใช้ console log ข้อมูล Auth.

429/wrong password/403/ไม่พร้อม มีข้อความไทยแบบ safe ไม่แสดงข้อความ driver/provider ดิบ. ระหว่าง submit ปิด controls และ ref guard ป้องกัน duplicate request. POST timeout/network failure/5xx หรือ success แล้วตรวจ session ต่อไม่สำเร็จถือว่าผลอาจ commit แล้ว: **ไม่รายงาน rollback และไม่ resubmit อัตโนมัติ**. ต้องกดตรวจสอบสถานะก่อน; ถ้าสมัครสำเร็จแต่ไม่ได้ session ให้เลือกเข้าสู่ระบบด้วยบัญชีเดิม. Unique email และ server ownership mapping เดิมยังคงเป็น authority.

## Local synthetic environment

เพื่อไม่แตะหลักฐาน F1.4/Auth acceptance ใช้ compose.auth.local.yaml แยก project **finntech-auth-local**, service **postgres-auth-local**, PostgreSQL16-alpine, loopback port**5436**, DB**finntech_auth_local**, fixture role**ui_fixture**, named volume**finntech-auth-local_finntech_auth_local_pgdata**.

`.env.auth.local` เก็บ password สังเคราะห์เฉพาะ Compose. `apps/api/.env` เก็บ DATABASE_URL, BETTER_AUTH_SECRET, TRACKER_ORIGIN=http://127.0.0.1:4173, TRACKER_API_PORT4174, TRACKER_AUTH_LOCAL_CONFIRM=synthetic-only. ทั้งสองไฟล์ ignored และไม่เขียนทับไฟล์ที่มีอยู่. Secret ไม่ใช้ VITE_*; dev runner เดิมส่งเฉพาะ whitelist ให้ Web. ไม่แนบเนื้อหา env หรือขอ password ใน chat.

ครั้งแรกเท่านั้น: สร้าง env ในเครื่องจาก placeholders (server secret สุ่ม>=32ตัวอักษร; password สังเคราะห์ต้องตรง Compose/URL). ตั้ง DATABASE_URL ไป exact local target ด้านบนแล้วใช้:

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Downloads\FINNTECH'
docker compose --env-file .env.auth.local -f compose.auth.local.yaml up -d --wait
npm run tracker:auth:local:prepare
npm run tracker:dev
```

Prepare build shared/API แบบเดิม แล้ว guard ตรวจ explicit target + synthetic-only + empty public schema ก่อน applyสี่ migrations. Missing DB exit2 NOT TESTED, nonempty/unexpected DB reject โดยไม่ reset/delete/migrate. **ภายหลังห้ามรัน prepare ซ้ำกับฐานข้อมูลไม่ว่าง**; เริ่มบริการเดิมและ dev ได้โดยไม่ migrate/reset:

```powershell
docker compose --env-file .env.auth.local -f compose.auth.local.yaml up -d --wait
npm run tracker:dev
```

เปิด **http://127.0.0.1:4173/** (ใช้127.0.0.1ตรง origin ไม่สลับlocalhost). API direct4174เป็นฝั่ง server; browserใช้4173ผ่านproxyเท่านั้น. กดสมัครบัญชี ใช้ alias/emailสังเคราะห์ example.invalid และ passwordทดสอบใหม่12–128ตัวอักษร; อย่าใช้ข้อมูลจริงหรือ DEMO credentials. รอบนี้ไม่มีการส่ง email verification/reset; production gates ใน decision005 ยังมีผล.

หยุด Web/API ด้วย qหรือCtrl+C ใน terminal tracker:dev แล้วหยุดเฉพาะ local serviceโดยรักษา volume:

```powershell
docker compose --env-file .env.auth.local -f compose.auth.local.yaml stop postgres-auth-local
```

ไม่ใช้ down --volumes/reset หรือแตะ compose.test.yaml/compose.auth.test.yaml ที่เก็บหลักฐานเดิม. Preview/local DB คงทำงานหลังส่งงานเพื่อให้เจ้าของเปิดลอง; ไม่ใช่การ deploy และไม่เปิด network ภายนอก.

## Verification และข้อจำกัด

- Unit UI/client ตรวจ signup/password confirmation, wrong login, session restore/logout, unavailable retry, duplicate submit, unknown POST outcome/reconciliation, relative URLs/no localStorage, payload validation และ timeout. Mocks ใช้เฉพาะ client unit; ไม่อ้างว่าแทน PostgreSQL integration.
- Browser acceptance ใช้ PostgreSQLจริงชุด local: สมัครบัญชี, refreshคงsession, logout/reloadเป็นanonymous, wrong passwordภาษาไทย และloginใหม่; desktop/mobileตรวจไม่เกิดhorizontaloverflow. ใช้บัญชีสังเคราะห์เท่านั้นและไม่พิมพ์credential.
- รัน tracker:typecheck/test/build, compiled package smoke --no-strip-types, root npm test/build และ whitespace/baseline. คง cold Vite smoke และ root failuresเดิมสองกรณี แยกจากผล UI; ไม่ข้ามtests/แก้expectationของroot src.
- HTTPS/browser production, Nodeขั้นต่ำ, email verification/reset, distributed rate limit/proxy trust/retention และbusiness endpointsยังไม่ทำ. ไม่อ้างว่าเว็บพร้อมติดตามเงินแล้วเมื่อมีแค่เส้นทาง Auth.
