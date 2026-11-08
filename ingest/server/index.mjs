import { createServer } from 'node:http'
import pg from 'pg'
import { createHandler } from './handler.mjs'
import { PgStore, MemoryStore } from './store.mjs'

const port = Number(process.env.PORT ?? 3000)
const token = process.env.DEEM_SINK_TOKEN
const dbUrl = process.env.TIGER_DATABASE_URL ?? process.env.DATABASE_URL

let store
if (dbUrl) {
  store = new PgStore(new pg.Pool({ connectionString: dbUrl, max: 5 }))
} else {
  console.warn('TIGER_DATABASE_URL is not set: using in-memory storage (lost on restart)')
  store = new MemoryStore()
}
await store.init()

createServer(createHandler({ store, token })).listen(port, '0.0.0.0', () => {
  console.log(`Deem ingest on :${port} (database ${dbUrl ? 'Tiger' : 'MEMORY'}, ingest ${token ? 'enabled' : 'DISABLED: set DEEM_SINK_TOKEN'})`)
})
