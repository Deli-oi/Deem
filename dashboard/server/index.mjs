import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createHandler } from './handler.mjs'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const port = Number(process.env.PORT ?? 3000)

createServer(createHandler({ distDir })).listen(port, '0.0.0.0', () => {
  console.log(`Deem greenhouse dashboard on :${port}`)
})
