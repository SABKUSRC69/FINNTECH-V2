# ADR-001: บัญชีข้ามอุปกรณ์และการย้ายข้อมูล DEMO

- **สถานะ:** ร่างเพื่อให้เจ้าของโครงการตรวจทวน
- **วันที่:** 2026-09-29
- **ขอบเขต:** การย้ายจาก localStorage ไปบัญชีถาวร, PAPER wallet/ledger/orders, และ session ของ BFF
- **ข้อจำกัดปัจจุบัน:** แอปที่ deploy อยู่ยังเป็น local DEMO; ADR นี้ยังไม่สร้างบริการหรือเปิดการใช้งานจริง การส่งออกในระยะที่ 1 เป็นการส่งออกไฟล์เท่านั้น ยังไม่มีตัวนำเข้า

## การตัดสินใจ

คง frontend บน GitHub Pages แต่ให้ใช้ custom domain ที่ควบคุมได้เพื่อให้ cookie เป็น first-party แล้วเรียก API ผ่าน BFF บน Cloudflare Worker ด้วย `Secure`, `HttpOnly`, host-only cookie แทนการเก็บ bearer/refresh token ใน browser การใช้ GitHub Pages กับ bearer token ใน client เป็นทางเลือกที่ปฏิเสธ: ทำได้โดยไม่เพิ่ม BFF แต่ token อยู่ใน JavaScript runtime และเสี่ยงถูกอ่านเมื่อเกิด XSS; GitHub Pages เองไม่มี server runtime สำหรับเก็บ secret หรือทำ transaction การเพิ่ม custom domain มีค่าโดเมนตาม registrar ส่วน BFF/ฐานข้อมูลมีค่าใช้บริการและข้อจำกัดตามแผนที่เลือก ซึ่งต้องอนุมัติแยกก่อนสมัครหรือซื้อ

ตัวเลือก backend ที่บันทึกไว้ยังคงเป็น Supabase Auth + PostgreSQL และ Cloudflare Worker BFF; Worker และ Supabase ยังไม่ถูกสร้าง/ตั้งค่าในระยะนี้ ค่าใช้จ่ายและโควตาต้องตรวจซ้ำจากหน้าแผนบริการก่อนอนุมัติ เนื่องจากราคาและเงื่อนไขเปลี่ยนได้

บัญชี, wallet, ledger, orders, trade history และ QR ที่สร้างในแอปยังเป็น **PAPER/DEMO** เท่านั้น ไม่มี API ส่งคำสั่งเทรดจริง ไม่มี private exchange, deposit หรือ withdrawal endpoint และห้ามเรียกสิ่งใดว่าเงินจริงหรือ exchange fill

## การย้ายข้าม origin

ข้อมูล localStorage ผูกกับ origin (`scheme + host + port`) เบราว์เซอร์ไม่ให้หน้าใหม่อ่าน localStorage ของ origin เดิมโดยตรง ดังนั้นผู้ใช้แต่ละคนต้อง:

1. เปิดเว็บไซต์จาก origin เดิมใน browser/profile เดิม ก่อนเปลี่ยน custom domain, redirect, หรือเลิกให้บริการ origin เดิม
2. เลือกหมวดข้อมูล DEMO ที่ต้องการและดาวน์โหลด JSON export เวอร์ชันที่รองรับ เก็บไฟล์ไว้ในที่ส่วนตัว
3. เปิด origin ใหม่ เข้าสู่บัญชีที่ยืนยันอีเมลแล้ว และเลือกนำเข้าไฟล์ผ่าน importer เมื่อเฟสนำเข้าพร้อมใช้งาน
4. ตรวจ preview, จำนวนรายการ, ยอด wallet และผลตรวจซ้ำให้ครบก่อนยืนยันนำเข้า

