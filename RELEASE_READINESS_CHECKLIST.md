# FINNTECH Release-readiness Checklist

สถานะเอกสาร: checklist สำหรับ working tree ปัจจุบัน ยังไม่ได้รันตรวจปล่อยเวอร์ชันหรือ deploy

## Gate ที่ต้องคงไว้

- [ ] ห้าม commit, push หรือ deploy จากงานตรวจนี้
- [ ] ก่อน deploy staging ต้องส่ง URL เป้าหมาย, ขอบเขตการเผยแพร่ และผล local checks ให้เจ้าของอนุมัติก่อน หากยังไม่มีอนุมัติให้หยุดที่ checklist นี้
- [ ] คำสั่ง Spot PAPER ทั้ง Market และ Limit ต้องยังถูกปฏิเสธจากทั้ง UI และ service ตราบใดที่ `orderRulesVerified` เป็น `false` ห้ามเดาความหมาย `base_asset_scale`, `quantity_scale` หรือ `quantity_step`
- [ ] ข่าวและปฏิทินเศรษฐกิจคงสถานะ `UNAVAILABLE` จนมี provider/backend ที่ตรวจสิทธิ์ใช้งาน แหล่งข้อมูล เวลา และรายการจริงได้ ห้ามแสดงข่าวตัวอย่างหรือป้าย “สด” บน widget ว่าง
- [ ] `LIVE` ใช้ได้เฉพาะข้อมูลสาธารณะที่รับและตรวจสอบจาก Bitkub ได้ ห้ามนำข้อมูลสุ่มหรือ fallback DEMO มาปะปน
- [ ] ตรวจว่าไม่มี API key, private wallet/order/deposit/withdraw request หรือข้อมูลลับใน frontend bundle, LocalStorage, Network log และหลักฐานที่ส่ง

## 1. บันทึก candidate และตรวจในเครื่อง

- [ ] บันทึก branch และ baseline: `git branch --show-current`, `git rev-parse HEAD`
- [ ] บันทึก `git status --short` และตรวจ diff ที่จะส่งทวนด้วย `git diff --stat`, `git diff --check`, `git diff`
- [ ] รัน `npm test` และเก็บผลรวมจำนวน test ผ่าน/ล้มเหลว
- [ ] รัน `npm run build` และเก็บ exit code กับ build output
- [ ] ทดสอบ built files ใต้ local project path `/FINNTECH/` ด้วย Vite preview ตามขั้นตอนด้านล่าง; ตรวจว่า HTML, JavaScript และ CSS โหลดจาก path นี้จริงด้วย HTTP 200 และ MIME type ถูกต้อง
- [ ] เมื่อพบปัญหา ให้แนบชื่อไฟล์/บรรทัดและผลที่เกิดจริงก่อนเสนอแก้ไข ห้ามกลบปัญหาด้วยการเปิด Market/Limit หรือยกสถานะข้อมูลเป็น LIVE

**หลักฐาน:** branch, baseline SHA, สถานะ working tree, diff/stat, stdout ของ test/build/diff-check, URL local preview และ screenshot หน้าหลัก

### Local project-path preview ที่ตรวจไฟล์ JS/CSS จริง

หลัง build ให้ใช้ Vite preview serve output ใต้ path `/FINNTECH/` เพื่อจำลอง GitHub Pages project site โดยไม่ deploy:

```powershell
npm run build
npm run preview -- --configLoader runner --base /FINNTECH/ --host 127.0.0.1 --port 4174
```

เปิด `http://127.0.0.1:4174/FINNTECH/` แล้ว DevTools → Network → Disable cache → Hard Reload:

- [ ] HTML document ที่ `/FINNTECH/` ตอบ HTTP 200 ด้วย MIME type `text/html`
- [ ] JavaScript bundle ที่โหลดจาก `/FINNTECH/` ตอบ HTTP 200 ด้วย MIME type JavaScript (`text/javascript` หรือ `application/javascript`) และ response body ไม่ว่าง
- [ ] CSS ที่โหลดจาก `/FINNTECH/` ตอบ HTTP 200 ด้วย MIME type `text/css` และ response body ไม่ว่าง; ไม่มี JS/CSS/manifest/service-worker 404
- [ ] Console ไม่มี error โหลด module, MIME type, base path หรือ service worker
- [ ] ตรวจ Network หรือ `performance.getEntriesByType('resource')` ว่า HTML, JS และ CSS ที่โหลดจริงใช้ origin `http://127.0.0.1:4174` และ path `/FINNTECH/`
- [ ] Manifest ยังคง `start_url`/`scope` เป็น `/FINNTECH/`

