import { isLive } from './backend'
import { NoopSession, SessionClient } from './lib/sessionClient'
import type { SessionService } from './lib/sessionClient'

/**
 * Tells the cloud when data collection starts (setup finished) and stops (the STOP button).
 * Only active against the real device (`VITE_BACKEND=mqtt`) with `VITE_INGEST_URL` set; otherwise a no-op.
 */
function createSession(): SessionService {
  const base = (import.meta.env.VITE_INGEST_URL as string | undefined)?.trim()
  if (!isLive || !base) return new NoopSession()
  return new SessionClient({ base, deviceId: (import.meta.env.VITE_DEVICE_ID as string | undefined) ?? 'esp32-pot-01' })
}

export const session: SessionService = createSession()
