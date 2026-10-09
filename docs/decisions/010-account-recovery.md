# 010: Account recovery and email verification design

วันที่ 2026-10-05 — DESIGN READY / runtime NOT IMPLEMENTED และ NOT TESTED

เอกสารนี้เป็นแผนสำหรับ R04 ไม่เปิด endpoints หรือเชื่อมบริการส่งอีเมล
ไม่แก้ ADR-002, migration acceptance, credentials, fixture หรือข้อมูลบัญชีเดิม
ข้อเสนอด้านอายุ token และช่องทางส่งยังต้องยืนยันก่อน implementation
ใช้ประกอบกับ [นโยบายข้อมูล](../operations/data-retention-deletion.md)
และเก็บประวัติ [Auth เดิม](005-auth-authorization.md) ไว้

## สิ่งที่ตรวจพบในระบบปัจจุบัน

| หลักฐาน | พฤติกรรมปัจจุบัน |
| --- | --- |
| `apps/api/src/auth/runtime.ts:16` | Better Auth deleteUser ปิดอยู่; account linking ปิดอยู่ |
| `apps/api/src/auth/runtime.ts:18` | AuthVerification ใช้ database; ยังไม่กำหนด hashed identifier |
| `apps/api/src/auth/runtime.ts:19` | Email/password เปิด ความยาว 12–128; ไม่มี sendResetPassword/sendVerificationEmail หรือ requireEmailVerification |
| `apps/api/src/auth/runtime.ts:20` | Database session 7 วัน, cookie cache ปิด; HttpOnly/SameSite cookie ตาม config ฝั่ง server |
| `apps/api/src/auth/runtime.ts:29` | Rate limit เป็น memory ต่อ process; ยังไม่พิสูจน์ topology production |
| `apps/api/src/app.ts:81` | Allowlist มี signup/signin/signout/get-session/ok เท่านั้น; recovery/verification paths ยังเป็น API 404 |
| `apps/api/src/auth/authorization.ts:16` | Tracker identity VERIFIED หมายถึง binding กับ Auth subject ไม่ใช่ emailVerified หรือการยืนยันบุคคล |
| `apps/api/prisma/schema.prisma:95` | AuthUser มี emailVerified เริ่ม false; AuthIdentity มี FK Restrict; ห้ามใช้เปลี่ยน owner เพื่อกู้บัญชี |

ตรวจ package ที่ติดตั้งจริง `apps/api/node_modules/better-auth/package.json`
เป็น 1.7.7 ไม่เปลี่ยนเวอร์ชันหรือ dependency ในงานนี้

ใน installed `dist/api/routes/password.mjs:51,73,81,154,168`:
reset ต้องมี callback ส่งอีเมล, ค่า expiry เดิม 1 ชั่วโมง,
GET link ตรวจแล้ว redirect โดยไม่ consume token, POST consume ก่อนเปลี่ยน password
แล้วจึงเรียก hook และลบ sessions เมื่อเปิด option
`dist/db/internal-adapter.mjs:787` มี consumeVerificationValue แบบ atomic/ตรวจ expiry
แต่นี่ไม่ใช่หลักฐานว่า password update และ session revocation ทั้ง endpoint atomic
กับ PostgreSQL adapter จริง ต้องทดสอบ failure ระหว่างขั้นตอนก่อนเปิดใช้งาน

ใน installed `dist/api/routes/email-verification.mjs:14,178,287,297`:
email verification ใช้ signed JWT, กรณี emailVerified อยู่แล้วให้ผล idempotent,
และ auto-signin เป็น option; ห้ามอ้างว่า email JWT consume แถว database แบบ reset token

## ข้อเสนอ flow สำหรับผู้ใช้

1. บัญชีใหม่สำหรับข้อมูลจริงยืนยันอีเมลก่อนใช้ ledger/recovery โดยตั้ง
   requireEmailVerification และปิด auto-signin หลัง verification
   การยืนยันนี้ไม่ใช่ KYC และไม่เปลี่ยน owner UUID/provenance
   fixture เดิมไม่ถูก promote หรือยืนยันอีเมลอัตโนมัติ
