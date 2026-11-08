import { useEffect, useRef, useState } from 'react'
import { HealthScreen } from './components/screens/HealthScreen'
import { HistoryScreen } from './components/screens/HistoryScreen'
import { InputsScreen } from './components/screens/InputsScreen'
import { SetupFlow } from './components/screens/SetupFlow'
import { backend } from './backend'
import { playAlert, soundEnabled, unlockAudio } from './lib/alertSound'
import { evaluateAlerts } from './lib/alerts'
import { hardwareKeyFor } from './lib/keys'
import { voiceMessage } from './lib/voice'
import type { Listening } from './lib/voice'
import { voice } from './voice'
import type { SensorState, VoiceState } from './components/screens/SetupFlow'
import type { AskAnswer, HealthPoint, PlantMatch, PlantType, ScreenPage, Telemetry } from './lib/types'
import './styles/global.css'

type AppPhase = 'boot' | 'setup_prompt' | 'setup_match' | 'sensor_check' | 'live'

const SENSOR_NAMES = ['Soil', 'AQI', 'Temp/RH']
const PAGES: ScreenPage[] = ['health', 'inputs', 'history']
/** Horizontal travel (px) that counts as a swipe. */
const SWIPE_PX = 36
/** A voice recording is cut off after this long even if the MIC key is still held. */
const MAX_LISTEN_MS = 8000
/** Shorter than this is a tap, not speech: ignore it. */
const MIN_LISTEN_MS = 400

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('boot')
  const [busy, setBusy] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [heard, setHeard] = useState<string | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [match, setMatch] = useState<PlantMatch | null>(null)
  const [plant, setPlant] = useState<PlantType | null>(null)
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null)
  const [history, setHistory] = useState<HealthPoint[]>([])
  const [page, setPage] = useState<ScreenPage>('health')
  const [sensors, setSensors] = useState<SensorState[]>([])
  const [sensorError, setSensorError] = useState<string | null>(null)
  const [linkOnline, setLinkOnline] = useState(true)
  const [answer, setAnswer] = useState<AskAnswer | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const swipeStartX = useRef<number | null>(null)

  // Key handlers are registered once; they read the latest state through these refs.
  const phaseRef = useRef(phase)
  const voiceRef = useRef(voiceState)
  const busyRef = useRef(busy)
  const listenRef = useRef<Listening | null>(null)
  const holdingRef = useRef(false)
  const startedAtRef = useRef(0)
  const lastAlertedTs = useRef<number | null>(null)
  const pendingAlert = useRef(false)
  phaseRef.current = phase
  voiceRef.current = voiceState
  busyRef.current = busy

  // Browsers only allow sound after a key press or touch; the first one unlocks the alert sound.
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('keydown', unlock, { once: true })
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => {
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('pointerdown', unlock)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setPhase('setup_prompt'), 500)
    return () => window.clearTimeout(t)
  }, [])

  async function submitUtterance(text: string) {
    setBusy(true)
    try {
      const result = await backend.matchPlant(text)
      setMatch(result)
      setPhase('setup_match')
    } finally {
      setBusy(false)
    }
  }

  async function askQuestion(question: string) {
    if (!plant) return
    setBusy(true)
    try {
      setAnswer(await backend.ask(plant.plant_type_id, question, telemetry ?? undefined))
    } finally {
      setBusy(false)
    }
  }

  async function runSensorCheck(selected: PlantType) {
    setPhase('sensor_check')
    setSensorError(null)
    setSensors(SENSOR_NAMES.map((name) => ({ name, state: 'pending' })))
    try {
      backend.selectPlant(selected)
      const checks = await backend.checkSensors()
      for (const check of checks) {
        await delay(320)
        setSensors((prev) =>
          prev.map((s) => (s.name === check.name ? { name: s.name, state: check.ok ? 'ok' : 'fail' } : s)),
        )
      }
      if (checks.some((c) => !c.ok)) {
        setSensorError('Some sensors are not reporting.')
        return
      }
      const [tel, hist] = await Promise.all([
        backend.getLatestTelemetry(selected.plant_type_id),
        backend.getHistory(selected.plant_type_id),
      ])
      setPlant(selected)
      setTelemetry(tel)
      setHistory(hist)
      await delay(280)
      setPhase('live')
      setPage('health')
    } catch (err) {
      setSensorError(err instanceof Error ? err.message : 'Sensor check failed.')
    }
  }

  // Live updates: new readings (every 10 min, and whenever TEST is pressed) and link status.
  useEffect(() => {
    if (phase !== 'live' || !plant) return
    return backend.subscribe((event) => {
      if (event.type === 'link') {
        setLinkOnline(event.online)
        return
      }
      setTelemetry(event.telemetry)
      void backend.getHistory(plant.plant_type_id).then(setHistory)
    })
  }, [phase, plant])

  // ---- MIC key: hold to talk, release to send. Setup = say the plant; live = ask a question.
  async function micDown() {
    const p = phaseRef.current
    if ((p !== 'setup_prompt' && p !== 'live') || voiceRef.current !== 'idle' || busyRef.current) return
    holdingRef.current = true
    setVoiceError(null)
    setAnswer(null)
    try {
      const active = await voice.listen(MAX_LISTEN_MS, () => void micUp())
      listenRef.current = active
      startedAtRef.current = performance.now()
      setVoiceState('recording')
      if (!holdingRef.current) await micUp() // key was released while the mic was starting
    } catch (err) {
      holdingRef.current = false
      setVoiceError(voiceMessage(err))
    }
  }

  async function micUp() {
    holdingRef.current = false
    const active = listenRef.current
    if (!active) return
    listenRef.current = null
    if (performance.now() - startedAtRef.current < MIN_LISTEN_MS) {
      active.cancel()
      setVoiceState('idle')
      setVoiceError('Hold the MIC key and speak.')
      return
    }
    setVoiceState('transcribing')
    try {
      const text = await active.finish()
      if (!text) {
        setVoiceError("Didn't catch that. Try again.")
        return
      }
      setHeard(text)
      if (phaseRef.current === 'setup_prompt') await submitUtterance(text)
      else if (phaseRef.current === 'live') await askQuestion(text)
    } catch (err) {
      setVoiceError(voiceMessage(err))
    } finally {
      setVoiceState('idle')
    }
  }

  // ---- TEST key: take a test input now. The health page then shows this most recent test.
  async function testKey() {
    if (phaseRef.current !== 'live' || !plant || busyRef.current || voiceRef.current !== 'idle') return
    setBusy(true)
    setAnswer(null)
    setNotice('testing...')
    try {
      const before = telemetry
      const tel = await backend.collectNow(plant.plant_type_id)
      setTelemetry(tel)
      setHistory(await backend.getHistory(plant.plant_type_id))
      setNotice(tel.ts === before?.ts ? 'no new reading' : `tested · health ${tel.health_score ?? '--'}`)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'test failed')
    } finally {
      setBusy(false)
    }
  }

  function go(direction: 1 | -1) {
    setPage((current) => {
      const next = Math.max(0, Math.min(PAGES.length - 1, PAGES.indexOf(current) + direction))
      return PAGES[next]
    })
    setAnswer(null)
  }

  // Latest handlers for the window listeners below.
  const handlers = useRef({ micDown, micUp, testKey, go })
  handlers.current = { micDown, micUp, testKey, go }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      const key = hardwareKeyFor(e.code)
      if (key === 'mic') {
        e.preventDefault()
        void handlers.current.micDown()
      } else if (key === 'test') {
        e.preventDefault()
        void handlers.current.testKey()
      } else if (phaseRef.current === 'live' && e.code === 'ArrowRight') handlers.current.go(1)
      else if (phaseRef.current === 'live' && e.code === 'ArrowLeft') handlers.current.go(-1)
    }
    const up = (e: KeyboardEvent) => {
      if (hardwareKeyFor(e.code) === 'mic') void handlers.current.micUp()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Swipe on the touch screen: finger (or mouse drag) left/right.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return
    swipeStartX.current = e.clientX
    try {
      e.currentTarget.setPointerCapture(e.pointerId) // keep the drag even if the finger leaves the screen
    } catch {
      // pointer already gone: the swipe still works from down/up positions
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const start = swipeStartX.current
    swipeStartX.current = null
    if (start == null || phase !== 'live') return
    const dx = e.clientX - start
    if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1)
  }

  // Readings outside the plant's healthy range. Every new reading that has one plays the alert
  // sound (and it repeats with each reading while the problem lasts). Never while the mic is
  // recording, or the beeps would be heard as speech: it waits until the mic is idle.
  const alerts = plant && telemetry ? evaluateAlerts(plant, telemetry.metrics) : []
  const alertCount = alerts.length
  useEffect(() => {
    if (phase !== 'live' || !telemetry) return
    if (alertCount === 0) {
      pendingAlert.current = false
      return
    }
    if (lastAlertedTs.current !== telemetry.ts) {
      lastAlertedTs.current = telemetry.ts
      pendingAlert.current = true
    }
    if (pendingAlert.current && voiceState === 'idle' && soundEnabled()) {
      pendingAlert.current = false
      playAlert()
    }
  }, [phase, telemetry, alertCount, voiceState])

  const sheetText = answer ? answer.answer : notice

  return (
    <div className="app-stage">
      <div className="device">
        <div className="bezel">
          <div
            className="screen"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (swipeStartX.current = null)}
          >
            {phase === 'boot' && (
              <div className="setup-screen">
                <div className="act-title">Deem</div>
                <p className="setup-copy">...</p>
              </div>
            )}

            {(phase === 'setup_prompt' || phase === 'setup_match' || phase === 'sensor_check') && (
              <SetupFlow
                phase={
                  phase === 'setup_prompt' ? 'prompt' : phase === 'setup_match' ? 'match' : 'sensor_check'
                }
                match={match}
                sensors={sensors}
                sensorError={sensorError}
                busy={busy}
                voiceState={voiceState}
                heard={heard}
                voiceError={voiceError}
                onConfirmMatch={() => {
                  if (match) void runSensorCheck(match.plant)
                }}
                onRetry={() => {
                  setMatch(null)
                  setHeard(null)
                  setVoiceError(null)
                  setPhase('setup_prompt')
                }}
                onRecheck={() => {
                  if (match) void runSensorCheck(match.plant)
                }}
              />
            )}

            {phase === 'live' && plant && telemetry && (
              <>
                {!linkOnline && <div className="link-banner">device offline</div>}
                {voiceState !== 'idle' && (
                  <div className={`voice-note ${voiceState}`}>
                    <span className="voice-dot" />
                    {voiceState === 'recording' ? 'LISTENING' : 'HEARING'}
                  </div>
                )}
                <div className="screen-track" data-page={page}>
                  <HealthScreen plant={plant} telemetry={telemetry} alerts={alerts} />
                  <InputsScreen plant={plant} telemetry={telemetry} />
                  <HistoryScreen plant={plant} points={history} />
                </div>
                {(sheetText || voiceError) && voiceState === 'idle' && (
                  <button
                    type="button"
                    className="ask-sheet"
                    onClick={() => {
                      setAnswer(null)
                      setNotice(null)
                      setVoiceError(null)
                    }}
                  >
                    <div className="ask-sheet-label">{answer ? 'ASK' : voiceError ? 'MIC' : 'TEST'}</div>
                    {answer && <div className="ask-q">"{answer.question}"</div>}
                    <div>{voiceError ?? sheetText}</div>
                    <div className="ask-sheet-dismiss">tap to close</div>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
