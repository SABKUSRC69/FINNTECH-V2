# FINNTECH — งานระบบที่เหลือก่อนดีไซน์รอบสุดท้าย

ตรวจ 2026-10-07 โดยอ่าน source และหลักฐานที่มีอยู่ ไม่รัน browser/DB/full suites ใหม่
เป้าหมายเจ้าของ: ใช้ส่วนตัวในเครื่องก่อน เตรียมออนไลน์ภายหลัง
เอกสารนี้จัดลำดับงาน ไม่ใช่คำสั่งแก้แอป ลบข้อมูล หรือ deploy

## ลำดับที่แนะนำ

ระบบหลัก → กู้บัญชี/สำรองและกู้ข้อมูล → ตรวจการใช้ข้อมูลจริงในเครื่อง → ดีไซน์รอบสุดท้าย → ทดสอบหลังเปลี่ยนดีไซน์ → เตรียมออนไลน์

พักการเปลี่ยนสี/layout/template รอบใหม่ได้ แต่ยังต้องมีหน้าจอขั้นต่ำเพื่อใช้งานและทดสอบระบบ
หาก feature ใหม่ต้องมี UI เช่น reset-password ให้ทำ flow ที่ใช้งานได้ก่อน แล้วปรับรูปลักษณ์ภายหลัง
ดีไซน์ที่มีอยู่เก็บไว้ ไม่จำเป็นต้องย้อนหรือลบทิ้ง

## ระบบหลักที่มีแล้วและมีหลักฐาน local synthetic

- สมัคร/เข้าสู่ระบบ/ออกจากระบบ, database sessions และการแยกเจ้าของ
- PostgreSQL persistence, Decimal/contracts, audit/idempotency และแก้ไข/ยกเลิกประวัติ
- รายรับรายจ่าย THB, หมวดหมู่, งบประมาณ, สรุปรายเดือนและสัดส่วนรายจ่าย
- พอร์ตคริปโต USDT บันทึกเอง, ต้นทุนเฉลี่ย, ค่าธรรมเนียมและ P&L แยกพอร์ต
- เงินสด THB ที่บันทึกเอง และสินทรัพย์รวมประมาณเป็นบาทด้วย direct USDT_THB
- ราคา BTC/ETH ผ่าน backend พร้อม stale/unavailable guards; ยังไม่รับรองความต่อเนื่องทุกสถานการณ์
- JSON backup v1/v2, preview/consent/restore เข้าบัญชีว่าง; ยังต้องตรวจรุ่นสุดท้ายตามด้านล่าง
- Manual encrypted full PostgreSQL backup และ isolated restore มีหลักฐานผ่าน
- pending/navigation guards และ same-payload/same-key retry ในขอบเขต tests/review ช่วง 1–2

หลักฐาน: docs/acceptance/core-features.md, assets-overview.md, backup-network.md,
work-status.md, phase1-independent-review-20261007.md และ phase2-independent-review-20261007.md
หลักฐานส่วนใหญ่ใช้ข้อมูลสังเคราะห์ ไม่เท่ากับพร้อมเก็บข้อมูลจริงหรือพร้อมออนไลน์

## งานที่เหลือสำหรับใช้ข้อมูลจริงในเครื่อง

| ลำดับ | งาน | สถานะปัจจุบัน | เงื่อนไขปิดงาน |
| --- | --- | --- | --- |
| 1 | วิธีการกู้บัญชีและยืนยันอีเมล | 3A implementation รับ review เฉพาะ isolated synthetic; owner feature ยัง OFF | เลือกวิธีใช้จริง/rollout/key custody; ปิด browser end-to-end และช่องว่าง acceptance ใน phase3a-independent-review; ไม่ผูกบริการเสียเงินโดยปริยาย |
| 2 | แผนสำรองข้อมูลเมื่อเครื่องเสีย | ทำ backup/restore local ได้แล้ว แต่ operations ยัง PARTIAL | กำหนดความถี่ ระยะเก็บ สำเนาแยกจากเครื่อง และวิธีกู้ key; ทดสอบกู้เมื่อเครื่อง/Windows user เดิมใช้ไม่ได้ เพราะ DPAPI CurrentUser ผูกบริบทเดิม ไม่เพิ่ม subscription โดยปริยาย |
| 3 | FX และความต่อเนื่องของ runner | ยังมีช่องว่างหลักฐาน | หาสาเหตุ N/A เดิมให้ได้หรือระบุว่ายังยืนยันไม่ได้; ทดสอบ provider outage/recovery และการเปิด/หยุด/restart runner ที่ configured DB/Auth จริง; บันทึกคงอยู่และคืนพอร์ตตามจริง; ไม่ยืด freshness 30s เพื่อกลบปัญหา |
| 4 | ตรวจ dependencies และนโยบายข้อมูล | audit ยังไม่พบหลักฐานผ่าน; retention/deletion/rotation เป็นแผน | ตรวจ advisories แยก runtime/dev/legacy แล้วแก้ตามผล; กำหนดวิธีเก็บ/ส่งออก/ลบข้อมูลและเปลี่ยน secrets ที่ใช้จริง ไม่จำเป็นต้องสร้างระบบ auto-delete ทั้งชุดเพื่อรุ่นส่วนตัว และไม่ลบข้อมูลโดยอัตโนมัติ |
| 5 | แยกพื้นที่ข้อมูลจริง | ยัง OPEN | เตรียมบัญชี/database/volume/config แยก fixture; คู่มือ first-run และ forward migration; ไม่ promote DEMO หรือ reuse fixture credential; พิสูจน์ว่า target ถูกต้องก่อนเขียน |
| 6 | ตรวจครบทั้งระบบบนรุ่นสุดท้าย | ยังไม่ครบ | สมัคร/เข้า/ออก, owner isolation, ledger/corrections, budget, cash/crypto, duplicate/lost-response retry, saved-file JSON parse/credential scan, restore เข้าบัญชีว่าง และ restart/reload ผ่านบน build เดียวกัน; ไม่ใช้ health200 หรือ unit tests แทน DB/browser evidence |

