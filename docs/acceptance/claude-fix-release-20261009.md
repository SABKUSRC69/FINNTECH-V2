# FINNTECH — fix release for audit F1–F10, 2026-10-09

หลักฐานอยู่ใน [`claude-fix-release-20261009/`](claude-fix-release-20261009/) · ต่อจาก [claude-bug-audit-20261009.md](claude-bug-audit-20261009.md)

## สรุป

- **Deployed:** commit `41d2985ea872e244d369073120ac51461f06b608` (`SABKUSRC69/finntech-beta`, branch `codex/student-real-use`) → Render `srv-db3pcll9fdbs73enrmg0` deploy `dep-db4gn9dg1s2s739ckur0` **Deploy succeeded | Live** (1m53s, 22:43 น.)
- **ก่อน release:** ยืนยัน live = release checkout = remote = `8058bb7` (asset `index-D3vtIgU1.js`)
- **Live หลัง deploy:** `index-BDYv7HwH.js` sha256 `6bf3a3c6…98d68`, `index-C6G3rOc3.css` sha256 `df60f3f7…0bc4d` ตรงกับ release build · `/api/ready` = `{"ready":true}` ([deployment.json](claude-fix-release-20261009/deployment.json))
- **ไม่มี migration หรือ schema change** ข้อมูลเดิมไม่ถูกแตะ rollback ไป `8058bb7` ได้อย่างปลอดภัย
- **Live authenticated flows:** NOT TESTED by Claude (ไม่สร้างบัญชีบนโดเมนจริง) — เตรียม [live-verify.mjs](claude-fix-release-20261009/live-verify.mjs) ให้เจ้าของรัน ผ่าน 10/10 เมื่อซ้อมกับ production image เดียวกันในเครื่อง

## สิ่งที่แก้

| # | ปัญหา | การแก้ | สถานะ |
|---|---|---|---|
| F1 | login/สมัคร 3 ครั้ง/10 วิ ทั้งเว็บ | ปิด limiter ของ Better Auth ที่ไม่มี IP ในโหมด real; ใช้ bucket ต่อ hash อีเมล (10/นาที) + เพดานรวม 120/นาที; sign-out ไม่ถูกนับ · **ไม่เชื่อ IP header ใดๆ** เพราะ Render ต่อท้าย `X-Forwarded-For` ที่ client ปลอมได้ | FIXED |
| F2 | โควตาเขียนใช้ร่วมทุกบัญชี | `writes:owner:<id>` 120/นาที + เพดานรวม 1,200/นาที (`SERVICE_BUSY`) พร้อมข้อความภาษาไทย | FIXED |
| F3 | หมวดหมู่สำหรับผู้ใช้ใหม่ | เก็บ draft ไว้, เลือกหมวดใหม่อัตโนมัติ, สถานะ loading/error(ลองใหม่)/ว่าง ข้าง selector, สร้างหมวดในฟอร์ม (Enter ไม่บันทึกรายการ), ปุ่ม "เพิ่มหมวดหมู่พื้นฐาน" (`POST /finance/categories/starter` idempotent, เพิ่มเฉพาะชื่อที่ขาด, ไม่สร้างรายการ), คำแนะนำในหน้างบประมาณ | FIXED |
| F4 | backup ใช้ไม่ได้เกิน 2,000 แถว | เพิ่มเป็น **5,000 แถว / 5 MiB** หลังวัดผลจริง, นับก่อนโหลดแถว, ตัด schema re-parse ซ้ำ, timeout transaction 120 วิ/เบราว์เซอร์ 150 วิ, `requestTimeout` 60 วิ, แจ้งว่าไม่รวมรูป | PARTIAL (ดูข้อจำกัด) |
| F5 | replay เขียนทุกแถว | `persistReplay` อัปเดตเฉพาะแถวที่เปลี่ยนแบบ bulk; restore ไม่ update ซ้ำ | FIXED (CPU replay ยัง O(N)) |
| F6 | deadlock ลำดับล็อก | `correctTrade`/`correctStockTrade` ล็อก media ก่อนพอร์ต | FIXED |
| F7 | ป้าย "ERROR" เมื่อไม่ได้ตั้ง feed | `MISSING` + "ยังไม่มี feed ราคาอัตโนมัติ · ตั้งราคาอ้างอิงเองได้" | FIXED |
| F8 | "ข้อมูลไม่ครบ" ระหว่างโหลด | แสดง "กำลังโหลด…" | FIXED |
| F9 | REST คริปโตล้มทั้งชุด | จับ error ต่อสัญลักษณ์ ยัง backoff | FIXED |
| F10 | login หลังขอลบบัญชี | ตรวจหลัง Better Auth ยืนยันรหัสแล้วเท่านั้น → `403 ACCOUNT_DELETION_PENDING`, ลบ session, ไม่ส่ง cookie; รหัสผิดยังเป็น 401 ปกติ | FIXED |

ไฟล์ runtime 17 ไฟล์: `apps/api/src/{app,server}.ts`, `auth/{runtime,real}.ts`, `tracker/{service,stock-ledger,replay-persist(ใหม่),backup,crypto-stream,routes}.ts`, `apps/web/src/tracker/{Dashboard,Assets,Backup}.tsx`, `tracker/{client,valuationPolicy}.ts`, `auth/client.ts`, `packages/contracts/src/index.ts` ([release-manifest.json](claude-fix-release-20261009/release-manifest.json), [release.patch](claude-fix-release-20261009/release.patch))

