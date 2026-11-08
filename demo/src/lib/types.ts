import type { MetricMap } from './mqttContract'

/** Numeric `metrics` object from docs/mqtt_contract.md. Devices may omit keys. */
export type Metrics = MetricMap

export type Telemetry = {
  id?: string
  label?: string
  device_id: string
  ts: number
  fw?: string
  metrics: Metrics
  received_ts?: number
  health_score?: number
}

export type ThresholdRange = { min: number | null; max: number | null }

export type PlantType = {
  plant_type_id: string
  common_names: string[]
  scientific_name: string
  synonyms?: string[]
  demo_candidate?: boolean
  thresholds: {
    temp_c: ThresholdRange
    rh_pct: ThresholdRange
    soil_moisture: ThresholdRange
    light_lux?: ThresholdRange
    soil_ec?: ThresholdRange
  }
  care: Record<string, string>
  solutions: Array<{
    problem: string
    advice: string
    trigger?: { metric: string; op: string; value: number }
  }>
  common_problems?: string[]
  embedding_text?: string
  sprite_ref?: string | null
}

export type PlantMatch = {
  plant: PlantType
  confidence: number
  utterance: string
}

/** One hourly average of the overall health score. `hour` is a local "YYYY-MM-DD HH" key. */
export type HealthPoint = {
  hour: string
  avg_health: number
}

export type AskAnswer = {
  question: string
  answer: string
  based_on: string[]
}

export type SetupPhase =
  | 'boot'
  | 'prompt'
  | 'listening'
  | 'match'
  | 'sensor_check'
  | 'ready'

export type ScreenPage = 'health' | 'inputs' | 'history'
