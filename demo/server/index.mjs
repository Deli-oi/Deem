import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createHandler } from './handler.mjs'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const port = Number(process.env.PORT ?? 3000)
const fishKey = process.env.FISH_AUDIO_API_KEY
// Comma-separated pages allowed to call /api/transcribe from another origin, e.g. http://localhost:3000 for the Pi screen.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

createServer(createHandler({ distDir, fishKey, allowedOrigins })).listen(port, '0.0.0.0', () => {
  console.log(`Deem on :${port} (voice ${fishKey ? 'enabled' : 'DISABLED: set FISH_AUDIO_API_KEY'})`)
})