อีเมลหรือชื่อบัญชีที่อยู่ใน localStorage **ไม่ใช่หลักฐานยืนยันตัวตนหรืออีเมล** ไฟล์ export เป็นข้อมูลที่ผู้ใช้ครอบครองและแก้ไขได้ จึงต้องติดป้าย `legacy DEMO import`, เก็บ origin ต้นทาง/เวลา export/เวลา import เป็น provenance และห้ามใช้ข้อมูลดังกล่าวยืนยันบัญชีหรือให้เครดิตอัตโนมัติ ระยะนี้ไม่ลบต้นฉบับ และยังไม่มีการส่งไฟล์ไป server

ค่า `passcodeHash` จากโปรไฟล์ DEMO ใช้อัลกอริทึมเพื่อจำลองการล็อกอินในเครื่อง ไม่ใช่ credential ที่ปลอดภัย ห้าม export, import หรือใช้เป็นรหัสผ่าน/ตัวตนในระบบบัญชีจริง ผู้ใช้ต้องสมัครและยืนยันอีเมลใหม่ แล้วตั้งรหัสผ่านผ่าน Auth provider

## Wallet และ starter credit

บัญชีถาวรใหม่เริ่มจากยอด PAPER เป็นศูนย์และสถานะ `wallet_setup_pending` ไม่มีเครดิตเริ่มต้นอัตโนมัติ ก่อนเริ่มใช้ ผู้ใช้เลือกอย่างใดอย่างหนึ่ง:

- **เริ่ม wallet DEMO ใหม่:** สร้างรายการ ledger `PAPER_STARTER_CREDIT` จำนวน 500,000 THB หนึ่งครั้งต่อบัญชี ผ่าน server transaction เท่านั้น
- **นำเข้า wallet เดิม:** ตรวจและ preview snapshot ที่ผู้ใช้เลือกนำเข้า แล้วบันทึกยอดเป็นรายการ `PAPER_LEGACY_IMPORT`; ไม่ให้ starter credit ซ้ำ

หากผู้ใช้เริ่มใหม่ก่อนแล้วมาขอนำเข้า wallet ภายหลัง:

- ถ้าไม่มีรายการ wallet หลัง starter credit, ไม่มี open order/ยอดล็อก และเครดิตยังไม่ถูกใช้ ให้ทำ transaction เดียวที่ลงรายการ reversal อ้าง `PAPER_STARTER_CREDIT` แล้วนำเข้า snapshot
- ถ้าเครดิตถูกใช้ไปแล้ว, มี order/ยอดล็อก, หรือมีรายการเคลื่อนไหวหลังเริ่มต้น ให้ปฏิเสธการเขียนทับ wallet; ให้ผู้ใช้เลือกไม่นำเข้า wallet หรือสร้างบัญชีใหม่ และยังอนุญาตให้เลือกย้ายหมวดที่ไม่เปลี่ยนยอดได้
- ห้าม reset หรือ retry import แล้วให้ starter credit ซ้ำ ใช้ unique idempotency key ต่อชนิดเหตุการณ์และบัญชี

ทุกหน้าต้องแสดงเครดิตและยอดที่นำเข้าว่าเป็น PAPER/DEMO พร้อม source; เครดิตไม่ใช่เงินฝากและถอนออกไม่ได้

## Ledger และ rollback

ledger เป็น append-only ห้ามแก้หรือลบรายการที่ยืนยันแล้ว การแก้รายการผิดทำด้วยรายการชดเชย เช่น `PAPER_STARTER_CREDIT_REVERSAL`, `PAPER_IMPORT_REVERSAL` หรือ `PAPER_TRADE_REVERSAL` ซึ่งมี `reversal_of_entry_id`, เหตุผล, actor, request/idempotency key และเวลา โดย reversal ต้องไม่เกินยอดที่รายการต้นทางยังเหลือ

การ reverse wallet และปรับยอดคงเหลือต้องอยู่ใน PostgreSQL transaction เดียว ตรวจยอด available/locked, order ที่เกี่ยวข้อง และยอดติดลบก่อน commit การ retry request ต้องได้ผลเดิมโดยไม่สร้างรายการซ้ำ หากมีรายการภายหลังที่พึ่งพารายการต้นทาง ให้ปฏิเสธการ rollback ตรง ๆ และใช้ compensating entries พร้อม reconciliation; ประวัติเดิมคงอยู่เสมอ

