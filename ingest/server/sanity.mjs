/**
 * Plausibility rules for sensor readings. A sensor that is warming up, unplugged or mis-wired can
 * send numbers that are valid JSON but impossible (CO2 32767, dust 6553.5, a "57 C" room). They must
 * never be scored, alerted on or stored as real data, so every consumer drops them.
 *
 * Plain-JS copy of demo/src/lib/sanity.ts (the app's version). Keep the tables identical; a test in
 * demo/server checks the demo copies, and the table in docs/mqtt_contract.md is the reference.
 */
export const VALID_RANGE = {
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
const PAIRED = ['temp_c', 'rh_pct']

const ok = (key, v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return false
  const r = VALID_RANGE[key]
  return r ? v >= r[0] && v <= r[1] : true // unknown keys pass through untouched
}

export function sanitizeMetrics(metrics) {
  const out = {}
  const dropped = []
  const pairBad = PAIRED.some((k) => k in metrics && !ok(k, metrics[k]))
  for (const [k, v] of Object.entries(metrics)) {
    if (!ok(k, v) || (pairBad && PAIRED.includes(k))) dropped.push(k)
    else out[k] = v
  }
  return { metrics: out, dropped }
}
