# FINNTECH: ขอบเขตและแบบผลิตภัณฑ์สำหรับ AI ผู้ลงมือทำ

วันที่: 2026-10-07 (Asia/Bangkok)
ความต้องการที่เจ้าของยืนยัน: ใช้งานส่วนตัวในเครื่องก่อน แล้วเตรียมเปิดออนไลน์ภายหลัง
เอกสารนี้เป็นแบบและเกณฑ์ตรวจรับ ไม่ใช่รายงานว่าฟังก์ชันทั้งหมดทำเสร็จแล้ว

## 1. ผลิตภัณฑ์หลัก

FINNTECH เป็นเว็บติดตามการเงินส่วนตัวภาษาไทย ผู้ใช้บันทึกรายรับรายจ่าย เงินสด
และประวัติซื้อขายคริปโตด้วยตัวเอง เว็บคำนวณยอด งบประมาณ ต้นทุน และกำไรขาดทุน
รับราคาอ้างอิงผ่าน backend และสำรอง/กู้ข้อมูลได้

พัฒนาต่อจาก `apps/web` + `apps/api` + `packages/contracts` + `packages/finance`
ไม่เริ่มระบบใหม่ทับของเดิม เว็บ `src/` เป็น legacy และแก้เฉพาะ regression ที่เกี่ยวข้อง
ไม่เพิ่มการส่งคำสั่งซื้อขาย ฝากถอน QR เชื่อมธนาคาร หรือเครดิตเริ่มต้น
ราคาอัตโนมัติไม่ใช่การเชื่อมบัญชีลงทุน ไม่มีการนำข้อมูล DEMO มาเป็นรายการจริงอัตโนมัติ

ค่าเงิน THB ใช้กับรายรับรายจ่าย/งบ/เงินสด; คริปโตใช้ USDT สำหรับ trade/cost/P&L
USD ของราคาหุ้นเป็น watchlist แยกต่างหาก อัตรา USDT/THB ใช้แสดงมูลค่าโดยประมาณ
ตาม decision011 ไม่เปลี่ยนต้นทุนและไม่ถือ USDT เท่ากับ USD

## 2. ความหมายของความสมบูรณ์

| ระดับ | สิ่งที่ต้องผ่าน | การกล่าวอ้างที่ใช้ได้ |
| --- | --- | --- |
| L1: Local functional complete | ฟังก์ชันหลัก + tests + PostgreSQL/browser acceptance ในฐานข้อมูลทดสอบ +คู่มือเริ่ม/หยุด | ใช้ทดลองในเครื่องได้ครบตาม scope |
| L2: Personal real-data ready | L1 + พื้นที่ข้อมูลจริงแยก + backup/recovery ที่ตรวจได้ + วิธีรับมือเข้าใช้บัญชีไม่ได้ +เจ้าของตัดสิน policy ที่ค้าง | พร้อมใช้ข้อมูลส่วนตัวในเครื่องตามข้อจำกัดที่แจ้ง |
| O1: Online ready | L2 + hosting/HTTPS/proxy/mail delivery/security/monitoring/restore/release acceptance บน target จริง | พร้อมเปิดออนไลน์บน environment ที่ตรวจแล้ว |

อย่าใช้ผล build/unit tests เป็นหลักฐาน L2/O1 และอย่าขวางงาน L1 ด้วยบริการออนไลน์ที่ยังไม่เลือก
L2 เป็นเกณฑ์ออกแบบของโครงการ ไม่ใช่ใบรับรองความปลอดภัยหรือการรับรองทางกฎหมาย

## 3. หน้าจอและเส้นทางหลัก

