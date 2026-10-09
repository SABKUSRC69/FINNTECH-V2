# พรอมป์ออกแบบ FINNTECH ใหม่ — ใช้ทรัพยากรฟรี

คำสั่งล่าสุดของเจ้าของ วันที่ 2026-10-07: ไม่ชอบดีไซน์ที่มีอยู่ ต้องการออกแบบใหม่
ใช้ดีไซน์/เครื่องมือภายนอกหรือเพิ่มการเชื่อมต่อที่ช่วยงานได้ โดยค่าใช้จ่ายเพิ่มต้องเป็นศูนย์
เอกสารนี้เปลี่ยนข้อกำหนดด้านรูปลักษณ์เดิม ไม่เปลี่ยนกฎการเงินหรือสิทธิ์ข้อมูล

คัดลอกข้อความหลังเส้นคั่นส่งให้ AI ผู้ลงมือทำ

---

คุณเป็น Product Designer และ Frontend Engineer ของ FINNTECH
ผมไม่ชอบดีไซน์ปัจจุบัน ต้องการโฉมใหม่ที่ออกแบบอย่างมีบุคลิก อ่านง่าย และดูเรียบร้อย
ไม่ใช่แค่เปลี่ยนสีหรือเพิ่ม border-radius ให้หน้าตาเดิม
คุณใช้ reference/template/components/fonts/tools จากภายนอกได้ แต่ต้องใช้ฟรีอย่างถูกสิทธิ์
ไม่มีการซื้อ สมัคร trial ที่ต้องใส่บัตร ใช้ Pro blocks หรือพึ่งบริการที่ต้องจ่ายเพื่อให้เว็บทำงาน

เป้าหมายผลิตภัณฑ์: เว็บติดตามการเงินส่วนตัวภาษาไทย ใช้ในเครื่องก่อน เตรียมออนไลน์ภายหลัง
Repository เดิม `C:\Users\Admin\Downloads\FINNTECH`
เว็บหลัก `apps/web` + `apps/api` + `packages/`
ถ้าไม่มี source/checkoutให้ขอไฟล์ก่อน ไม่สร้างผลตรวจเหมือนลงมือแล้ว

## คำสั่งนี้แทนข้อกำหนดดีไซน์เดิม

คุณไม่จำเป็นต้องคงสีเขียว/teal, หน้าตาการ์ด, sidebar, typography หรือlayoutเดิม
อนุญาตเพิ่ม dependency/UI library/fonts/assets ฟรีที่ช่วยงานและcompatibleได้
ข้อห้ามเพิ่มUIdependencyหรือให้คงโทนเดิมในพรอมป์ช่วงก่อน ไม่ใช้กับงานredesignนี้
แต่กฎDecimal/ledger/ownership/session/pending/idempotency/ราคาstaleยังต้องรักษา
ไม่ทำAuth recoveryหรือเปลี่ยนbackendเพียงเพื่อออกแบบหน้าจอ

## ขั้นแรก: ทำตัวอย่าง 3 แนวที่เปิดดูได้จริง

อ่านโค้ดและดูหน้าจอปัจจุบันก่อน แล้วทำdesign explorationสามแนวที่แตกต่างจริง:

A. Clean premium
- พื้นสว่าง off-white/sidebarเข้ม ตัวอักษรชัด เน้นสีน้ำเงิน/indigoอย่างพอดี
- Layoutแบ่งพื้นที่สรุป การกระทำ และประวัติอย่างชัด ไม่ใช้กรอบซ้อนหลายชั้น
- ดูเป็นผลิตภัณฑ์การเงินจริงที่สุขุม ไม่เหมือนหน้าตารางadminทั่วไป

B. Investment dark
- พื้น charcoal/slate มีลำดับsurfaceที่ชัด สีเน้นcyan/blue
- ตัวเลขและข้อมูลเด่น ความหนาแน่นพอดีและสถานะราคาอ่านง่าย
- ไม่มีneonทุกการ์ด/backgroundtextureหรือglowที่รบกวนข้อมูล

C. Calm personal finance
- พื้นcream/stone สีเน้นmutedblue/terracottaหรือpaletteที่เข้ากัน
- เป็นมิตร อ่านง่าย ใช้white spaceและกราฟที่จำเป็น
- ไม่ใช้emojiหรือภาพการ์ตูนจำนวนมากแทนicon/ข้อมูล

