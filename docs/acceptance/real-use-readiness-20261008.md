# FINNTECH real-use readiness — 8 ตุลาคม 2026

**สถานะ: BLOCKED สำหรับ public real-data activation; implementation/preparation ส่ง review ได้ ยังไม่ใช่ release ที่พร้อมใช้งานจริง** ไม่ commit/push/deploy, ไม่เปิด public registration, ไม่แตะฐาน cloud Beta หรือ recovery enrollments เดิม ไม่ย้าย DEMO เป็นข้อมูลจริง ไม่มีซื้อบริการ/dependency ใหม่

Owner input: ไม่มี owned domain; อนุมัติทดสอบ Brevo Free ก่อน public; ยอมรับ sleep/no SLA; Windows เป็น backup runner, Google Drive ที่มีอยู่สำหรับ encrypted off-device และ Gmail private recipientสำหรับ alerts Folder/recipientจะให้แบบส่วนตัวตอน setup ยังไม่ได้ให้จริง ไม่ตีความ placeholders เป็น operational configuration

## สิ่งที่ทำและผลก่อน/หลัง

- DEMO reconciliation fix ที่เตรียมไว้ตรวจซ้ำและรักษาไว้: signed-in/out expectationต้องตรวจพบก่อนปลด lock ไม่ตีความ timeout เป็น rollback ใช้หลักเดียวกันกับ normal real logout (accepted/lost response) Navigation/payload/keyเดิมคงอยู่ ไม่มี UI redesign
- เพิ่ม `cloud-real`/`real-rehearsal` แบบ fail closed: exact selected HTTPS origin/DB/role/TLS, singleton database boundary, closed signup default, verified empty owner accountไม่มี auto seedหรือpromotion Recovery off ใน Betaยังอยู่เหมือนเดิม
- Better Auth **1.7.7**, Prisma **7.10.0** ตามของติดตั้งเดิม Real enrollment/verification/resetใช้atomic transaction/hash/revocation integrationเดิม New Brevo HTTPS sink/encrypted durable outboxแยกจาก LocalSyntheticSink TokensในfragmentและPOSTconfirmป้องกันscanner GET consume, expired/replayedใช้ไม่ได้ ไม่คืน token/mailbox/provider bodyให้caller
- Queue claim/first attempt/lease commitก่อนprovidercall Retry original job ID, ≤4ครั้ง, exponential backoff; ไม่ retryหลัง14นาทีจากfirst attemptเพราะBrevo dedupe15นาที Request body16KiB/3s, HTTPtimeouts10s, exactOrigin, ignoreforwardedIPเพื่อป้องกัน spoofedproxy ratebypass; DBfixedbudgetbucketsร่วมworkers ไม่มีattacker-controlledcounterkeygrowth Production proxy acceptanceยังไม่ได้ตรวจ
- Caps100accounts/100mailattempts rolling24h/256MiBDB default; per-useroutbox1000total/4pending, no automaticdeletion; storagepauseทำให้writeใหม่503/ready503 แต่ existing receiptยังตรวจด้วย payload/keyเดิมได้ ไม่เปลี่ยนDecimal/ledger/30spricepolicy
- UIขั้นตํ่าreal recovery/verification/signupstatus, closedsignupdisabled, authenticatedrealaccountข้อความpersistent, syntheticrehearsalbannerและThaiprivacyข้อจำกัด/adminvisibility/publicsupportsettingแยกจากprivate Gmail alerts
- เตรียมportable AES-256-GCM full DB archive+authenticatedrestore, readonlybackup target guard, Google Drive owner/quota/permissions/upload-journal/same-IDlostresponse/download verification, private coarse receipt, Windows wrapperและindependentwatchdog reviewtemplate ยังไม่ได้activate/providerconfigure

## หลักฐานและ checks

Node local **24.18.0**, Docker Linux PostgreSQL **18**, Windows PowerShell Actual logsอยู่ `evidence/real-use-20261008/` Countsแต่ละsuiteทับซ้อนกัน ไม่รวมเป็นtotalเดียว

