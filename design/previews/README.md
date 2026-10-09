# FINNTECH — 3 design directions

ขั้นสำรวจ วันที่ 2026-10-07 ยังไม่เปลี่ยนแอปหลัก ไม่ใช่ full redesign implementation

เปิดในเครื่องจาก root:

```powershell
node scripts/design-preview-server.mjs
```

รวมสามแบบ: http://127.0.0.1:4296/

- A Clean Premium: http://127.0.0.1:4296/?concept=a
- B Investment Dark: http://127.0.0.1:4296/?concept=b
- C Calm Personal Finance: http://127.0.0.1:4296/?concept=c

หยุดด้วย Ctrl+C ใน terminal ที่เริ่ม server หากพอร์ตถูกใช้ให้ตรวจ process ก่อน ไม่หยุด process อื่นโดยเดา
ผู้ทำงานเปิด preview server PID5700 บน127.0.0.1:4296 คงไว้เป็น deliverable สำหรับเลือกดีไซน์
หากต้องหยุดรอบนี้ ตรวจ command line ให้เป็น scripts/design-preview-server.mjs ก่อนหยุดเฉพาะ process ดังกล่าว
เปิด index.html โดยตรงได้เช่นกัน ไม่ต้อง build/npm install/login/API/DB

## สิ่งที่ตรวจจาก source

React18.3/Tailwind3.4/Vite6 มี Login/signup และ7หน้าหลักตาม TrackerNavigation:
Assets, Finance, Budget, Crypto, Stocks, Backup, Account
อ่าน App, navigation, Assets และพรอมป์ redesign ก่อนสร้าง preview ไม่พบ AGENTS.md จาก rg
ข้อมูลเงินสดเดิมไม่ได้เปลี่ยนตาม financeอัตโนมัติ USDTแยกUSDและTHB ราคาหรือFXเก่าไม่ใช้valuation
จึงทำ preview แยกเงินสด/คงเหลือเดือน/คริปโต ไม่มี totalที่เอาต้นทุนมาปน ไม่มี profit/trendปลอม
หุ้น NOT CONFIGURED ไม่มีราคา syntheticเติมเพื่อให้ดูเต็ม

## 3 โครงสร้างที่ต่างกัน

| แบบ | โครงสร้าง | เหมาะกับ |
| --- | --- | --- |
| A Clean Premium | sidebarมีชื่อ, summaryคู่, งบและพอร์ตคู่กัน, formเป็นrailด้านขวา, ประวัติด้านล่าง | ใช้ทุกวันและบันทึกได้เร็ว — แนะนำ |
| B Investment Dark | horizontal workspace, ตัวเลข3คอลัมน์, พอร์ตกว้าง, ตารางเต็มพื้นที่, formแยกด้านล่าง | ตรวจพอร์ตและประวัติที่มีความหนาแน่นมากขึ้น |
| C Calm Personal Finance | icon rail, typographyแบบjournal, เงินสดไม่อยู่ในกรอบ, summaryงบเดือนแบบeditorial, คอลัมน์ไม่สมมาตร | อ่านสบายและเน้นวางแผนการเงินส่วนตัว |

แต่ละแบบมี light/dark pair, local font, palette/spacing/button statesและตัวอย่างฟอร์มท้ายหน้า
มี native modalเปิดจากปุ่มบันทึก, mobileMore, anchornavigation, hide/unhide และตรวจรูปแบบเงินตัวอย่าง
ปุ่ม submitเพียงแสดงผลตรวจ mock ไม่เพิ่ม ledgerหรือเรียกAPI ไม่ใช่การนำ validationใหม่ไปแทน schemaจริง
navในpreviewเลื่อนไปส่วนตัวอย่าง ไม่ใช่ implementationทุกหน้าหลัก
ข้อมูลจำลองระบุบนหัวหน้าและท้ายหน้า กราฟมีเพียง budget progressจากfixturesที่ระบุงบ/ใช้ไป
ไม่มีแนวโน้มราคา/randomcandles/currentP&Lที่ไม่มีราคาสด

## ไฟล์ / dependencies / license