2. หน้า “ลืมรหัสผ่าน” รับอีเมลอย่างเดียว และตอบเหมือนกันสำหรับทุกสถานะบัญชี:
   “หากบัญชีนี้รองรับการกู้คืน ระบบจะส่งขั้นตอนไปยังอีเมลที่ลงทะเบียนไว้”
   ไม่ล็อกบัญชี ไม่สร้าง session และไม่เปลี่ยน password จากการขอลิงก์
3. ส่งลิงก์เฉพาะอีเมลที่ยืนยันแล้วของบัญชีนั้น ใช้ Better Auth reset flow
   ไม่สร้างระบบ hash/password ใหม่ ข้อเสนอ reset อายุ 15 นาที
   ตั้ง resetPasswordTokenExpiresIn เป็น 900 และ verification.storeIdentifier เป็น hashed
   ต้องตรวจค่าที่เก็บจริงกับ adapter; ห้าม log token/URL/body
4. ผู้ใช้เปิดลิงก์เข้าสู่หน้า “ตั้งรหัสผ่านใหม่” ฝั่ง origin ของเรา
   GET/link scanner ไม่เปลี่ยน password; POST ต้องให้ผู้ใช้ยืนยันรหัสใหม่สองครั้ง
   server บังคับนโยบาย 12–128 เดียวกับ signup และ validate token/expiry
5. เมื่อสำเร็จเพิกถอน database sessions ทั้งหมดด้วย revokeSessionsOnPasswordReset
   และยกเลิก reset challenges ค้างของบัญชี ไม่ auto-signin
   แจ้ง “เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่” และส่งแจ้งเตือนที่ไม่มีรหัสผ่าน
6. ถ้า timeout หลังส่ง POST ให้บอก “ยังยืนยันผลไม่ได้” ไม่อ้าง rollback
   การลอง token เดิมที่ใช้แล้วต้องไม่เปลี่ยน password ซ้ำ; ให้ลองเข้าสู่ระบบปกติ
   หรือขอลิงก์ใหม่ ไม่คืน token/credential ผ่าน receipt หรือ status endpoint

ข้อเสนอ verification email อายุ 24 ชั่วโมง ต้องตั้ง expiresIn ชัดเจน
การกดซ้ำให้ idempotent ไม่เปิด auto-signin หรือเปลี่ยนบัญชีที่กำลังล็อกอิน
ใช้ confirmation landing ก่อนส่งผู้ใช้เข้า verification callback เพื่อให้ข้อความชัด
แต่ไม่อ้างว่า callback GET ของ library เป็น POST-only หรือ single-use database token

## บัญชีเดิมและกรณีสูญเสียการเข้าถึง

- บัญชีที่ emailVerified=false ยังไม่รองรับ automatic recovery ตามข้อเสนอนี้
  ผู้ที่ยังล็อกอินได้ต้องยืนยัน password ปัจจุบันก่อนเริ่มยืนยันอีเมลเดิม
  ไม่เปิด unauthenticated verification ให้ใช้ข้าม prerequisite นี้ในบัญชีเดิม
- ถ้าลืม password ก่อนยืนยันอีเมล หรือเข้า mailbox ไม่ได้: ไม่มี automatic recovery
  ต้องแจ้งข้อจำกัด ไม่ใช้ screenshot, JSON backup, namespace, DEMO credentials
  หรือการแจ้ง owner UUID เป็นหลักฐานให้เปลี่ยน ownership
- การเปลี่ยนอีเมล, account linking, admin recovery override และ recovery codes
  ยังไม่อยู่ในรุ่นนี้ ไม่ย้ายข้อมูลเข้าบัญชีใหม่โดยอัตโนมัติ
- ก่อนเปิด requireEmailVerification ต้องกำหนด rollout/แจ้งผู้ใช้เดิม
  ไม่เปิด flag แล้วทำให้ทุกบัญชีเดิมเข้าไม่ได้โดยไม่มีแผน; local fixtures คงเดิม
