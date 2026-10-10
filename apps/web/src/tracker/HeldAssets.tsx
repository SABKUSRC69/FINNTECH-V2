import {usePresentation} from '../presentation'
import {displayDecimal} from './client'
export type HeldAssetRow={id:string;kind:'cash'|'stock'|'crypto'|'manual';name:string;account:string;quantity:string;native:string|null;currency:string;thb:string|null;status?:string|undefined}
export default function HeldAssets({rows,loading}:{rows:HeldAssetRow[];loading:boolean}) {
 const {money}=usePresentation(),display=(v:string|null)=>v===null?'N/A':money(displayDecimal(v))
 return <section className="tracker-card journal-held-assets rounded-2xl p-5" aria-label="สินทรัพย์ที่คุณถือ" data-testid="held-assets"><h3 className="text-lg font-semibold">สินทรัพย์ที่คุณถือ</h3><p className="mt-1 text-xs">เงินสด · หุ้น/ETF · คริปโต · สินทรัพย์อื่น</p>
 {!rows.length&&<p className="mt-4 text-sm" role="status">{loading?'กำลังโหลดรายการ…':'ยังไม่มีสินทรัพย์ที่บันทึก'}</p>}
 {!!rows.length&&<div className="journal-held-scroll" tabIndex={0} role="region" aria-label="รายการสินทรัพย์และมูลค่าเทียบบาท"><table className="journal-held-table"><caption className="sr-only">สินทรัพย์ที่ถือ แยกบัญชีและพอร์ต</caption><thead><tr><th scope="col">สินทรัพย์ / บัญชี</th><th scope="col">จำนวน / ยอดเงิน</th><th scope="col">มูลค่าเทียบบาท</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} data-holding-kind={row.kind}><td><p className="font-semibold">{row.name}</p><p className="text-xs">{row.account}</p>{row.status&&<p className="mt-1 text-xs">{row.status}</p>}</td><td className="journal-held-quantity">{money(row.quantity)}</td><td className="journal-held-value"><p className="font-semibold">{display(row.thb)} THB</p>{row.currency!=='THB'&&<p className="text-xs">{display(row.native)} {row.currency}</p>}</td></tr>)}</tbody></table></div>}
 </section>
}