ไฟล์ใหม่ทั้งหมด: index.html, preview.js, preview.css, assets/NotoSansThai.ttf, assets/OFL.txt,
THIRD_PARTY_NOTICES.md, README.md, evidence/* และ scripts/design-preview-server.mjs
ไม่แก้ apps/web, apps/api, packages, package.jsonหรือlockfile ของเดิม
UI dependenciesใหม่: **0** ค่าเพิ่มของ font/template/components/assets: **0บาท**
CSS/layout/iconsเขียนใหม่ ไม่ใช้ template/Problock/trial/providerภายนอก
Noto Sans Thai unmodifiedดาวน์โหลดจาก officialgoogle/fonts ใช้SIL OFL1.1 เก็บ copyright/fulllicense/hash
ดู [notices](THIRD_PARTY_NOTICES.md), [OFL](assets/OFL.txt), [official source](https://github.com/google/fonts/tree/main/ofl/notosansthai)
runtimeใช้localfontพร้อมSegoeUI/Tahomafallback ไม่โหลดCDN/fontservice ไม่มีส่งsource/ข้อมูลจริง/secretไปบริการออกแบบ
staticserverเสิร์ฟเฉพาะdesign/previews; CSP connect-src none/object-src none/form-action none
ไม่มีbackendwrite, DBoperation, auth/sessionchange, migration, commit/push/deploy หรือซื้อบริการ

## ภาพก่อน / ตัวอย่างใหม่

ก่อน: evidence/before-phase2-finance-1440.png และ before-phase2-finance-390.png
เป็นหลักฐานสังเคราะห์ที่เก็บจากช่วง2ก่อนหน้า (ไม่ใช่ถ่ายฐานเจ้าของใหม่)
หน้าเดิมเป็นfinance ส่วนตัวอย่างใหม่เป็นoverview ข้อมูลและหน้าที่เทียบต่างกัน ใช้เปรียบเทียบรูปลักษณ์เท่านั้น

| แบบ | Desktop1440 | Mobile390 | ทั้งหน้า: form/table/tokens |
| --- | --- | --- | --- |
| A | [ภาพ](evidence/a-1440.png) | [ภาพ](evidence/a-390.png) | [desktop](evidence/a-1440-full.png) / [mobile](evidence/a-390-full.png) |
| B | [ภาพ](evidence/b-1440.png) | [ภาพ](evidence/b-390.png) | [desktop](evidence/b-1440-full.png) / [mobile](evidence/b-390-full.png) |
| C | [ภาพ](evidence/c-1440.png) | [ภาพ](evidence/c-390.png) | [desktop](evidence/c-1440-full.png) / [mobile](evidence/c-390-full.png) |

## ผลตรวจจริง

evidence/checks.json เก็บคำสั่ง/exit/output และ hashes-initial.json เก็บhashต้นฉบับที่ตรวจ

| ตรวจ | ผล | Exit code |
| --- | --- | --- |
| node --check design/previews/preview.js | syntaxผ่าน | 0 |
| node --check scripts/design-preview-server.mjs | syntaxผ่าน | 0 |
| git diff --check | tracked diffผ่าน ไม่ได้อ้างว่าเช็คuntrackedครบจากคำสั่งนี้ | 0 |
| HTTP GETบนloopbackจากshellนอกsandbox | 200และCSPถูกส่งจริง; server-http.json | 0 |
| browser responsive | 3แนว × 5widths × 2themes =30cells; matrix.json | browserAPI ไม่มีshell exit |
| browser interactions | ทั้ง3แนว modal/focus/form/More/hideผ่าน; interaction.json | browserAPI ไม่มีshell exit |

widths320/390/768/1280/1440ครบ light/dark ไม่พบpageoverflow (ตารางมือถือscrollเฉพาะtable-wrap)
visiblebuttons/linksอย่างน้อย44px inputsมือถือ16px NotoLocal fontLoaded=trueทุกcell
bottomnavสูง64.8px mobilefooterclearanceประมาณ104px ปุ่มท้ายฟอร์มจึงเลื่อนพ้นnavได้
Tab/Shift+Tabวนภายในmodal Escapeปิดและคืนfocusไปปุ่มเปิด Moreมี4links
กรอก0แสดงvalidation;120.25แสดงผ่านรูปแบบและย้ำไม่ได้บันทึกจริง hide/unhideคืน128,450.00เดิม
browser console warn/errorที่APIรายงาน=0 เก็บconsole.json
มีความล้มเหลวของเครื่องมือวัดรอบแรกเพราะ evaluateไม่มีperformance.getEntriesByType จึงใช้DOMmetricsที่รองรับ
ไม่ใช่codebug; ไม่มีnetworktraceครบจากเครื่องมือนี้ ขอบเขตnoexternalruntimeตรวจจากsource/CSP/localfont
shellHTTPรอบแรก sandboxปฏิเสธsocket เป็นenvironmentfailure; escalationบนloopbackผ่าน ไม่ใช่producterror

## NOT TESTED / ขั้นถัดไป

- physicalmobile/iOSkeyboard/safe-areaจริง, screenreader, enginesอื่น, contrastauditแบบครบและlongDecimalstressfixtures
- realDB/Auth/session/provider/download/restore และ financial/pending/retry regressionในUIใหม่
- fullapp npmtest/build/tracker:typecheck/tracker:test/tracker:build/package smoke **ไม่ได้รันใหม่ในขั้นสำรวจนี้**
  พรอมป์กำหนดชุดนี้สำหรับimplementationหลังเลือก ไม่ใช้ผลช่วง2เดิมอ้างผ่านredesign
- ยังไม่เปลี่ยนLoginหรือทุกหน้า production ยังไม่แทน navigationguardหรือ requestของจริงด้วยmock

หลังเจ้าของเลือกA/B/C (หรือระบุส่วนที่ต้องผสม) ค่อยทำ sharedtokens/componentsในReact18/Tailwind3
แล้วนำไปใช้กับLogin/Overview/Finance/Budget/Crypto/Stocks/Backup/Accountครบ โดยคงsession/ownership/Decimal
busy/pending/backupLocked/writingguardและretrypayload/keyเดิม ทดสอบครบตามพรอมป์และส่งreviewใหม่
ขั้นนี้หยุดรอเลือกดีไซน์ ไม่deploy ไม่เริ่มrecovery/backendงานใหม่