หยุด Vite preview ด้วย Ctrl+C เมื่อเก็บหลักฐานครบ; preview นี้ serve build ในเครื่องเท่านั้น

## 2. Bitkub REST และ CORS จาก GitHub Pages origin จริง

ใช้หน้า Pages ที่เผยแพร่อยู่แล้วเพื่อทดสอบพฤติกรรม CORS ของ browser จาก origin จริง:

- URL: `https://sabkusrc69.github.io/FINNTECH/`
- ค่า `location.origin` ที่คาดหวัง: `https://sabkusrc69.github.io` (path `/FINNTECH/` ไม่ใช่ส่วนหนึ่งของ origin)
- เปิด DevTools ของ tab นี้ แล้วรัน probe ใน Console; ห้ามใช้ `curl` เป็นหลักฐาน CORS เพราะ `curl` ไม่บังคับ browser CORS policy

```js
const base = 'https://api.bitkub.com/api/v3/market'
const results = []
const probe = async (name, url) => {
  const started = performance.now()
  try {
    const response = await fetch(url, { cache: 'no-store' })
    const text = await response.text()
    let body
    let jsonValid = true
    try { body = JSON.parse(text) } catch { body = null; jsonValid = false }
    const topLevelArray = Array.isArray(body)
    const wrappedArray = Array.isArray(body?.result) || Array.isArray(body?.data)
    results.push({ name, status: response.status, ok: response.ok, jsonValid,
      elapsedMs: Math.round(performance.now() - started),
      apiError: body?.error ?? null,
      responseShape: topLevelArray ? `top-level array (${body.length})` : wrappedArray ? 'array under result/data' : typeof body })
    return { response, body, jsonValid }
  } catch (error) {
    // A browser TypeError often means CORS or network failure. Confirm CORS
    // specifically from the Console policy message and Network request details.
    results.push({ name, outcome: error.name === 'TypeError' ? 'FETCH_FAILED (CORS/network)' : 'FETCH_FAILED',
      error: `${error.name}: ${error.message}`, elapsedMs: Math.round(performance.now() - started) })
    return null
  }
}

// Run ticker independently: REST v3 returns all tickers when `sym` is omitted,
// so this still probes the Pages origin even if /symbols fails or is CORS-blocked.
const symbolsResult = await probe('symbols', `${base}/symbols`)
const tickerResult = await probe('ticker (all symbols)', `${base}/ticker`)
const symbolsBody = symbolsResult?.body
const rows = symbolsBody?.result ?? symbolsBody?.data ?? symbolsBody
const btc = Array.isArray(rows) && rows.find((row) =>
  row.base_asset === 'BTC' && row.quote_asset === 'THB' &&
  String(row.status).toLowerCase() === 'active' &&
  String(row.market_segment).toUpperCase() === 'SPOT'
)
const tickerRows = tickerResult?.body?.result ?? tickerResult?.body?.data ?? tickerResult?.body
const tickerIsTopLevelArray = Array.isArray(tickerResult?.body)
results.push({ name: 'ticker response contract', outcome: tickerIsTopLevelArray ? 'PASS: top-level array' : 'FAIL: expected top-level array',
  responseShape: Array.isArray(tickerRows) ? `rows=${tickerRows.length}` : typeof tickerRows,
  sampleKeys: Array.isArray(tickerRows) && tickerRows[0] ? Object.keys(tickerRows[0]).join(', ') : '' })

if (btc?.symbol && btc?.pairing_id) {
  const sym = encodeURIComponent(String(btc.symbol).toLowerCase())
  await probe('depth (mapped BTC/THB)', `${base}/depth?sym=${sym}&lmt=5`)
  await probe('trades (mapped BTC/THB)', `${base}/trades?sym=${sym}&lmt=5`)
} else {
  results.push({ name: 'depth/trades (mapped BTC/THB)', outcome: 'SKIPPED: /symbols did not provide a verified active mapping' })
}

console.table(results)
console.log({ origin: location.origin, symbolsFetchSucceeded: Boolean(symbolsResult?.response?.ok),
  btcMappingVerified: Boolean(btc?.symbol && btc?.pairing_id),
  providerSymbol: btc?.symbol ?? null, pairingId: btc?.pairing_id ?? null,
  tickerTopLevelArray: tickerIsTopLevelArray,
  sampleTicker: Array.isArray(tickerRows) ? tickerRows[0] ?? null : null })
```

