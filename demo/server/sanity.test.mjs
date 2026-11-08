// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { VALID_RANGE as appRanges, sanitizeMetrics as appSanitize } from '../src/lib/sanity'
import { VALID_RANGE, sanitizeMetrics } from './sanity.mjs'
import { readFileSync } from 'node:fs'

describe('the server copy of the plausibility rules', () => {
  it('has exactly the same table and behaviour as the app', () => {
    expect(VALID_RANGE).toEqual(appRanges)
    for (const m of [{ co2_ppm: 32767, temp_c: 57, rh_pct: 95 }, { co2_ppm: 600, temp_c: 22, rh_pct: 40, pm2_5: 6553.5 }, { soil_moisture: 12 }]) {
      expect(sanitizeMetrics(m)).toEqual(appSanitize(m))
    }
  })
  it('the ingest copy is the same file', () => {
    expect(readFileSync(new URL('../../ingest/server/sanity.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n')).toBe(readFileSync(new URL('./sanity.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n'))
  })
})
