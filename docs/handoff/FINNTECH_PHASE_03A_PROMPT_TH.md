# พรอมป์ช่วง 3A: กู้คืนบัญชี/ยืนยันอีเมลในสภาพทดสอบแยก

คัดลอกข้อความหลังเส้นคั่นส่งให้ AI ผู้ลงมือทำ

---

ช่วง2ผ่าน independent review ในscope UXแล้ว เริ่มช่วง3AของFINNTECH:
implement และตรวจ recovery/verification ด้วยบัญชีสังเคราะห์และช่องทางรับอีเมลภายในเครื่อง
เป้าหมายหลักยังใช้ส่วนตัวในเครื่องก่อน แล้วเตรียมออนไลน์ภายหลัง
ยังไม่เปิด recovery ให้บัญชีเดิมหรือข้อมูลจริง และไม่สมัคร/ซื้อ/ส่งอีเมลผ่าน provider ภายนอก

Repository เดิม `C:\Users\Admin\Downloads\FINNTECH`
ใช้ Better Auth/Prisma/PostgreSQL และ frontendเดิม ไม่สร้าง auth/password storeคู่ขนาน
ถ้าไม่มี source/checkoutให้ขอไฟล์ก่อน ไม่แต่งผลตรวจ

## อ่านก่อนทำ

- AGENTS.md ถ้ามี, package.json root/API/Web และ lockfile
- docs/acceptance/phase2-independent-review-20261007.md
- docs/decisions/010-account-recovery.md โดยเฉพาะ consistency/session revocation/delivery/rollout
- docs/decisions/005-auth-authorization.md และ 006-auth-ui.md
- docs/operations/data-retention-deletion.md, docs/handoff/FINNTECH_PRODUCT_SPEC_TH.md
- apps/api/src/auth/{runtime,config,authorization}.ts
- apps/api/src/app.ts, tracker/stream.ts, persistence/database.ts, Prisma schema/migrations
- apps/web/src/auth/client.ts, App.tsx, tracker/Account.tsx และ Auth tests/db-test harnesses
- installed Better Auth source/types ของเวอร์ชันที่ lockfileกำหนด

Baselineก่อนหน้า root313tests/tracker184 ตามผู้ทำช่วง2; ผู้ตรวจรันfocused34ผ่าน
นี่ไม่ใช่ expected countคงที่ ให้รายงานผลใหม่จริงของคุณ

## A. ออกแบบ integration แล้ว implement ใน isolated scope

1. สรุป flow/config/routes และอธิบายว่า installed library รองรับอย่างไร
   ก่อนเขียนส่วนเสี่ยง อ่าน source/types จริง ถ้าต้องใช้docsออนไลน์ให้ใช้ official primary docs
   อย่าเดาชื่อ option/endpointจากความจำ และไม่ upgrade libraryเพื่อให้ตรง tutorial
2. ใช้ recovery config/adapters ที่ disabledโดยdefaultอย่างชัดเจน
   default runtimeเดิมและenv ownerต้องไม่เปลี่ยน signup/signin/account access
3. เปิด featureเฉพาะ test configuration และ dedicated loopback synthetic runtime
   ไม่มีช่องทางลัดที่คืน reset/verification tokenจากAPIให้clientหรือปิดauth
4. routesที่จำเป็นเพิ่มแบบexplicit allowlist เฉพาะเมื่อfeatureพร้อม
   featureปิดต้องไม่เปิดroute/UIที่ใช้งานได้ ห้าม wildcardเปิดAuthทุกroute
5. forward migrationถ้าจำเป็น ให้เพิ่มไฟล์ใหม่และทดสอบเฉพาะtargetใหม่
   ห้ามแก้migrationเก่า/migrate/reset/prepareบนฐานownerหรือtestฐานอื่นที่ไม่ว่าง
