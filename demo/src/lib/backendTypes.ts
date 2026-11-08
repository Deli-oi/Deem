import type { SensorProgress } from './telemetry'
import type { AskAnswer, HealthPoint, PlantMatch, PlantType, Telemetry } from './types'

export type BackendEvent =
  | { type: 'telemetry'; telemetry: Telemetry }
  /** Link to the pot's ESP32: false when the broker or the device drops (Last Will). */
  | { type: 'link'; online: boolean }

/**
 * Everything the UI needs. MockBackend (fixtures) and MqttBackend (real ESP32 over
 * the contract in docs/mqtt_contract.md) both implement it, so the screens never
 * know which one they are talking to.
 */
export interface DeemBackend {
  listPlants(): Promise<PlantType[]>
  matchPlant(utterance: string): Promise<PlantMatch | null>

  /** Called once setup is confirmed. Telemetry is scored against this plant. */
  selectPlant(plant: PlantType): void
  /**
   * Wait for every sensor to be ready, calling `onProgress` as each one comes up (or fails).
   * Resolves once none are pending. Rejects if the device never comes online.
   */
  checkSensors(onProgress: (progress: SensorProgress[]) => void): Promise<SensorProgress[]>
  getLatestTelemetry(plantTypeId: string): Promise<Telemetry>
  /** Live updates (new telemetry, link up/down). Returns an unsubscribe function. */
  subscribe(listener: (event: BackendEvent) => void): () => void

  /** Hourly average health, oldest first (the chart on the swipe-right screen). */
  getHistory(plantTypeId: string): Promise<HealthPoint[]>
  ask(plantTypeId: string, question: string, telemetry?: Telemetry): Promise<AskAnswer>

}
