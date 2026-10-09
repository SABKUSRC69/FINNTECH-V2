# เทียบผล Claude Code กับ working tree ในเครื่อง

2026-10-07 Asia/Bangkok — read-only source/Git inspection ไม่แก้แอปหรือcommit/push/deploy

## ข้อสรุป

รายงานClaudeที่เจ้าของส่งมาระบุว่าcheckout/branchesที่Claudeเข้าถึงมีเพียงlegacydemo
ส่วนเครื่องนี้มีtrackerจริง แต่apps/packages/docs/scriptsทั้งหมดไม่อยู่ในGitindex/HEAD
จึงเป็นคนละsource snapshot ไม่ใช้รายงานนั้นสรุปว่าtrackerในเครื่องไม่มีหรือสูญหาย
ห้ามเริ่มสร้างtrackerใหม่จากศูนย์ก่อนตรวจ/ส่งต่อworkingtreeที่ถูกต้อง

## หลักฐานที่ตรวจเอง

- CWD C:\Users\Admin\Downloads\FINNTECH
- branch main; HEAD bd1ba14 `fix: version service worker registration`
- origin https://github.com/SABKUSRC69/FINNTECH.git
- git ls-files apps packages docs scripts: 0 paths
- git status: apps/, packages/, docs/, scripts/ เป็นuntracked; package.json/lockfileและlegacyมีmodificationsเดิม
- package.jsonในworkingtreeมีworkspacesและtracker scripts; HEAD:package.jsonไม่มีtracker scripts
- apps/web/package.json, apps/api/src/auth/recovery.ts และรายงานindependentreview3Aมีอยู่จริง/nonempty
- Dockerfile.beta/render.beta.yaml/compose.beta-rehearsal.yamlมีอยู่เป็นuntrackedด้วย
  การมีไฟล์ไม่ใช่หลักฐานว่าbuild/deployผ่าน และไม่ได้reviewbetaimplementationในรอบนี้

ไม่ได้fetchหรืออ่านliveGitHubbranchesใหม่ จึงไม่อ้างยืนยันremoteปัจจุบันด้วยตนเอง
TAN888/gh-pagesและผลremoteที่ไม่มีtrackerเป็นข้อสังเกตของClaudeตามรายงานที่ส่งมา
การอ่านlocalcachedremote refsไม่ใช่หลักฐานliveGitHub

## ใช้ผลClaudeอย่างไร

- เก็บผล53tests/buildและassetcomparisonเป็นผลของtrackedlegacysnapshotที่Claudeตรวจ
  ไม่ใช้แทนผลtrackerหรือเปรียบเทียบcountsโดยถือว่าเป็นsourceเดียวกัน
- advisories8high/2moderateมาจากlockfile/scratchinstallationของClaude
  ต้องตรวจlockfileปัจจุบัน/รายละเอียดadvisoriesอีกครั้ง ไม่เหมารวมว่าcurrenttrackerมีผลเดียวกัน
- ข้อเสนอfloat/storagewrite/demo-bannerต้องมีfile:line/triggerและเทียบcurrentcodeก่อนแก้
- ข้อเสนอbuildtrackerใหม่ไม่เหมาะกับworkingtreeนี้ เพราะมีimplementationอยู่แล้ว
- รีวิวเดิมอนุญาตสร้างรายงานใหม่ได้ คำว่าauditไม่ได้ห้ามเขียนเอกสาร
  การที่Claudeไม่สร้างreportไม่ใช่ผลตรวจความพร้อมของระบบ

## งานถัดไปก่อนdeployจากGitHub

1. ให้ผู้ตรวจเข้าถึงworkingtreeจริงในเครื่อง หรือsanitizedsnapshotที่รวมuntrackedจำเป็น
2. ตรวจreleasefileallowlistและdependencylock/schema/migrations/build/startครบ
3. ตรวจsecrets/privateenv/mailbox/dumps/backups/evidenceก่อนstaging/upload
   ไม่git add . ไม่forcepush ไม่เปลี่ยนrepovisibilityหรือทับงานเดิม
4. เตรียมreviewablereleasebranch/manifest/diff แล้วpublishตามscopeที่เจ้าของอนุญาต
5. ตรวจจากcleancheckoutของreleasecommitอีกครั้ง เพื่อพิสูจน์ว่าไฟล์ครบและbuildได้จริง
6. deploytrackerพร้อมAPI/PostgreSQLตามbetaplan ไม่ใช้legacy npm run deployโดยเดา

## แก้ข้อเสนอGitHubPagesเดิม

นอกจากstatic-onlyแล้ว GitHubPageslimitsยังระบุว่าไม่ควรใช้กับsensitivetransactions
เช่นส่งpassword/cardnumbers และไม่ให้ใช้เป็นfreehostingสำหรับcommercialSaaS
ดังนั้นไม่แนะนำPagesเป็นหน้าล็อกอินของtrackerนี้ แม้มีAPIภายนอก
ใช้GitHubเก็บsourceและCI แล้วใช้webhostสำหรับtracker/APIเหมาะกว่า
แหล่งofficial: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

ไม่มีการติดตั้งdependencies/runfulltests/เปิดDB/browser/scansecretvalues/แก้sourceในรอบนี้
