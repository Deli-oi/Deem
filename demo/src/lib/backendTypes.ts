import type { SensorCheck } from './telemetry'
import type { AskAnswer, DailyHealth, PlantMatch, PlantType, Telemetry } from './types'

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
  /** Verify each sensor is reporting. Rejects if the device never shows up. */
  checkSensors(): Promise<SensorCheck[]>
  getLatestTelemetry(plantTypeId: string): Promise<Telemetry>
  /** The ESP owns the Collect button; this returns the newest reading. */
  collectNow(plantTypeId: string): Promise<Telemetry>
  /** Live updates (new telemetry, link up/down). Returns an unsubscribe function. */
  subscribe(listener: (event: BackendEvent) => void): () => void

  getHistory(plantTypeId: string): Promise<DailyHealth[]>
  ask(plantTypeId: string, question: string, telemetry?: Telemetry): Promise<AskAnswer>

  /** Pump relay on/off. Resolves when the device acks, rejects on nack or timeout. */
  setRelay(on: boolean): Promise<void>
}
