from pathlib import Path
root=Path(r'C:\Users\Admin\Downloads\FINNTECH');release=root/'.student-real-20261008.local/release-source'
for base in [root,release]:
 p=base/'apps/web/src/tracker/Assets.tsx';s=p.read_text(encoding='utf-8')
 s=s.replace('selectReference,referenceDateLabel','selectReference')
 old="status:reference.value?`${reference.source} · ${referenceDateLabel(reference)}`:'ราคาไม่พร้อม'"
 assert old in s
 s=s.replace(old,"status:reference.value?(reference.close?`${daily?.source??'ราคาปิด'} · ${reference.close.tradingDate}${reference.close.status==='DELAYED'?' · รอวันล่าสุด':''}`:reference.state==='MANUAL'?`กรอกเอง · ${reference.asOf?new Date(reference.asOf).toLocaleDateString('th-TH'):''}`:'Alpaca IEX · ราคาสด'):'ราคาไม่พร้อม'")
 s=s.replace('disabled={disabled} onClick={()=>{void load()}}>โหลดสินทรัพย์ล่าสุด', 'disabled={busy||!!pending||manualLocked||referenceLocked||loading} onClick={()=>{void load()}}>โหลดสินทรัพย์ล่าสุด')
 s=s.replace('{usdFx.source} · {usdFx.asOf?', "{usdFx.state==='MANUAL'?'กรอกเอง':'ECB รายวัน'} · {usdFx.asOf?")
 p.write_text(s,encoding='utf-8',newline='\n')
print('Short source labels and retryable asset refresh applied in both checkouts.')