ข้อ 1 เลือกแนวทาง recovery ที่เหมาะกับรุ่นส่วนตัวได้; email delivery เป็นทางเลือกตามแผนปัจจุบัน
หากเปลี่ยนแนวทาง ต้องออกแบบและตรวจหลักฐานก่อนเปิดข้อมูลจริง ไม่สรุปว่าต้องซื้อ SMTP
ข้อ 2 ใช้สำเนาบนอุปกรณ์ที่เจ้าของมีอยู่ได้; ความพร้อมของอุปกรณ์/ที่เก็บยังไม่ได้ตรวจ

## ความต่างของรายงานเก่ากับล่าสุด

- Root failures สองกรณีในรายงาน 2026-10-05/06 เป็นประวัติ ช่วง 1 แก้แล้วและช่วง 2 รายงาน root313/tracker184 ผ่าน ไม่จัดเป็น bug ที่ยังเปิดเพียงเพราะ checklist เก่าไม่อัปเดต
- .redesign-c-20261007.local/final-results.json ระบุ test/build/typecheck/smoke/diff ทุกคำสั่ง exit0; รอบนี้อ่านผล ไม่อ้างรันเองหรือรับรอง source ทั้งระบบจากไฟล์ผลอย่างเดียว
- JSON saved-file และ browser restore เคยผ่านใน backup-network.md วันที่ 2026-10-05 แต่รอบตรวจหลังจากนั้นบางรอบ download event timeout/ไม่ยืนยันไฟล์ ไม่สรุปว่าฟีเจอร์ไม่มีหรือเสีย และไม่ถือหลักฐานรุ่นเก่าเป็น final-version acceptance
- Full PostgreSQL restore ผ่านวันที่ 2026-10-06; ไม่จัดเป็นยังไม่มี backup แต่แผน off-device/schedule/key custody ยังไม่เสร็จ
- FX guards ผ่านหลายกรณี แต่สาเหตุ original N/A incident ยัง UNCONFIRMED ตาม review ช่วง 1
- README/เกณฑ์บางฉบับยังมีข้อความสถานะเก่า ต้องปรับหลังปิดงานแต่ละข้อโดยรักษาผลตรวจเดิม

## งานก่อนออนไลน์ แยกจากเป้าหมายใช้ในเครื่อง

- เลือก target/hosting ที่รัน API และ PostgreSQL; ทดสอบ HTTPS, Secure cookie, Origin, reverse proxy, WebSocket และ headers บน topology จริง
- rate limit ที่เหมาะกับ topology, monitoring/alerts และ incident response
- backup schedule/off-device recovery ที่ทำงานจริงบน target, migrations/release/rollback ที่รักษาข้อมูล
- mail delivery จริง หากเลือก recovery ทางอีเมล และการ redact secrets/tokens ใน logs
- ตรวจการใช้งานบน browser/มือถือจริงตามกลุ่มผู้ใช้ และ security acceptance รุ่น release

ไม่มีการเลือกโฮสต์ สมัครบริการหรือ deploy ในรอบนี้ ไม่ยืนยันว่าโฮสต์ฟรีทุกแห่งรองรับระบบนี้

## Optional / ยังไม่ใช่เงื่อนไขของรุ่น finance+crypto ส่วนตัว

- ราคาหุ้นจริง: มี relay/UI แต่หลักฐานเดิม NOT_CONFIGURED; ต้องเลือก provider/สิทธิ์และตรวจ runtime ถ้าจะเปิดใช้
- บันทึกพอร์ตหุ้น/cost-basis: ยังไม่อยู่ในระบบหลักปัจจุบัน ต้องออกแบบสกุลเงิน/ค่าธรรมเนียมและ acceptance เพิ่ม
- นำเข้าข้อมูล legacy DEMO: deferred ไม่ควรย้ายเป็นข้อมูลจริงอัตโนมัติ
- ข่าว/ปฏิทิน และซื้อขาย/ฝากถอนจริง: ไม่จำเป็นต่อ tracker รุ่นนี้ ไม่ขยาย scope เพื่อคำว่าเสร็จทั้งหมด

## วิธีรับงาน

รับทีละข้อพร้อม patch, source review และหลักฐาน PASS/FAIL/NOT TESTED
จบระบบก่อนแล้วทำดีไซน์ได้ แต่หลังเปลี่ยนดีไซน์ต้องตรวจ form submission,
pending locks, keyboard/modal และ backup/retry อีกครั้งบน source/build รุ่นสุดท้าย

อัปเดตหลังreview3A 2026-10-07: focused78 testsรันเองผ่าน; root322/tracker193/PG14+1
เป็นหลักฐานผู้ทำ ไม่รันPG/fullmatrixซ้ำในreviewนี้ และไม่ปิดพื้นที่ข้อมูลจริง/online
งานถัดไป3Bpreparation: docs/handoff/FINNTECH_PHASE_03B_PREPARATION_PROMPT_TH.md
