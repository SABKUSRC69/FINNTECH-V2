# Offline security review: owner and input boundaries

วันที่ตรวจ: 2026-10-05 (Asia/Bangkok)

รอบนี้ตรวจโค้ดและ unit/HTTP regression tests ผ่าน environment ของ task เท่านั้น
เจ้าของไม่ได้อยู่กับคอมที่หอ ไม่ต้องเปิด Docker, browser หรือรันคำสั่งเพิ่มเติม
ไม่เรียกฐานข้อมูลจริง ไม่สร้างบัญชี/session ไม่ reset volume และไม่เปิดบริการภายนอก
ไม่แก้ runtime source, dependencies, `src/` เดิม หรือเอกสาร F1.1

## หลักฐานจากโค้ด

| Boundary | ตำแหน่งที่ตรวจจริง | ผลและขอบเขต |
| --- | --- | --- |
| Authenticated owner | `apps/api/src/auth/authorization.ts:38`, `:43` | อ่าน session ฝั่ง server แล้ว resolve business owner; ไม่อ่าน owner จาก body/query/header |
| Identity mapping | `apps/api/src/auth/authorization.ts:24`, `:27` | ยอมรับเฉพาะ provider/subject/verifiedAt/owner state ที่ถูกต้อง; retry mapping เฉพาะ Prisma P2002 ไม่ยอมรับ connection failure เป็น unique race |
| Origin และ cache | `apps/api/src/tracker/routes.ts:23`, `:25`, `:26`; `apps/api/src/app.ts:81`, `:83` | protected business routes ตรวจ owner และ exact write Origin; Auth routes มี allowlist; protected successful responses ใช้ no-store |
| Owner-scoped reads | `apps/api/src/tracker/service.ts:64`, `:65`, `:69`, `:216` | categories/finance/budgets/portfolios/holdings/trades มี owner filter; finance จำกัด USER_ENTERED |
| Owner-scoped writes | `apps/api/src/tracker/service.ts:114`, `:136`, `:177`, `:194`, `:196` | ตรวจ category/portfolio/trade ของเจ้าของ และล็อก record/portfolio ที่มี owner predicate ก่อนเปลี่ยน history |
| Idempotency และ transaction | `apps/api/src/tracker/service.ts:36`, `:45`, `:51` | owner + endpoint + request key ไม่ผูก session; receipt/audit อยู่ใน mutation transaction; runtime lock/rollback ไม่ทดสอบซ้ำในรอบนี้ |
| Validation ก่อน business write | `packages/contracts/src/index.ts:38`, `:67`, `:100`; `apps/api/src/tracker/service.ts:111`, `:175` | strict Zod contracts ใช้ Finance parser, ปฏิเสธ owner field ที่ไม่อยู่ใน schema และ financial JSON numbers/scale/range ผิด |
| Body limits และ errors | `apps/api/src/tracker/routes.ts:14`, `:31`, `:57`; `apps/api/src/auth/authorization.ts:46` | normal body 64 KiB, backup ใช้ limit แยกหลัง Auth; errors ของ parser/owner lookup ไม่สะท้อน raw input/driver details |
| Session/secret boundary | `apps/api/src/auth/runtime.ts:22`, `:27`, `:31`; `apps/api/src/app.ts:67`, `:72`; `scripts/tracker-dev.mjs:65`, `:78` | DB sessions, HttpOnly/SameSite, cookie cache ปิด, redact JSON token และ logger; Web รับ environment whitelist; ไม่มีการแสดงหรือแนบ credentials ในงานนี้ |
| Quote-only WebSocket | `apps/api/src/tracker/stream.ts:26`, `:36`, `:55` | exact Origin/session check, read-only client messages, periodic session recheck; รอบนี้เป็น static review ไม่ใช่ real WS reconnect test |
| Backup ownership | `apps/api/src/tracker/backup.ts:48`, `:56`, `:101`, `:102` | export/read/empty-target checks มี owner scope; restore แยก USER_ENTERED whitelist, consent/digest/exclusive dataset lock; ไม่ทดสอบ DB restore ซ้ำ |

VERIFIED ใน business identity mapping หมายถึง authenticated subject binding
ไม่ใช่การยืนยันอีเมล, KYC หรือสิทธิ admin ตาม decision 005 เดิม
ไม่สรุปว่าตรวจความปลอดภัยครบทุกส่วนจากการอ่านไฟล์หรือ tests เหล่านี้

## Regression tests ที่เพิ่ม

`apps/api/test/authorization.test.ts`: 42 cases ใช้ createApp/real routing/parsers
กับ synthetic Auth/database doubles ซึ่งระบุชัดว่าไม่ใช่ PostgreSQL evidence:

- Anonymous GET 6 paths และ POST/PATCH 10 paths ถูกปฏิเสธก่อน owner lookup/business write
- ปลอม owner/auth-user ผ่าน query/header ไม่เปลี่ยน server OwnerContext
- authenticated subject สองรายถูกส่ง owner filters ของตนให้ finance queries
- session lookup/query failure คืน fixed 503 ไม่ echo error detail
- wrong provider/subject, missing verifiedAt และ FIXTURE mapping ถูกปฏิเสธ
- first-request P2002 อ่าน winner ใหม่; missing winner ไม่ authorize; P1001 ไม่ถูกนับเป็น unique race
- missing/non-exact Origin ถูกปฏิเสธก่อน business mutation เมื่อมี mapping อยู่แล้ว
- owner field ใน write body, THB JSON number/null/boolean/empty/whitespace/exponent/scale/range ผิดถูกปฏิเสธก่อน mutation transaction
- invalid input tests ส่ง idempotency key ที่ถูกต้อง เพื่อไม่ให้การขาด key กลบ validation bug
- malformed JSON และ oversized body คืน 400/413 แบบไม่สะท้อน input