| หน้า | เนื้อหาหลัก | การกระทำสำคัญ | เงื่อนไขสำคัญ |
| --- | --- | --- | --- |
| เข้าสู่ระบบ/สมัคร | อีเมล รหัสผ่าน สถานะบริการ | สมัคร เข้า ออก ตรวจสถานะเมื่อผลไม่แน่นอน | ไม่ให้ข้อมูลว่าบัญชีอื่นมีอยู่; recovery แสดงเฉพาะ flow ที่พร้อมจริง |
| ภาพรวมสินทรัพย์ | เงินสด THB, crypto ทุกพอร์ต, สัดส่วน, มูลค่าเทียบบาท, ราคา/เวลา | เพิ่มเงินสด เปิดพอร์ต ไปบันทึกรายการ | ระบุว่านับเฉพาะเงินสดและคริปโตที่บันทึก; ข้อมูลไม่ครบไม่แสดงยอดรวมเสมือนครบ |
| รายรับรายจ่าย | เดือน รายรับ รายจ่าย คงเหลือเดือน สัดส่วนหมวด ประวัติ | เพิ่ม แก้ ยกเลิก กรอง/ค้นตามความจำเป็น | คงเหลือเดือนคือรายรับลบรายจ่าย ไม่ใช่ยอดธนาคาร; ไม่มี auto-sync เงินสด |
| งบประมาณ | งบต่อหมวด/เดือน ใช้จริง คงเหลือ/เกิน | ตั้งหรือปรับงบ ไปดูรายการหมวด | งบไม่สร้าง transaction; ไม่แสดงเปอร์เซ็นต์ที่หารศูนย์ |
| พอร์ตคริปโต | เลือกพอร์ต holdings cost/P&L history ราคาอ้างอิง | สร้างพอร์ต บันทึก buy/sell ด้วยมือ แก้/ยกเลิก | ขายเกินถือ reject; ledger/replay และ audit เดิมต้องคงอยู่ |
| สำรองและกู้คืน | export, เลือกไฟล์, preview, ยืนยัน, ผล | ดาวน์โหลด JSON กู้เข้าบัญชีว่าง ตรวจผลคำขอเดิม | ไม่เขียนทับบัญชีที่มีข้อมูล; แยก JSON backup จาก full PostgreSQL backup |
| บัญชีและการดูแลข้อมูล | ข้อมูลบัญชี วิธี recovery คู่มือ backup ข้อจำกัด รุ่น/สถานะ | ออกจากระบบ ไป recovery ถ้าพร้อมจริง | UI แสดงข้อความผู้ใช้เข้าใจ; ไม่แสดง secret หรือรายละเอียด driver |
| ราคาหุ้น (ทางเลือก) | watchlist ราคา USD source/time/status | ดู/จัดรายการตามสิทธิ์ที่รองรับ | provider ไม่พร้อมใช้ empty state; ไม่เรียก watchlist ว่าพอร์ตที่ถือ |

บัญชี/การดูแลข้อมูลเป็นหน้าที่ต้องเพิ่มอย่างพอดี ไม่ต้องสร้าง admin portal สำหรับรุ่นส่วนตัว
ไม่เพิ่มข้อมูลส่วนตัวที่ระบบไม่จำเป็นต้องใช้

## 4. แบบหน้าตาและการนำทาง

- ต่อยอดโทนเขียว/teal และพื้นอ่อนที่มีแล้ว รักษา light/dark และปุ่มซ่อนยอด
  ใช้ CSS variables ของ `apps/web/src/index.css` ไม่เปลี่ยนทั้งระบบเพื่อความสวยอย่างเดียว
- Desktop ใช้ sidebar, หัวข้อหน้า, controls และเนื้อหาที่มีลำดับชัด
  การ์ดเน้นยอดที่สำคัญ แล้วตามด้วยการกระทำและประวัติ; จำกัดความกว้างเพื่ออ่านง่าย
- Mobile ออกแบบ bottom nav 4 งานหลัก: ภาพรวม, รายการ, พอร์ต, เพิ่มเติม
  “เพิ่มเติม” เปิดงบประมาณ สำรองข้อมูล บัญชี และหุ้นถ้ารองรับ; ต้องเข้าถึงทุกหน้าได้
  ไม่อัดเมนูยาวทั้งหมดลงแถบเดียว รักษาสถานะ/ค่าที่ผู้ใช้กรอกเมื่อสลับหน้าอย่างปลอดภัย
- ให้ปุ่มเพิ่มรายการเด่นหนึ่งจุดต่อหน้า ฟอร์มมี label, หน่วย, validation ข้างช่อง
  ใช้ข้อความ “บันทึกประวัติซื้อ/ขาย” เพื่อไม่ให้สับสนกับการส่งคำสั่งซื้อขาย
- ปุ่มสัมผัสหลักอย่างน้อย 44×44 px; ฟอร์ม mobile ใช้ตัวอักษร 16 px ขึ้นไป
  ตรวจ 320/390/768/1280/1440 px; ตารางกว้างเลื่อนเฉพาะพื้นที่ตารางได้
- Keyboard ใช้งานได้, focus เห็นชัด, ลำดับ heading ถูกต้อง, icon มี accessible name
  modal/sheet มี focus management และคืน focus หลังปิด; ไม่ใช้สีอย่างเดียวสื่อความหมาย
