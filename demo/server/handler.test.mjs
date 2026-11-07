// @vitest-environment node
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanTranscript, createHandler } from './handler.mjs'

let distDir
let server
let base
let fetchImpl
let clock = 1_000_000

function start(fishKey) {
  fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ text: '<|speaker:0|> Golden pothos.' }) }))
  server = createServer(createHandler({ distDir, fishKey, fetchImpl, now: () => clock }))
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`
      resolve()
    }),
  )
}

beforeAll(async () => {
  distDir = await mkdtemp(join(tmpdir(), 'deem-dist-'))
  await mkdir(join(distDir, 'assets'))
  await writeFile(join(distDir, 'index.html'), '<html>deem</html>')
  await writeFile(join(distDir, 'assets', 'app.js'), 'console.log(1)')
  await start('test-key')
})

afterAll(() => server.close())

const post = (body, headers = {}) =>
  fetch(`${base}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/webm', ...headers }, body })

describe('cleanTranscript', () => {
  it('drops Fish Audio tags, whitespace and trailing punctuation', () => {
    expect(cleanTranscript('<|speaker:0|> Golden pothos.')).toBe('Golden pothos')
    expect(cleanTranscript('  why is it   drooping?  ')).toBe('why is it drooping')
    expect(cleanTranscript(undefined)).toBe('')
  })
})

describe('POST /api/transcribe', () => {
  it('forwards audio to Fish Audio with the key and model, and returns clean text', async () => {
    const res = await post(Buffer.from('fake-audio'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ text: 'Golden pothos' })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.fish.audio/v1/asr')
    expect(init.headers.Authorization).toBe('Bearer test-key')
    expect(init.headers.model).toBe('transcribe-1-pro')
    expect(init.body.get('audio')).toBeTruthy()
    expect(init.body.get('ignore_timestamps')).toBe('true')
  })

  it('rejects empty audio', async () => {
    const res = await post(Buffer.alloc(0))
    expect(res.status).toBe(400)
  })

  it('rejects oversized audio', async () => {
    const res = await post(Buffer.alloc(5 * 1024 * 1024 + 1))
    expect(res.status).toBe(413)
  })

  it('rejects requests from another origin', async () => {
    const res = await post(Buffer.from('x'), { Origin: 'https://evil.example' })
    expect(res.status).toBe(403)
  })

  it('reports an upstream failure as 502 without leaking details', async () => {
    fetchImpl.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    const res = await post(Buffer.from('x'))
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('test-key')
  })

  it('rate limits after 20 requests a minute', async () => {
    clock += 120_000 // start a fresh window
    let last = 200
    for (let i = 0; i < 22; i++) last = (await post(Buffer.from('x'))).status
    expect(last).toBe(429)
  })

  it('only accepts POST', async () => {
    const res = await fetch(`${base}/api/transcribe`)
    expect(res.status).toBe(405)
  })
})

describe('static files', () => {
  it('serves index.html, assets, and falls back to index.html for app routes', async () => {
    expect(await (await fetch(`${base}/`)).text()).toContain('deem')
    const asset = await fetch(`${base}/assets/app.js`)
    expect(asset.headers.get('content-type')).toContain('javascript')
    expect(asset.headers.get('cache-control')).toContain('immutable')
    expect(await (await fetch(`${base}/some/route`)).text()).toContain('deem')
  })

  it('blocks path traversal', async () => {
    const res = await fetch(`${base}/..%2f..%2fetc%2fpasswd`)
    expect([200, 403, 404]).toContain(res.status)
    expect(await res.text()).not.toContain('root:')
  })
})

describe('without a Fish Audio key', () => {
  it('answers 503 so the UI can say voice is not set up', async () => {
    server.close()
    await start(undefined)
    const res = await post(Buffer.from('x'))
    expect(res.status).toBe(503)
  })
})
