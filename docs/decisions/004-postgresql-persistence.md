# F1.4 ส่วนแรก: PostgreSQL/Prisma persistence decision

วันที่ 2026-10-01; ยึด ADR-002 และ acceptance/migration โดยไม่แก้สองเอกสารนั้น

## Prerequisites และ dependency decision

- ใช้ Prisma CLI, `@prisma/client` และ `@prisma/adapter-pg` **7.10.0** แบบ exact pin ที่ตรวจจาก npm registry; adapter ใช้ PostgreSQL driver ภายใน ไม่เพิ่ม ORM หรือฐานข้อมูลอื่น
- [ข้อกำหนด Prisma 7 ทางการ](https://docs.prisma.io/docs/orm/v7/reference/system-requirements) รองรับ Node 20.19/22.12/24 และ TypeScript 5.4+; repo ใช้ Node 24.18.0, npm 11.16.0, TypeScript 5.9.3 ในรอบนี้
- เดิม API engines อนุญาต 22.9 ซึ่งต่ำกว่า minimum Prisma 7 จึงจำกัด API ใหม่เป็น `^22.12.0 || ^24.0.0`; ไม่เปลี่ยน dependencies/engine ของแอปเดิม Node 22.12 ขั้นต่ำยัง NOT TESTED
- Prisma 7 ใช้ generated client output และ driver adapter ฝั่ง API; [generate ก่อน build](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/generating-prisma-client) เพื่อให้ production รัน compiled JS ไม่พึ่ง tsx/type stripping
- เพิ่ม dependency ของ API ไปยัง Finance/Contracts เดิมโดยตรง ไม่เปลี่ยน version ของสอง packages นั้น
- ไม่พบ Docker, psql หรือ PostgreSQL service บนเครื่องนี้ ณ การตรวจ prerequisites; การ apply migration, constraints และ locks บน PostgreSQL จริงจึงยัง **NOT TESTED** ไม่มี mocks/SQLite แทนผลนั้น

## Ownership และ identity

- `tracker_users` คือ local ownership key แบบ UUID; default UNVERIFIED และ fixtures เป็น FIXTURE ไม่ถือเป็น authenticated identity
- `auth_identities(provider, subject)` เตรียม mapping ไป owner สำหรับ Better Auth ภายหลัง ไม่ใช่ Better Auth adapter/session schema และไม่ออก cookie/session ในรอบนี้ VERIFIED flag เพียงอย่างเดียวไม่ให้สิทธิ์
- ทุกตารางของผู้ใช้มี owner FK และ owner เปลี่ยนไม่ได้ Composite FKs ของ category รวม `(owner, category, type)`; budget อ้าง expense category เท่านั้น และ trade/holding รวม `(owner, portfolio, USDT)`
- holding key เป็น `(owner, portfolio, asset, quote_currency)`; last trade ถ้ามีต้องอยู่ scope เดียวกัน ไม่ปน BTC ของสองพอร์ต
- FK ป้องกัน cross-owner references แต่ไม่ใช่ read authorization/RLS; application services ในเฟส Auth ต้องดึง owner จาก verified session และ filter owner ทุก read/write ห้ามรับ owner จาก request body
- ไม่เปิด write endpoints และยังไม่ผูก database readiness เข้ากับ `/api/health`; route เดิมตรวจ process และยังรายงาน database/auth `not_configured`

## Decimal persistence boundary

- THB `DECIMAL(20,2)` (PostgreSQL NUMERIC); crypto quantity/price/fee/gross/cost/P&L `DECIMAL(38,18)`
- อ่าน actual Prisma.Decimal ด้วย `toFixed()` เป็น plain string แล้วผ่าน Finance parser; ไม่ส่ง Prisma.Decimal เข้า Finance arithmetic ไม่ใช้ Number/toNumber หรือ floating arithmetic
- `prepareFinanceMoney`/`prepareCryptoMoney` เรียก shared Zod contracts ก่อนสร้าง write fields ทั้งหมดเป็น canonical decimal strings ไม่ผูก owner/category/asset ID จาก body
- Raw input ใช้ `thbInputForStorage`/`cryptoInputForStorage` ซึ่ง reject scale/range เกินกำหนด ผลคำนวณใช้ `thbResultForStorage`/`cryptoResultForStorage` ซึ่ง quantize HALF_EVEN และตรวจ overflow ก่อน Prisma write
- API money ใช้ `thbForApi`/`cryptoForApi` ผ่าน Finance serializers รวมการ normalize computed negative zero ไม่ส่ง financial JSON numbers
- [PostgreSQL NUMERIC](https://www.postgresql.org/docs/16/datatype-numeric.html) ปัด excess scale ก่อน CHECK จึงห้ามอ้างว่า typmod/CHECK reject excess input scale ได้ ทุก financial write ของ service ในอนาคตต้องผ่าน boundary; raw SQL/Prisma admin writes ไม่ได้ให้การรับประกันนี้
- SQL CHECK ป้องกัน NaN, invalid currency, nonpositive amount/quantity/price, negative fees/cost/holding และ provenance ผิด ตาราง transaction ใหม่ใช้ THB, crypto ใช้ USDT ไม่มี FX
- Budget เป็นขีดจำกัด non-negative ต่อ expense category/month (first day); zero budget อนุญาต ไม่สร้าง aggregate income/expense
- gross/cost removed/realized P&L/holding cost ที่ยังไม่ได้คำนวณเป็น NULL ไม่เดาเป็นศูนย์; holding default NOT_BUILT ยังห้ามนำไปอ้างเป็น calculated portfolio/P&L

## Transaction/lock boundary

- `inOwnedPortfolioTransaction` รับ trusted owner ภายในเท่านั้น ใช้ Serializable transaction และ `SELECT ... WHERE owner_id AND portfolio_id FOR UPDATE` ตรวจ ownership/lock parent portfolio ที่มีอยู่จริง
- Lock ระดับ portfolio ป้องกัน concurrent writes ทุก `(owner, portfolio, asset, quote)` และกรณียังไม่มี holding row; สอง portfolio แยกกัน Lock กว้างกว่า asset scope อย่างตั้งใจเพื่อเริ่มต้นด้วยกติกาที่ตรวจง่าย
- lock timeout 1 วินาที, transaction timeout 10 วินาที Callback ต้องมีเฉพาะ DB operations ไม่มี network/external side effects
- เมื่อมี replay engine ต้องบันทึก trade, replay ตามลำดับ, ตรวจ oversell, projection, audit และ idempotency receipt ใน transaction เดียวนี้ การออกแบบ corrections ของ append-only ledger ยังรอ engine ไม่เปิดให้แก้ trade history ในรอบนี้
- Serialization/deadlock/lock-timeout ต้อง abort และ retry ทั้ง transaction แบบ bounded ภายใต้ key เดิมใน service ภายหลัง ยังไม่ทำ retry/business engine ในรอบนี้
- Connection timeout หลังส่ง commit เป็น unknown result ไม่ใช่หลักฐาน rollback ต้อง lookup receipt/key เดิมตาม acceptance; helper ไม่กลืน transaction error หรือกล่าวว่า rollback สำเร็จ
- Integration suite ใช้สอง Prisma clients ตรวจ lock บน PostgreSQL จริง กรณีนี้ยัง NOT TESTED จนเจ้าของรัน isolated DB

## Idempotency และ legacy archive

- Unique `(owner, endpoint, key)` ไม่ผูก session ID แยก file SHA-256 และ row identity; request SHA-256 ต้องครอบ file hash, immutable namespace ID, selected sections, currency overrides ใน importer ภายหลัง
- Schema เก็บ request hash/receipt และไม่ให้เปลี่ยน request identity หรือ receipt เงียบ ๆ Service ภายหลังต้อง lookup same key/hash คืน receipt เดิม; different hash ให้ conflict ไม่ใช่ upsert/overwrite
- known row ID: unique `(owner, namespace, section, source_row_id)` โดย ordinal ไม่ใช่ identity
- no-ID row: unique `(owner, namespace, file_hash, section, ordinal)` ด้วย partial index แยกอีกตัว รักษา identical rows ต่าง ordinal และไฟล์ใหม่ hash ต่างกัน ห้ามใช้ content hash dedupe
- Namespace ID immutable, display name เปลี่ยนได้ Namespace ไม่ใช่ authentication/credential
- Import/rows/summaries CHECK บังคับ LEGACY_DEMO ไม่เชื่อมไป normal finance/trade tables; currency override THB เป็น metadata และ cost basis ของ export v1 คง NULL Source payload append-only ไม่เขียนทับต้นฉบับ
- REVERSED batch/receipt กลับสถานะเดิมไม่ได้; deferred constraint ตรวจ batch และ receipt สอดคล้องกันเมื่อ commit Rollback legacy ไม่มี FK/action ไปแก้รายการปกติ
- Audit เป็น append-only ไม่มี generic JSON details เพื่อหลีกเลี่ยงการเก็บข้อมูลลับ Legacy JSON/receipt ยังรอ exporter whitelist/redaction/validation จาก importer ไม่เปิด raw dump endpoint ในรอบนี้
- Archive deletion/retention ยังไม่เปิด SQL triggers ป้องกัน update/delete source rows และ audit; นโยบาย retention/deletion และสิทธิ์ database role ต้องสรุปก่อน production
- Custom CHECK/partial indexes/triggers อยู่ migration SQL; ห้ามใช้ `db push` แทน migrations หรือ regenerate migration ทับ SQL นี้

## Local PostgreSQL integration gate

ใช้เฉพาะ `compose.test.yaml`: project `finntech-f14-test`, DB `finntech_tracker_f14_test`, user fixture, loopback port 5434, volume ใหม่ `finntech-f14-test_finntech_f14_test_pgdata` แยกจาก compose/DB/volume เดิมทั้งหมด

เจ้าของที่มี Docker ให้รันจาก root:

```powershell
Copy-Item .env.test.example .env.test
# แก้ placeholders ด้วย password สำหรับข้อมูลสังเคราะห์ในเครื่องเท่านั้น
# URL-encode password ใน TRACKER_TEST_DATABASE_URL และใช้ค่าเดียวกันกับ Compose
docker compose --env-file .env.test -f compose.test.yaml up -d --wait
npm run tracker:db:validate
npm run tracker:db:generate
npm run tracker:db:test
docker compose --env-file .env.test -f compose.test.yaml down
```

Runner ต้องได้รับ `TRACKER_DB_TEST_CONFIRM=synthetic-only`; reject target อื่น, query parameters, placeholders และ nonempty DB ก่อน migrate ไม่ใช้ DATABASE_URL ที่อาจชี้ฐานข้อมูลผู้ใช้จาก environment และไม่ print connection URL/credential

Suite apply migrations บน empty DB แล้วตรวจ NUMERIC round-trip/max/BTC, constraints/cross-owner FK, unique requests, commit/rollback, legacy identities/reversal และ concurrent portfolio locks; fixtures เป็น UUID และข้อมูลสังเคราะห์ ไม่ใช้ผู้ใช้จริง

รันซ้ำต้อง reset **เฉพาะ test volume ใหม่** ด้วยคำสั่งต่อไปนี้เมื่อไม่ต้องเก็บ synthetic evidence แล้ว; ไม่ใช้คำสั่งนี้กับ compose.yaml เดิม:

```powershell
docker compose --env-file .env.test -f compose.test.yaml down --volumes
docker compose --env-file .env.test -f compose.test.yaml up -d --wait
npm run tracker:db:test
```

Missing/unavailable PostgreSQL ออก exit 2 และข้อความ NOT TESTED โดยไม่ apply migration Ordinary tracker/root tests ไม่รัน live suite อัตโนมัติ; suite ชื่อ `postgres.integration.ts` และรันผ่าน guarded command เท่านั้น ไม่มี skip เพื่อสร้างผล PASS

Connection-refusal test ใช้ Prisma จริงกับ loopback port ที่ปิดแล้ว ตรวจ probe คืน error เป็นหลักฐานเฉพาะ failure boundary ไม่ใช่หลักฐาน migration/SQL constraints และไม่มี Prisma/database mock

## F1.4 review correction: category, symbols และ lock evidence

- Forward migration `20261001000002_category_type_restrict` เปลี่ยน category composite FK ของ transactions/budgets เป็น `ON UPDATE RESTRICT`; ไม่แก้สอง migration เดิม การเปลี่ยน type ของ category ที่ถูกอ้างถึงต้องถูกปฏิเสธแทนการ cascade เปลี่ยนประวัติ ส่วน name ไม่อยู่ใน FK จึง rename ได้ PostgreSQL regression ตรวจ transaction/type/amount คงเดิมและ rename สำเร็จ
- Canonical asset symbol เป็น uppercase Contracts validate ASCII `[A-Za-z0-9_-]{1,32}` ก่อน normalize (`btc/BtC/BTC` → `BTC`); ไม่ trim หรือ normalize Unicode Persistence ใช้ผล Contracts เดิมโดยไม่เพิ่ม parser/กฎซ้ำ SQL CHECK รับเฉพาะ uppercase ไม่ได้เดา provider mapping หรือเปิด market allowlist
- Lock regression มี deadline สำหรับ first-acquired 2500ms และ suite timeout 15 วินาที; ขณะ portfolio แรกถูกล็อก ต้อง update portfolio อื่นสำเร็จ และหลัง release ต้องเข้า callback ของ portfolio แรกได้ คง foreign-owner rejection
- ตรวจ implementation ที่ติดตั้ง `@prisma/adapter-pg` 7.10.0: PostgreSQL generic errors มี `kind: postgres`, `originalCode`, `code`; Prisma raw-query wrapper ส่ง `P2010` พร้อม `meta.driverAdapterError.cause` Lock predicate จึงรับเฉพาะ `P2010` และ SQLSTATE `55P03` ทั้ง originalCode/code ไม่รับ connection failure, query timeout ทั่วไป หรือข้อความ error เป็นหลักฐาน
- CHECK errors ของ model writes ใช้ `P2039` ใน Prisma runtime นี้; test helper ตรวจ structured `23514` เมื่อพบ P2039/P2010 ไม่ให้ generic database error ถูกนับเป็น constraint success
- รูปแบบข้างต้นยืนยันจาก implementation ของ adapter/runtime ที่ติดตั้ง ไม่ใช่ผล PostgreSQL runtime จนกว่าจะรัน integration suite บนฐานข้อมูลสังเคราะห์จริง หาก runtime ให้ metadata ต่างจากที่ตรวจ suite ต้อง FAIL เพื่อให้ตรวจสาเหตุ ห้าม fallback รับทุก error
- เครื่องนี้ยังไม่มี Docker/psql/PostgreSQL service; migration/constraints/lock runtime และ Node 22.12 ขั้นต่ำยัง NOT TESTED ไม่มี mock/SQLite เป็นหลักฐานแทน

## ยังไม่ทำ/รอ Tech Lead

- Better Auth runtime/adapter/session และ authorization ของ read/archive/write endpoints
- cost-basis/replay, oversell, ledger corrections และ projection freshness
- importer preview/consent/whitelist/redaction/conflict protocol และ canonical request hashing
- market relay/provider metadata, market allowlist enablement, UI และ deployment
- PostgreSQL runtime gate/lock proofs, Node ขั้นต่ำ และ retention policy ก่อน production
