import { useEffect, useState } from 'react'
import { stockMarketSnapshotSchema, type StockMarketSnapshot } from '@finntech/contracts'
import { trackerRequest, TrackerRequestError } from './client'

/**
 * One shared subscription per browser tab to FINNTECH's authenticated stock relay. The browser never
 * holds provider keys. Non-owners (403) and unconfigured servers never open the WebSocket.
 */
export type StockAccess = 'checking' | 'owner' | 'denied' | 'unavailable'
export interface StockMarketState { snapshot: StockMarketSnapshot | null; access: StockAccess; receivedAt: number }
type Listener = (state: StockMarketState) => void

// Half the 30 s live window, so REST alone (WebSocket blocked or backing off) keeps fresh prices LIVE.
const RECONCILE_MS = 15_000
let state: StockMarketState = { snapshot: null, access: 'checking', receivedAt: 0 }
const listeners = new Set<Listener>()
let socket: WebSocket | null = null, reconnect: ReturnType<typeof setTimeout> | undefined, poll: ReturnType<typeof setInterval> | undefined
let failures = 0, fetching = false, expiredHandlers = new Set<() => void>()

function publish(next: Partial<StockMarketState>): void {
  state = { ...state, ...next }
  for (const listener of listeners) listener(state)
}
/** Invalid REST snapshots clear prices (N/A); an invalid stream frame is ignored, keeping the last valid one. */
function accept(value: unknown, fromRest: boolean): void {
  const parsed = stockMarketSnapshotSchema.safeParse(value)
  if (parsed.success) publish({ snapshot: parsed.data, access: 'owner', receivedAt: Date.now() })
  else if (fromRest) publish({ snapshot: null, access: 'unavailable' })
}
async function reconcile(): Promise<void> {
  if (fetching) return
  fetching = true
  try {
    accept(await trackerRequest('stocks/market'), true)
    // No socket when the server has no Alpaca keys: periodic reconciliation will notice activation.
    if (!socket && listeners.size && state.snapshot?.connection !== 'NOT_CONFIGURED') connect()
  } catch (error) {
    if (error instanceof TrackerRequestError && error.expired) { publish({ snapshot: null, access: 'denied' }); stop(); for (const handler of [...expiredHandlers]) handler(); return }
    // 403: this account is not the key owner. Other failures: feed or network unavailable. No socket.
    const forbidden = error instanceof TrackerRequestError && error.status === 403
    publish({ snapshot: null, access: forbidden ? 'denied' : 'unavailable' })
    if (forbidden) stop(); else socket?.close()
  } finally { fetching = false }
}
function connect(): void {
  if (socket || typeof WebSocket === 'undefined' || !listeners.size || state.access !== 'owner') return
  const opened = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/stocks`)
  socket = opened
  opened.onmessage = event => { try { accept(JSON.parse(String(event.data)), false); failures = 0 } catch { /* keep last valid snapshot */ } }
  opened.onerror = () => opened.close()
  opened.onclose = () => {
    if (socket !== opened) return
    socket = null
    if (listeners.size && state.access === 'owner') { failures = Math.min(failures + 1, 5); reconnect = setTimeout(connect, 1000 * 2 ** failures) }
  }
}
function start(): void {
  void reconcile()
  poll = setInterval(() => { void reconcile() }, RECONCILE_MS)
}
function stop(): void {
  if (poll) clearInterval(poll); if (reconnect) clearTimeout(reconnect)
  poll = undefined; reconnect = undefined
  const closing = socket; socket = null; closing?.close()
}

/** Subscribe a component; the first subscriber starts the shared store and the last one stops it. */
export function useStockMarket(expired: () => void, refreshRevision = 0): StockMarketState {
  const [current, setCurrent] = useState(state)
  useEffect(() => {
    const listener: Listener = next => setCurrent(next)
    listeners.add(listener); expiredHandlers.add(expired)
    if (listeners.size === 1) start(); else { setCurrent(state); void reconcile() }
    return () => { listeners.delete(listener); expiredHandlers.delete(expired); if (!listeners.size) { stop(); state = { snapshot: null, access: 'checking', receivedAt: 0 } } }
  }, [refreshRevision])
  return current
}

/** Test seam: reset module state between isolated renders. */
export function resetStockMarketForTests(): void { stop(); listeners.clear(); expiredHandlers = new Set(); state = { snapshot: null, access: 'checking', receivedAt: 0 }; failures = 0; fetching = false }
