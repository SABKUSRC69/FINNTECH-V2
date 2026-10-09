import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { once } from 'node:events'
import { test } from 'vitest'
import type { AuthRuntime } from '../src/auth/runtime.js'
import { MarketRelay } from '../src/tracker/market.js'
import { attachMarketStream } from '../src/tracker/stream.js'

test('session revocation closes transport even when a peer never acknowledges the close frame', async () => {
  let valid = true
  const origin = 'https://synthetic.invalid'
  const auth = { options: { baseURL: origin }, api: { getSession: async () => valid ? { user: { id: 'synthetic' } } : null } } as unknown as AuthRuntime
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const market = new MarketRelay(async () => { throw new Error('synthetic provider disabled') })
  const stop = attachMarketStream(server, auth, market)
  const peer = connect(address.port, '127.0.0.1')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await once(peer, 'connect')
    const received: Buffer[] = []
    peer.on('data', data => received.push(data)) // Deliberately never sends a close acknowledgement.
    const initial = once(peer, 'data')
    peer.write(`GET /ws/market HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: ${origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: c3ludGhldGljLXRlc3QxMg==\r\n\r\n`)
    await initial; assert.match(Buffer.concat(received).toString(), /101 Switching Protocols/)
    const closed = once(peer, 'close'), started = Date.now(); valid = false
    await Promise.race([closed, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('revoked transport remained open')), 7500) })])
    assert.ok(Date.now() - started < 7500)
  } finally { clearTimeout(timer); peer.destroy(); stop(); await new Promise<void>(resolve => server.close(() => resolve())) }
}, 10000)