- สำเร็จ/validation ต้องเป็นข้อความของงานปัจจุบัน ไม่มี banner เก่าตามไปหน้าอื่น
  ข้อความผลไม่แน่นอนหรือ pending write ยังต้องคงอยู่และตรวจผลได้จนจบ
- ซ่อนยอดเปลี่ยนเฉพาะการนำเสนอ คงค่าเงิน/quantity ต้นฉบับเพื่อคำนวณและบันทึก
  แจ้งขอบเขตว่าช่องกรอก บันทึกช่วยจำ ไฟล์ backup และ Network ไม่ถูกซ่อนด้วยปุ่มนี้
- ใช้กราฟจากข้อมูลจริงที่มีความหมายเท่านั้น ไม่เติมข้อมูลตัวอย่างเพื่อทำให้หน้าดูเต็ม
  ถ้าใช้กราฟต้องอ่าน source/ช่วงเวลา/ข้อมูลไม่ครบได้ และมีสรุปข้อความประกอบ

## 5. สถานะที่ทุก flow ต้องมี

Loading, empty, success, validation error, unavailable, session expired,
stale market data และ unknown outcome หลัง timeout/response loss

เมื่อไม่เคยได้รับราคา: N/A + เหตุผล; เมื่อราคาเก่า: แสดงเวลารับและห้ามใช้คำนวณปัจจุบัน
เกณฑ์อายุราคา/อัตราเดิม 30 วินาทีคงไว้จนมีการตัดสินใจเชิงผลิตภัณฑ์ที่ชัดเจน
provider receive time ต้องแยกจาก exchange timestamp; ข้อมูล invalid ไม่เลื่อน receivedAt
การคำนวณมูลค่าไม่ครบแสดงว่าขาดส่วนไหน ไม่ถือว่าค่าที่หายเป็นศูนย์

Write timeout ไม่เท่ากับ rollback ต้อง reconcile/retry ด้วย idempotency key และ payload เดิม
ห้ามล้าง pending state หรือสร้าง key ใหม่เพื่อให้ผู้ใช้กดซ้ำได้ง่ายขึ้น
การสลับหน้า/ออกจากระบบระหว่าง pending ให้ยึด behavior ที่ป้องกันการเขียนซ้ำของระบบเดิม

## 6. บัญชีและการดูแลระบบในเครื่อง

- ใช้ Better Auth/PostgreSQL/HttpOnly cookie เดิม ห้ามสร้าง auth/password store คู่ขนาน
- พื้นที่ทดสอบและข้อมูลจริงแยก database/volume/env; migrations ใหม่ต้อง forward และรักษาข้อมูล
- ตัดสินวิธีกู้การเข้าถึงบัญชีสำหรับ L2 ก่อนใช้ข้อมูลจริง: ใช้ recovery design ตาม decision010
  และช่องทาง delivery ที่เจ้าของเลือก หรือกำหนดขั้นตอน local recovery ที่ผ่านการทบทวน
  ห้ามเดาวิธี bypass password, ปิด auth หรือใช้ fixture credentials เป็นทางออก
- พัฒนา email/recovery adapter และทดสอบด้วย local mail sink ได้ก่อนเลือก provider จริง
  sink เป็นเครื่องมือทดสอบเท่านั้นและต้องไม่ส่งอีเมล/credential ออกภายนอก
- คู่มือ full backup ต้องบอกสิ่งที่รวม/ไม่รวม ตำแหน่งไฟล์ วิธีเก็บ key และวิธีกู้จริง
  DPAPI CurrentUser ผูก profile/เครื่อง จึงต้องออกแบบ key custody/recovery ก่อนอ้างกู้ข้ามเครื่องได้
- เลือกความถี่ backup, ที่เก็บสำเนาอีกชุด, อายุเก็บ, จุดหมายกู้คืน และการแจ้งเตือนก่อนเปิด job จริง
  ไม่มีการซื้อบริการหรือลบ backup เก่าตามค่าที่ AI เดา
- การลบบัญชี/retention ต้องยึด policy ที่อนุมัติ การลบ active database ไม่ได้ทำให้ backup ทุกชุดหายทันที
- local runner bind loopback มี start/stop/health ที่ตรวจได้ ไม่อ้างว่าเครื่องมือตรวจหลุดคือเว็บล่ม

## 7. ช่องว่างที่พิสูจน์แล้วและต้องปิดก่อน

