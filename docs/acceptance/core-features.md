# ตรวจฟีเจอร์หลักผ่านหน้าเว็บจริง

2026-10-06 Asia/Bangkok — browser/UI และ PostgreSQL16.15 ด้วยข้อมูลสังเคราะห์
ไม่แก้source/dependencies/env/F1.1 ไม่ใช้บัญชีหรือข้อมูลจริง ไม่commit/push/deploy
ทดสอบบนcompiled appที่localhost:4197 แยกcookiehostจากเว็บหลัก127.0.0.1:4173
ใช้runtime/business logicเดิมและpublic market relayจริง ไม่มีmockราคา/ฐานข้อมูล
Authsecretชั่วคราวอยู่ในmemory ไม่เปิดเผย credential และไม่เปลี่ยนsecretของเว็บหลัก

## ผลที่ตรวจจริง

| ฟีเจอร์ | ผล | ตัวอย่าง/หลักฐาน |
| --- | --- | --- |
| สมัคร/ออก/เข้าสู่ระบบ | PASS UI | Aสร้างผ่านUIและreloadมีsession; Bสมัครแล้วออก/เข้าบัญชีเดิมได้ |
| แยกเจ้าของ | PASS scopeที่ตรวจ | Bไม่เห็นfinance/cashของA ทั้งUIและDB; ไม่ใช้แทนexhaustiveauthorization suite |
| หมวดหมู่/รายรับรายจ่าย | PASS UI/DB | อาหาร4000 บ้าน6000 รายรับ20000 → expense10000 balance10000THB; reloadคงค่า |
| สัดส่วนรายจ่าย | PASS UI | อาหาร40% บ้าน60% ไม่เอารายรับมาอยู่ในตัวหาร |
| งบประมาณ | PASS UI/DB | งบอาหาร3500 ใช้4000 → เกิน500THB |
| ซื้อคริปโตบันทึกเอง | PASS UI/DB | btcถูกcanonicalเป็นBTC; Aซื้อ0.1ที่60000 ต้นทุน6000USDT |
| ขายบางส่วน/ค่าธรรมเนียม/P&L | PASS UI/DB | Aขาย0.04ที่65000 fee10 → quantity0.06 cost3600 realizedPnl190USDT |
| แยกต้นทุนสองพอร์ต | PASS UI/DB | Bซื้อ0.1ที่30000 → cost3000 ไม่ปนกับA |
| ขายเกินจำนวน | PASS rejection | พยายามขายB0.2ขณะที่ถือ0.1 ถูกปฏิเสธ และtradecountยัง3 |
| เงินสดเพิ่ม/แก้/reload | PASS UI/DB | เพิ่ม1000.10 แก้1200.20 แล้วreloadคงอยู่; ไม่เปลี่ยนเงินสดตามledgerอัตโนมัติ |
| เงินสดทศนิยมเกินscale | PASS rejection | 1000.001ถูกปฏิเสธ ไม่มีบัญชีซ้ำ; validcashaccountcount1 |
| ราคาคริปโตจริง | PASS snapshot | Binance BTCแสดงสดและเปลี่ยนระหว่างตรวจ ไม่รับรองราคา/uptimeตลอดเวลา |
| สินทรัพย์รวม/USDT→THB | PASSเมื่อข้อมูลสด / PARTIAL availability | จริงrate33.59; A5157.1206USDT≈173227.68THB, B8595.201≈288712.80THB + cash1200.20 =463140.68THB; ตรวจDecimalอีกครั้ง |
| อัตราเก่า/ไม่พร้อม | PASS guardeddisplay / ความพร้อมยังจำกัด | บางช่วงrateเกิน30s แสดงN/Aทั้งholdingTHB/total ไม่ใช้ต้นทุนหรืออัตราเก่าแทน; เงินสด/quantityคงอยู่ |
| ส่งออกbackupv2 | PASS service/JSON / PARTIAL browser | export/prepareจริงครบcategories3 transactions3 budgets1 portfolios2 trades3 cash1; financialfieldsเป็นstrings ไม่มีcredentialfields |
| ไฟล์backupถูกบันทึกลงเครื่อง | NOT TESTED | UIแสดงส่งไฟล์ให้browserแล้ว แต่เครื่องมือรอdownloadtimeout จึงไม่อ้างfileSavedPASS |