| Command / operation | ผลจริง | Exit | ขอบเขต |
|---|---|---:|---|
| `npm test` final | PASS: **46 files / 394 tests** | 0 | root+tracker overlapping; backup/Drive mocksรวม8 tests |
| `npm run build` | PASS | 0 | root legacy build;ไม่มีlegacysourceเปลี่ยน |
| `npm run tracker:typecheck` final | PASS | 0 | finance/contracts/API/web รวมdbtest types |
| `npm run tracker:test` final | PASS: finance21 + contracts13 + API123 + web100 = **257** | 0 | plusVite dev smoke และreleased4175 |
| `npm run tracker:build` final | PASS | 0 | API/shared/frontendcompiled |
| `node --no-strip-types scripts/tracker-package-smoke.mjs` | PASS | 0 | compiledDecimal/crossinstance/contracts/ledger |
| `node --env-file=<private-rehearsal-env> --import tsx --test apps/api/db-test/real-use.integration.ts` | PASS: **16 tests** | 0 | PostgreSQL18/BA1.7.7 จริง, **mail HTTPtransportจำลอง**, syntheticonly |
| `node --no-strip-types --env-file=<private-rehearsal-env> scripts/real-migration-rehearsal.mjs` | PASS:9forwardmigrations | 0 | secondfresh5445schema ไม่resetfirstfailure |
| `node --no-strip-types --env-file=<private-rehearsal-env> scripts/real-backup-rehearsal.mjs` | PASS: fullrestore **27 tables** | 0 | freshnetwork-none isolatedtarget /alltablehash/schema/constraintbehavior |
| `docker build -f Dockerfile.real -t finntech-real-review:20261008 .` final | PASS | 0 | localonly ไม่push |
| localimage inventory/secretscan | PASS:119packages/4707files, randomizedsyntheticsecretmatches0;42locallogsmatches0 | 0 | arbitrary/realcloudsecretsยังไม่ตรวจ;imageOSCVEs NOTTESTED |
| PowerShell wrapperparser | PASS syntaxonly | 0 | wrapperrun/taskregistration NOTTESTED |
| `git diff --check` | PASS | 0 | trackedfiles;incrementalpatchตรวจแยกด้วยgitapply/hash |
| `npm audit --omit=dev --json` | **FAIL audit:5 high package findings** | 1 | CLI/build/optional graph ต่างจากruntimeinventory |

Actual isolatedcases: verifiedempty2owners, foreignread/mutation/exportdenial, exactTHB/USDTDecimalstrings, originalkeyretry/changedpayload409, ownedemptypreview/consentrestore+IDremap+nonemptydeny, authaccount/logouts/newHTTPclient/recreatedDBclientpersistence, scanner/expiry/replay/enumeration, atomicfaultrollbackหลังpasswordupdate, concurrentresetconsumeonce/HTTPnewWS401/existingmarket+stocksWSrevocation(~5s), sessionexpirydataintact, durableprovidermockfailure/restart/dedupewindow, body/rate/account/storageguards. Browserchangeในtestเป็นindependentHTTPcookiejars **ไม่ใช่สองphysicalbrowserprofiles**

Fullrestoreevidence SHA256 `0e5781865233690a97441b04cfbcf0eefcb218c4e48e5b427163644e79a89dff`; dump customในRAM→encrypt→independentkeypathcopy→authenticateก่อนpg_restore;sourcebefore/afterunchanged เทียบallpublictables+columns+constraints+functions+triggers+indexes+auth/audit/receipts Testsnapshotเป็นของrunก่อนlaterintegration fixtures;schemaเดิม ไม่มีการอ้างว่าทุกsnapshot/productiontested Keycopyอีกpathบนเครื่องนี้ไม่ใช่machine-lossdrill

Local browserเปิด compiledrehearsal4198 จริงและใช้Enterเปิด/กลับrecovery เก็บlogin/recoveryภาพและDOMoverflowที่320/390/768/1280/1440 light/dark ไม่พบpageoverflowใน**unauthenticatedrecovery page** ไม่ขยายผลเป็นfullallpageskeyboard/modal/touch/HTTPSmailflowaccepted ไม่มีexternalfinancialdataส่งออก แก้locatorจากAXcheckboxเป็นDOMbuttonตามsnapshotเมื่อครั้งแรกno matches ไม่เปลี่ยนUIเพื่อให้testผ่าน

