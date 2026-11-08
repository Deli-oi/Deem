import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createHandler } from './handler.mjs'
import { createKnowledge } from './knowledge.mjs'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const port = Number(process.env.PORT ?? 3000)
const fishKey = process.env.FISH_AUDIO_API_KEY
const geminiKey = process.env.GEMINI_API_KEY
// Comma-separated pages allowed to call the /api routes from another origin, e.g. http://localhost:3000 for the Pi screen.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

// The Tiger database holds the plant knowledge. Only a real connection string counts: a bare key
// (no postgres:// scheme) is ignored, and the bundled seed file is used instead.
const dbUrl = process.env.TIGER_DATABASE_URL ?? process.env.DATABASE_URL
const dbOk = typeof dbUrl === 'string' && /^postgres(ql)?:\/\//.test(dbUrl)
const pool = dbOk ? new pg.Pool({ connectionString: dbUrl, max: 3 }) : null
if (dbUrl && !dbOk) console.warn('TIGER_DATABASE_URL is not a postgres:// connection string: plant knowledge comes from the seed file')

const knowledge = createKnowledge({
  pool,
  seedPath: `${distDir}/plants/seed_all.json`,
  gemini: { apiKey: geminiKey, model: process.env.GEMINI_MODEL || 'gemini-flash-latest' },
})
const init = await knowledge.init()

createServer(createHandler({ distDir, fishKey, allowedOrigins, knowledge })).listen(port, '0.0.0.0', () => {
  console.log(
    `Deem on :${port} (voice ${fishKey ? 'enabled' : 'DISABLED: set FISH_AUDIO_API_KEY'}, ` +
      `plants ${pool ? (init.error ? 'seed file (database error)' : `Tiger (${init.stored} stored)`) : 'seed file'}, ` +
      `gemini ${geminiKey ? 'enabled' : 'DISABLED: set GEMINI_API_KEY'})`,
  )
})
