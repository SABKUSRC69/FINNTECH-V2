import { describe, expect, it } from 'vitest'
import { prepareBackup } from '../src/tracker/backup.js'
const id = (digit: string) => `00000000-0000-4000-8000-${digit.padStart(12, '0')}`
const timestamp = '2026-10-04T00:00:00.000Z'
const fixture = () => ({ format: 'FINNTECH_TRACKER_BACKUP', version: 1, provenance: 'USER_ENTERED', exportedAt: timestamp,
  categories: [{ id: id('1'), name: 'อาหาร', type: 'expense' }], budgets: [], portfolios: [{ id: id('4'), name: 'A', quoteCurrency: 'USDT' }],
  transactions: ['2', '3'].map(digit => ({ id: id(digit), categoryId: id('1'), type: 'expense', amount: '0.1', currency: 'THB', date: '2026-10-04', note: '', createdAt: timestamp, voidedAt: null, voidReason: null })),
  trades: [{ id: id('5'), portfolioId: id('4'), asset: 'BTC', side: 'buy', quantity: '0.00000001', price: '60000', fee: '0', quoteCurrency: 'USDT', date: '2026-10-04', createdAt: timestamp, voidedAt: null, voidReason: null, accounting: { gross: '0.0006', costRemoved: '0', realizedPnl: '0' } }],
})
describe('backup validation/replay (unit evidence only)', () => {
  it('v4 preserves explicit reference provenance and disabled state; duplicate/cross-currency/noncanonical references fail',()=>{
    const ref={id:id('9'),symbol:'AAPL',currency:'USD',source:'MANUAL',value:'123.456',asOf:timestamp,updatedAt:timestamp,enabled:false}
    const backup={...fixture(),version:4,cashAccounts:[],stockPortfolios:[],stockTrades:[],manualAssets:[],valuationReferences:[ref]}
    expect(prepareBackup(backup).summary.references).toEqual([{symbol:'AAPL',currency:'USD',source:'MANUAL',value:'123.456',asOf:timestamp,updatedAt:timestamp,enabled:false}])
    expect(()=>prepareBackup({...backup,valuationReferences:[ref,{...ref,id:id('10')}]})).toThrow()
    expect(()=>prepareBackup({...backup,valuationReferences:[{...ref,currency:'THB'}]})).toThrow()
    expect(()=>prepareBackup({...backup,valuationReferences:[{...ref,asOf:'2026-10-04T00:00:00Z'}]})).toThrow()
    expect(()=>prepareBackup({...backup,valuationReferences:[{...ref,ownerId:id('1')}]})).toThrow()
    const {valuationReferences:_refs,...old}=backup
    expect(prepareBackup({...old,version:3}).summary.references).toEqual([])
  })
  it('v2 cash is preserved in verification summary without turning it into income', () => {
    const plan = prepareBackup({ ...fixture(), version: 2, cashAccounts: [{ id: id('8'), name: 'เงินสด', balance: '0.10', currency: 'THB', asOf: '2026-10-05' }] })
    expect(plan.summary.cash).toEqual([{ name: 'เงินสด', balance: '0.1', currency: 'THB', asOf: '2026-10-05' }])
    expect(plan.summary.months[0]?.expense).toBe('0.2')
  })
  it('counts identical rows separately and preserves exact BTC/THB values', () => {
    const plan = prepareBackup(fixture())
    expect(plan.summary.months).toEqual([{ month: '2026-10', income: '0', expense: '0.2', balance: '-0.2' }])
    expect(plan.summary.holdings[0]).toMatchObject({ quantity: '0.00000001', totalCost: '0.0006', realizedPnl: '0' })
    expect(plan.digest).toBe(prepareBackup(JSON.parse(JSON.stringify(fixture()))).digest)
  })
  it('keeps cancelled rows as evidence, excluding their amounts from totals/replay', () => {
    const input = fixture()
    const value = { ...input, transactions: input.transactions.map(row => ({ ...row, voidedAt: timestamp, voidReason: 'synthetic duplicate' })), trades: input.trades.map(row => ({ ...row, voidedAt: timestamp, voidReason: 'synthetic duplicate' })) }
    const plan = prepareBackup(value)
    expect(plan.summary.counts.cancelledTransactions).toBe(2); expect(plan.summary.counts.cancelledTrades).toBe(1)
    expect(plan.summary.months).toEqual([]); expect(plan.summary.holdings[0]).toMatchObject({ quantity: '0', totalCost: '0', realizedPnl: '0' })
  })
  it('rejects accounting mismatch, oversell and aggregate overflow', () => {
    const value = fixture()
    expect(() => prepareBackup({ ...value, trades: [{ ...value.trades[0], accounting: { gross: '1', costRemoved: '0', realizedPnl: '0' } }] })).toThrow('BACKUP_INCONSISTENT')
    expect(() => prepareBackup({ ...value, trades: [{ ...value.trades[0], side: 'sell' }] })).toThrow('oversell')
    expect(() => prepareBackup({ ...value, transactions: value.transactions.map(row => ({ ...row, amount: '999999999999999999.99' })) })).toThrow()
  })
})
