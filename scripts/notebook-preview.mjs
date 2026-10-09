// Test-only HTTP fixtures; no env, real auth, DB, market provider or persistent writes.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareBackup } from '../apps/api/dist/tracker/backup.js'
import { backupDocumentSchema } from '../packages/contracts/dist/index.js'
import { financeOverviewSchema, cryptoOverviewSchema, cashOverviewSchema, stockMarketSnapshotSchema } from '../packages/contracts/dist/index.js'
const root = process.cwd(), dist = path.resolve(process.env.NOTEBOOK_PREVIEW_DIST || 'apps/web/dist')
const categoryId = '00000000-0000-4000-8000-000000000001', transactionId = '00000000-0000-4000-8000-000000000002', portfolioId = '00000000-0000-4000-8000-000000000003'
const finance = financeOverviewSchema.parse({ month: '2026-10', currency: 'THB', income: '999999999999999999.99', expense: '1.25', balance: '999999999999999998.74',
  categories: [{ id: categoryId, name: 'หมวดข้อมูลสังเคราะห์สำหรับทดสอบการตัดคำ'.repeat(2), type: 'expense' }],
  transactions: [{ id: transactionId, categoryId, type: 'expense', amount: '1.25', date: '2026-10-07', note: 'บันทึกสังเคราะห์สำหรับตรวจหน้าจอ'.repeat(4) }],
  budgets: [{ id: categoryId, categoryId, month: '2026-10', amount: '1', spent: '1.25', remaining: '-0.25' }] })
const crypto = cryptoOverviewSchema.parse({ quoteCurrency: 'USDT', portfolios: [{ id: portfolioId, name: 'พอร์ตสังเคราะห์สำหรับตรวจข้อความยาว'.repeat(2) }], holdings: [{ portfolioId, asset: 'BTC', quantity: '0.00000001', totalCost: '0.001', realizedPnl: '0' }], trades: [{ id: transactionId, portfolioId, asset: 'BTC', side: 'buy', quantity: '0.00000001', price: '100000', fee: '0', date: '2026-10-07', realizedPnl: '0' }] })
const cash = cashOverviewSchema.parse({ accounts: [{ id: categoryId, version: 1, name: 'บัญชีเงินสดสังเคราะห์สำหรับทดสอบข้อความยาว'.repeat(2), balance: '999999999999999999.99', currency: 'THB', asOf: '2026-10-07' }] })
const stocks = stockMarketSnapshotSchema.parse({ source: 'Alpaca IEX', currency: 'USD', connection: 'NOT_CONFIGURED', quotes: [] })
const simpleFinance = financeOverviewSchema.parse({ ...finance, income: '45000', expense: '200', balance: '44800', categories: [
  { id: categoryId, name: 'อาหารและเครื่องดื่ม', type: 'expense' },
  { id: '00000000-0000-4000-8000-000000000004', name: 'ค่าเดินทาง', type: 'expense' },
  { id: '00000000-0000-4000-8000-000000000005', name: 'เงินเดือน', type: 'income' }], transactions: [
  { id: transactionId, categoryId, type: 'expense', amount: '120', date: '2026-10-07', note: 'มื้อกลางวัน' },
  { id: '00000000-0000-4000-8000-000000000006', categoryId: '00000000-0000-4000-8000-000000000004', type: 'expense', amount: '80', date: '2026-10-06', note: 'รถไฟฟ้า' },
  { id: '00000000-0000-4000-8000-000000000007', categoryId: '00000000-0000-4000-8000-000000000005', type: 'income', amount: '45000', date: '2026-10-01', note: 'รายรับเดือนตุลาคม' }
], budgets: [{ id: categoryId, categoryId, month: '2026-10', amount: '8000', spent: '120', remaining: '7880' }] })
const simpleCash = cashOverviewSchema.parse({ accounts: [
  { id: categoryId, version: 1, name: 'เงินสดใช้จ่าย', balance: '28450', currency: 'THB', asOf: '2026-10-07' },
  { id: '00000000-0000-4000-8000-000000000008', version: 1, name: 'เงินสำรอง', balance: '100000', currency: 'THB', asOf: '2026-10-07' }] })
const simpleCrypto = cryptoOverviewSchema.parse({ quoteCurrency: 'USDT', portfolios: [{id: portfolioId, name: 'พอร์ตระยะยาว'}], holdings: [{portfolioId, asset: 'BTC', quantity: '0.02500000', totalCost: '1850', realizedPnl: '0'}], trades: [{id:transactionId, portfolioId, asset:'BTC', side:'buy', quantity:'0.02500000',price:'74000',fee:'0',date:'2026-10-01',realizedPnl:'0'}] })
let mode = 'normal', writes = [], signedIn = true
// Export fixture is schema-checked and never reads a user's account/database.
const timestamp='2026-10-08T00:00:00.000Z'
const exampleBackup=backupDocumentSchema.parse({format:'FINNTECH_TRACKER_BACKUP',version:2,provenance:'USER_ENTERED',exportedAt:timestamp,
  categories:simpleFinance.categories,transactions:simpleFinance.transactions.map(row=>({...row,currency:'THB',createdAt:timestamp,voidedAt:null,voidReason:null})),
  budgets:simpleFinance.budgets.map(({spent,remaining,...row})=>({...row,month:simpleFinance.month,currency:'THB'})),portfolios:[],trades:[],
  cashAccounts:simpleCash.accounts.map(({version,...row})=>row)})