- ถ้า mailbox ถูกยึด การ reset อย่างเดียวไม่พิสูจน์ว่ากู้บัญชีปลอดภัย
  ระงับ recovery ตาม incident runbook ที่ต้องออกแบบแยก ไม่สร้างทางลัดเจ้าหน้าที่

## Server boundary และ delivery

เพิ่ม Auth allowlist ทีละ path ที่จำเป็นเมื่อมี implementation/tests
ห้ามเปิด wildcard ส่งทุก Auth route ผ่านโดยปริยาย
server กำหนด redirect/callback เป็น path ที่รู้จักบน origin เดียวกัน
reject external origin, protocol-relative URL และ path ที่ไม่รองรับ
ไม่ให้ request Host หรือ input ผู้ใช้กำหนด link origin
POST ใช้ Origin/CSRF checks เดิม ไม่ปิดเพื่อรองรับอีเมล

หน้า recovery ใช้ no-store/no-referrer และ CSP ที่ไม่มี third-party scripts
อ่าน token เข้า memory แล้วล้าง query จาก address bar โดยไม่เก็บใน localStorage
ต้อง redact token ทั้ง URL path/query ใน app, proxy, monitoring และ delivery errors
ห้ามแนบ email/password/hash/token/cookie/connection URL ใน logs หรือ evidence
การล้าง address bar ไม่ทำให้ access log หรือประวัติที่บันทึกไปแล้วหาย

delivery ต้องเป็น server-only adapter พร้อม durable retry/bounded lifetime
ไม่รอ provider ใน response ที่ทำให้แยกบัญชีได้จากเวลา และไม่ใช้ fire-and-forget
ที่เสียงานเงียบ ๆ เมื่อ process ปิด; idempotent delivery ไม่ต่ออายุ token เอง
เมื่อ provider ล่มยังตอบ generic response แต่สถานะงาน/alert ภายในต้องแสดง failure
rate limits แยก IP ที่เชื่อถือได้กับ account bucket แบบ keyed digest ไม่เก็บอีเมลใน log
threshold/store/IP trust ยังต้องทดสอบภายใต้ topology จริง; memory limit เดิมไม่พอเป็นหลักฐาน
digest ยังเป็นข้อมูล pseudonymous ไม่เรียกว่า anonymous

เลือกอีเมลที่ยืนยันแล้วเป็นช่องทาง recovery ตามแผนนี้
ยังไม่มี provider/SMTP ที่อนุมัติ ไม่สมัครหรือส่งเมลจริงในรอบนี้
งานทดสอบก่อนเชื่อมบริการใช้ synthetic mailbox และ test outbox ภายในเท่านั้น
ห้ามแสดง raw message/link/token ในรายงานหรือใช้ผู้รับจริง

## Consistency และ session revocation gate

ต้อง serialize reset/verification/deletion ที่เกี่ยวกับ AuthUser เดียวกันฝั่ง server
token เดียวแข่งสองคำขอต้องสำเร็จได้ครั้งเดียว และ token เก่าทุกตัวใช้ไม่ได้หลัง reset
ตรวจ lock order ร่วมกับ owner-dataset lock ของ ledger; ไม่เกิด deadlock กับ deletion

ก่อนอ้าง reset สำเร็จ ต้องพิสูจน์ว่า password เปลี่ยนและ sessions ถูก revoke ครบ
การตั้ง prismaAdapter transaction:true หรือ revokeSessionsOnPasswordReset อย่างเดียว
ไม่ใช่หลักฐานว่า transaction ครอบทั้ง flow/hook
หาก adapter ทำ atomic commit ข้ามขั้นตอนไม่ได้ ต้องมี durable security barrier
ปิดการ authorize HTTP/WS ของ subject ที่ pending/failure จน repair สำเร็จ
การเลือกวิธี integration/forward migration เป็นงาน implementation ถัดไปและเป็น gate
ห้าม success response ทั้งที่ old session ยังใช้ได้จาก partial failure