- [ ] Probe ต้องพิมพ์ผล `/symbols` แม้ fetch/JSON ล้มเหลว และต้องเรียก `/ticker` แยกต่อเสมอ; ในกรณีนั้นต้องเห็นแถว `FETCH_FAILED (CORS/network)` หรือ status/error ของ `/symbols` แทนการหยุดด้วย uncaught exception
- [ ] `/ticker` ที่ไม่ส่ง `sym` ต้องตรวจ response shape ว่าเป็น array ระดับบนสุดตาม REST v3; บันทึกจำนวนแถวและ keys ของแถวตัวอย่าง ถ้าได้ wrapper หรือ shape อื่นให้ทำเครื่องหมาย mismatch และตรวจเอกสาร/payload ก่อนสรุปผล
- [ ] เมื่อ `/symbols` อ่านได้ ให้ตรวจและบันทึก mapping จริง แล้ว probe depth/trades ด้วย symbol จาก mapping เท่านั้น; ถ้า `/symbols` ล้มเหลวให้ระบุ depth/trades ว่า skipped เพราะยังไม่มี mapping ยืนยัน
- [ ] บันทึก HTTP status, เวลา, response shape และ `error` ของ API โดยไม่คัดลอกข้อมูลเกินจำเป็น
- [ ] ใน DevTools → Network ตรวจ Request URL, Request Headers (`Origin`), Response Headers (`Access-Control-Allow-Origin`, ถ้า browser แสดง), status และ response body
- [ ] บันทึก CORS failure แยกจาก HTTP `4xx/5xx`, Bitkub application `error`, timeout และ JSON parse error; ถ้า browser ปฏิเสธ CORS ให้ถือว่า Pages origin ยังใช้ REST feed ไม่ได้ ห้ามใช้ proxy สาธารณะที่ไม่ทราบผู้ดูแล
- [ ] เทียบ mapping คู่กับแถว `/symbols` จริง ได้แก่ `base_asset`, `quote_asset`, `symbol`, `pairing_id`, `status`, `market_segment`; ห้ามยึดตัวอย่างหรือค่าที่ hardcode แทน payload ปัจจุบัน
- [ ] ตรวจราคา, 24h fields, depth และ trade timestamps/units ว่าผ่าน validation; ถ้า endpoint ไม่มี provider timestamp ให้รายงานเวลา “ได้รับจาก browser” แยกชัดเจน ห้ามเรียกว่า exchange timestamp
- [ ] ตรวจ `/symbols` และ REST response เมื่อได้ 429, timeout, malformed JSON หรือ network/CORS error; ต้องคง `STALE`/`UNAVAILABLE` และไม่สร้างราคา/ข้อมูลทดแทน

**ข้อจำกัดหลักฐาน:** การรัน probe นี้พิสูจน์ CORS จาก origin ปัจจุบันเท่านั้น และทดสอบโค้ดที่ deploy อยู่ ไม่ได้พิสูจน์ว่า uncommitted candidate ถูก deploy แล้ว การตรวจ candidate บน Pages origin ต้องใช้ staging deployment ซึ่งต้องขออนุมัติก่อน

## 3. WebSocket และ LIVE → STALE → reconnect

