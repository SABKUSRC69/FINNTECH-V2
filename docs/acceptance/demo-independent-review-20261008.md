# DEMO independent review — 8 October 2026

สถานะ: ยอมรับหลักฐาน deployment และระบบ DEMO หลักสำหรับให้เพื่อนกลุ่มเล็กทดลองด้วยข้อมูลสมมติ มี P2 ด้านการรักษา navigation lock ที่ต้องแก้ก่อนปิด acceptance ของ workflow นี้ ไม่รับรองเว็บไซต์ทั้งหมดหรือความพร้อมสำหรับข้อมูลเงินจริง

## สิ่งที่ตรวจเองในรอบนี้

- อ่าน implementation ของ DEMO, Auth runtime/configuration, owner authorization, request guards, frontend entry/fresh flow, WebSocket stream และ migration พร้อม isolated PostgreSQL tests และรายงานส่งมอบ
- `git apply --check --reverse docs/acceptance/demo-shared-access-20261008.patch`: exit 0
- ตรวจ SHA256 ของไฟล์ใน final release manifest กับ workspace: **138/138 ตรงกัน** เป็นการตรวจไฟล์ local กับ manifest ไม่ใช่การดึง source จาก Render
- Focused Vitest: **27 tests / 5 files ผ่าน, exit 0** ครอบคลุม DEMO boundary, WS, entry UI, auth client และ App รอบแรกใน sandbox เกิด EPERM ก่อนรัน tests; รันใหม่บน host แล้วผ่าน
- GET เว็บจริง `/api/health`, `/api/ready`, `/api/auth-capabilities`: **200 ทั้งสาม** database ok, synthetic DEMO enabled, recovery/verification off โดย health ยังระบุ auth `not_checked`
- `git diff --check`: exit 0 พร้อม existing CRLF normalization warnings
- ไม่ใช้รหัส DEMO ไม่เข้าฐานข้อมูล cloud ไม่สร้างบัญชี cloud ไม่ deploy และไม่แก้ application source

หลักฐาน review-only อยู่ใน `.demo-independent-review-20261008.local/`: `focused-tests.log`, `reproduction.log`, `public-http.json`, `audit-production.json` และ mocked reproduction/config ไม่มีรหัสจริง

## P2 — Successful entry followed by failed account reconciliation unlocks too early

ตำแหน่ง: `apps/web/src/auth/DemoEntry.tsx` catch ของ `enter()` หลัง `submitDemo('enter', code)` และ `readAccount()`

เมื่อ `/demo/enter` ตอบสำเร็จแล้ว แต่ `readAccount()` ติดต่อ health/session/me ไม่สำเร็จ หรือเจอ response ที่ตรวจสอบไม่ได้ จะโยน `AuthRequestError` ที่ `outcomeUnknown=false` สำหรับ GET จากนั้น catch ตั้ง `pending=false` และเรียก `pendingLock(false)` ช่องรหัส ปุ่มเริ่มใหม่ และเมนูจึงปลดล็อก ทั้งที่ยังไม่ยืนยันบัญชีที่เพิ่งสร้าง ไม่มีปุ่มตรวจผลคำขอ DEMO เดิมให้ใช้งาน

ยืนยันด้วย mocked UI reproduction: prepare/enter สำเร็จ แล้ว readAccount reject ด้วย `AuthRequestError('synthetic GET failure')`; ตรวจพบช่องรหัสและปุ่มเริ่มใหม่เปิดใช้งาน, pendingLock รับ false และปุ่ม reconcile หาย **1 reproduction ผ่าน, exit 0** เป็น test ที่ยืนยันพฤติกรรมผิดปัจจุบัน ไม่ใช่ test ที่ยืนยันว่าแก้แล้ว

ผลกระทบ: ผู้ใช้สามารถเปลี่ยนเมนู/ข้อมูลก่อนยืนยัน session และละทิ้งขั้นตอนตรวจผลพื้นที่เดิม ไม่พบหลักฐานข้อมูลข้ามเจ้าของหรือ receipt สร้างซ้ำจากกรณีนี้; server ยังปฏิเสธ reset ขณะที่ session ใช้งานได้