แต่ละแนวต้องมีอย่างน้อย:
- หน้าoverview desktop1440px
- หน้าoverview mobile390px
- ตัวอย่างฟอร์ม/ตารางรายการหนึ่งส่วน
- palette, font, spacing และbutton/input/card statesที่สอดคล้องกัน
- ชื่อแนวและเหตุผลว่าช่วยผู้ใช้FINNTECHอย่างไร

ให้เป็นHTML/React previewที่เปิดได้ในเครื่อง พร้อมscreenshots และลิงก์preview
ไม่ส่งเพียงคำอธิบาย moodboard หรือwireframeว่าง
แยกpreviewจากแอปหลักก่อน ไม่เปลี่ยนdefaultthemeหรือหน้าจอจริงทั้งระบบในขั้นสำรวจ
ใช้synthetic fixturesได้เฉพาะpreviewที่ติดป้าย “ตัวอย่างดีไซน์” ชัดเจน
อย่าต่อAPIเจ้าของหรือเอาข้อมูลส่วนตัวส่งไปบริการออกแบบ/AIภายนอก

ส่งสามแนวให้ผมเลือกพร้อมข้อเสนอที่คุณแนะนำหนึ่งแนวและเหตุผล
ถามเฉพาะว่าจะเลือกแนวไหน/ปรับอะไรหลังมีpreviewจริงแล้ว
อย่าเปลี่ยนทั้งเว็บไซต์ก่อนที่ผมจะเลือกแนว; หลังเลือกจึงทำขั้นimplementationด้านล่าง

## แหล่งฟรีที่เริ่มใช้ได้

- shadcn/ui official blocks/components: https://ui.shadcn.com/blocks
  และ https://ui.shadcn.com/docs/components
  source/license: https://github.com/shadcn-ui/ui/blob/main/LICENSE.md
- Radix primitives ถ้าจำเป็นสำหรับinteraction:
  https://www.radix-ui.com/primitives
  license: https://github.com/radix-ui/primitives/blob/main/LICENSE
- Lucide icons: https://lucide.dev/license
- Noto Sans Thai: https://github.com/google/fonts/tree/main/ofl/notosansthai
  license: https://github.com/google/fonts/blob/main/ofl/notosansthai/OFL.txt

ใช้sourceของofficialprojectsเป็นฐาน ไม่ถือว่าเว็บชื่อคล้ายกัน/Figma kit/marketplaceทุกแห่งใช้ฟรี
ไม่ใช้paidtemplatesที่หาdownloadเถื่อนหรือassetที่ไม่มีlicense
referenceภาพใช้ศึกษา hierarchy/layoutได้ แต่อย่าคัดlogo/branding/ภาพ/โค้ดที่ไม่อนุญาต
ถ้าพบtemplateฟรีที่เหมาะกว่า ให้ตรวจlicenseและเสนอพร้อมURL แล้วใช้ได้ภายในscopeนี้

อนุญาตเพิ่มfreeUIdependenciesตามจำเป็น ไม่ต้องขออนุญาตทุกcomponent
ตรวจReact18/Tailwind3/Viteและlockfileเดิมก่อนใช้snippet/CLIล่าสุด
เลือกversion/implementationที่compatible ไม่upgradeReact/Tailwind/เปลี่ยนframeworkทั้งโครงการเพียงเพื่อใช้template
ถ้าจำเป็นต้องmigrateจริง ให้เสนอแผนcompatibilityและความเสี่ยงที่ตรวจได้ก่อนทำmigrationใหญ่
คงsource/lockfileที่reviewได้ และบันทึกdependencydiffตามจริง

ฟอนต์/ไอคอน/assetให้self-hostในprojectเมื่อเหมาะสมเพื่อใช้งานในเครื่อง
หน้าเว็บต้องไม่บังคับติดต่อCDN/designserviceหรือใช้APIkeyเพื่อแสดงUIหลัก
ถ้าfontโหลดไม่ได้ต้องมีThai/systemfallback ไม่มีข้อความหายหรือlayoutเสีย
อ่านและคงlicense/copyright noticesที่จำเป็นในTHIRD_PARTY_NOTICESหรือไฟล์licenses

