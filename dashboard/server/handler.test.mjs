// @vitest-environment node
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHandler } from './handler.mjs'

let server
let base

beforeAll(async () => {
  const distDir = await mkdtemp(join(tmpdir(), 'deem-gh-dist-'))
  await mkdir(join(distDir, 'assets'))
  await mkdir(join(distDir, 'map'))
  await writeFile(join(distDir, 'index.html'), '<html>greenhouse</html>')
  await writeFile(join(distDir, 'assets', 'app.js'), 'console.log(1)')
  await writeFile(join(distDir, 'map', 'dracaena.png'), 'png')
  server = createServer(createHandler({ distDir }))
  await new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`
      resolve()
    }),
  )
})

afterAll(() => server.close())

describe('dashboard static server', () => {
  it('serves the app at / and for app routes', async () => {
    expect(await (await fetch(`${base}/`)).text()).toContain('greenhouse')
    expect(await (await fetch(`${base}/anything/here`)).text()).toContain('greenhouse')
  })

  it('serves hashed assets as immutable and map sprites as images', async () => {
    const asset = await fetch(`${base}/assets/app.js`)
    expect(asset.headers.get('content-type')).toContain('javascript')
    expect(asset.headers.get('cache-control')).toContain('immutable')
    expect((await fetch(`${base}/map/dracaena.png`)).headers.get('content-type')).toBe('image/png')
  })

  it('returns a real 404 for a missing file, not the app HTML', async () => {
    const res = await fetch(`${base}/map/nope.png`)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).not.toContain('text/html')
  })

  it('has no API and only allows GET', async () => {
    expect((await fetch(`${base}/`, { method: 'POST', body: 'x' })).status).toBe(405)
  })

  it('does not serve files outside the build folder', async () => {
    const res = await fetch(`${base}/..%2f..%2fetc%2fpasswd`)
    expect(await res.text()).not.toContain('root:')
  })
})
