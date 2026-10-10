// Splits export time into database read, schema validation and accounting verification for the
// largest seeded synthetic owner (full local CPU; the 0.1-CPU container is roughly proportional).
import { performance } from 'node:perf_hooks'
import { backupDocumentSchema } from '@finntech/contracts'
import { createTrackerDatabase } from '../../../apps/api/src/persistence/database.js'
import { exportBackup, prepareBackup } from '../../../apps/api/src/tracker/backup.js'
import { databaseUrl } from './env.mjs'

const db = createTrackerDatabase(databaseUrl)
const owner = (await db.$queryRaw<{ owner_id: string }[]>`SELECT owner_id FROM finance_transactions GROUP BY owner_id ORDER BY count(*) DESC LIMIT 1`)[0]!.owner_id
const timed = async <T>(label: string, work: () => Promise<T> | T) => { const s = performance.now(); const r = await work(); console.log(label, Math.round(performance.now() - s), 'ms'); return r }
const doc = await timed('exportBackup total', () => exportBackup(db, owner))
const json = await timed('JSON.stringify', () => JSON.stringify(doc))
const parsed = await timed('JSON.parse', () => JSON.parse(json))
await timed('backupDocumentSchema.parse', () => backupDocumentSchema.parse(parsed))
await timed('prepareBackup (parse + replay + summary)', () => prepareBackup(parsed))
console.log('bytes', Buffer.byteLength(json))
await db.$disconnect()