## หลังเลือกดีไซน์: นำไปใช้ครบหน้าที่มีจริง

1. เข้าสู่ระบบ/สมัครบัญชี
2. สินทรัพย์รวม/overview
3. รายรับรายจ่ายและประวัติ
4. งบประมาณ
5. พอร์ตคริปโต/holdings/cost/P&L/history
6. สำรองและกู้คืนข้อมูล
7. บัญชีและดูแลข้อมูล
8. ราคาหุ้นwatchlistตามฟังก์ชันเดิม ไม่เปิดproviderใหม่เพื่อเติมหน้า

สร้างdesign tokens/componentsร่วมสำหรับcolor/type/space/radius/shadow/input/button/table/dialog/status
ให้ทุกหน้ารู้สึกเป็นผลิตภัณฑ์เดียวกัน ไม่ออกแบบdashboardสวยหน้าเดียวแล้วทิ้งหน้าอื่น

แนวทางlayout:
- ให้ข้อมูลสำคัญลำดับแรก เช่นภาพรวมยอดที่นับได้ source/freshness และการกระทำหลัก
- แยกยอดคงเหลือเดือนออกจากเงินสดและมูลค่าสินทรัพย์ ไม่เรียกทั้งหมดว่ายอดธนาคาร
- ตารางตัวเลขจัดแนว/หน่วยชัด อ่านได้เมื่อdecimal stringยาว
- แยกform/edit/void/confirmจากsummaryไม่ให้กองเป็นการ์ดยาวเหมือนเดิมทั้งหมด
- สถานะmarket/FXใช้ป้ายที่อ่านได้ ไม่ใส่ป้ายLIVEทุกจุดเพื่อให้หน้าดูactive
- มีempty/loading/validation/error/stale/session-expired/unknown-outcomeตามflowจริง
- ใช้chartจากข้อมูลที่มีจริงและมีความหมาย; ไม่สร้างtrend/profit/randomcandlesในแอปใช้งานจริง
  ถ้ายังไม่มีendpoint/historyเพียงพอ ให้ใช้summaryหรือempty stateอย่างออกแบบดี
- ไม่สร้างปุ่มกดได้เสมือนมีฟังก์ชันเมื่อbackendยังไม่รองรับ

## Responsiveและaccessibility

Desktop/tablet/mobileต้องออกแบบตามงานจริง ไม่ใช่ย่อdesktopลงมือถือ
จะปรับnavigationให้เหมาะกับแนวที่เลือกได้ แต่ทุกหน้าเดิมต้องเข้าถึงได้
mobileไม่อัดเมนูยาวทั้งหมดในแถบเดียว; sticky/bottomnavไม่บังฟอร์มหรือpending

ตรวจ320/390/768/1280/1440px, light/dark, keyboardและlongThai/longdecimal
touchtargetsหลัก44pxขึ้นไป, inputmobile16pxขึ้นไป, focusเห็นชัดและtextcontrastอ่านง่าย
สีไม่ใช่สัญญาณเดียวของกำไรขาดทุน/error/สถานะ; modalมีfocus/inert/Escape/restoreที่ถูกต้อง
ใช้motionสั้นเฉพาะที่ช่วยfeedback และรองรับprefers-reduced-motion

## ฟังก์ชันและข้อมูลที่ห้ามเสีย

- ใช้Auth/session/API/owner mappingเดิม ไม่เพิ่มระบบloginอีกชุด
- Finance/budget/cashเป็นTHB; cryptoledger/cost/P&Lเป็นUSDTแยกพอร์ต
  assetTHBใช้referenceUSDT_THBเดิม ไม่ถือUSDT=USD ไม่เปลี่ยนสูตรต้นทุน
- Decimal strings/precisionเดิม ไม่ใช้Number/parseFloatเพื่อทำยอดให้ดูสวย
- ราคาหรืออัตราเกิน30sไม่ใช้คำนวณปัจจุบัน ไม่ยืดstaleหรือเลื่อนtimestamp
- Navigation/close/logout/newlinksต้องไม่bypassbusy/pending/backupLockedหรือwritingguard
- หลังtimeoutผลอาจcommitแล้ว ต้องretry/reconcileด้วยpayload/keyเดิม
  ดีไซน์ใหม่ต้องให้ผู้ใช้ตรวจผลได้ ไม่ซ่อนwarning/ปลดล็อกเพื่อความสวย