ไม่เพิ่ม tests สูตรที่เลียนแบบ implementation เพราะ Finance suite เดิมครอบคลุม
fees, partial/full sale, half-even, oversell, overflow และ independent scopes อยู่แล้ว
และถูกรันซ้ำจริงใน tracker suite รอบนี้

## Verification

| Check | ผลรอบนี้ | หลักฐาน |
| --- | --- | --- |
| tracker:typecheck | PASS | TypeScript strict ทุก workspace; ไม่มี dependency/version change |
| tracker:test | PASS | 149 cases: Finance16 / Contracts11 / API78 / Web44 รวมใหม่ 42 |
| Cold Vite optimizer smoke | PASS | อยู่ใน tracker:test; --force ส่ง browser ESM ของ react-dom/client และหยุด server คืน port4175 |
| tracker:build / compiled packages --no-strip-types | PASS | exit0 ทั้ง build และ compiled package smoke; runtime exports และ Decimal boundaries ผ่าน smoke เดิม |
| root npm test | FAIL เดิม | 276 passed / 2 failed รวม 278; จำนวนเพิ่มจาก root discovery ของ suite ใหม่ 42; failures ยังเป็น allComponents และ spotTrading.integration |
| root build | PASS | exit0; ไม่เปลี่ยน src/dependencies เดิม |
| diff / whitespace / baseline | ผลใน evidence report | ตรวจไฟล์ใหม่แยกจาก git diff เพราะยัง untracked; ไม่แก้ expected/skip ของ root tests |
| PostgreSQL constraints/locks/Auth/browser/provider | NOT TESTED รอบนี้ | ไม่เรียก Docker, DB, browser หรือ provider; อ้างผลเก่าได้เฉพาะว่าเป็นหลักฐานในอดีต |
| Dependency advisory audit | NOT TESTED | ไม่ส่ง dependency list ไป registry ในรอบนี้ ไม่อัปเกรดเพื่อคาดเดาผล audit |
| Node ขั้นต่ำ 22.12 / HTTPS / multi-process limit | NOT TESTED | รอบนี้ Node24.18.0; local tests ไม่ใช่หลักฐาน target online |

การรันแรกใน sandbox ล้มก่อนเริ่ม tests ด้วย EPERM realpath ของ authorization.ts
แยกเป็น environment failure; host run เริ่ม 41 tests ได้ โดย test ใหม่หนึ่งข้อคาด
zero serialization ผิดเป็น `0.00` จึงแก้เฉพาะ test ใหม่เป็น canonical `0`
ตาม Finance/README เดิม และเพิ่ม case subject B เป็น 42 cases ก่อน full suite PASS
ไม่มี runtime source หรือ test เดิมเปลี่ยนเพื่อทำให้ผลผ่าน

## งานที่ทำต่อได้และสถานะ

| งาน | สถานะ | สิ่งที่ต้องทำต่อ |
| --- | --- | --- |
| Owner/input review + regression | PASS เฉพาะ scope นี้ | คง suite นี้ใน scripts เดิม; ทดสอบ PostgreSQL/HTTP/browser ต่าง scope ตาม gates เดิม |
| Account recovery/verification | ยังไม่ implement | วาง flow verification/reset/expiry/single-use/session revocation/abuse protection; เลือกช่องทางส่งกับเจ้าของก่อนเชื่อมบริการ ไม่ใช้ fixture เป็นบัญชีจริง |
| Retention/deletion | รอตัดสินนโยบาย | แยกบัญชี, financial records, audit, legacy และ backups; กำหนด actor/retention/backup effects ก่อนเปิด delete endpoint หรือ job; v1 ไม่ล้าง legacy อัตโนมัติ |
| Scheduled/off-device DB backups | ยังไม่ implement | กำหนด RPO/RTO, encrypted off-device storage/key custody, schedule/alerts และทดสอบเครื่อง/profile สูญหาย; local DPAPI rehearsal ไม่แทน disaster recovery |
| FINNTECH UI redesign | แบบจำลองพร้อม ยังไม่แก้ UI จริง | นำ spacing/colors/navigation/mobile layout ไปปรับ apps/web โดยรักษา Auth/Decimal/API behavior และ same-origin; ไม่แทนระบบด้วย template Auth/DB ใหม่ |
| Online security/operations | รอ target และการอนุญาตแยก | HTTPS/Secure cookies, reverse proxy/IP trust, distributed rate limit, release/rollback/monitoring; ไม่มี deploy ในรอบนี้ |

## Evidence

`C:\Users\Admin\Downloads\FINNTECH\.offline-security-20261005-200718.local\`
มี manifest before/after, comparison, incremental changes.patch รวม untracked,
complete-files.md และ sanitized test/build logs โดยไม่รวมไฟล์ env หรือ dump
baseline เก็บเพียง paths/SHA-256 ไม่พิมพ์เนื้อหา secret
ผล comparison และ checks ที่ยัง pending ด้านบนให้ยึด review-report.md เมื่อปิดรอบนี้

หลักฐาน R03 ที่เสร็จก่อนงานนี้: `.pg-recovery-runtime-20261005-192002.local/`
PostgreSQL16.15 restore fidelity 20 tables ผ่าน ต้นทางไม่เปลี่ยนและ volume คงอยู่
เป็นหลักฐานรอบก่อน ไม่ใช่การรัน PostgreSQL อีกครั้งใน offline review นี้
