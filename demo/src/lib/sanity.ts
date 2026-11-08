/**
 * Plausibility rules for sensor readings. A sensor that is warming up, unplugged or mis-wired can
 * send numbers that are valid JSON but impossible (CO2 32767, dust 6553.5, a "57 C" room). They must
 * never be scored, alerted on or stored as real data, so every consumer drops them.
 *
 * Keep in step with demo/server/sanity.mjs and ingest/server/sanity.mjs (tests check the tables match
 * where they can) and with the table in docs/mqtt_contract.md.
 */
export const VALID_RANGE: Record<string, readonly [number, number]> = {
  co2_ppm: [1, 10000], // 0 = not ready, 32767 / 65535 = sensor error markers
  pm1_0: [0, 1000],
  pm2_5: [0, 1000], // 6553.5 (0xFFFF / 10) = "no data"
  pm4_0: [0, 1000],
  pm10_0: [0, 1000],
  temp_c: [-10, 50], // the DHT11 itself only measures 0 to 50
  rh_pct: [0, 100],
  soil_moisture: [0, 100],
  soil_temp_c: [-10, 60],
}

/** temp_c and rh_pct come from one sensor read: if either is impossible the other is not trusted either. */
const PAIRED = ['temp_c', 'rh_pct'] as const

const ok = (key: string, v: unknown): v is number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return false
  const r = VALID_RANGE[key]
  return r ? v >= r[0] && v <= r[1] : true // unknown keys pass through untouched
}

export function sanitizeMetrics(metrics: Record<string, number>): { metrics: Record<string, number>; dropped: string[] } {
  const out: Record<string, number> = {}
  const dropped: string[] = []
  const pairBad = PAIRED.some((k) => k in metrics && !ok(k, metrics[k]))
  for (const [k, v] of Object.entries(metrics)) {
    if (!ok(k, v) || (pairBad && (PAIRED as readonly string[]).includes(k))) dropped.push(k)
    else out[k] = v
  }
  return { metrics: out, dropped }
}