- Theme/hidepresentationไม่เปลี่ยนrequest/payload/accountdata
- ไม่reset/deleteDB/volume ไม่ใช้ข้อมูลจริงในpreview/screenshot ไม่promoteDEMO
- ไม่เพิ่มexecution/wallet/ฝากถอน/QR/creditsหรือเปิดPaperTrading
- ไม่deploy/ซื้อบริการ/ส่งsource/env/ข้อมูลจริงไปthirdpartyโดยพรอมป์นี้

## คำว่าฟรีในงานนี้

ฟรีคือไม่มีค่าเพิ่มสำหรับtemplates/components/fonts/assets/designservicesที่ใช้กับงานนี้
ไม่บังคับsubscription/APIcredit/paidhostingเพื่อให้โฉมใหม่ใช้งานlocalได้
อย่าใช้free-trial/quotaremainingเป็นหลักฐานว่าระบบใช้ฟรีต่อได้ตลอด
ค่าAIที่ผมใช้อยู่กับการพัฒนาเป็นคนละเรื่อง ไม่อ้างว่าการเรียกAIหรือhostingออนไลน์ทุกอย่างไม่มีค่าใช้จ่าย
ถ้าtoolภายนอกต้องเสียเงิน/หมดquota ให้เปลี่ยนเป็นการทำpreviewด้วยHTML/CSS/Reactในเครื่อง

## ส่งมอบและตรวจรับ

ขั้นสำรวจ:
- สามpreviewที่เปิดดูจริง desktop/mobile พร้อมscreenshots
- referenceURLs/licenses และรายการทุกresourceว่าค่าเพิ่ม0บาท
- แนวที่คุณแนะนำ เหตุผล และสิ่งที่ต้องเลือกก่อนimplementation
- ยังไม่แก้DB/backendหรือเปลี่ยนแอปหลักทั้งระบบ

ขั้นimplementationหลังผมเลือก:
- incrementalpatchรวมไฟล์ใหม่/dependencydiffและlicense notices
- screenshotsทุกหน้าหลักทั้งdesktop/mobile ระบุbuild/hashของรุ่นที่ตรวจ
- ผลcommandsจริง: npm test, npm run build, npm run tracker:typecheck,
  npm run tracker:test, npm run tracker:build, package smoke และgit diff --check
- regressionสำหรับpending/nav/retry/hide/financialmeaningเดิม
- ถ้าเปลี่ยนtestเพราะlayoutใหม่ ต้องมีcoveragebehaviorเทียบเท่า ไม่skipกฎการเงิน/ownership
- browserconsole/networksummaryและNOT TESTEDตามจริง ไม่อ้างphysicalmobileจากemulation
- อธิบายก่อน/หลังว่าดีไซน์เปลี่ยนอะไรและฟังก์ชันเดิมยังทำงานอย่างไร

เริ่มจากดูsource/หน้าจอเดิมและสร้างสามแนวที่เห็นภาพทันที
อย่าตอบแค่แผนหรือถามผมหลายข้อก่อนมีตัวอย่างให้เลือก

---

## ตรวจแหล่งฟรีโดยผู้จัดพรอมป์

ตรวจจากแหล่งทางการวันที่ 2026-10-07:

| ทรัพยากร | ขอบเขตสิทธิ์ที่ตรวจ | แหล่ง |
| --- | --- | --- |
| shadcn/ui official source | MIT; blocksทางการระบุopensource/free | [license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md), [blocks](https://ui.shadcn.com/blocks) |
| Radix primitives | MIT | [license](https://github.com/radix-ui/primitives/blob/main/LICENSE) |
| Lucide | ISC และMITสำหรับiconsที่licenseแยกระบุ | [license](https://lucide.dev/license) |
| Noto Sans Thai | SIL OFL1.1;คงlicenseเมื่อแจกจ่ายfont | [license](https://github.com/google/fonts/blob/main/ofl/notosansthai/OFL.txt) |

ต้องตรวจแต่ละthirdpartytemplate/blockเพิ่มเอง ไม่สรุปสิทธิ์ทั้งmarketplaceจากlicenseของlibraryฐาน
