/**
 * Air-quality limits from the SEN63C. They are the same for every plant: the plant data
 * (MiFloraDB) has no per-species ranges for CO2 or particulates, and these are about the room
 * more than the plant. A plant's own `thresholds` always win if it ever defines one of these.
 *
 * The limits are deliberately on the high side ("needs fixing now", not "slightly stuffy"),
 * so a busy room does not set off the alert constantly:
 *   - CO2 > 1500 ppm: clearly stale air. Outdoor air is ~420, a normal room 600-1000, and
 *     1000 is the usual "poor ventilation" guideline. (The health score starts easing off
 *     at 1000; the alert waits until 1500.)
 *   - PM2.5 > 35 ug/m3: the US EPA 24-hour limit (WHO's stricter guideline is 15).
 *   - PM10 > 150 ug/m3: the US EPA 24-hour limit.
 * PM1.0 and PM4.0 have no standard, so they never alert.
 * Nothing alerts for LOW values (a low CO2 reading is outdoor air or a sensor issue, not a problem).
 */
export const AIR_QUALITY_LIMITS: Record<string, { min: number | null; max: number | null }> = {
  co2_ppm: { min: null, max: 1500 },
  pm2_5: { min: null, max: 35 },
  pm10_0: { min: null, max: 150 },
}

type Solution = { problem: string; advice: string; trigger: { metric: string; op: string; value: number } }

/** Stored fixes for the blanket limits, for the assistant (the plant data has none for these). */
export const AIR_QUALITY_SOLUTIONS: Solution[] = [
  {
    problem: 'air_stale_co2',
    trigger: { metric: 'co2_ppm', op: '>', value: AIR_QUALITY_LIMITS.co2_ppm.max as number },
    advice: 'The air is stuffy (CO2 is high). Open a window or run a fan to bring in fresh air, and move the plant away from a crowded spot. Plants are fine with extra CO2, but you will not be.',
  },
  {
    problem: 'air_dust_pm2_5',
    trigger: { metric: 'pm2_5', op: '>', value: AIR_QUALITY_LIMITS.pm2_5.max as number },
    advice: 'There is a lot of fine dust or smoke in the air. Ventilate, stop anything burning or smoking nearby, and wipe the leaves with a damp cloth so dust does not block light.',
  },
  {
    problem: 'air_dust_pm10',
    trigger: { metric: 'pm10_0', op: '>', value: AIR_QUALITY_LIMITS.pm10_0.max as number },
    advice: 'There is a lot of coarse dust in the air. Ventilate, clean nearby surfaces, and wipe the leaves with a damp cloth.',
  },
]
