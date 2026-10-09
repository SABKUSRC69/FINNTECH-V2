# FINNTECH — พรอมป์เตรียมและ deploy Closed Beta ฟรี

วันที่ 2026-10-07 Asia/Bangkok
เจ้าของต้องการทดลอง deploy ให้ผู้ใช้เข้ามาลองแล้ว เป้าหมายนี้แทนข้อห้ามdeployแบบรวมในพรอมป์เก่า
ยังรักษางาน/ข้อมูลเดิมและข้อจำกัดค่าเพิ่มศูนย์ ไม่อนุญาตซื้อบริการหรือเปิดเผยsecrets
ต้องเลือกโหมดข้อมูลและtargetจากเจ้าของก่อนเปิดรับผู้ใช้ ไม่ถือpreselectedoptionว่าเป็นคำตอบ

คัดลอกข้อความหลังเส้นคั่นส่งให้ AI ผู้ลงมือทำ

---

คุณเป็นผู้ลงมือเตรียมและ deploy FINNTECH สำหรับผู้ใช้ทดลองกลุ่มเล็ก
Repository: C:\Users\Admin\Downloads\FINNTECH
เป้าหมายล่าสุดคือ deploy ให้คนลองจริง พักredesignก่อน
ใช้tracker apps/web + apps/api + packages ไม่deploylegacy src/เป็นเว็บหลัก

## 1. รับinputที่จำเป็น พร้อมทำงานที่ไม่ขึ้นกับinputต่อ

ถามให้ชัดและไม่ขอsecretในแชต:
- online Closed Beta หรือเฉพาะLAN
- ผู้ใช้จริงใช้ข้อมูลทดลองสมมติ หรือจะให้เก็บข้อมูลการเงินจริง
- โฮสต์/บัญชี/โดเมนที่มีอยู่ ถ้าไม่มีเสนอ Render Free + Neon Free เป็นcandidate
- รายชื่อ/วิธีเชิญและจำนวนผู้ใช้เริ่มต้น

สร้างไฟล์deployและทดสอบlocalก่อน ไม่หยุดแค่เสนอแผน
หากคำตอบยังไม่มา เตรียมconfigurationแบบplaceholderเท่านั้น ไม่สร้างcloudtargetหรือactivateข้อมูลเอง
หากไม่มีบัญชี/สิทธิ์ ให้เจ้าของlogin/เชื่อมGit providerผ่านUIเอง ไม่รับpassword/token/DBURLในแชต
การเลือกcandidateในเอกสารนี้ไม่ใช่การยืนยันว่าownerมีบัญชี/ยอมใช้ข้อมูลทดลองแล้ว

## 2. อ่านbaselineและpreserve

- AGENTS.mdที่เกี่ยวข้องถ้ามี
- docs/acceptance/phase3a-independent-review-20261007.md
- docs/acceptance/system-remaining-20261007.md และrecovery/backupdecisions/runbooks
- package/lockfile, apps/api/src/{server,app}.ts, auth/config/runtime/authorization,
  tracker routes/stream และ apps/web/vite.config.ts
- Prisma schema/migrations ทั้งหมดและจริงบนtargetต้องใช้directmigrationconnectionที่รองรับ

Working treeมีchangesของownerและapps/packages/docs/scriptsยังมีuntrackedจำนวนมาก
สร้างbaselineรวมuntrackedแล้วเก็บไว้ ห้ามreset/cleanหรือcommitทุกอย่างด้วยgit add .
ก่อนGitpush/exportimage ตรวจallowlistของไฟล์releaseและsecret/privatefileexclusionsจริง
ไม่เปลี่ยนrepo visibilityเป็นpublic ไม่อัปโหลด .env, *.local, mailbox, dumps,
backups.private.local, credentials หรือsession evidence
หากremoteยังไม่มีtrackersourceให้เตรียมreleasebranch/snapshotจากworkingtreeอย่างระวัง
ห้ามdeployHEADเก่าหรือapplyincrementalpatchไปcheckoutที่ไม่มีbaselineตรงกัน

## 3. ทางเลือกdefaultสำหรับonlinepilot: Render Free + Neon Free

ตรวจofficialdocs/pricingปัจจุบันก่อนprovision ไม่ใช้paidplan/trialที่ต้องใส่บัตร
Renderหนึ่งWebServiceเสิร์ฟcompiledapps/webพร้อมAPI/WSจากoriginเดียว
Neonเป็นPostgreSQLใหม่ของbeta แยกจากownerและfixture มีpersistentdataนอกRenderfilesystem
ใช้*.onrender.com HTTPSได้ ไม่ซื้อdomain และไม่แยกfrontend/APIให้เกิดCORSโดยไม่จำเป็น
เลือกregionใกล้กันที่Freeรองรับ ตรวจssl/driver/pool/migrationconnectionจริง
ไม่ย้ายBetterAuthไปNeonManagedAuth ไม่เปลี่ยนpasswordstore/frameworkเพื่อdeploy

