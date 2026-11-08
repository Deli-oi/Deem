import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

/**
 * Static file server for the built dashboard. There is no API: the dashboard is a self-contained
 * mock with simulated data and talks to nothing.
 * Only app routes (no file extension) fall back to index.html; a missing file is a real 404.
 */
export function createHandler({ distDir }) {
  return async function handler(req, res) {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' })
      const url = new URL(req.url ?? '/', 'http://localhost')
      const safe = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')
      let file = join(distDir, safe)
      if (file !== distDir && !file.startsWith(distDir + sep)) return json(res, 403, { error: 'forbidden' })
      try {
        if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
      } catch {
        if (extname(url.pathname)) return json(res, 404, { error: 'not_found' })
        file = join(distDir, 'index.html')
      }
      const body = await readFile(file)
      const hashed = file.includes(`${sep}assets${sep}`)
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      })
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch {
      if (!res.headersSent) json(res, 404, { error: 'not_found' })
      else res.end()
    }
  }
}