function json(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1'), pathname = url.pathname
    if(pathname==='/' && url.searchParams.has('fixture')){mode=url.searchParams.get('fixture'); signedIn=mode!=='signed-out'; writes=[]}
    if (pathname.startsWith('/__fixture__/mode/')) { mode = pathname.split('/').at(-1); writes = []; signedIn = true; return json(res, { mode }) }
    if (pathname === '/__fixture__/results') return json(res, { mode, writes: writes.length, payloadSame: writes.every(row => row.body === writes[0]?.body), keySame: writes.every(row => row.key === writes[0]?.key) })
    if (req.method === 'POST') {
      let body = ''; for await (const part of req) {body += part; if(Buffer.byteLength(body)>2*1024*1024)return json(res,{},413)}
      writes.push({ body, key: req.headers['idempotency-key'] })
      if (mode === 'pending' && writes.length === 1) return json(res, { error: { code: 'SYNTHETIC_RESPONSE_LOSS' } }, 500)
      if(pathname==='/api/backup/preview'){const prepared=prepareBackup(JSON.parse(body));return json(res,{digest:prepared.digest,summary:prepared.summary,canRestore:mode==='empty'})}
      if(pathname==='/api/backup/restore'){const prepared=prepareBackup(JSON.parse(body).backup);return json(res,{digest:prepared.digest,summary:prepared.summary})}
      if (pathname.endsWith('sign-out')) signedIn = false; if(pathname.endsWith('sign-in/email')||pathname.endsWith('sign-up/email')){signedIn=true;mode='normal'}
      return json(res, { id: transactionId })
    }
    if (pathname === '/api/health') return json(res, { status: 'ok', service: 'tracker-api', real: { registrationsOpen: true, authenticationMode: 'email-password', stagingEnrollment: false, rehearsal: true }, capabilities: { recovery: false }, checks: { process: 'ok', database: 'ok', auth: 'not_checked' } })
    if (pathname === '/api/auth/get-session') return json(res, signedIn && mode !== 'signed-out' ? { user: { name: 'ผู้ทดสอบสมุดการเงิน · ข้อมูลสังเคราะห์' } } : null)
    if(pathname==='/api/account/deletion')return json(res,{available:false});
    if (pathname === '/api/me') return json(res, { ownerId: categoryId })
    if (pathname === '/api/backup') return json(res, exampleBackup)
    if (pathname === '/api/finance') {
      if (mode === 'unavailable') return json(res, {}, 503)
      if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 2000))
      return json(res, { ...(mode === 'empty' ? {...simpleFinance,income:'0',expense:'0',balance:'0',transactions:[],budgets:[],categories:[]} : mode === 'long' ? finance : simpleFinance), month: url.searchParams.get('month') || finance.month })
    }
    if (pathname === '/api/crypto') return json(res, mode === 'empty' ? {...simpleCrypto,portfolios:[],holdings:[],trades:[]} : mode === 'long' ? crypto : simpleCrypto)
    if (pathname === '/api/cash') return json(res, mode === 'empty' ? {accounts:[]} : mode === 'long' ? cash : simpleCash)
    if (pathname === '/api/reference-rate') return json(res, { base: 'USDT', quote: 'THB', rate: '33.62', receivedAt: new Date(Date.now() - 60000).toISOString(), status: 'STALE', source: 'Bitkub public', kind: 'LAST_PRICE_SNAPSHOT' })
    if (pathname === '/api/stocks/market') return json(res, stocks)
    if (pathname === '/api/crypto/market') return json(res, { quotes: [{ asset: 'BTC', price: '100000', receivedAt: new Date(Date.now() - 60000).toISOString(), status: 'STALE', source: 'Binance public' }] })
    if (pathname.startsWith('/api/')) return json(res, {}, 404)
    const target = path.resolve(dist, pathname === '/' ? 'index.html' : pathname.slice(1))
    if (!target.startsWith(dist + path.sep)) return json(res, {}, 404)
    let data = await readFile(target); if(target.endsWith('index.html')) data=Buffer.from(data.toString().replace('<body>', `<body><aside aria-label="ตัวอย่างดีไซน์" style="padding:10px 16px;background:#49312d;color:#fff;font:14px/1.6 sans-serif">ตัวอย่างดีไซน์ — ข้อมูลสังเคราะห์ในหน่วยความจำ ไม่มีบัญชีจริงหรือฐานข้อมูล <nav style="display:flex;flex-wrap:wrap;gap:14px">${['normal','signed-out','long','empty','unavailable','slow','pending'].map(m=>`<a style="color:#fff;text-decoration:underline" href="/?fixture=${m}">${m}</a>`).join('')} <a style="color:#fff" href="/__fixture__/results">ผลคำขอสังเคราะห์</a></nav></aside>`))
    res.writeHead(200, { 'Cache-Control':'no-store', 'Content-Type': target.endsWith('.svg') ? 'image/svg+xml' : target.endsWith('.js') ? 'application/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.ttf') ? 'font/ttf' : 'text/html' }); res.end(data)
  } catch { json(res, {}, 404) }
})
server.on('upgrade', (_req, socket) => socket.destroy())
server.on('error',error=>{console.error(error.code);process.exitCode=1})
server.listen(Number(process.env.NOTEBOOK_PREVIEW_PORT||4308), '127.0.0.1', () => console.log('NOTEBOOK synthetic UI fixture ready on loopback; PID ' + process.pid))
process.once('SIGINT', () => server.close())
process.once('SIGTERM', () => server.close())