ข้อจำกัดที่ต้องแจ้งผู้ทดลองและtest:
- RenderFreeพักเมื่อidle15minและspin-upประมาณ1min; filesystemไม่persistent
- RenderFreeมีusagequota และอาจsuspendเมื่อเกิน ไม่ใช้keepaliveเพื่อเลี่ยงเงื่อนไข
- อย่าเลือกRenderFreePostgresเป็นฐานเก็บระยะยาว เพราะหมดอายุ30วัน
- NeonFreeมีquota/storage/restorewindow จำกัด ต้องmonitorตามdashboardจริง
- free-tierไม่เท่ากับproductionSLA; หากsignupflowบังคับจ่ายให้หยุดส่วนนั้นและเสนอทางเลือกฟรี

## 4. Implementเฉพาะสิ่งที่จำเป็นสำหรับdeploy

- แยกexplicitcloudbeta/runtime mode จากlocaldefault
  localยังbind127.0.0.1และรักษาPORTguardsเดิม
  cloudmodeตรวจPORTเป็นintegerและbind0.0.0.0ตามprovider ไม่แก้localให้เปิดทุกinterfaceโดยปริยาย
- ใช้productionbuild ไม่รันVitedev/HMRเป็นpublicserver
- compile/generatePrismaในLinux/cleancheckoutแล้วbuildshared/API/Webตามdependencyorder
  เริ่มcompiledAPIด้วยNode22.12+สาย22หรือ24ที่โครงการรองรับ
  WEB_DIST_DIRต้องชี้apps/web/distถูกตามcwdจริง; /api404ต้องไม่คืนSPA
- อย่าใช้npm run deployเดิม ซึ่งtargetlegacyGitHubPagesและไม่มีAPI/PostgreSQL
- ทำmanifest/render.yamlหรือDockerfile/startscriptsที่ตรวจได้ และhealth/readinessที่แยกDBfailure
- DATABASE_URL/BETTER_AUTH_SECRETอยู่serversecretstoreเท่านั้น
  originเป็นpublicHTTPSexact ไม่มีsecretในVITE/browserbundle/URL/logs
- TLStermination/Securecookie/Origin/WS/CSPต้องทดสอบบนURLจริง
  ตรวจBetterAuthtrustedproxy/host semanticsจากinstalledsourceและproviderdocs
  ห้ามtrustproxy=trueหรือเชื่อX-Forwarded-Forจากทุกคนโดยไม่มีtopologyproof
- migrate deployเฉพาะtargetbetaที่เลือกและตรวจแล้ว เป็นforwardmigration
  เก็บbackupก่อนเปลี่ยนฐานที่มีข้อมูล ไม่reset/drop/truncate/reuseownerfixtureDB
- แก้readAccount recoverycapabilityกรณี/api/me401ตามreview3Aพร้อมregression

## 5. Closed Betaต้องจำกัดผู้ใช้จริงฝั่งserver

เลือกserverenforcedinvitation/allowlistที่ทดสอบได้ตามinputowner
ไม่ใช้แค่ซ่อนปุ่มsignupหรือเก็บinvitecodeลับไว้ในfrontend
ปฏิเสธanonymous/ผู้ไม่ได้เชิญและowneroverride; ทดสอบdirectAuthAPI/HTTP/WSbypass
ทำratelimitsที่เหมาะกับproviderpeer/proxyและsingleinstancebeta
ไม่logrequestbody/password/token/DBURL ไม่เผยaccountenumerationโดยข้อความerror
หยุดรับผู้ใช้ใหม่ได้โดยไม่ลบข้อมูล/ปิดownerbackupaccess

ถ้าownerเลือกข้อมูลทดลอง:
- ผู้ทดลองมีบัญชีจริงของตนเองและข้อมูลสมมติเท่านั้น ไม่ใช้sharedDEMOcredential
- แสดงBeta/ข้อมูลทดลองและrecoverylimitationsตรงจริง
- TRACKER_RECOVERY_MODE=off สำหรับcloudbetaจนมีrealrecoveryที่ผ่านrollout
  ห้ามเปลี่ยนguardsynthetic-3aหรือใช้encryptedtestmailboxเป็นช่องทางของผู้ทดลอง
- ไม่มีadminpasswordoverride/ownershiptransferที่เดาขึ้นเพื่อกู้บัญชี
- betaDBไม่promoteเป็นreal-datastoreโดยอัตโนมัติในภายหลัง

