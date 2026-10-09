import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Backup from './Backup'
const category = '00000000-0000-4000-8000-000000000001'
const document = { format: 'FINNTECH_TRACKER_BACKUP', version: 1, provenance: 'USER_ENTERED', exportedAt: '2026-10-04T00:00:00.000Z', categories: [{ id: category, name: 'อาหาร', type: 'expense' }], transactions: [], budgets: [], portfolios: [], trades: [] }
const summary = { counts: { categories: 1, transactions: 0, cancelledTransactions: 0, budgets: 0, portfolios: 0, trades: 0, cancelledTrades: 0 }, months: [], holdings: [] }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function setup(canRestore = true, lostResponse = false) {
  let calls = 0
  const writes: RequestInit[] = [], lock = vi.fn(), restored = vi.fn(async () => {})
  vi.stubGlobal('fetch', vi.fn(async (path: string, options: RequestInit = {}) => {
    if (path === '/api/backup/restore') { writes.push(options); if (lostResponse && ++calls === 1) throw new Error('synthetic lost response') }
    const body = path === '/api/backup/preview' ? { digest: 'a'.repeat(64), canRestore, summary } : { digest: 'a'.repeat(64), summary }
    return { ok: true, status: 200, json: async () => body }
  }))
  render(<Backup lock={lock} restored={restored} expired={vi.fn()} />)
  return { writes, lock, restored }
}
async function select(value: unknown = document) {
  fireEvent.change(screen.getByLabelText('ไฟล์สำรอง JSON'), { target: { files: [{ size: 300, text: async () => JSON.stringify(value) }] } })
}
describe('backup preview/consent/retry UI', () => {
  it('rejects unsupported files before any server request', async () => {
    setup(); await select({ token: 'synthetic-placeholder', format: 'legacy' })
    await screen.findByText(/ไม่ใช่ไฟล์สำรอง FINNTECH/)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('blocks nonempty targets even after preview', async () => {
    const { writes } = setup(false); await select()
    await screen.findByText(/บัญชีนี้มีข้อมูลแล้ว/)
    expect(screen.getByRole('button', { name: 'ยืนยันกู้คืนข้อมูล' }).hasAttribute('disabled')).toBe(true)
    expect(writes).toHaveLength(0)
  })
  it('requires consent and retries a lost commit with the identical body/key', async () => {
    const { writes, restored } = setup(true, true); await select()
    const commit = await screen.findByRole('button', { name: 'ยืนยันกู้คืนข้อมูล' })
    expect(commit.hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(commit.hasAttribute('disabled')).toBe(false))
    fireEvent.click(commit)
    const retry = await screen.findByRole('button', { name: 'ตรวจผลด้วยคำขอเดิม' })
    expect(screen.getByLabelText('ไฟล์สำรอง JSON').hasAttribute('disabled')).toBe(true)
    fireEvent.click(retry); await screen.findByText('กู้คืนสำเร็จ จำนวนรายการและยอดตรงกับ preview')
    expect(writes).toHaveLength(2); expect(writes[1]?.body).toBe(writes[0]?.body); expect(writes[1]?.headers).toEqual(writes[0]?.headers)
    expect(restored).toHaveBeenCalledOnce()
  })
})