## สิทธิ์ client, BFF และ RPC

- Browser ไม่มีสิทธิ์ `INSERT/UPDATE/DELETE` ตารางข้อมูลบัญชีหรือการเงินโดยตรง ตาราง wallet, ledger, orders และ trades เปลี่ยนได้ผ่าน RPC transaction ที่เรียกจาก BFF เท่านั้น
- การอ่านข้อมูลที่จำเป็นให้ใช้ user access token กับ RLS ซึ่งผูกแถวกับ `auth.uid()` และทดสอบการอ่านข้ามผู้ใช้ว่าได้ศูนย์แถว
- BFF ตรวจ session/access token กับ Auth provider และดึง subject จาก token ที่ตรวจลายเซ็นแล้วเท่านั้น ไม่รับ `user_id` จาก body/header ของ client มาเป็นตัวตน
- BFF ต่อ PostgreSQL ผ่าน pooled connection ด้วย role เฉพาะ `finntech_bff` ซึ่งเก็บเป็น Worker secret: role นี้ไม่มี `BYPASSRLS`, ไม่มี direct table `SELECT/INSERT/UPDATE/DELETE` และมีเพียง `EXECUTE` บน RPC allowlist ที่จำเป็น
- RPC ที่เปลี่ยน PAPER wallet/ledger/orders เป็น `SECURITY DEFINER` โดย owner role ที่ไม่มี login และมีสิทธิ์เฉพาะตารางที่ต้องเปลี่ยน; ใช้ fixed `search_path`, ตรวจ input, actor/user scope, idempotency และ balance ภายใน transaction
- BFF ส่ง `user_id` ที่ได้จาก verified subject ให้ RPC ได้เฉพาะหลังผ่าน session validation; การเชื่อถือค่านี้จำกัดอยู่ที่ Worker ซึ่งถือ credential ของ `finntech_bff` เท่านั้น หาก Worker/secret รั่ว ผู้โจมตีอาจเรียก RPC ภายใต้ role นี้ได้ จึงต้องจำกัด procedure, log actor/request id โดยไม่ log token, rotate secret และทดสอบสิทธิ์ตรงจาก browser ว่าเรียกไม่ได้
- ห้ามใช้ Supabase `service_role` ใน browser หรือเป็น credential ของ BFF ตามแบบนี้ ห้ามใส่ key/secret ใน `VITE_*`, localStorage, build artifact หรือ Git

## Session, CSRF และการเพิกถอน

