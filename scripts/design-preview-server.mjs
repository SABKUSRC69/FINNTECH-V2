// Isolated static design exploration. No env, API, DB or owner data.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../design/previews/', import.meta.url))
const port = 4296
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.ttf':'font/ttf', '.png':'image/png', '.md':'text/plain; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.json':'application/json' }
const server = createServer(async (req,res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end() }
    const url = new URL(req.url,'http://127.0.0.1')
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
    if (!target.startsWith(root)) { res.writeHead(404); return res.end() }
    const body = await readFile(target)
    res.writeHead(200,{ 'Content-Type':types[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'" })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch { res.writeHead(404);res.end('Not found') }
})
server.listen(port,'127.0.0.1',()=>console.log(`FINNTECH design preview http://127.0.0.1:${port}/ · PID ${process.pid}`))
server.on('error',error=>{console.error(error.code);process.exitCode=1})
process.on('SIGINT',()=>server.close())
process.on('SIGTERM',()=>server.close())
