import { useEffect, useRef, useState } from 'react'
import { ScreenButtons } from './components/ScreenButtons'
import { HealthScreen } from './components/screens/HealthScreen'
import { HistoryScreen } from './components/screens/HistoryScreen'
import { InputsScreen } from './components/screens/InputsScreen'
import { SetupFlow } from './components/screens/SetupFlow'
import { backend } from './backend'
import type { SensorState } from './components/screens/SetupFlow'
import type { AskAnswer, HealthPoint, PlantMatch, PlantType, ScreenPage, Telemetry } from './lib/types'
import './styles/global.css'

type AppPhase = 'boot' | 'setup_prompt' | 'setup_match' | 'sensor_check' | 'live'

const SENSOR_NAMES = ['Soil', 'AQI', 'Temp/RH']
const PAGES: ScreenPage[] = ['health', 'inputs', 'history']
/** Horizontal travel (px) that counts as a swipe. */
const SWIPE_PX = 36
/** How long the mic "listens" before the stand-in transcript is used (Fish Audio replaces this). */
const LISTEN_MS = 900

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('boot')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [utterance, setUtterance] = useState('dracaena')
  const [match, setMatch] = useState<PlantMatch | null>(null)
  const [plant, setPlant] = useState<PlantType | null>(null)
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null)
  const [history, setHistory] = useState<HealthPoint[]>([])
  const [page, setPage] = useState<ScreenPage>('health')
  const [sensors, setSensors] = useState<SensorState[]>([])
  const [sensorError, setSensorError] = useState<string | null>(null)
  const [linkOnline, setLinkOnline] = useState(true)
  const [answer, setAnswer] = useState<AskAnswer | null>(null)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('why is it drooping?')
  const [notice, setNotice] = useState<string | null>(null)
  const swipeStartX = useRef<number | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setPhase('setup_prompt'), 500)
    return () => window.clearTimeout(t)
  }, [])

  async function submitUtterance(text: string) {
    setBusy(true)
    setAnswer(null)
    try {
      const result = await backend.matchPlant(text)
      setMatch(result)
      setPhase('setup_match')
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

  // MIC: voice input for Fish Audio. Setup = say the plant; live = ask a question.
  async function onMic() {
    if (phase === 'setup_prompt') {
      if (!utterance.trim() || listening) return
      setListening(true)
      await delay(LISTEN_MS) // stand-in for the Fish Audio transcript
      setListening(false)
      await submitUtterance(utterance.trim())
    } else if (phase === 'live') {
      setAsking(true)
      setAnswer(null)
    }
  }

  async function sendAsk() {
    if (!plant || !question.trim()) return
    setBusy(true)
    try {
      const res = await backend.ask(plant.plant_type_id, question.trim(), telemetry ?? undefined)
      setAnswer(res)
      setAsking(false)
    } finally {
      setBusy(false)
    }
  }

  // TEST: take a test input now. The health page then shows this most recent test.
  async function onTest() {
    if (phase !== 'live' || !plant) return
    setBusy(true)
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

  // Swipe: drag (mouse) or swipe (finger) left/right on the screen. Arrow keys work too.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button, input')) return
    swipeStartX.current = e.clientX
    try {
      e.currentTarget.setPointerCapture(e.pointerId) // keep the drag even if the cursor leaves the screen
    } catch {
      // pointer already gone: the swipe still works from down/up positions
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const start = swipeStartX.current
    swipeStartX.current = null
    if (start == null || phase !== 'live' || asking) return
    const dx = e.clientX - start
    if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1)
  }

  useEffect(() => {
    if (phase !== 'live' || asking) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input')) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, asking])

  const showButtons = (phase === 'setup_prompt' || phase === 'live') && !asking

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
                utterance={utterance}
                onUtteranceChange={setUtterance}
                onSubmitUtterance={submitUtterance}
                onConfirmMatch={() => {
                  if (match) void runSensorCheck(match.plant)
                }}
                onRetry={() => {
                  setMatch(null)
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
                  <HealthScreen plant={plant} telemetry={telemetry} />
                  <InputsScreen plant={plant} telemetry={telemetry} />
                  <HistoryScreen plant={plant} points={history} />
                </div>
                {(answer || notice) && !asking && (
                  <button
                    type="button"
                    className="ask-sheet"
                    onClick={() => {
                      setAnswer(null)
                      setNotice(null)
                    }}
                  >
                    <div className="ask-sheet-label">{answer ? 'ASK' : 'TEST'}</div>
                    <div>{answer?.answer ?? notice}</div>
                    <div className="ask-sheet-dismiss">tap to close</div>
                  </button>
                )}
                {asking && (
                  <form
                    className="ask-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void sendAsk()
                    }}
                  >
                    <div className="act-title">Ask</div>
                    <input
                      className="setup-input"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      aria-label="Question"
                    />
                    <div className="touch-actions dual">
                      <button type="button" className="touch-btn" onClick={() => setAsking(false)}>
                        BACK
                      </button>
                      <button type="submit" className="touch-btn primary" disabled={busy}>
                        {busy ? '...' : 'SEND'}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}

            {showButtons && (
              <ScreenButtons
                showTest={phase === 'live'}
                disabled={busy || listening}
                listening={listening}
                onTest={() => void onTest()}
                onMic={() => void onMic()}
              />
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