- [ ] จากหน้า Pages จริง เปิด DevTools → Network → WS และยืนยัน handshake ของ public stream สำเร็จ (`101 Switching Protocols`) จาก browser ที่มี origin Pages
- [ ] ยืนยัน ticker stream มาจาก symbol/pair mapping ที่ได้จาก `/symbols` และ order book stream ใช้ `pairing_id` จาก response เดียวกัน
- [ ] ตรวจ ticker frames และ order-book frames ว่ารูปแบบ/ราคา/จำนวนถูกต้องตาม official public WebSocket docs; สำหรับ recent trades ใช้ event `tradeschanged` จาก `orderbook/<pairing_id>` เท่านั้น ห้ามใช้ `market.trade.<symbol>` ซึ่งเอกสารปัจจุบันระบุว่าปิดตั้งแต่ 2026-05-18
- [ ] เก็บ frame ตัวอย่างที่ตัดข้อมูลไม่เกี่ยวข้องออก พร้อมเวลารับจากเครื่อง; บันทึกว่า timestamp ใดมาจาก provider และ timestamp ใดเป็น receive time
- [ ] เมื่อ UI ขึ้น `LIVE` ให้บันทึก source และ last update ของ ticker, book, trades แยกกัน และตรวจว่าไม่มี feed ชนิดหนึ่งทำให้อีกชนิดถูกติดป้าย LIVE โดยไม่มีข้อมูล
- [ ] ทำให้ feed ขาดชั่วคราวด้วย DevTools → Network → Offline หรือ Request blocking สำหรับ `api.bitkub.com`; อย่าลบ LocalStorage หรือแก้ข้อมูลในบัญชีเพื่อจำลองเหตุการณ์
- [ ] รอเกิน stale threshold ปัจจุบัน 30 วินาที แล้วตรวจว่าแต่ละ feed เปลี่ยนเป็น `STALE` หรือ `UNAVAILABLE` พร้อม last update/source เดิม และไม่ค้างป้าย `LIVE`
- [ ] คืน Network แล้วรอ reconnect/backoff; ต้องเห็น WebSocket เชื่อมใหม่และข้อมูล valid ใหม่ก่อน feed กลับเป็น `LIVE` โดยไม่ reload หน้า
- [ ] ทดสอบสลับคู่ Spot ว่า socket/order-book เดิมถูก cleanup, mapping ใหม่ถูกใช้ และไม่มีราคา/book/trades ของคู่ก่อนหน้าปะปน
- [ ] ปิด tab แล้วตรวจว่าไม่มี reconnect/socket loop ของหน้าเดิมค้างอยู่

**หลักฐาน:** screenshot สถานะ `LIVE`, `STALE`/`UNAVAILABLE`, และ `LIVE` หลัง reconnect; Network capture ที่แสดง WS URL/handshake/close/reconnect; Console errors พร้อมเวลา และบันทึกเวลาที่เริ่ม Offline/Online

## 4. Desktop และ mobile visual check

- [ ] ตรวจ local build preview ก่อน; หากจะทดสอบ candidate บน Pages origin ให้รออนุมัติ staging ตาม gate ด้านบน
- [ ] Desktop: viewport 1440×900 และ 1280×800; ตรวจ Dashboard, Portfolio, Trading Terminal, Analytics และ News/Calendar
- [ ] Mobile: viewport 390×844 และ 360×800 (รวมทดสอบ scroll/touch); ตรวจเมนู, ตาราง, กราฟ, modal, input และปุ่มว่าไม่ทับ/ล้นจอ
- [ ] ตรวจให้ source/status/time อ่านได้ โดยเฉพาะข้อมูลราคา `LIVE`/`STALE`/`UNAVAILABLE`, ข่าว `UNAVAILABLE`, และเหตุผลที่คำสั่งถูกพัก
- [ ] ตรวจ Market และ Limit ถูกปิดเมื่อ `orderRulesVerified` เป็น `false`; พยายาม submit ทั้งสองฝั่งแล้ว service ต้องปฏิเสธด้วย ห้ามทำธุรกรรม Paper ที่จับคู่สำเร็จเพื่อผ่าน UI check
- [ ] ตรวจ console ไม่มี uncaught error, React warning ที่กระทบการใช้งาน หรือ WebSocket/JSON error ที่ UI ซ่อนสถานะไว้
- [ ] ตรวจ Console/Network หลัง hard reload และจากการเปิด path `/FINNTECH/` โดยตรง; manifest/icon/assets ต้องไม่ 404

**หลักฐาน:** screenshot desktop/mobile ของแต่ละหน้าหลัก, viewport/device emulation ที่ใช้, Console log และรายการ request ที่ล้มเหลว

## 5. Data, safety และข้อความผลิตภัณฑ์

