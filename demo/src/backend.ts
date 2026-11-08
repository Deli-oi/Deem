import type { DeemBackend } from './lib/backendTypes'
import { MockBackend } from './mock/backend'
import { connectWebSocket, MqttBackend } from './mock/mqttBackend'

/**
 * Pick the backend from env (Vite `VITE_*` vars, see demo/.env.example):
 *   VITE_BACKEND=mqtt      read the real ESP32 over MQTT (default is the fixture mock)
 *   VITE_MQTT_URL          Mosquitto WebSocket URL, e.g. ws://deem-pi.local:9001
 *   VITE_DEVICE_ID         the pot's device_id, e.g. esp32-pot-01
 */
function createBackend(): DeemBackend {
  const mock = new MockBackend()
  if (import.meta.env.VITE_BACKEND !== 'mqtt') return mock

  const url = import.meta.env.VITE_MQTT_URL ?? 'ws://localhost:9001'
  const deviceId = import.meta.env.VITE_DEVICE_ID ?? 'esp32-pot-01'
  const clientId = `deem-ui-${Math.random().toString(16).slice(2, 10)}`
  return new MqttBackend({ deviceId, link: connectWebSocket(url, clientId), knowledge: mock })
}

export const backend: DeemBackend = createBackend()
export const isLive = import.meta.env.VITE_BACKEND === 'mqtt'