ถ้าownerเลือกข้อมูลการเงินจริง:
- ทำงานระบบ/เตรียมdeployต่อได้ แต่ก่อนเปิดรับข้อมูลปิดrecovery/backup/keycustody/
  retentionและonlineacceptanceที่เกี่ยวข้องตามreview3Aและ3Bจริง
- ระบุblockerที่ทำซ้ำได้และแก้ที่necessary ไม่อ้างว่าเปลี่ยนNODE_ENVแล้วพร้อม
- การใช้freeplanไม่ใช่หลักฐานว่าข้อมูลได้รับbackup/recoveryครบ

## 6. Acceptanceบนrelease/URLจริงก่อนเชิญผู้ใช้

เก็บsourcecommit/buildhash และtargetที่ไม่เปิดเผยsecret
ทดสอบสองบัญชีผู้เชิญและผู้ไม่ได้เชิญ:
- Signup/login/logout/reload, ownerisolation, anonymousdenial, forgedOrigin
- THB/USDT/USD/Decimal, ledger/budget/cash/cryptocorrections,
  duplicate/lost-response retries payload/keyเดิม
- HTTPS/Secure/HttpOnly/SameSitecookie, CSP/assets, APIJSON404, deep-links
- WSผ่านwss/reconnect/revokedcookie; providerstale30s/outage/N/Aตามจริง
- JSONdownloadไฟล์บันทึกจริง/schema/credentialscan และrestoreเข้าบัญชีว่าง
- restart/redeploy/sleepwake: ข้อมูลอยู่ครบ sessionbehaviorถูกต้อง
  Neonautosuspend/coldconnectionต้องrecoverได้ ไม่อ้างhealth200ว่าloginสำเร็จ
- noenv/secrets/mailbox/dumpในrepo/image/build/logs
- backuprestoreบนisolatedtargetและแผนrollbackที่ไม่ย้อนmigrationด้วยdrop/reset
- regression/build/typecheck/smokeและdependencyauditตามsourcechange

browsercredentialต้องให้มนุษย์takeoverตามtoolpolicy ไม่ขอให้ส่งรหัสมารายงาน
testที่ทำไม่ได้ให้ระบุNOT TESTED ไม่รับรองPASSจากภาพหน้าจอหรือunitmock

## 7. ทำdeployตามขอบเขตที่ownerเลือกและส่งมอบ

คำขอownerล่าสุดอนุญาตทดลองdeployแล้ว ไม่ต้องขออนุญาตdeployซ้ำเพียงเพราะพรอมป์เก่าห้ามไว้
แต่ต้องมีtarget/accountaccess/datamodeจริงก่อนdependentexternalactions
บัญชีและcredentialsให้ownerตั้งผ่านproviderUI/secretstore ไม่ส่งมาแชต
ทำfiles/checksและconfigurationให้concreteก่อนจุดที่ต้องownerlogin/input
ถ้าtoolapprovalปฏิเสธ ให้แจ้งaction/reasonและทำส่วนที่ไม่ติดขัดต่อ ไม่อ้างdeployสำเร็จ

ส่ง: incrementalpatch/releasefilelist, deploymentURL, commit/buildhash,
checks PASS/FAIL/NOT TESTED, freeplanselected/quotas, restart/stop/backup/rollbackrunbook,
คู่มือเชิญผู้ทดลองและข้อจำกัดrecovery ห้ามส่งmail/ข้อความเชิญให้ใครแทนownerถ้าไม่ได้สั่ง
ไม่ขยายscopeเป็นredesign/news/stocks/tradingจริง

---

## แหล่งofficialที่ตรวจไว้ 2026-10-07

- Renderfree/limitations: https://render.com/docs/free
- Renderport/HTTPS/WS: https://render.com/docs/web-services
- Gitprovideraccess: https://render.com/docs/git-provider
- NeonFreeupdate2026-10-02: https://neon.com/blog/neon-free-plan-1-gb-per-project
  ระบุ1GB/project,100CUhours/project/month,6hinstantrestore ตรวจconsoleอีกครั้งก่อนสร้าง
- Neonpricing: https://neon.com/pricing (ราคาเปลี่ยนได้; pricingpageเครื่องมือopenรอบนี้ไม่รองรับcontenttype ใช้officialupdateล่าสุดและต้องตรวจdashboardก่อนprovision)
- CloudflareQuickTunnelทางเลือกdemoจากคอม:
  https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
  free/randomURL/testingonly ไม่มีSLA ต้องเปิดเครื่อง และไม่ใช่defaultpersistentbeta