## FAIL ที่พบระหว่างงานและการแก้

1. Firstfreshmigration exit1: unquoted `window` reservedword แก้เป็นquotedidentifier Forwardrepairเฉพาะemptytaskfixtureและretainfailedreceipt;9migrationsผ่านsecondfreshschema ไม่drop/resetownerDB
2. Earlyintegration exit1: BA3/10 signinrateในharnessและassertglobalcountsจากfixturesที่เก็บไว้ แก้waitตามrateเดิม/assertnewpairเทียบbaseline ไม่ลดguards/skipassertions Final16ผ่าน
3. Firstfullrestore exit1: PostgreSQL18rewritescastใน CHECKสองตัวทำให้exacttextdigestต่าง แก้**เฉพาะknownexactspellingwhitelist**และทดสอบ12valid/invalidenumcasesrollbackทั้งsource/target Unknownschema/hashmismatchยังfail เก็บfirstfailedtarget ไม่reset และfreshverifiedtargetผ่าน
4. Firstroot exit1:ใช้node:testในscriptที่rootVitestdiscoverเป็นemptysuite เปลี่ยนtest runnerเป็นVitest ไม่skip Backup/Drivetestsยังตรวจ behavior;temporarymagiclengthassertionแก้จากhardcoded17เป็นactual18
5. Typecheck exit2: discriminatedrecoveryunionของoldsynthetictestและtypedUUIDdefaultในnewtesthelper แก้narrowing/key:string Productionpayloadไม่ได้เปลี่ยน
6. Sandboxenvironment:root tests46filesno tests `EPERM realpath` exit1; Dockerlock/APIpipeEACCES exit1;localserverDBconnectEACCESexit1;Vite configmodulepathimportdenialexit1 ต่อด้วยapprovedlocalfile/engine/networkaccessแล้วfinalchecksผ่าน ไม่มีautomaticreviewrejection ยังเก็บfailedlogsไม่รายงานเป็นfunctionalcodefailure

## Runtime dependency audit / identity

Final localimage tag `finntech-real-review:20261008`, config/imageID **sha256:6d5c1521051e8a227b406c92b918037df1115efefba54925dcce3ea58e8c6921**;manifestlist **sha256:29fe001ee8c51347f630db3a75de5cbb6d1df6b90817d6a8d131f14811658443** ดูbuildlog/inventory/release-scanและchanged-filesmanifestสำหรับactualcontentSHA ไม่มีnewcommit/sourcecommitที่อ้างได้เพราะdirtycheckout Source snapshot/patch เทียบtask-startbaseline ไม่เทียบrootHEADทั้งหมด

5highคือ `prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`, `source-map-js` ตามnpmJSON;ทั้ง5ไม่อยู่ใน119packagefinalimage inventory (CLIgenerator/config/optionalMySQL/buildsourcemapgraph) Runtimeใช้PostgreSQLadapterไม่มีMySQLendpointและไม่รับuserbuildconfig No runtime reachabilityพิสูจน์ในreleaseนี้สำหรับ5packages **ไม่ได้หมายถึงzero vulnerabilities** retainauditfindings;หากupgradeCLI/buildให้แยกPRและretestไม่downgradePrisma/forcefix ส่วนNode/DebianimageCVEs/fullSBOMscanner/providercontaineranalysisและbuildsupplychainยังNOTTESTED

## Launch blockers และ NOT TESTED

Code/config/schema snapshot identity: **844e67eed5b52ce552e2ab6d9ef5bf25d08df6adfb7838520b2a41b9fd0eae58** จาก 86 inputs ใน `evidence/real-use-20261008/source-snapshot.json` ไม่รวม binary assets/generated/tests/private files; complete built release ใช้ image digest ข้างต้น Public evidence logs normalize CRLF/trailing whitespace เท่านั้น raw logs เก็บใน ignored task directory Patch receipt เป็น sidecar เพื่อไม่สร้าง hash อ้างตัวเอง

