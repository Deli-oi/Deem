import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createHandler } from './handler.mjs'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const port = Number(process.env.PORT ?? 3000)
const fishKey = process.env.FISH_AUDIO_API_KEY

createServer(createHandler({ distDir, fishKey })).listen(port, '0.0.0.0', () => {
  console.log(`Deem on :${port} (voice ${fishKey ? 'enabled' : 'DISABLED: set FISH_AUDIO_API_KEY'})`)
})