6. ให้ account/UI capabilityสะท้อนserver configurationจริงอย่างน้อยเท่าที่จำเป็น
   ไม่ใช้VITE_* secret หรือ frontend flagเปิดrouteฝั่งserver

## B. Verificationและrecovery flows

- บัญชีใหม่ใน recovery test mode ต้องverifyก่อนเข้าfinance/recovery
  ไม่auto-signinหลังverification; ยืนยันแล้ว loginปกติด้วยauthเดิม
- แยก emailVerified ของAuthUserจากowner mapping state VERIFIED
  การสร้างAuthIdentity/TrackerUserเดิมไม่เท่ากับยืนยันอีเมล
- สมัครสำเร็จแต่ยังไม่มีsessionต้องแสดง “รอยืนยันอีเมล” อย่างตรงผล
  ไม่รายงาน rollbackหรือให้สมัครซ้ำเพราะreadAccountยังไม่signed-in
- “ลืมรหัสผ่าน” รับอีเมลและตอบgenericตามdecision010
  existing verified/unknown/unverified ต้องไม่เผยว่าบัญชีไหนมีอยู่
- ส่งresetเฉพาะverified synthetic mailbox; unverifiedใช้verificationflowที่ถูกต้อง
  บัญชีเดิมที่ยังunverifiedต้องพิสูจน์passwordปัจจุบันก่อนเริ่มยืนยันตามdecision010
  ห้ามacceptclientemailVerifiedหรือpromotefixture/บัญชีเดิมอัตโนมัติ
- GET/linkscannerไม่เปลี่ยนpassword; reset POSTใช้12–128ตัวอักษรและconfirmation
- resetสำเร็จต้องrevokeทุกdatabase sessionและinvalidatechallengesเก่าตามdesign
  ไม่auto-signinและไม่เปลี่ยนowner UUID/ข้อมูลการเงิน
- tokenปลอม/หมดอายุ/ใช้แล้ว/แข่งกันต้องถูกปฏิเสธตามcontractที่ตรวจได้
- tokenอยู่memoryเท่านั้น ล้างaddressbarเมื่อเข้าflowอย่างเหมาะสม
  no-store/no-referrerและCSPตามdecision; exact same-origin callback/path allowlist
  ไม่ใช้Host/forwardedheaders/client inputเป็นauthorityของlink origin
- outcomeunknownหลังresetไม่เท่ากับrollback ไม่auto-resubmitรหัสผ่านใหม่
  ให้ตรวจด้วยloginปกติ/ขอลิงก์ใหม่ตามผลที่ยืนยันได้ ไม่เปิดstatusendpointคืนcredential

อายุreset15นาทีและverification24ชั่วโมงจากdecision010เป็นข้อเสนอ:
ใช้ค่าexplicitเหล่านี้ใน isolated testsเพื่อพิสูจน์expiryได้ แต่ระบุว่าไม่ใช่policyอนุมัติสำหรับข้อมูลจริง
อย่าactivateค่าหรือrequireEmailVerificationกับบัญชีเดิมโดยอัตโนมัติ

## C. Deliveryและtoken handling

- มีserver-only delivery interfaceและlocal synthetic sink/testoutbox
  harnessอ่านmessage/tokenภายในที่จำกัดสิทธิ์; ไม่สร้างpublicmailboxหรือtoken-readAPI
- ห้ามส่งอีเมลไปผู้รับจริง/providerภายนอกหรือขอkey/passwordผ่านแชต
- ไม่lograwmessage/link/email/password/hash/token/cookie/DB URL
  redactpath/query/body/errorทั้งappและdeliveryที่เกี่ยวข้อง
- durable retry/bounded lifetimeต้องไม่เป็นfire-and-forgetที่processดับแล้วงานหายเงียบ
  retrydeliveryไม่ต่ออายุtokenเองและไม่ส่งซ้ำไร้ขอบเขต
