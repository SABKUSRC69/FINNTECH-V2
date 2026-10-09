import type { MailConfiguration } from './config.js'
import { openEnvelope, type DeliverySink } from './delivery.js'

const emailPattern = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/
const escape = (text: string) => text.replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]!)
export class BrevoDeliverySink implements DeliverySink {
  constructor(private readonly settings: MailConfiguration, private readonly key: string, private readonly origin: string,
    private readonly transport: typeof fetch = fetch) {}
  async deliver(id: string, envelope: string): Promise<void> {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('mail_delivery_rejected')
    const message = openEnvelope(envelope, this.key)
    if (!emailPattern.test(message.email) || message.email.length > 254 || !['verify', 'reset', 'notice'].includes(message.kind)) throw new Error('mail_delivery_rejected')
    let link: URL | undefined
    if (message.kind !== 'notice') {
      try { link = new URL(message.link!) } catch { throw new Error('mail_delivery_rejected') }
      const expectedPath = message.kind === 'verify' ? '/account/verify' : '/account/reset'
      if (link.origin !== this.origin || link.pathname !== expectedPath || link.search || !link.hash.startsWith('#token=')) throw new Error('mail_delivery_rejected')
    }
    const subject = message.kind === 'verify' ? 'FINNTECH — ยืนยันอีเมล' : message.kind === 'reset' ? 'FINNTECH — ตั้งรหัสผ่านใหม่' : 'FINNTECH — รหัสผ่านถูกเปลี่ยนแล้ว'
    const text = link ? `${subject}\nเปิดลิงก์แล้วกดยืนยันด้วยตนเอง ลิงก์ใช้ได้ครั้งเดียว\n${link.href}\nหากไม่ได้ร้องขอ ไม่ต้องดำเนินการ` : `${subject}\nSessions เดิมถูกเพิกถอนแล้ว หากไม่ได้ดำเนินการเอง ให้ขอลิงก์กู้คืนจากเว็บไซต์`
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 2500)
    try {
      const response = await this.transport('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'api-key': this.settings.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { name: 'FINNTECH', email: this.settings.sender }, to: [{ email: message.email }],
          subject, textContent: text, htmlContent: `<p>${escape(text).replace(/\n/g, '<br>')}</p>${link ? `<p><a href="${escape(link.href)}">${escape(subject)}</a></p>` : ''}`, headers: { 'Idempotency-Key': id } }),
      })
      if (response.status === 201) { void response.body?.cancel(); return }
      // A repeated provider receipt is acceptance of the SAME request, not a new send.
      const reader = response.body?.getReader(); let size = 0; const chunks: Uint8Array[] = []
      if (reader) { try {
        while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 4096) break; chunks.push(item.value) }
      } finally { void reader.cancel().catch(() => {}) } }
      if (response.status === 400 && size <= 4096) {
        const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (result && typeof result === 'object' && 'code' in result && result.code === 'duplicate_parameter') return
      }
      throw new Error('mail_delivery_unconfirmed')
    } catch { throw new Error('mail_delivery_unconfirmed') }
    finally { clearTimeout(timer) }
  }
}
