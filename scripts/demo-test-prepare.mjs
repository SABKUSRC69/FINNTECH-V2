import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
const password = randomBytes(32).toString('hex')
await mkdir('.demo-20261008.local', { recursive: true })
// Exclusive creation preserves a retained fixture's credentials on subsequent runs.
try {
  await writeFile('.demo-20261008.local/test.env', `DEMO_TEST_DATABASE_PASSWORD=${password}\nDATABASE_URL=postgresql://demo_fixture:${password}@127.0.0.1:5443/finntech_demo_test_20261008\n`, { flag: 'wx' })
  console.log('Synthetic demo target prepared; credentials withheld')
} catch (error) { if (error.code !== 'EEXIST') throw new Error('Fixture preparation failed (details withheld)'); console.log('Existing fixture configuration preserved') }