ผลรวมเงินบาทเป็นค่าประมาณเฉพาะสินทรัพย์ที่บันทึก ไม่ใช่มูลค่าสุทธิทั้งหมด
ภาพassets.pngเป็นช่วงrateN/A; ข้อมูลfreshที่เห็นก่อนหน้านั้นบันทึกแยกในassets-fresh-observed.json
ตรวจDecimalจากตัวเลขDOMจริงนั้นในverify.mjs ไม่อ้างว่าภาพภายหลังหรือราคาตอนอ่านเอกสารยังสด

## จุดที่ควรแก้/ตรวจต่อ

1. ความต่อเนื่องของFXrelay: มีช่วงN/Aจากอัตราไม่สด ต้องตรวจfetch/backoffและproviderresponse
   ก่อนเสนอเปลี่ยนความถี่/ผู้ให้ข้อมูล ไม่ยืด30sหรือใช้ราคาค้างเพื่อกลบปัญหา
2. BannerของDashboardค้างข้ามเมนู เช่นข้อผิดพลาดขายเกินแสดงในหน้าbackup หรือบันทึกสำเร็จเก่า
   แสดงพร้อมvalidationใหม่ เป็นUXที่ควรปรับ ไม่ใช่หลักฐานว่ารายการถูกบันทึกผิด
3. ต้องยืนยันไฟล์ดาวน์โหลดบนbrowser/เครื่องเจ้าของจริง ยังไม่ทราบว่าการtimeoutเป็นเครื่องมือหรือsave
4. เว็บหลักหยุดตอบระหว่างท้ายการตรวจ พอร์ตว่าง ไม่ยืนยันสาเหตุ; เปิดกลับด้วยnpm run tracker:dev
   แบบTTYและตรวจhealth200แล้ว ต้องตรวจlifecycleเพิ่มเติมก่อนอ้างเปิดต่อเนื่องผ่าน

แก้ไข/ยกเลิกfinance/trade, ขายทั้งหมด, fullbackuprestoreUI, physicalmobile,
productionHTTPS และfailure/retryครบทุกflow NOT TESTEDรอบนี้
มีหลักฐานเดิมบางส่วนในacceptanceอื่น แต่ไม่ยืมมานับPASSใหม่
rootสองfailuresเดิมยังOPEN ไม่มีการแก้/skip/รันใหม่ในรอบinspectนี้
ไม่ทำoff-device/scheduler/Authrecovery/retentionหรือเปิดข้อมูลจริงในงานตรวจนี้

## การรักษาข้อมูลและไฟล์

ก่อนทดสอบเก็บbaselineSHAทุกtracked/untrackedรวมenvhashโดยไม่อ่านค่าออกlog
เก็บhash/countของเจ้าของเดิมทั้ง9domain/audit/idempotencytables และเทียบหลังทดสอบตรง
เพิ่มเพียงสองบัญชีfixtureและข้อมูลของAที่แยกowner ไม่reset/deletevolumeหรือแก้ข้อมูลเดิม
ไม่กล่าวว่าทั้งฐานไม่เปลี่ยน เพราะมีfixtures/Authsessionsใหม่; ไม่มีการlogoutบัญชีเว็บหลัก
ปิดแท็บทดสอบแล้ว พอร์ต4197ไม่มีlistener เว็บหลัก4173เปิดกลับและhealth200ตอนตรวจท้าย

Evidence: `.core-features-review-20261006.local/` มีbefore/after/comparison.json,
data-before/data-after/protected-check.json, database-results.json, assets-snapshot.json,
assets-fresh-observed.json, assets.png, verify.mjs, cleanup/final-health.json และchanges.patch
ไม่แนบpassword/sessiontoken/secret/exportข้อมูลจริง มีเพียงsummary/hashและfixtureภาพ
server/verifyharnessอยู่ในignoredreviewdir ไม่ใช่sourceใหม่ของผลิตภัณฑ์
คำสั่งverify: `node --env-file=apps/api/.env .core-features-review-20261006.local/verify.mjs`
ต้องใช้synthetic5436 targetเท่านั้น; errorในharnessก่อนUIถูกแก้ชื่อmodelให้ตรงTrackerUser
selectorเก่าและdownloadเครื่องมือที่timeoutไม่ใช้เป็นหลักฐานbusinesslogicFAIL
ไม่รันfullTS/legacytests/buildซ้ำเพราะไม่มีapplication sourcechange; sharedbuildตอนเริ่มdevผ่าน
git diff --check และwhitespaceแยกของเอกสารใหม่ต้องผ่าน โดยไม่เทียบgitstatusอย่างเดียว
