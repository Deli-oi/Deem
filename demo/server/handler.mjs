import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

const FISH_ASR_URL = 'https://api.fish.audio/v1/asr'
const MAX_AUDIO_BYTES = 5 * 1024 * 1024
const RATE_LIMIT = 20 // transcriptions per IP per minute: the key is paid, so cap abuse
const RATE_WINDOW_MS = 60_000

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

/** Fish Audio tags text like <|speaker:0|>; strip them and trailing punctuation. */
export function cleanTranscript(raw) {
  return String(raw ?? '')
    .replace(/<\|[^|]*\|>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?。！？]+$/u, '')
    .trim()
}

function extensionFor(contentType) {
  if (contentType.includes('ogg')) return 'ogg'
  if (contentType.includes('mp4') || contentType.includes('aac')) return 'm4a'
  if (contentType.includes('wav')) return 'wav'
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3'
  return 'webm'
}

async function readBody(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

/**
 * Creates the request handler. Injected `fetchImpl` and `now` keep it testable.
 * - POST /api/transcribe: audio body -> Fish Audio ASR -> { text }
 * - anything else: static files from `distDir`, falling back to index.html (single-page app)
 */
export function createHandler({ distDir, fishKey, fetchImpl = fetch, now = Date.now }) {
  const hits = new Map()

  function limited(ip) {
    const t = now()
    const recent = (hits.get(ip) ?? []).filter((x) => t - x < RATE_WINDOW_MS)
    recent.push(t)
    hits.set(ip, recent)
    return recent.length > RATE_LIMIT
  }

  async function transcribe(req, res) {
    if (!fishKey) return json(res, 503, { error: 'voice_not_configured' })

    // Only our own page may call this (it spends the Fish Audio key).
    const origin = req.headers.origin
    if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'forbidden' })

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket.remoteAddress ?? 'unknown'
    if (limited(ip)) return json(res, 429, { error: 'rate_limited' })

    const audio = await readBody(req, MAX_AUDIO_BYTES)
    if (audio === null) return json(res, 413, { error: 'audio_too_large' })
    if (audio.length === 0) return json(res, 400, { error: 'empty_audio' })

    const contentType = (req.headers['content-type'] ?? 'audio/webm').split(';')[0]
    const form = new FormData()
    form.append('audio', new Blob([audio], { type: contentType }), `speech.${extensionFor(contentType)}`)
    form.append('language', 'en')
    form.append('ignore_timestamps', 'true')
    form.append('tag_audio_events', 'false')
    form.append('diarize', 'false')

    let upstream
    try {
      upstream = await fetchImpl(FISH_ASR_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${fishKey}`, model: 'transcribe-1-pro' },
        body: form,
      })
    } catch {
      return json(res, 502, { error: 'upstream_unreachable' })
    }
    if (!upstream.ok) return json(res, 502, { error: 'upstream_failed', status: upstream.status })
    const data = await upstream.json()
    return json(res, 200, { text: cleanTranscript(data.text) })
  }

  async function serveStatic(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const safe = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')
    let file = join(distDir, safe)
    if (file !== distDir && !file.startsWith(distDir + sep)) return json(res, 403, { error: 'forbidden' })
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
    } catch {
      file = join(distDir, 'index.html') // SPA fallback
    }
    try {
      const body = await readFile(file)
      const hashed = file.includes(`${sep}assets${sep}`)
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      })
      res.end(body)
    } catch {
      json(res, 404, { error: 'not_found' })
    }
  }

  return async function handler(req, res) {
    try {
      const path = (req.url ?? '/').split('?')[0]
      if (path === '/api/transcribe') {
        if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
        return await transcribe(req, res)
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' })
      return await serveStatic(req, res)
    } catch {
      if (!res.headersSent) json(res, 500, { error: 'server_error' })
      else res.end()
    }
  }
}