## การวัดก่อนตั้งเพดาน backup (production image, `--cpus 0.1 --memory 512m`)

| ชุด | แถว | export | preview | restore | /api/health ของผู้อื่นค้างสูงสุด | หน่วยความจำสูงสุด |
|---|---|---|---|---|---|---|
| ก่อนตัด re-parse | 5,000 | 28.4 s | 12.5 s | 67.2 s | 29.3 s | 251 MiB |
| หลังตัด re-parse | 2,000 | 11.6 s | 8.9 s | 26.5 s | 7.7 s | 227 MiB |
| หลังตัด re-parse | 5,000 | 18.9 s | 15.9 s | 46.8 s | 17.3 s | 285 MiB |
| **release สุดท้าย** | 4,980 | 22.3 s | 15.7 s | 50.0 s | 17.2 s | 261 MiB |

20,000 แถวถูกปฏิเสธเพราะคาดว่า restore จะเกิน 3–4 นาทีและทำให้ทั้งเว็บค้าง · พบเพิ่มว่า **รุ่นก่อนหน้า export 2,000 แถวเกิน timeout 10 วิของเบราว์เซอร์อยู่แล้ว** ([backup-measurements*.json](claude-fix-release-20261009/))

## ผลตรวจ

| คำสั่ง / ชุด | ผล |
|---|---|
| `npm test` | PASS exit 0 (66 files, 475 tests) |
| `npm run build` | PASS exit 0 |
| `npm run tracker:typecheck` | PASS exit 0 |
| `npm run tracker:test` | PASS exit 0 (finance 25, contracts 16, api 137, web 152 + dev smoke) |
| `npm run tracker:build` | PASS exit 0 |
| `node --no-strip-types scripts/tracker-package-smoke.mjs` | PASS exit 0 |
| `git diff --check` | PASS exit 0 |
| Release checkout: `tracker:typecheck`, `tracker:build`, `git diff --check` | PASS exit 0 |
| `assets.integration.ts` | PASS 12/12 |
| `tracker:db:test` (F1.4) | PASS 12/12 |
| `password-mode.integration.ts` | PASS 5/5 |
| **ใหม่** `audit-fixes.integration.ts` (F1, F2, F3, F4, F5, F6, F10) | PASS 7/7 ([evidence](claude-fix-release-20261009/audit-fixes-evidence.json)) |
| **ใหม่** `auditFixes.test.tsx` (F3 draft/auto-select/Enter/starter/error, F7, F8, F10 copy) | PASS 7/7 |
| **ใหม่** `crypto-stream.test.ts` (F9) | PASS |
| เบราว์เซอร์ + production image 0.1 CPU: สมัคร, empty state, สร้างหมวดในฟอร์มโดย draft คงอยู่และถูกเลือก, บันทึก → reload, Assets "กำลังโหลด…" → ป้าย feed ที่ถูก, รหัสผิด/ถูกหลังขอลบบัญชี | PASS |
| `live-verify.mjs` ซ้อมกับ production image ในเครื่อง | PASS 10/10 ([result](claude-fix-release-20261009/local-rehearsal-verify-result.json)) |
| Secret scan ไฟล์ release + bundle | PASS 0 found |
| Live: release identity, `/api/ready`, `/api/health` | PASS |
| Live authenticated flows | NOT TESTED (ให้เจ้าของรัน `live-verify.mjs`) |

## ข้อจำกัดที่เหลือ

- **Backup:** เพดาน 5,000 แถว (~2.7 ปีที่ 5 รายการ/วัน) ยังไม่ใช่หลายปีเต็ม; เกินแล้วยัง export ไม่ได้ (ไม่มี export แบ่งไฟล์) · ระหว่าง export/restore ผู้ใช้อื่นอาจค้าง ~15–20 วิ เพราะ CPU 0.1 · วัดกับ PostgreSQL ในเครื่อง ไม่รวม latency ของ Neon · ไม่รวมรูปใบเสร็จ/โปรไฟล์
- **F1:** ไม่มี IP ที่เชื่อถือได้บน Render จึงยังมีความเสี่ยงที่คนยิงอีเมลสุ่มจำนวนมากจนชนเพดานรวม 120/นาที แล้วบล็อก login ของทุกคน
- **F5:** การคำนวณ replay ยังเป็น O(N) ใน CPU (เพิ่มเทรดในประวัติ ~1,500 รายการ ≈ 2.5–3.6 วิที่ 0.1 CPU)
- ยังไม่มีระบบกู้รหัสผ่าน (อยู่นอกขอบเขต) · การลบบัญชีจริงยังต้องให้ operator purge
- บัญชีสังเคราะห์จาก `live-verify.mjs` จะถูกขอลบเท่านั้น ต้องรอ operator purge ด้วย
- การแก้ใน checkout หลัก `C:\Users\Admin\Downloads\FINNTECH` (`main` → `FINNTECH-V2`) **ยังไม่ได้ commit** ตาม convention เดิม; release commit อยู่ใน `.student-real-20261008.local/release-source` เท่านั้น
- ในเครื่องได้ pull image ทางการ `node:22-bookworm-slim` (base เดียวกับ `Dockerfile.real`) เพื่อใช้เป็น proxy ทดสอบ · container ทดสอบ (`claude-fix-*`) และไฟล์ secret ชั่วคราวถูกลบแล้ว
