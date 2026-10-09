> Current implementation update (2026-10-08): ดู [operator runbook](finish-real-operator-runbook.md) และ [ผลตรวจล่าสุด](../acceptance/finish-real-use-readiness-20261008.md). ข้อความ runtime NOT IMPLEMENTED ด้านล่างเป็น baseline/policy proposal เดิม ไม่ใช่สถานะโค้ดปัจจุบัน; ไม่ถือเป็น policy approval หรือ public activation.

# Real-use data lifecycle — gate ยังไม่ผ่าน

บัญชีใหม่ต้องยืนยันอีเมล เริ่มรายการว่าง ไม่มี owner/fixture promotion ข้อมูลอยู่ PostgreSQL ผูก Better Auth → authIdentity → ownerId ใช้ Decimal strings, ledger/audit/idempotencyเดิม Logout/session expiry/restartไม่ลบข้อมูล Reset atomicเพิกถอน sessions และ challenges เดิม

JSON export/preview/consent restoreใน empty owned accountผ่าน HTTP integration ด้วยข้อมูลสังเคราะห์ (ไม่เท่ากับ browser download acceptance) JSON unencrypted ให้ผู้ใช้เก็บส่วนตัว Full DB archive encryptedแยกจาก user export

**Account deletion: BLOCKED / ยังไม่ implement working purge** existing immutable ledger/audit triggers ต้องมี reviewed controlled operator transactionก่อน ห้ามใช้คำว่า disabled/exported แทน deleted และห้าม bypass immutable guardsด้วย generic DB wipe งานนี้ไม่ได้ทดลองลบ owner recordsหรืออ้างว่าคู่มือนี้ลบข้อมูลได้

ก่อนเปิดข้อมูลจริงต้องทำและพิสูจน์ต่อด้วย synthetic owner: authenticated owner requestพร้อม recent identity verificationและcase receipt, resolve pending writes/exports, revoke HTTP/newWS/existingWS, invalidate challenges/encrypted deliveries, review legal/data-retention needs, owner-scoped purgeที่ตรวจ ledger/audit invariantsโดยไม่มี foreign-owner side effect, tombstone/minimal receiptที่ไม่เก็บPIIเกินจำเป็น และ restore suppression/re-deleteที่ป้องกันข้อมูลกลับจาก backupก่อนเปิดบริการ restored target ไม่ให้ public APIรับ ownerId เพื่อ purge

Backupsควรหมดอายุตามfinite30day policyที่ owner review; ไม่สัญญาทันทีทุกสำเนา Drive/local/keysต้องตรวจรายการจริง และผู้ใช้ควบคุม JSON exports ของตนเอง Privacy UIอธิบายข้อจำกัด/admin visibility/ติดต่อได้ แต่ช่องทาง public supportต้อง ownerตั้งแยกจาก private Gmail alerts Public activationถูกblockด้วย missing actual deletion processนี้ด้วย ไม่ใช่เฉพาะ credentials