- ถ้าต้องpersistpayloadที่มีtoken ให้เลือกการป้องกันที่ไม่ทำให้hashedverification
  ไร้ความหมาย เช่น encryptedminimalpayloadพร้อมserver-onlykey/expiry
  อย่าเก็บplaintextresetlinkในlog/backupทั่วไปหรือเพิ่มkeyเข้าfrontend
- deliveryfailureยังตอบgenericที่ไม่เผยบัญชี แต่มีinternalstatus/reasoncodeที่ปลอดภัย
  ทดสอบ restart/duplicate/retry/expiry; testoutboxไม่ถือว่าmaildeliveryจริงผ่าน
- แยกaccount/IPrate-limitให้ตรวจได้โดยไม่logอีเมล; topologyproductionยังไม่อยู่scope

## D. Consistencyและauthorization gates — ต้องพิสูจน์ก่อนเปิด

- พิสูจน์กับPostgreSQLจริงว่าconsume challenge/passwordchange/sessionrevocation
  และผลตอบกลับไม่เกิดsuccessเท็จเมื่อขั้นตอนบางส่วนล้ม
- อย่าถือprismaAdapter transaction:trueหรือlibraryoptionเป็นหลักฐานว่าflowทั้งหมดatomic
- serializeoperationsของAuthUserเดียวกันตามlock orderที่ไม่ชนledger
  concurrent tokenเดียวสำเร็จหนึ่งครั้ง และreset challengesเก่าใช้ต่อไม่ได้
- ถ้าatomic acrossstepsทำไม่ได้ ต้องมีdurable security barrierตามdecision010
  ปฏิเสธauthorization HTTP/WSของsubjectที่pending/failureจนrepairสำเร็จ
  default normalusersต้องไม่ถูกล็อก/เสียข้อมูลจากการเพิ่มbarrier
- ตรวจrequireOwner, /api/me และWSmarket/stocksทั้งupgradeและrevalidation
  DBlookupfailureต้องfailclosed ไม่มีเส้นทางอื่นbypassbarrier/emailgate
- วัดเวลาที่WSตรวจพบrevocation/ปิดจริงรวมlatency/failure
  อย่าอ้างทันทีหรือ<=5sเพียงเพราะtimerเดิม5s
- faultinjectionหลังconsume/passwordupdate/before-sessionrevoke/deliveryenqueue
  และrestartต้องมีผลที่ตรวจได้ พร้อมวิธีrepairที่ไม่bypasspassword/session
- ถ้าบางgateยังพิสูจน์ไม่ได้ ให้เก็บfeaturedisabledและรายงานFAIL/NOT TESTED
  ไม่เปิดrouteจริงเพื่อทำให้หน้าUXดูครบ

## E. พื้นที่ทดสอบและแบบพื้นที่ข้อมูลจริง

สร้างtesttargetใหม่เฉพาะช่วงนี้ แยกdatabase/role/volume/ports/origin/envจากownerและfixturesเดิม
ตรวจguardก่อนmigrationsหรือเขียนfixtures ทุกบัญชี/อีเมล/รหัสผ่านเป็นสังเคราะห์
เก็บvolumeหลังstop ไม่drop/resetnonemptytargetเพื่อให้testsผ่าน
ไม่แก้apps/api/.envเดิมหรือใช้ข้อมูลowner/logincredentialsเดิมในharness

ทำrunbookและenv.examplesสำหรับพื้นที่ข้อมูลจริงแยกจากtestเท่านั้น
ไม่สร้างบัญชีจริง ไม่ย้ายfixture/DEMO และไม่เปิดfeatureจริงในช่วง3A
ระบุinputsช่วง3B: deliveryจริง/วิธีกู้การเข้าถึงในเครื่อง, token/rolloutpolicy,
secrets/keycustody, backupstorage และตำแหน่งฐานจริงที่เจ้าของต้องเลือก

## F. Testsและหลักฐาน

