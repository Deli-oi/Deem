import { useEffect, useRef, useState } from 'react'
import { MicButton } from './components/MicButton'
import { FailureScreen } from './components/screens/FailureScreen'
import { HealthScreen } from './components/screens/HealthScreen'
import { HistoryScreen } from './components/screens/HistoryScreen'
import { InputsScreen } from './components/screens/InputsScreen'
import { SetupFlow } from './components/screens/SetupFlow'
import { backend } from './backend'
import { playAlert, soundEnabled, unlockAudio } from './lib/alertSound'
import { evaluateAlerts } from './lib/alerts'
import { voiceMessage } from './lib/voice'
import type { Listening } from './lib/voice'
import { voice } from './voice'
import { session } from './session'
import type { SensorState, VoiceState } from './components/screens/SetupFlow'
import { SENSORS } from './lib/telemetry'
import type { AskAnswer, HealthPoint, PlantMatch, PlantType, ScreenPage, Telemetry } from './lib/types'
import './styles/global.css'

type AppPhase = 'boot' | 'setup_prompt' | 'setup_match' | 'sensor_check' | 'live'

const PAGES: ScreenPage[] = ['health', 'inputs', 'history']
/** Horizontal travel (px) that counts as a swipe. */
const SWIPE_PX = 36
/** A voice recording is cut off after this long even if the mic is never tapped off. */
const MAX_LISTEN_MS = 8000
/** Shorter than this is an accidental double tap, not speech: ignore it. */
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
  const swipeStartX = useRef<number | null>(null)

  // The mic's async steps and the auto-stop timer read the latest state through these refs.
  const phaseRef = useRef(phase)
  const voiceRef = useRef(voiceState)
  const busyRef = useRef(busy)
  const listenRef = useRef<Listening | null>(null)
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
    setSensors(SENSORS.map((s) => ({ name: s.name, state: 'pending' })))
    try {
      backend.selectPlant(selected)
      // Each row follows the real device: it turns to a check when that sensor is up, an X if it failed.
      const checks = await backend.checkSensors((progress) =>
        setSensors(progress.map((p) => ({ name: p.name, state: p.state }))),
      )
      const failed = checks.filter((c) => c.state === 'fail').map((c) => c.name)
      if (failed.length > 0) {
        setSensorError(`${failed.join(' and ')} ${failed.length > 1 ? 'are' : 'is'} not reporting.`)
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
      // Setup is finished (plant confirmed, every sensor checked): from now on the cloud stores this pot's readings.
      session.start(selected.plant_type_id)
      setPhase('live')
      setPage('health')
    } catch (err) {
      setSensorError(err instanceof Error ? err.message : 'Sensor check failed.')
    }
  }

  /** The STOP button on the history page: end data collection and go back to the setup prompt. */
  async function stopCollection() {
    await session.stop()
    lastAlertedTs.current = null
    pendingAlert.current = false
    setAnswer(null)
    setVoiceError(null)
    setHeard(null)
    setMatch(null)
    setPlant(null)
    setTelemetry(null)
    setHistory([])
    setSensors([])
    setSensorError(null)
    setPage('health')
    setPhase('setup_prompt')
  }

  // Live updates: a new reading (every 10 minutes) and the device's link status.
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

  // ---- Voice: tap the mic to start, tap again to stop and send. Setup = say the plant; live = ask a question.
  async function startListening() {
    setVoiceError(null)
    setAnswer(null)
    try {
      const active = await voice.listen(MAX_LISTEN_MS, () => void stopListening())
      listenRef.current = active
      startedAtRef.current = performance.now()
      setVoiceState('recording')
    } catch (err) {
      setVoiceError(voiceMessage(err))
    }
  }

  async function stopListening() {
    const active = listenRef.current
    if (!active) return
    listenRef.current = null
    if (performance.now() - startedAtRef.current < MIN_LISTEN_MS) {
      active.cancel()
      setVoiceState('idle')
      setVoiceError('Tap the mic, speak, then tap it again.')
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

  function onMicTap() {
    const p = phaseRef.current
    if (p !== 'setup_prompt' && p !== 'live') return
    if (voiceRef.current === 'recording') void stopListening()
    else if (voiceRef.current === 'idle' && !busyRef.current) void startListening()
  }

  function go(direction: 1 | -1) {
    setPage((current) => {
      const next = Math.max(0, Math.min(PAGES.length - 1, PAGES.indexOf(current) + direction))
      return PAGES[next]
    })
    setAnswer(null)
  }

  // Arrow keys also move between the pages (handy on a desktop).
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current !== 'live') return
      if (e.code === 'ArrowRight') goRef.current(1)
      else if (e.code === 'ArrowLeft') goRef.current(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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

  // The voice button sits along the bottom of setup's first step and of every live page,
  // and those screens are made shorter to leave room for it.
  const showMic = phase === 'setup_prompt' || phase === 'live'

  return (
    <div className="app-stage">
      <div className="device">
        <div className="bezel">
          <div
            className={`screen${showMic ? ' has-mic' : ''}`}
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
                <div className="screen-track" data-page={page}>
                  {alerts.length > 0 ? (
                    <FailureScreen plant={plant} telemetry={telemetry} alerts={alerts} />
                  ) : (
                    <HealthScreen plant={plant} telemetry={telemetry} alerts={alerts} />
                  )}
                  <InputsScreen plant={plant} telemetry={telemetry} />
                  <HistoryScreen plant={plant} points={history} onStop={() => void stopCollection()} />
                </div>
                {(answer || voiceError) && voiceState === 'idle' && (
                  <button
                    type="button"
                    className="ask-sheet"
                    onClick={() => {
                      setAnswer(null)
                      setVoiceError(null)
                    }}
                  >
                    <div className="ask-sheet-label">{answer ? 'ASK' : 'MIC'}</div>
                    {answer && <div className="ask-q">"{answer.question}"</div>}
                    <div>{voiceError ?? answer?.answer}</div>
                    <div className="ask-sheet-dismiss">tap to close</div>
                  </button>
                )}
              </>
            )}

            {showMic && <MicButton state={voiceState} disabled={busy} onTap={onMicTap} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