- Brevo owneraccount/senderapproval/APIprivate setup, actualGmail/testmailboxesdelivery/spam/browserverify/reset/noticeยังNOTTESTED Free senderrewritingเป็นstopgapตามofficialsource ยังไม่รับประกันpublicarbitrarymailboxrecovery ดูsetupdoc ไม่มีโดเมนที่ownerควบคุม
- GoogleDrive exactprivatefolder/quota/permissions/OAuth/grant/7dayTestingtokenexpiry, actualencryptedupload/download/fullrestorefromDrive, separatelyrecoverablekeycustody, WindowsACL+scheduledtask, offline/failurealert→Gmailจริง **NOTTESTED/BLOCKED** Scriptprepared/mocksไม่ได้ปิดgateนี้ RPO24h/RTO4hเป็นproposed ไม่ใช่ค่าที่วัดแล้ว FiniteDrivepruneยังNOTIMPLEMENTED
- **Workingowner-verifiedaccountdeletionยังNOTIMPLEMENTED** immutableledger/auditpurgeต้องreviewและproveforeignownerpreservation/sessionchallenge/backupresurrectionsuppression ดูdata-lifecycle ไม่อ้างcontactguideคือimplementeddelete
- No selectedrealcloudresource/newcredentials/discovery/deploy/stagingHTTPSWSSจริง;Securecookies/Renderproxy/redeploy/coldwake/2physicalprofiles/browserJSONsavedfile/fullfinance/cashcorrections/networklossreleaseacceptance **NOTTESTED** Requiresconcretestagingreleaseauthorizationหลังreview ไม่มีpublicsignupturnedon
- Providercommercialterms/accounteligibilityจริง/alternativefreeruntimeproductioncompatibilityNOTTESTED RenderFreediscouragesproductionexplicitly;owneracceptssleepไม่ใช่productioncertification No billing/card/paidservicesintroduced
- Watchdogreviewtemplateไม่ได้อยู่activeworkflow,GitHubfreequota/actionSHAverification/scheduledrun/receiptfailurealertdeliveryNOTTESTED ไม่มีmonitorที่รับรองเครื่องofflineอยู่ตอนนี้

## Handoff / review decision

Reviewpatchก่อน จากนั้นownerทำBrevoFreeverifySenderและprivateAPIkey;GoogleDrivefolder/recipient+privateOAuthgrant+offdevicekeycustodyผ่านprivatesetup ไม่ส่งsecretsในchat ตั้งpublicsupportaddressแยกตามconsent Implement/provecontrolleddeletion+Driveretentionที่ค้าง และอนุมัติ**closedsyntheticstagingreleaseที่ระบุidentity**ก่อนcloudchanges เมื่อgatesครบจึงขอpublicactivationใหม่ ไม่ใช้approvalเดิมของDEMOแทน

เอกสาร: [setup/free-plan/incident/rollback](../operations/real-use-setup.md), [backup/Drive/Gmail/restore](../operations/real-use-backup.md), [lifecycle blocker](../operations/real-use-data-lifecycle.md). Artifact: `real-use-incremental-20261008.patch` รวมnewfiles/binaryscreenshots+manifest;`evidence/real-use-20261008/patch-check.json` checked/appliedtoisolatedbaselinecopyและhashreconstruction ไม่ resetcheckout

Ownprocesses:temporarylocalbrowser4198ปิดแล้ว;ownlocalserverterminatedหลังacceptance;เฉพาะ4containersproject `finntech-real-rehearsal-20261008` ถูกstopและvolumesคงไว้ ไม่มีdown-v/DBdeletion DockerDesktopซึ่งเปิดใช้สำหรับtestsยังคงrunningไม่ได้killsharedengine Ports4198/5444/5445ไม่มีlistenerเมื่อcleanupcheck ไฟล์privatearchive/keysคงignoredเพื่อreview ไม่ใส่deliverypatch