ต้องมี unit/config/UI tests และ PostgreSQL isolated integration ตามscenarioA01–A12ในdecision010
แบ่งcoverageที่ทำจริงจากNOT TESTEDชัด ไม่ใช้mocksแทนtransaction/sessionruntime
ขั้นต่ำพิสูจน์:
- defaultfeatureoffคงbehavior/routes/accountaccessเดิม
- signup→awaitverification→verify→loginและownerUUIDเดิม
- invalid/expired/replayed/wrong-subject tokensและno-session-afterverification
- unknown/unverified/verifiedresetgenericstatus/bodyและtimingdistributionที่วัดได้
- oldpassword/oldsessionsใช้ไม่ได้หลังreset, HTTP/WS/restart/failurebarrier
- wrong/missingOrigin/externalcallback/Hostinjectionถูกปฏิเสธ
- deliveryfailure/retry/expiryและข้อมูลledgerก่อนหลังไม่เปลี่ยน
- reset outcomeunknownไม่auto-resubmitหรือเผยtoken

Browserใช้ตามpermissions/confirmationของเครื่องมือ; ถ้าขั้นเปลี่ยนcredentialต้องให้ผู้ใช้ทำเอง
ให้รายงานข้อจำกัดและใช้backendharnessกับบัญชีสังเคราะห์พิสูจน์ส่วนที่ทำได้
ห้ามbypassconfirmationของเครื่องมือเพื่อทำbrowsertest

รันroot/trackertests, typecheck, builds, package smoke, Prisma validateและgit diff --check
เก็บexit/countจริงและfinal-resultsที่แยกattempts หากenvironmentไม่พร้อมให้รายงานตรง
ทำchecksที่ไม่ติดdependencyต่อจนเสร็จ ไม่ซื้อ/ติดตั้ง/อัปเกรดเพื่อเดาวิธีแก้

## สิ่งที่ต้องรักษาและนอกscope

Navigation/modal/pendingguardจากช่วง1–2, Decimal/ledger/ownership/idempotency,
stale30s, backupformatและข้อมูลownerเดิมต้องคงอยู่
ไม่เปลี่ยนFX/download/retention/deletion/schedulerในรอบนี้ ไม่เปิดaccountlinking/adminbypass
ไม่commit/push/deploy/เปิดpublicexposureหรือส่งข้อมูลจริงออกภายนอก
ถ้าจำเป็นต้องเพิ่มdependencyให้เสนอชื่อ/เหตุผล/ขอบเขตก่อน ไม่เพิ่มmailSDKโดยไม่มีproviderที่เลือก

## ส่งงานให้review

รายงาน phase3a-review-<วันที่จริงAsia/Bangkok>.md + incremental.patchรวมไฟล์ใหม่
มี flowdiagram/routes/config/migrations และเหตุผลintegrationchoices
ตารางscenarioA01–A12: PASS/FAIL/NOT TESTEDพร้อมenvironment/evidence
commands/counts/exit, sanitized logs/summaries และdata-invariantcomparisonของtesttarget
ระบุfeaturedefaultoffและยืนยันว่าownerenv/DB/sessionไม่ถูกเปลี่ยน
แยก deliverysink PASS จากproviderจริง NOT TESTED
เสนอpolicy/activationinputsสำหรับ3Bโดยไม่ถือค่าproposedเป็นอนุมัติ

แก้ถ้อยคำbaselineในรายงานช่วง2ด้วย: ก่อนช่วง2มีmobile nav6รายการอยู่แล้ว
การเปลี่ยนคือ6รายการ→4+More ไม่ใช่จากไม่มีbottomnav
รักษารายงานmatrix70ก่อนCSSdelta + finalsheet4ตามหลักฐาน ไม่อ้าง70รุ่นสุดท้าย

เริ่ม3Aได้เลย ทำส่วนisolatedที่ได้รับscopeนี้ให้ครบ แล้วหยุดส่งreview
ห้ามactivaterecoveryให้บัญชีownerหรือเริ่ม3Bโดยอัตโนมัติ

---