- [ ] Dashboard, Portfolio และ Trading Terminal ใช้ market-data service/source เดียวกัน; ราคา DEMO ต้องถูกติดป้าย DEMO และห้ามแสดง LIVE
- [ ] ตรวจว่าไม่มี random candles, random order book/trades, ราคา FX คงที่ หรือ fixed USDT/THB แสดงใต้ LIVE; เมื่อข้อมูลหายให้เห็น empty state/`UNAVAILABLE`
- [ ] ตรวจ News และ Economic Calendar ว่าเป็น `UNAVAILABLE` พร้อม empty state และไม่มี headline/actual ตัวเลขตัวอย่างหรือคำว่า “สด”
- [ ] ตรวจข้อความฝาก/ถอน/QR/toast ระบุว่า “จำลอง” และไม่อ้างว่าเงินเข้าบัญชีจริง
- [ ] ตรวจ UI, Network และ built bundle ว่าไม่มีการเรียก private trading/wallet/deposit/withdraw endpoint, ไม่มี API key และไม่มีข้อความว่า exchange ส่ง/จับคู่คำสั่งจริง
- [ ] ตรวจ PWA `start_url`/`scope` และลิงก์ภายในให้สอดคล้องกับ project path `/FINNTECH/`

**หลักฐาน:** screenshot ป้ายสถานะ, Network request summary และผลค้น bundle สำหรับ endpoint/private-key pattern (แนบเฉพาะผล ไม่แนบ secret)

## 6. ชุดหลักฐานส่งผู้ตรวจ

- [ ] Branch, baseline SHA, `git status --short`, `git diff --stat` และ diff ที่ review ได้
- [ ] รวมชื่อและ SHA-256 ของ untracked files ทุกไฟล์ในหลักฐาน เพราะ `git diff` ปกติไม่รวม untracked files; บันทึก metadata ด้วย PowerShell โดยไม่พิมพ์หรือแนบเนื้อหาอัตโนมัติ:

```powershell
$untrackedFiles = @(git ls-files --others --exclude-standard)
foreach ($reviewFile in $untrackedFiles) {
  $reviewHash = (Get-FileHash -LiteralPath $reviewFile -Algorithm SHA256).Hash
  Write-Output "$reviewFile`t$reviewHash"
}
```

- [ ] ตรวจไฟล์ untracked แยกจากการสร้าง metadata เพื่อหา API key, token, secret และข้อมูลส่วนตัว; ห้าม dump เนื้อหาหรือแนบต้นฉบับอัตโนมัติ
- [ ] ปกปิดหรือลบข้อมูลอ่อนไหวในสำเนาที่เตรียมส่ง และตรวจสำเนาซ้ำก่อนแนบ; ส่งเนื้อหาเฉพาะไฟล์ที่ตรวจแล้วว่าไม่อ่อนไหว หรือส่งสำเนาที่ปกปิดแล้ว พร้อมคงชื่อ/hash ของต้นฉบับไว้ในรายการหลักฐาน

- [ ] `npm test`, `npm run build`, `git diff --check` พร้อม exit code และ stdout สรุป
- [ ] REST probe จาก Pages origin: URL/origin, เวลา (Asia/Bangkok และ UTC), status/latency/response shape, mapping `/symbols`, ผล CORS
- [ ] WebSocket evidence: stream URL ที่ได้จาก mapping, handshake, frames ที่ redact แล้ว, stale/reconnect timeline และ screenshot
- [ ] Screenshot desktop/mobile, `UNAVAILABLE` ของข่าว, disabled Market/Limit พร้อมเหตุผล, และ Console/Network errors
- [ ] สรุป `LIVE` จริง, `STALE`, `UNAVAILABLE`, `DEMO`, ข้อจำกัด และรายการ fail/ยังไม่ทดสอบแยกจากกัน
- [ ] ห้ามแนบ HAR ที่มีข้อมูลบัญชี/secret; public market feed ไม่ควรต้องใช้ credential

## 7. อนุมัติ staging/release

- [ ] หยุดก่อน deploy staging จนกว่าเจ้าของจะอนุมัติ URL/โครงการเป้าหมายและขอบเขตการเผยแพร่โดยชัดเจน
- [ ] หลังอนุมัติ staging ให้ตรวจ candidate build จาก Pages origin จริงซ้ำตามหัวข้อ 2–5 และส่งผลกลับให้ตรวจทวน
- [ ] ห้าม production deploy, commit หรือ push จาก checklist นี้; release ต้องมีการอนุมัติแยกหลังผู้ตรวจรับหลักฐาน

## เอกสารอ้างอิงทางการ

- [Bitkub REST API v3](https://github.com/bitkub/bitkub-official-api-docs/blob/master/rest-v3.md)
- [Bitkub Public WebSocket API](https://github.com/bitkub/bitkub-official-api-docs/blob/master/websocket-public.md)