WebSocket ต้องปิดเมื่อ session ถูก revoke และไม่มีข้อมูลส่งหลังตรวจพบ revocation
timer เดิม `apps/api/src/tracker/stream.ts:47` ตรวจทุก 5 วินาที
ต้องวัดจริงรวม latency/DB failure ไม่อ้างว่า immediate หรือ <=5 วินาทีจาก timer อย่างเดียว
database lookup failure ต้อง fail closed; reset ไม่เปลี่ยน finance rows หรือ owner mapping

## Acceptance ก่อนเปิด runtime

ทุก scenario ต่อไปนี้ NOT TESTED ในรอบเอกสารนี้ ใช้ PostgreSQL จริงสำหรับ consistency
และ browser จริงสำหรับ link/cookie; unit doubles ไม่ใช้แทนหลักฐานนั้น

| ID | Scenario / สิ่งที่ต้องพิสูจน์ |
| --- | --- |
| A01 | existing verified / unknown / unverified email ตอบ status/body เหมือนกัน; วัด timing distribution และส่งเฉพาะ verified mailbox |
| A02 | verification หมดอายุ/ปลอม/ซ้ำ/ต่าง subject ไม่สร้าง session ไม่เปลี่ยน owner และไม่ข้าม gate ของบัญชีเดิม |
| A03 | reset ปลอม/หมดอายุ/ใช้แล้ว/จากบัญชีอื่นถูกปฏิเสธ; concurrent token เดียวสำเร็จเพียงครั้งเดียว |
| A04 | GET link/scanner ไม่เปลี่ยน password; reset POST ใช้ password policy เดิม; old password ไม่ผ่านหลังสำเร็จ |
| A05 | reset สำเร็จ: sessions ทุกอุปกรณ์ใช้ไม่ได้, HTTP ถูกปฏิเสธ, WS ปิดตามค่าที่วัดจริง; ledger/owner ไม่เปลี่ยน |
| A06 | fail หลัง consume / hash / password write / hook / revoke: ไม่ประกาศสำเร็จผิด; pending barrier/transaction recovery ป้องกัน old sessions ตามวิธีที่เลือก |
| A07 | timeout หลัง commit: UI ไม่อ้าง rollback; retry ไม่เปลี่ยนรหัสซ้ำและไม่เปิด session อัตโนมัติ |
| A08 | delivery down/process restart/retry ไม่สูญงานเงียบ ไม่ต่ออายุ token และไม่ leak account existence |
| A09 | wrong/missing Origin, external redirect, Host injection และ spoof IP ไม่ผ่าน policy; rate limits วัดจริงรวม multi-process |
| A10 | HTML/history/storage/network/logs/proxy ไม่มี token exposure เกินช่องทางที่จำเป็น; frontend ไม่รับ server secrets |
| A11 | deletion-pending และบัญชีที่ลบแล้วไม่ส่ง recovery/สร้าง mapping ใหม่; restore เก่าไม่ฟื้น credentials หรือ challenges |
| A12 | rollout บัญชีเดิม/fixtures ไม่ promote DEMO ไม่ทำบัญชีสูญข้อมูล; email change/link/admin bypass ยังคงปิด |

## เอกสารอ้างอิง

ความสามารถ config/reset/session revocation ตรวจเทียบ installed source 1.7.7 กับ
[Better Auth email/password](https://www.better-auth.com/docs/authentication/email-password)
และ hashed identifiers/rate-limit options กับ
[Better Auth options](https://www.better-auth.com/docs/reference/options)
ไม่คัดลอกตัวอย่างที่ log อีเมลหรือ token ลงระบบเรา

generic responses, expiry, single-use reset, anti-abuse, session invalidation,
no automatic login และไม่ใช้ข้อมูล recovery ที่เพิ่งเปลี่ยนเป็นหลักฐานเดียว
อ้าง [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
expiry ตัวเลขและ rollout ข้างต้นเป็นข้อเสนอ FINNTECH ไม่ใช่ตัวเลขบังคับจากแหล่งอ้างอิง