แนวแก้: จดจำว่า enter สำเร็จแล้ว และรักษา pending/navigation lock เมื่อการตรวจบัญชีภายหลังล้มเหลว ใช้รหัสและ signed request cookie เดิม ห้าม prepare/reset/new workspace จนยืนยันผลแล้ว เช่นเดียวกับ `handleAuth()` ที่มี committed flag ตรวจกรณีเดียวกันใน `freshDemo()` ด้วย: sign-out สำเร็จแล้ว แต่ readAccount ล้มเหลว ปัจจุบันอาจไม่ตั้ง uncertain เพราะใช้เพียง error.outcomeUnknown โดยกรณี fresh นี้ยืนยันจาก source ยังไม่ได้ทำ reproduction แยก

## สิ่งที่รับได้และข้อจำกัด

โค้ดกำหนดรหัสเฉพาะ server, สร้าง genuine Better Auth session พร้อม owner แยก, ใช้ durable receipt และ transaction adapter เดียวกับ seed, จำกัด body/time/rate/capacity และตรวจ fixed expiry/epoch ฝั่ง HTTP/WS ไม่มี demo password store หรือ recovery enrollment

Root 342, tracker 213 และ PostgreSQL 13 tests มาจาก logs ของผู้ทำงานซึ่งตรวจอ่านแล้ว **ไม่ได้รัน full suites หรือ PostgreSQL ซ้ำใน review นี้** รอบนี้รันเองเฉพาะ 27 tests และ reproduction 1 ข้อ ไม่รวมจำนวน overlapping suites เป็นจำนวน tests ใหม่

WSS cloud acceptance ผ่านตามเกณฑ์ฉบับสุดท้าย แต่ client-visible close วัดได้ **22,723ms** หลัง logout ไม่ใช่ภายใน 5 วินาที รายงานระบุ no messages after revalidation และ new upgrades denied พร้อมรักษาหลักฐาน assertion 14 วินาทีที่เคยล้มเหลว สาเหตุ transport delay ยังไม่ยืนยัน

`npm audit --omit=dev --json` รอบนี้ exit 1: dependency tree แจ้ง **5 package findings ระดับ high** คือ prisma, @prisma/config, deepmerge-ts, mysql2 และ source-map-js จำนวนนี้มี inherited findings และไม่เท่ากับช่องโหว่ runtime ที่เข้าถึงได้ 5 จุด Dockerfile ใช้ custom runtime closure ที่ตัด CLI/dev/optional peers; inventory รอบ Beta ก่อนหน้าที่อ่านไม่มีแพ็กเกจทั้งห้านี้ ต้องตรวจ inventory ของ final image และ reachability ต่อ จึงยังไม่สรุปว่า deployed runtime มีหรือไม่มีช่องโหว่ดังกล่าว ไม่เปลี่ยน package/lock และไม่ใช้ audit fix --force

## งานที่ยังต้องทำ

1. แก้ P2 และเพิ่ม regression สำหรับ success-then-reconciliation-failure รวมถึง fresh logout reconciliation
2. ทดสอบ natural four-hour expiry และ Render idle/cold start ของ release จริง
3. ตรวจ final runtime dependency inventory/advisories และแยก build-only findings พร้อมแนวแก้ที่ไม่ downgrade Prisma โดยอัตโนมัติ
4. ทดลองสอง browser profiles/อุปกรณ์จริง และ network interruption ของ browser
5. ทำ full database restore drill ในพื้นที่แยก; `pg_restore --list` เป็นแค่การอ่าน archive
6. กำหนด retention/capacity: default 100 นับพื้นที่ที่เก็บทั้งหมด แม้ logout/หมดอายุ จึงเต็มได้; ไม่มี automatic deletion

Production rotation/epoch ยังไม่ทดสอบจริง แต่มี isolated HTTP/WS evidence; physical-device accessibility, load/quota/multi-instance และ exhaustive provider log history ยังไม่รับรอง ใช้ข้อมูลสมมติสำหรับรอบเพื่อนทดลองนี้

Prompt สำหรับงานแก้: [FINNTECH_DEMO_REVIEW_FIX_PROMPT_EN.md](../../FINNTECH_DEMO_REVIEW_FIX_PROMPT_EN.md)
