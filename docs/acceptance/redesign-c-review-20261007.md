# FINNTECH — Calm Personal Finance (C), review 2026-10-07

ผู้ใช้เลือก C แล้ว จึงนำแนวนี้ไปใช้กับ frontend จริงครบหน้าที่มีอยู่ โดยหยุดส่ง review หลัง implementation ไม่เริ่ม recovery/backend/online deployment

## ผลก่อน/หลังและขอบเขต

ก่อน: sidebar กว้าง การ์ดและฟอร์มเรียงเป็นกลุ่มหน้าตาคล้ายกัน สี teal และ typography เดิม หลัง: cream/stone + terracotta, ฟอนต์ไทย local, desktop icon rail, page introduction และลำดับอ่าน/ลงรายการแยกกัน มีชุดสี dark olive/charcoal พร้อม focus และสถานะที่ใช้ร่วมกัน

| หน้า | การเปลี่ยนแปลง |
| --- | --- |
| Login / signup | Story และฟอร์มสองพื้นที่บน desktop; mobile เรียงตามลำดับ; ใช้ Auth/session/validation/reconcile เดิม |
| Overview / สินทรัพย์รวม | ยอดที่นับได้และเงินสดแยกกัน; cash editor ด้านขวา; portfolio และ FX ด้านซ้าย; stale ยังเป็น N/A |
| รายรับรายจ่าย | summary และสัดส่วนจริงด้านซ้าย, editor ด้านขวา, ประวัติเป็น semantic table มีพื้นที่เลื่อนแนวนอนแยกจาก page |
| งบประมาณ | แยก editor กับผลติดตาม; THB และยอดจาก API เดิม |
| Crypto | holdings มาก่อน editor และประวัติ; USDT แยกต่อพอร์ต; ไม่สร้าง trend หรือกำไรขึ้นเอง |
| Backup | พื้นที่ export/restore แยกบน desktop, ต่อเนื่องบน mobile; flow และ locks เดิม |
| บัญชี | layout ดูแลข้อมูลสองพื้นที่, ชื่อจาก authenticated state เดิม, logout/ลิงก์ backup เดิม |
| หุ้น | intro และสถานะ provider ใช้ design system เดียวกัน; ไม่เปิด provider หรือเติมราคาจำลองใน app |

Mobile ยังคง 4 จุด ภาพรวม/รายการ/พอร์ต/เพิ่มเติม และทุกทางใช้ guard เดิม Desktop icons มี accessible labels เดิมและ title สำหรับ hover ฟอร์ม/input 16px, ปุ่มหลักอย่างน้อย 44px, native modal/inert/keyboard เดิม, reduced-motion และ safe-area padding

## ไฟล์ใน incremental patch

แก้ 8 ไฟล์เดิมจาก baseline ก่อนงาน C: `apps/web/src/App.tsx`, `index.css`, `tracker/Dashboard.tsx`, `tracker/TrackerNavigation.tsx`, `tracker/Assets.tsx`, `tracker/Backup.tsx`, `tracker/StockPrices.tsx`, `tracker/Account.tsx`

เพิ่ม: `apps/web/src/journal.css`, `tracker/PageIntro.tsx`, `tracker/FinanceHistory.tsx`, `tracker/FinanceHistory.test.tsx`, `apps/web/public/fonts/NotoSansThai.ttf`, `apps/web/public/fonts/OFL.txt`, `apps/web/THIRD_PARTY_NOTICES.md` และรายงานนี้

Patch: [redesign-c-review-20261007.patch](/C:/Users/Admin/Downloads/FINNTECH/docs/acceptance/redesign-c-review-20261007.patch) เทียบกับ snapshot ก่อน C รวม font binary ไม่รวม diff งานเดิมของเจ้าของ ไม่มีการ staging/commit/push การตรวจ reverse apply เป็น check อย่างเดียว

เพิ่ม regression สองข้อ: table คง Decimal string ยาวและส่ง entry เดิมให้ edit/void; pending ปิด actions, hide คง masking, voided record ยังคงประวัติและไม่มี action ซ้ำ ไม่แก้หรือลด assertion ของ tests เดิม

## ทรัพยากร / dependencies

