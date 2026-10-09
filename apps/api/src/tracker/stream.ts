import type { Server, IncomingMessage } from 'node:http'
import { fromNodeHeaders } from 'better-auth/node'
import { WebSocketServer, WebSocket } from 'ws'
import type { AuthRuntime } from '../auth/runtime.js'
import type { MarketRelay } from './market.js'
import type { StockMarketRelay } from './stocks.js'
import { betaFor } from '../auth/beta.js'
import { demoFor } from '../auth/demo.js'

/** Quotes only, with a session-checked same-origin upgrade; no client commands are accepted. */
export function attachMarketStream(server: Server, auth: AuthRuntime, market: MarketRelay, stocks?: StockMarketRelay,
  stockOwner?: (authUserId: string) => Promise<string | null>, subjectGate?: (authUserId: string) => Promise<boolean>): () => void {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false })
  const origins = new Map<WebSocket, IncomingMessage>()
  const revoke = (client: WebSocket) => {
    if (client.readyState !== WebSocket.OPEN) return
    client.close(1008, 'session expired')
    // A peer/proxy may not acknowledge the close frame. Bound transport shutdown
    // independently of the WebSocket library's longer graceful-close timeout.
    const deadline = setTimeout(() => client.terminate(), 1000)
    deadline.unref()
    client.once('close', () => clearTimeout(deadline))
  }
  const validSession = async (request: IncomingMessage) => {
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
      if (!session) return false
      if (subjectGate && !await subjectGate(session.user.id)) return false
      if ((auth.options.emailAndPassword?.requireEmailVerification || betaFor(auth)?.access === 'invited' || demoFor(auth)) && !subjectGate) return false
      if (request.url === '/ws/stocks' && stocks?.ownerId !== null) {
        const ownerId = await stockOwner?.(session.user.id)
        return !!ownerId && !!stocks?.allowsOwner(ownerId)
      }
      return true
    }
    catch { return false }
  }
  server.on('upgrade', (request, socket, head) => {
    if (!['/ws/market', ...(stocks ? ['/ws/stocks'] : [])].includes(request.url ?? '') || request.headers.origin !== auth.options.baseURL) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return
    }
    // Bound the handshake independently of database connection/driver delays.
    const deadline = setTimeout(() => socket.destroy(), 5000)
    socket.once('close', () => clearTimeout(deadline))
    void validSession(request).then(allowed => {
      if (socket.destroyed) return
      clearTimeout(deadline)
      if (!allowed) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return }
      sockets.handleUpgrade(request, socket, head, client => {
        origins.set(client, request)
        client.on('error', () => client.terminate())
        client.on('message', () => client.close(1008, 'read only'))
        client.once('close', () => origins.delete(client))
        void (request.url === '/ws/stocks' ? stocks!.snapshot() : market.snapshot())
          .then(snapshot => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(snapshot)) })
      })
    })
  })
  let broadcasting = false
  const timer = setInterval(() => {
    if (broadcasting || !origins.size) return
    broadcasting = true
    void (async () => {
      const requests = [...origins.values()]
      const cryptoSnapshot = requests.some(request => request.url === '/ws/market') ? JSON.stringify(await market.snapshot()) : ''
      const stockSnapshot = requests.some(request => request.url === '/ws/stocks') ? JSON.stringify(await stocks!.snapshot()) : ''
      await Promise.all([...origins].map(async ([client, request]) => {
        if (!await validSession(request)) { revoke(client); return }
        if (client.readyState === WebSocket.OPEN) {
          if (client.bufferedAmount > 65536) client.terminate()
          else client.send(request.url === '/ws/stocks' ? stockSnapshot : cryptoSnapshot)
        }
      }))
    })().finally(() => { broadcasting = false })
  }, 5000)
  timer.unref()
  return () => { clearInterval(timer); for (const client of origins.keys()) client.terminate(); sockets.close() }
}
