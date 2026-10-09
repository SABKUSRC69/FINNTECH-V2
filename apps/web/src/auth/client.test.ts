import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthRequestError, readAccount, submitAuth, submitDemo } from './client'

const healthy = { status: 'ok', service: 'tracker-api', checks: { process: 'ok', database: 'ok', auth: 'not_checked' } }
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('same-origin Auth client boundary', () => {
  it('marks only a terminal DEMO receipt response as ended; ordinary rejection cannot clear a pending entry', async () => {
    const mock = vi.fn().mockResolvedValueOnce(reply({}, 403)).mockResolvedValueOnce(reply({}, 429))
      .mockResolvedValueOnce(reply({}, 503)).mockResolvedValueOnce(reply({}, 410))
    vi.stubGlobal('fetch', mock)
    await expect(submitDemo('enter', 'synthetic-code-only')).rejects.toMatchObject({ demoEnded: false, outcomeUnknown: false })
    await expect(submitDemo('enter', 'synthetic-code-only')).rejects.toMatchObject({ demoEnded: false, outcomeUnknown: false })
    await expect(submitDemo('enter', 'synthetic-code-only')).rejects.toMatchObject({ demoEnded: false, outcomeUnknown: true })
    await expect(submitDemo('enter', 'synthetic-code-only')).rejects.toMatchObject({ demoEnded: true, outcomeUnknown: false })
  })
  it('keeps recovery and Beta capabilities when owner authorization expires during the read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply({ ...healthy, capabilities: { recovery: true }, beta: { dataMode: 'synthetic' } }))
      .mockResolvedValueOnce(reply({ user: { name: 'Synthetic' } })).mockResolvedValueOnce(reply({}, 401)))
    expect(await readAccount()).toEqual({ status: 'signed-out', recovery: true, beta: true })
  })
  it('uses cookie credentials, relative URLs, no cache and no client owner ID', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(healthy))
      .mockResolvedValueOnce(reply({ user: { name: 'Synthetic' } }))
      .mockResolvedValueOnce(reply({ ownerId: 'server-owner' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await readAccount()).toEqual({ status: 'signed-in', account: { name: 'Synthetic' } })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/health', '/api/auth/get-session', '/api/me'])
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.credentials).toBe('same-origin')
      expect(options.cache).toBe('no-store')
      expect(options.body).toBeUndefined()
    }
  })

  it('reports null sessions and expired owner authorization as signed out', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(healthy)).mockResolvedValueOnce(reply(null))
    vi.stubGlobal('fetch', fetchMock)
    expect(await readAccount()).toEqual({ status: 'signed-out' })
    fetchMock.mockResolvedValueOnce(reply(healthy)).mockResolvedValueOnce(reply({ user: { name: 'Synthetic' } }))
      .mockResolvedValueOnce(reply({}, 401))
    expect(await readAccount()).toEqual({ status: 'signed-out' })
  })

  it('rejects unconfigured health, malformed session and invalid owner payload', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ ...healthy, checks: { ...healthy.checks, auth: 'not_configured' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(readAccount()).rejects.toBeInstanceOf(AuthRequestError)
    fetchMock.mockResolvedValueOnce(reply(healthy)).mockResolvedValueOnce(reply({ user: { name: false } }))
    await expect(readAccount()).rejects.toBeInstanceOf(AuthRequestError)
    fetchMock.mockResolvedValueOnce(reply(healthy)).mockResolvedValueOnce(reply({ user: { name: 'Synthetic' } })).mockResolvedValueOnce(reply({}))
    await expect(readAccount()).rejects.toBeInstanceOf(AuthRequestError)
  })

  it('does not echo server details on login/registration/rate-limit rejection', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ message: 'private server details' }, 401))
      .mockResolvedValueOnce(reply({}, 422)).mockResolvedValueOnce(reply({}, 429))
    vi.stubGlobal('fetch', fetchMock)
    await expect(submitAuth('sign-in')).rejects.toThrow('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    await expect(submitAuth('sign-up')).rejects.toThrow('สมัครบัญชีไม่สำเร็จ')
    await expect(submitAuth('sign-in')).rejects.toThrow('ทำรายการถี่เกินไป')
  })

  it('treats network loss and server failure after a POST as unknown outcomes', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('private driver details')).mockResolvedValueOnce(reply({}, 503))
    vi.stubGlobal('fetch', fetchMock)
    for (const action of ['sign-up', 'sign-out'] as const) {
      await expect(submitAuth(action)).rejects.toMatchObject({ outcomeUnknown: true })
    }
  })

  it('bounds a stalled request with an eight-second abort instead of loading forever', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })))
    const operation = submitAuth('sign-in')
    const rejected = expect(operation).rejects.toMatchObject({ outcomeUnknown: true })
    await vi.advanceTimersByTimeAsync(8_000)
    await rejected
    expect(vi.getTimerCount()).toBe(0)
  })
})
