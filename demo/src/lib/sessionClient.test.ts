import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NoopSession, SessionClient } from './sessionClient'

type Call = { path: string; body: Record<string, unknown> }

function make(handler: (path: string, body: Record<string, unknown>, n: number) => unknown) {
  const calls: Call[] = []
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url).replace('https://ingest.example', '')
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    calls.push({ path, body })
    const out = handler(path, body, calls.length)
    if (out instanceof Error) throw out
    return { ok: true, json: async () => out } as Response
  })
  const client = new SessionClient({ base: 'https://ingest.example/', deviceId: 'esp32-pot-01', fetchImpl: fetchImpl as unknown as typeof fetch, heartbeatMs: 60_000 })
  return { client, calls }
}

const ok = (path: string) => (path.endsWith('/start') ? { session_id: 'abc' } : path.endsWith('/heartbeat') ? { active: true } : { stopped: true })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('SessionClient', () => {
  it('starts a session for the confirmed plant, then beats every minute with its id', async () => {
    const { client, calls } = make(ok)
    client.start('dracaena')
    await vi.advanceTimersByTimeAsync(0)
    expect(calls[0]).toEqual({ path: '/api/session/start', body: { device_id: 'esp32-pot-01', plant_type_id: 'dracaena' } })
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls.slice(1).map((c) => c.path)).toEqual(['/api/session/heartbeat', '/api/session/heartbeat'])
    expect(calls[1].body).toEqual({ session_id: 'abc' })
    await client.stop()
  })

  it('STOP ends the session in the cloud and the heartbeat stops', async () => {
    const { client, calls } = make(ok)
    client.start('dracaena')
    await vi.advanceTimersByTimeAsync(0)
    await client.stop()
    expect(calls[calls.length - 1]).toEqual({ path: '/api/session/stop', body: { session_id: 'abc' } })
    const before = calls.length
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(calls.length).toBe(before)
  })

  it('keeps trying quietly when the cloud is unreachable, and starts as soon as it is back', async () => {
    let up = false
    const { client, calls } = make((path) => (up ? ok(path) : new Error('offline')))
    client.start('dracaena')
    await vi.advanceTimersByTimeAsync(0) // first attempt fails, nothing thrown
    await vi.advanceTimersByTimeAsync(60_000) // still down
    up = true
    await vi.advanceTimersByTimeAsync(60_000) // retried start works
    await vi.advanceTimersByTimeAsync(60_000) // now it heartbeats
    const paths = calls.map((c) => c.path)
    expect(paths.filter((p) => p === '/api/session/start').length).toBe(3)
    expect(paths[paths.length - 1]).toBe('/api/session/heartbeat')
    await client.stop()
  })

  it('starts again if the cloud says the session is no longer active while the screen is still live', async () => {
    let n = 0
    const { client, calls } = make((path) => (path.endsWith('/start') ? { session_id: `s${++n}` } : { active: false }))
    client.start('dracaena')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000) // heartbeat says inactive -> start again
    expect(calls.map((c) => c.path)).toEqual(['/api/session/start', '/api/session/heartbeat', '/api/session/start'])
    await client.stop()
  })

  it('a slow start that finishes after STOP is closed straight away, not left running', async () => {
    let release: (v: unknown) => void = () => {}
    const gate = new Promise((r) => (release = r))
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url).replace('https://ingest.example', '')
      calls.push(path)
      if (path.endsWith('/start')) await gate
      return { ok: true, json: async () => (path.endsWith('/start') ? { session_id: 'late' } : { stopped: true }) } as Response
    })
    const client = new SessionClient({ base: 'https://ingest.example', deviceId: 'esp32-pot-01', fetchImpl: fetchImpl as unknown as typeof fetch })
    client.start('dracaena')
    await vi.advanceTimersByTimeAsync(0)
    await client.stop() // pressed before the start request came back
    release(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toEqual(['/api/session/start', '/api/session/stop'])
  })

  it('gives up on a hanging request instead of freezing', async () => {
    const hang = vi.fn((_u: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted')))))
    const client = new SessionClient({ base: 'https://ingest.example', deviceId: 'esp32-pot-01', fetchImpl: hang as unknown as typeof fetch, timeoutMs: 1000 })
    client.start('dracaena')
    await vi.advanceTimersByTimeAsync(1500)
    expect(hang).toHaveBeenCalledTimes(1) // timed out without throwing
    await client.stop()
  })
})

describe('NoopSession', () => {
  it('does nothing (mock mode)', async () => {
    const s = new NoopSession()
    s.start()
    await expect(s.stop()).resolves.toBeUndefined()
  })
})
