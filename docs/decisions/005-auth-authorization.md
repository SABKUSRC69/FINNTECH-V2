# Auth และ authorization foundation

วันที่: 2026-10-04. ใช้ ADR-002 และ migration acceptance เดิม; ไม่แก้เอกสาร F1.1 หรือแอป `src/` เดิม

## ขอบเขตและ dependency

เพิ่ม Better Auth **1.7.7** ใน `apps/api` แบบ exact pin. ใช้ ESM และ Prisma PostgreSQL adapter กับ Prisma **7.10.0** เดิม. เอกสารทางการระบุ Prisma 7 และ handler สำหรับ Express 5; npm peer dependencies รองรับ Prisma 7. ไม่มี dependency เดิมเปลี่ยนเวอร์ชัน (ตรวจ lockfile เทียบ baseline). API ใช้ Node ตาม engines เดิม `^22.12.0 || ^24.0.0`; ตรวจ runtime บน Node **24.18.0**, Node ขั้นต่ำ **22.12 ยัง NOT TESTED**.

อ้างอิง: [Prisma adapter](https://better-auth.com/docs/adapters/prisma), [Express handler](https://better-auth.com/docs/integrations/express), [core database schema](https://better-auth.com/docs/concepts/database), [cookies](https://better-auth.com/docs/concepts/cookies), [options](https://better-auth.com/docs/reference/options).

มีเฉพาะ email/password registration, sign-in, sign-out, get-session, process endpoint `/api/auth/ok` และ protected `/api/me`. ไม่มี finance write endpoint, UI forms, importer, relay หรือ business engine. Auth route อื่นตอบ JSON 404. ไม่รับ credential DEMO หรือ localStorage เป็นตัวตน และไม่ย้ายข้อมูลเก่าอัตโนมัติ. ยังไม่มี email delivery/reset-password, social login, account linking หรือ deletion endpoint.

## Session และ server configuration

- Server-only env: `DATABASE_URL`, `BETTER_AUTH_SECRET` (random >=32 characters), `TRACKER_ORIGIN` (origin เดียวกับ browser). ห้ามใช้ `VITE_*` สำหรับค่าเหล่านี้. Dev runner เดิมส่งเฉพาะ whitelist ของ environment ให้ Web; secret ไม่ส่งเข้า frontend.
- เมื่อไม่มี Auth env ใน development ยังรัน skeleton เดิมได้. ถ้ากำหนด Auth บางส่วนหรือ placeholder จะ reject configuration ก่อน listen. Production ต้องกำหนดครบและใช้ HTTPS; local HTTP อนุญาตเฉพาะ loopback.
- Better Auth handler อยู่ก่อน `express.json`. POST Auth ต้องมี Origin ตรง `TRACKER_ORIGIN`; ไม่ปิด CSRF/origin checks ของ Better Auth และไม่เปิด CORS.
- Cookie เป็น host-only, HttpOnly, SameSite=Lax, Path=/; Secure เมื่อ HTTPS. session อยู่ PostgreSQL, อายุ 7 วัน, refresh อายุหลัง 1 วัน; cookie cache ปิด. ไม่มี bearer plugin หรือ localStorage token. HTTP JSON ตัด raw session token ออก และคืน Cache-Control:no-store.
- Credentials hash ด้วย Better Auth; ไม่เขียน crypto/password algorithm เอง. Telemetry ปิด; logger ออกเฉพาะ level/event class โดยไม่ echo driver errors, credential หรือข้อมูลผู้ใช้.
- `/api/health` คง `status:ok` เป็น process liveness. เมื่อ configured ตรวจ SELECT 1 และรายงาน database ok/error; Auth เป็น `not_checked` ไม่อ้าง runtime/schema readiness จากการมี config. ไม่มี DB/Auth env คืน not_configured เดิม.

## Ownership และ migration

Forward migration `20261004000000_database_auth` เพิ่ม AuthUser/Session/Account/Verification แยกจาก TrackerUser. ไม่แก้ 3 migrations เดิม. AuthIdentity เพิ่ม optional unique FK authUserId แบบ RESTRICT และ CHECK ให้ provider better-auth มี subject ตรง Auth user UUID และ verifiedAt; fixture/provider เก่าไม่เชื่อมเอง.

`requireOwner` ตรวจ live session ด้วย Better Auth ทุก request ก่อน map business owner. ไม่รับ owner จาก body/query/header. ครั้งแรกสร้าง TrackerUser และ AuthIdentity ใน transaction เดียว. Unique authUserId/provider+subject ป้องกันคำขอพร้อมกัน; ฝ่ายที่แพ้ P2002 rollback และอ่าน mapping ที่ชนะ ไม่ทิ้ง orphan owner. verifiedAt/VERIFIED หมายถึงผูกกับ authenticated subject ไม่ใช่การยืนยัน email, KYC หรือสิทธิ admin. FIXTURE ไม่ถือเป็น authenticated identity.

Business queries ในอนาคตต้องใช้ server OwnerContext ใน where/owned transaction และคง composite FK ของ F1.4. รอบนี้พิสูจน์ข้ามเจ้าของผ่าน **test-only** read route โดยไม่เปิด business endpoint จริง. Deletion ของ Auth user ที่ผูก business owner ถูก FK RESTRICT; ไม่มี automatic data deletion.

Migration ไม่ reconcile AuthIdentity better-auth เก่าที่ไม่มี FK เอง. หากมีแถวดังกล่าว migration จะ reject; ต้องตรวจและวางแผน reconciliation แยก โดยไม่ยกระดับ DEMO/fixture.

## Local PostgreSQL acceptance

ใช้ **compose.auth.test.yaml** เท่านั้น: project finntech-auth-test, service postgres-auth-test, loopback **5435**, DB finntech_auth_test, synthetic role auth_fixture, named volume finntech-auth-test_finntech_auth_test_pgdata. ไม่แตะ F1.4 port5434/volume ที่เก็บหลักฐานอยู่.

สร้าง `.env.auth.test` จาก example เฉพาะเมื่อยังไม่มีไฟล์ แล้วแก้ placeholders ในเครื่องด้วย password สังเคราะห์เดียวกันและ URL-encode ให้ถูกต้อง; ห้ามส่งเนื้อหาให้ reviewer. `.env.auth.test` ถูก gitignore.

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Downloads\FINNTECH'
if (!(Test-Path -LiteralPath '.env.auth.test')) {
  Copy-Item -LiteralPath '.env.auth.test.example' -Destination '.env.auth.test'
}
# Edit placeholders locally. Do not print credentials or the URL.
docker compose --env-file .env.auth.test -f compose.auth.test.yaml up -d --wait
npm run tracker:db:validate
npm run tracker:db:generate
npm run tracker:auth:test
npm run tracker:build
npm run tracker:auth:smoke
docker compose --env-file .env.auth.test -f compose.auth.test.yaml stop postgres-auth-test
```

Guarded test runner ตรวจ exact target + synthetic-only confirmation + empty public schema ก่อน apply ทั้งสี่ migrations. Nonempty/unexpected DB ถูกปฏิเสธโดยไม่ reset/delete/migrate. Missing/unavailable PostgreSQL = exit2 NOT TESTED. **หลังรอบแรก volume ไม่ว่างแล้ว: อย่ารัน acceptance ซ้ำหรือ reset เพื่อทำให้ผ่าน**; เก็บหลักฐาน และวางแผนฐานข้อมูลสังเคราะห์ชุดใหม่ก่อนรอบใหม่. Stop เฉพาะ service ไม่ down --volumes.

12 PostgreSQL cases: migration status, hashed credentials/DB session, anonymous/fixture rejection, concurrent owner mapping, owner A/B scope, login ใหม่คง owner, wrong password, wrong/missing Origin, tampered cookie, no-cache/token-free JSON, expiry, logout/replayed cookie และ health/API boundary (บาง assertions อยู่ใน case เดียว).

`tracker:auth:smoke` ใช้ compiled `dist/server.js` ผ่าน Node --no-strip-types, port4194 และ synthetic test DB เท่านั้น; ตรวจ same-origin HTTP/cookies/logout + built HTML/JS/CSS MIME, missing asset/API 404 และไม่มี generated server secret ใน assets. สร้าง fixture สังเคราะห์เพิ่มแล้วเก็บไว้. ไม่แย่ง port หรือฆ่า process อื่น; finally หยุด child และตรวจ port ว่าง.

## ข้อจำกัดและ gate ถัดไป

- Runtime acceptance ผ่าน PostgreSQL ไม่ทดแทน browser automation; การตรวจ cookie ผ่าน HTTP ยังไม่พิสูจน์ UI/browser interaction จริง. หน้า4173 ยังเป็น skeleton.
- Rate limit ใช้ memory ของ process และเปิดใน development ด้วย; ยังไม่พิสูจน์ distributed/atomic rate limiting หรือ reverse-proxy IP trust. ต้องสรุปก่อน production.
- HTTPS cookie config มี unit coverage แต่ยังไม่มี live HTTPS acceptance. Email verification/reset, mail delivery, retention/deletion, secret rotation, session abuse/rate-limit review และ Node ขั้นต่ำเป็น production gates; ไม่เปิดเผยแพร่ในงานนี้.
- Cost-basis/replay, write authorization ของ business endpoints, importer/legacy archive read API และ market relay ยังไม่ทำ. ข้อความ “ข้อมูลเพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน” คงอยู่ในหน้าไทยเดิม.
