import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

const FISH_ASR_URL = 'https://api.fish.audio/v1/asr'
const MAX_AUDIO_BYTES = 5 * 1024 * 1024
const RATE_LIMIT = 20 // transcriptions per IP per minute: the key is paid, so cap abuse
const RATE_WINDOW_MS = 60_000
const AI_RATE_LIMIT = 30 // Gemini calls per IP per minute
const MAX_JSON_BYTES = 16 * 1024

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
export function createHandler({ distDir, fishKey, fetchImpl = fetch, now = Date.now, allowedOrigins = [], knowledge = null }) {
  const hits = new Map()
  const aiHits = new Map()
  // Other pages (e.g. the Pi touchscreen at http://localhost:3000) may call this server if listed.
  const allowed = new Set(allowedOrigins)
  const corsFor = (origin) =>
    origin && allowed.has(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : {}

  function limited(ip) {
    const t = now()
    const recent = (hits.get(ip) ?? []).filter((x) => t - x < RATE_WINDOW_MS)
    recent.push(t)
    hits.set(ip, recent)
    return recent.length > RATE_LIMIT
  }

  function aiLimited(ip) {
    const t = now()
    const recent = (aiHits.get(ip) ?? []).filter((x) => t - x < RATE_WINDOW_MS)
    recent.push(t)
    aiHits.set(ip, recent)
    return recent.length > AI_RATE_LIMIT
  }

  const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket.remoteAddress ?? 'unknown'

  /** Same rule as transcribe: only our own page (or a listed one, like the Pi screen) may call. Returns false after replying 403. */
  function originAllowed(req, res) {
    const origin = req.headers.origin
    if (origin && new URL(origin).host !== req.headers.host && !allowed.has(origin)) {
      json(res, 403, { error: 'forbidden' })
      return false
    }
    for (const [k, v] of Object.entries(corsFor(origin))) res.setHeader(k, v)
    return true
  }

  async function readJsonBody(req, res) {
    const raw = await readBody(req, MAX_JSON_BYTES)
    if (raw === null) return json(res, 413, { error: 'too_large' }), undefined
    try {
      return JSON.parse(raw.toString('utf8'))
    } catch {
      return json(res, 400, { error: 'bad_json' }), undefined
    }
  }

  /** Runs a knowledge call, turning its errors into clean status codes (no details leaked). */
  async function knowledgeCall(res, fn) {
    try {
      return json(res, 200, await fn())
    } catch (e) {
      const status = [400, 404, 503].includes(e.status) ? e.status : 502
      return json(res, status, { error: e.message?.match(/^[a-z_]+$/) ? e.message : 'upstream_failed' })
    }
  }

  async function plants(req, res) {
    if (!knowledge) return json(res, 503, { error: 'knowledge_not_configured' })
    if (!originAllowed(req, res)) return
    return knowledgeCall(res, async () => ({ plants: await knowledge.list() }))
  }

  async function matchPlant(req, res) {
    if (!knowledge) return json(res, 503, { error: 'knowledge_not_configured' })
    if (!originAllowed(req, res)) return
    if (aiLimited(clientIp(req))) return json(res, 429, { error: 'rate_limited' })
    const body = await readJsonBody(req, res)
    if (body === undefined) return
    return knowledgeCall(res, async () => ({ match: await knowledge.match(body?.utterance) }))
  }

  async function ask(req, res) {
    if (!knowledge) return json(res, 503, { error: 'knowledge_not_configured' })
    if (!originAllowed(req, res)) return
    if (aiLimited(clientIp(req))) return json(res, 429, { error: 'rate_limited' })
    const body = await readJsonBody(req, res)
    if (body === undefined) return
    return knowledgeCall(res, () =>
      knowledge.ask({
        plantTypeId: body?.plant_type_id,
        question: body?.question,
        metrics: body?.metrics && typeof body.metrics === 'object' ? body.metrics : {},
        healthScore: body?.health_score,
      }),
    )
  }

  async function transcribe(req, res) {
    if (!fishKey) return json(res, 503, { error: 'voice_not_configured' })

    // Only our own page may call this (it spends the Fish Audio key).
    const origin = req.headers.origin
    if (origin && new URL(origin).host !== req.headers.host && !allowed.has(origin)) return json(res, 403, { error: 'forbidden' })
    for (const [k, v] of Object.entries(corsFor(origin))) res.setHeader(k, v)

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
      // Only app routes (no file extension) fall back to index.html. A missing file such as
      // /sprites/x.png must be a real 404, not an HTML page the browser mistakes for the file.
      if (extname(url.pathname)) return json(res, 404, { error: 'not_found' })
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
      if (path === '/api/plants' && req.method === 'GET') return await plants(req, res)
      if (path === '/api/plants/match' && req.method === 'POST') return await matchPlant(req, res)
      if (path === '/api/ask' && req.method === 'POST') return await ask(req, res)
      if (path === '/api/transcribe' || path === '/api/plants' || path === '/api/plants/match' || path === '/api/ask') {
        if (req.method === 'OPTIONS') {
          const cors = corsFor(req.headers.origin)
          if (!cors['Access-Control-Allow-Origin']) return json(res, 403, { error: 'forbidden' })
          res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' })
          return res.end()
        }
        if (path === '/api/transcribe' && req.method === 'POST') return await transcribe(req, res)
        return json(res, 405, { error: 'method_not_allowed' })
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' })
      return await serveStatic(req, res)
    } catch {
      if (!res.headersSent) json(res, 500, { error: 'server_error' })
      else res.end()
    }
  }
}