ไม่มี dependency เพิ่ม ไม่มี package/package-lock เปลี่ยนในงาน C รูปแบบ UI และ CSS เขียนใน repo; icons เดิม ฟอนต์ Noto Sans Thai จาก [Google Fonts official source](https://github.com/google/fonts/tree/main/ofl/notosansthai), SIL OFL 1.1 เก็บ [notice](/C:/Users/Admin/Downloads/FINNTECH/apps/web/THIRD_PARTY_NOTICES.md) และ license ใน public และ build output ค่าเพิ่มสำหรับทรัพยากรนี้ 0 บาท ไม่มี CDN หรือ paid template

## รุ่นที่ตรวจและหลักฐาน browser

ตรวจ compiled `apps/web/dist` กับ API fixture ใน memory ที่ 127.0.0.1:4297 ไม่อ่าน env/credentials ไม่เชื่อม DB/provider ไม่ใช้ข้อมูลส่วนตัว ชื่อ “ผู้ทดสอบดีไซน์ C” และข้อมูลทั้งหมดในภาพเป็นสังเคราะห์ ตัวเลขและสัดส่วนสอดคล้องกับ fixtures ไม่ใช่ข้อมูลแอปจริง

| Build file | SHA256 |
| --- | --- |
| index-_A7wpEfP.css | D9262E807C16F3BCAFAF23D3280C23A28A751283076208036D27EBAD8872AB7F |
| index-Ymj5vTHb.js | 5322F3F5FB4CB3741D0049D8B964E8FEF5B80D63DFB890408F7505E0AE804796 |
| NotoSansThai.ttf | 5A1C559BB539583C8A1FD99D1C5B9491E5E14478C9CD2BD0970D5C3096CC9EF8 |

หลักฐาน local แยกจาก patch อยู่ [.redesign-c-20261007.local/browser](/C:/Users/Admin/Downloads/FINNTECH/.redesign-c-20261007.local/browser) และ [build hashes](/C:/Users/Admin/Downloads/FINNTECH/.redesign-c-20261007.local/build-evidence.json) โฟลเดอร์ .local ถูก ignore ตามกฎเดิม

- 7 หน้าหลัก × widths 320/390/768/1280/1440 × light/dark = 70 เคส: [matrix](/C:/Users/Admin/Downloads/FINNTECH/.redesign-c-20261007.local/browser/matrix.json)
- Login 10 + signup 10 เคส ไม่สร้างบัญชีจริง: `login-matrix.json`, `signup-matrix.json`
- ข้อมูลไทย/Decimal ยาว assets/finance/crypto ที่ 320/1440 สองธีม 12 เคส และ selected holdings อีก 4 เคส: `stress-matrix.json`, `holdings-stress.json`
- รวม 106 เคส ไม่พบ page overflow; font local โหลดจริง; input 16px และปุ่ม visible ไม่มี target ต่ำกว่า 44px ใน matrix ตารางรายการเลื่อนใน region ของตัวเองได้ บน mobile footer clearance ประมาณ 91–92px มากกว่า bottom nav ประมาณ 69px
- ภาพทุก 7 หน้าหลักที่ 390/1440 ทั้งสองธีม: `<page>-<width>-<theme>.png` พร้อม Login/signup ทุกธีมและสอง widths ในโฟลเดอร์ browser
- [Overview desktop](/C:/Users/Admin/Downloads/FINNTECH/.redesign-c-20261007.local/browser/overview-1440-light-viewport.png), [Overview mobile](/C:/Users/Admin/Downloads/FINNTECH/.redesign-c-20261007.local/browser/overview-390-light-viewport.png), [Finance](/C:/Users/Admin/Downloads/FINNTECH/.redesign-c-20261007.local/browser/finance-1440-light.png), [Login](/C:/Users/Admin/Downloads/FINNTECH/.redesign-c-20261007.local/browser/login-390-light.png)
- ก่อน C ใช้ภาพประวัติ phase2: [desktop](/C:/Users/Admin/Downloads/FINNTECH/.phase2-review-20261007.local/browser/1440-light-finance.png), [mobile](/C:/Users/Admin/Downloads/FINNTECH/.phase2-review-20261007.local/browser/390-light-finance.png) เป็นข้อมูลสังเคราะห์คนละ fixture จึงเปรียบเทียบ layout ไม่ใช้เปรียบเทียบยอดก่อน/หลัง

### State / keyboard / requests

More sheet เปิดขณะ pending ได้ แต่เมนูทั้งสี่ปิดใช้งาน; Tab วนที่ close เมื่อเมนูถูกล็อก; Escape ปิด sheet และคืน focus ไป More โดย pending ยังคงอยู่ Void dialog จาก table เริ่ม focus ที่ reason, Shift+Tab/Tab วน, Escape ตอน idle คืน opener; unknown outcome ปิดด้วย Escape/close ไม่ได้ และ retry อยู่ใน dialog: [keyboard evidence](/C:/Users/Admin/Downloads/FINNTECH/.redesign-c-20261007.local/browser/keyboard.json)

Fixture ตอบครั้งแรก 500 และครั้งถัดไปสำเร็จ: finance retry, theme/hide ระหว่าง pending แล้ว retry, void keyboard retry และ void pointer retry แต่ละ scenario ส่ง 2 คำขอ โดย `payloadSame=true` และ `keySame=true` ดู `pending-retry.json`, `theme-hide-retry.json`, `void-retry.json`, `void-pointer-retry.json` เก็บเฉพาะผลเปรียบเทียบ ไม่เก็บ raw payload/key ไม่อ้างว่า fixture พิสูจน์ DB commit/rollback จริง

ระหว่างตรวจพบ pointer retry สองครั้งที่ไม่เกิด request ทันทีหลัง screenshot/Escape sequence; keyboard สำเร็จและ fresh pointer scenarios สำเร็จ ไม่พบ overlay บัง center ของปุ่มจาก DOM hit test สาเหตุเฉพาะ sequence นี้ UNCONFIRMED ไม่แก้ guard หรือ request จากการเดา ควรทวนการแตะจริงบนอุปกรณ์ต่อใน review

Loading จาก finance GET หน่วง 2s และ error GET 503 มีภาพ `loading-390.png`, `unavailable-390.png` ไม่แสดงยอด 0 แทนข้อมูลที่โหลดไม่ได้; market/FX 60s แสดง stale/N/A และ stocks NOT_CONFIGURED ไม่มีราคา การตรวจ session-expired, backup retry/locks, financial rules เพิ่มเติมอยู่ใน regression suite เดิม

Console summary ที่อ่านผ่าน browser: [console-summary.json](/C:/Users/Admin/Downloads/FINNTECH/.redesign-c-20261007.local/browser/console-summary.json) = [] สำหรับ warn/error ที่ API ส่งกลับในช่วงตรวจ ไม่อ้างว่าไม่มี network failure: fixture จงใจปฏิเสธ WS upgrade, ใช้ HTTP market fallback; มี 500 unknown outcome และ 503 ตาม scenario ไม่เก็บ HAR หรือข้อมูล credentials ไม่มีการส่งข้อมูลส่วนตัว/source ไปบริการภายนอก

## Commands ที่รันจริง

| คำสั่ง | ผลสุดท้าย | Exit code | Log ใน .redesign-c-20261007.local |
| --- | --- | --- | --- |
| npm test | 35 files, 315 tests passed | 0 | final-1.log |
| npm run build | legacy Vite build passed | 0 | final-2.log |
| npm run tracker:typecheck | passed | 0 | typecheck-rerun.log |
| npm run tracker:test | finance 21 + contracts 13 + API 83 + web 69 = 186 passed; cold package smoke passed | 0 | final-4.log |
| npm run tracker:build | passed | 0 | build-rerun.log |
| node --no-strip-types scripts/tracker-package-smoke.mjs | passed | 0 | final-6.log |
| git diff --check | passed | 0 | diff-check-final.log |

[Final manifest](/C:/Users/Admin/Downloads/FINNTECH/.redesign-c-20261007.local/final-results.json) และ logs เก็บจริง ครั้งแรก web 63 pass/4 fail เพราะเปลี่ยนคำทักทายเดิม จึงคืน “สวัสดี {name}” tests เดิมไม่เปลี่ยน Full batch ครั้งแรก typecheck/build exit 2 เพราะ test fixture ใหม่ขาด nullable voidedAt/voidReason; เติม null ตาม contract แล้ว typecheck/build และ targeted 2 tests ผ่าน สองข้อนี้เป็น code/test-fixture bugs ไม่ซ่อนผลครั้งแรก (`batch-attempt1-results.json`, `web-tests-attempt1.log`)

แยก environment failure: build ท้ายงานใน sandbox exit 1 ด้วย `Cannot find module 'vite'` จาก config runner (`build-sandbox-attempt.log`); รันคำสั่งเดียวกันนอก sandbox exit 0 โดยไม่เปลี่ยน dependencies ฟอนต์ license ตัด trailing space หนึ่งจุดโดยคงข้อความสิทธิ์ครบ

Visual review พบ root utility text-slate-900 ทำให้สีหัวข้อ/ตัวเลข dark ไม่สืบทอด token จึงเพิ่ม `.tracker-app[data-theme]` ให้สี root มี specificity ชัด แล้ว rebuild และตรวจ 106 เคส/ภาพ normal, auth, stress ใหม่ครบ Heading dark เป็น rgb(241,238,230) ตาม token ใน matrix hash JavaScript ไม่เปลี่ยน (ชื่อไฟล์เปลี่ยนตาม CSS import) ภาพและ keyboard/pending/loading/error scenarios เก็บก่อนแก้ CSS inheritance จุดสุดท้ายนี้ จึงไม่ใช้ภาพ state เหล่านั้นอ้างเป็น screenshot ของ final CSS; financial/navigation request flow ไม่เปลี่ยน

Console รุ่นสุดท้ายเก็บเพิ่มใน `browser/console-summary-final.json` = [] เช่นกัน

## สิ่งที่ยัง NOT TESTED และขอบเขต review

ยังไม่ตรวจ physical mobile/touch/IME/virtual keyboard, Safari/Firefox, screen reader จริง, automated contrast audit, production Auth/DB writes/ownership/session expiry end-to-end, live market/FX/WS recovery, backup download/restore กับ DB จริง, recovery/change-password หรือ online readiness ไม่เริ่มระบบที่ backend ยังไม่รองรับ

Runner fixture ที่เริ่มในงาน C หยุดเฉพาะ process ของ fixture หลังตรวจ identity/port และตรวจ port 4297 ว่าง ดู `browser/lifecycle-final.json` Server gallery design preview เดิม 4296 ไม่ใช่ main tracker และไม่ใช่ API/DB runner ใหม่ เริ่มเว็บหลักตาม README ด้วย `npm run tracker:dev` เมื่อต้องใช้กับ local environment ของเจ้าของ

ขอ review ดีไซน์และ regression ชุดนี้ก่อนปรับเพิ่ม ไม่สรุปว่าเว็บไซต์สมบูรณ์ทั้งหมดจากงาน redesign นี้