- ใช้ opaque session id สุ่มอย่างน้อย 256 บิตใน cookie ชื่อ `__Host-ft_session`; ตั้ง `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, ไม่กำหนด `Domain` และไม่เปิด token ให้ JavaScript
- Worker เก็บ hash ของ session id และ refresh-token state ใน D1; refresh token ที่ต้องเก็บเข้ารหัสด้วย key จาก Worker secret ส่วน access token อายุไม่เกิน 10 นาทีอยู่ฝั่ง server เท่านั้น
- อายุ session ที่เลือก: idle 30 นาที, absolute 7 วัน, ไม่เปิด “remember me” เป็นค่าเริ่มต้น ต่ออายุ idle ได้เมื่อมี activity ที่ผ่านการยืนยัน และไม่เกิน absolute expiry
- ทุก state-changing request ต้องตรวจ exact `Origin`/allowlist, ใช้ CSRF token ที่ผูก session ใน custom header และตรวจ `Sec-Fetch-Site`; `SameSite` เป็น defense in depth ไม่ใช่ CSRF control เพียงอย่างเดียว
- Logout ต้อง revoke session ฝั่ง D1 ก่อนตอบสำเร็จและเพิกถอน refresh session กับ Auth provider; reset password, ปิดบัญชี หรือสัญญาณ compromise ให้ revoke ทุก session ของผู้ใช้ การ logout เครื่องเดียวไม่ทำลาย session อื่น เว้นแต่ผู้ใช้เลือก “ออกจากทุกอุปกรณ์”
- Email verification เป็นเงื่อนไขก่อนเปิดบัญชีถาวร/นำเข้าข้อมูล; password reset ใช้ provider flow แบบ token ครั้งเดียวและหมดอายุ การ login จำกัดความพยายามต่อบัญชีและแหล่งเครือข่ายด้วย rate limit/progressive delay และตอบข้อความที่ไม่เปิดเผยว่ามีอีเมลในระบบหรือไม่
- การ refresh พร้อมกันใช้ D1 conditional update/version และ single-flight ต่อ session: มีผู้ชนะเพียง request เดียว ผู้แพ้อ่าน refresh state รุ่นใหม่แทนการ replay token เก่า หาก refresh timeout จนแยกไม่ออกว่า provider หมุน token แล้วหรือยัง ให้ revoke session นั้นและบังคับ login ใหม่ ห้ามเขียน token รุ่นเก่าทับรุ่นใหม่

## Backup และการกู้คืน

ขอบเขต backup ที่ต้องทำก่อนเปิดบัญชีจริง: PostgreSQL (schema, users' application data, ledger), Auth identities/verification state ตามวิธี export ที่ provider รองรับ, Storage objects/metadata ถ้ามี, และรายการตั้งค่า/secret names/redirect allowlist/RPC grants ที่ต้องสร้างใหม่ Secret value ไม่อยู่ใน backup ปกติ; เก็บใน secret manager แยกและกำหนดผู้ดูแล

เก็บ backup เข้ารหัส แยกสิทธิ์จาก production กำหนด retention/ลบเมื่อครบกำหนด และบันทึก checksum/เวลา/ผู้ทำ restore การตั้ง schedule อย่างเดียวไม่ผ่านเกณฑ์ ต้อง restore ลง environment แยกจริง ตรวจจำนวนผู้ใช้/ไฟล์/ledger sums, RLS/RPC grants, login flow และ audit trail แล้วบันทึกผล PASS พร้อมเวลา; ทดสอบ restore ซ้ำตามรอบที่กำหนดก่อนเปิดใช้และหลังเปลี่ยน schema สำคัญ

## เกณฑ์ตรวจรับก่อนเปิดใช้

1. browser ที่ใช้ public key เรียก DML/RPC ที่จำกัดไม่ได้; BFF แก้ PAPER wallet ของผู้ใช้ A ไม่สามารถอ่านหรือเปลี่ยนยอดของผู้ใช้ B
2. starter credit เกิดได้ครั้งเดียว และ import-before-credit/import-after-unused-credit/late import หลังใช้ยอด เป็นไปตามกฎข้างต้น
3. duplicate import, duplicate reversal, concurrent order/ledger update และ concurrent refresh ไม่สร้างรายการหรือยอดซ้ำ
4. session หมดอายุ, CSRF/Origin ที่ผิด, logout/revoke, password reset และ email verification ผ่าน integration tests
5. restore backup จริงผ่าน checklist ของฐานข้อมูล, Auth, Storage และ settings พร้อมหลักฐาน ไม่ถือว่าแค่สร้าง backup สำเร็จคือ restore-tested
6. migration file เก็บต้นฉบับไว้, ปฏิเสธ schema/row ที่ไม่ถูกต้อง, ไม่รับ email เดิมเป็น verified, และแสดง preview ก่อน commit import

## สิ่งที่ยังไม่อนุมัติ/ยังไม่ทำ

ยังต้องอนุมัติผู้ให้บริการ/plan, custom domain/ค่าโดเมน, retention/backup cadence, อัตรา starter credit, และนโยบาย session ก่อนสร้าง infra หรือเริ่ม phase ที่ย้ายข้อมูลจริง ADR นี้ไม่อนุมัติการซื้อบริการ เปลี่ยน DNS, deploy, หรือเปิดการซื้อขาย/ฝาก/ถอนเงินจริง