1. PositionsTable legacy ไม่รับ `orderRulesVerified` แต่มีข้อความว่าสร้าง Limit ได้
   แก้ให้ตรงสถานะจริงและทำสอง root tests ที่ล้มเหลวให้ผ่านโดยไม่ลด expectation
2. Dashboard message เป็น state ร่วมและไม่ clear เมื่อเปลี่ยน section
   แยกอายุข้อความ resolved ออกจาก pending/unknown-outcome ให้ชัด
3. FX availability มีหลักฐานช่วง N/A; ตรวจ metadata/ticker validation, schedule, timeout,
   backoff และ frontend refresh ก่อนเปลี่ยนค่า; ยังไม่ยืนยันว่า provider หรือ code เป็นสาเหตุ
4. การส่งไฟล์ให้ browser ยังไม่พิสูจน์ว่าไฟล์ถูกบันทึกสำเร็จ ต้องทดสอบ file download จริง
5. runner lifecycle มี connection refused ในบางรอบ ต้องเก็บ process/port/log evidence
   ก่อนแก้; กรณี owner ปิด terminal หรือไม่มี process ไม่ถือเป็น business logic bug โดยอัตโนมัติ
6. README/เอกสารบางฉบับเป็นประวัติหลายระยะ ทำหน้าสถานะปัจจุบันและ start guide ให้ชัด

## 8. การตรวจรับที่ต้องมี

| กลุ่ม | หลักฐานตรวจรับ |
| --- | --- |
| Code checks | root tests/build, tracker typecheck/tests/build, compiled package smoke; จำนวนจริงและ exit code |
| Database | PostgreSQL isolated จริง: ownership A/B, Decimal/constraints, locks/idempotency, correction/void/replay |
| Browser | signup/login/logout/reload, finance/budget/crypto/cash, nav/theme/hide และ responsive; screenshot/console summary |
| Market | valid metadata, fresh→stale→unavailable→recovery; WS-only/HTTP fallback; rate invalid/429/timeout; ไม่มี fabricated values |
| Download/restore | ไฟล์ที่ดาวน์โหลด parse ได้/ไม่มี credentials; preview/consent/empty target/retry และข้อมูลเดิมไม่เปลี่ยน |
| Recovery/operations | restore full DB ใน isolated target, key access, backup failure, runner shutdown; account recovery ตาม scope ที่เปิด |
| Real-data readiness | แยกพื้นที่จริง, policy decision log และแผนเมื่อเครื่อง/บัญชีเข้าไม่ได้ |
| Online ภายหลัง | HTTPS/proxy/cookie/CSP/WS/rate-limit/monitoring/rollback บน target จริง; ไม่ใช้ local screenshots แทน |

Physical mobile, provider จริง หรือ environment ที่เข้าไม่ถึงให้เขียน NOT TESTED
ห้ามนับ tests ที่ skip หรือ fixtures/mocks เป็น runtime acceptance

## 9. งานออนไลน์ภายหลังและฟังก์ชันเสริม

เตรียม configuration/contracts/adapters/runbooks ได้ แต่ไม่ซื้อบริการหรือ deploy ในงาน local
ต้องเลือก target hosting, domain, TLS/proxy, database, mail, backup storage และ secrets management
ก่อนการตรวจ O1; tracker ต้องมี backend runtime ไม่ใช้ static GitHub Pages อย่างเดียว

ราคาหุ้น/พอร์ตหุ้น/ข่าว/calendar/legacy importer ไม่เป็นเงื่อนไขปิด L1 ของ finance+crypto
ถ้าเจ้าของเลือกทำให้มี scope/currency/entitlement/acceptance แยก; อย่าถือ watchlist เป็น holdings
และอย่าเปิด Paper Trading เพื่อทำให้ tests หรือ UI ดูสมบูรณ์

## 10. เอกสารอ้างอิงใน repository

อ่าน `docs/acceptance/website-status-20261007.md`, `docs/acceptance/work-status.md`,
`docs/acceptance/core-features.md`, `docs/acceptance/backup-network.md`,
`docs/decisions/009-financial-backup.md`, `docs/decisions/010-account-recovery.md`,
`docs/decisions/011-assets-and-reference-fx.md`, `docs/operations/postgresql-backup.md`,
`docs/operations/data-retention-deletion.md` และ source ที่เกี่ยวข้อง
ADR/acceptance เก่าเป็นประวัติ ส่วน behavior ปัจจุบันต้องยืนยันจาก source/runtime
