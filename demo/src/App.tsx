import { useEffect, useRef, useState } from 'react'
import { FakeButtons } from './components/FakeButtons'
import { HealthScreen } from './components/screens/HealthScreen'
import { HistoryScreen } from './components/screens/HistoryScreen'
import { SetupFlow } from './components/screens/SetupFlow'
import { backend } from './mock/backend'
import type {
  AskAnswer,
  DailyHealth,
  PlantMatch,
  PlantType,
  ScreenPage,
  Telemetry,
} from './lib/types'
import './styles/global.css'

type AppPhase = 'boot' | 'setup_prompt' | 'setup_match' | 'sensor_check' | 'live'

const SENSOR_ORDER = ['Soil moisture', 'Air quality', 'Temp / RH', 'Relay']

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('boot')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('Booting Deem demo…')
  const [match, setMatch] = useState<PlantMatch | null>(null)
  const [plant, setPlant] = useState<PlantType | null>(null)
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null)
  const [history, setHistory] = useState<DailyHealth[]>([])
  const [page, setPage] = useState<ScreenPage>('health')
  const [sensorsOnline, setSensorsOnline] = useState<string[]>([])
  const [answer, setAnswer] = useState<AskAnswer | null>(null)
  const [fixtureLabels, setFixtureLabels] = useState<string[]>([])
  const [activeFixture, setActiveFixture] = useState(0)
  const pendingUtterance = useRef('dracaena')
  const swipeStartX = useRef<number | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setPhase('setup_prompt')
      setToast('Say or type the plant type, then press Voice.')
    }, 700)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    setFixtureLabels(backend.listFixtureLabels('dracaena'))
  }, [])

  async function submitUtterance(text: string) {
    pendingUtterance.current = text
    setBusy(true)
    setToast('Matching plant…')
    setAnswer(null)
    try {
      const result = await backend.matchPlant(text)
      setMatch(result)
      setPhase('setup_match')
      setToast(result ? `Matched ${result.plant.common_names[0]}` : 'No close match')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Match failed')
    } finally {
      setBusy(false)
    }
  }

  async function runSensorCheck(selected: PlantType) {
    setPhase('sensor_check')
    setSensorsOnline([])
    setToast('Checking sensors…')
    for (let i = 0; i < SENSOR_ORDER.length; i++) {
      await delay(380)
      setSensorsOnline((prev) => [...prev, SENSOR_ORDER[i]])
    }
    const [tel, hist] = await Promise.all([
      backend.getLatestTelemetry(selected.plant_type_id),
      backend.getHistory(selected.plant_type_id),
    ])
    setPlant(selected)
    setTelemetry(tel)
    setHistory(hist)
    await delay(450)
    setPhase('live')
    setPage('health')
    setToast(`Monitoring ${selected.common_names[0]}`)
  }

  async function onConfirm() {
    if (phase === 'setup_match' && match) {
      await runSensorCheck(match.plant)
      return
    }
    if (phase === 'setup_prompt' && pendingUtterance.current.trim()) {
      await submitUtterance(pendingUtterance.current.trim())
    }
  }

  async function onVoice() {
    if (phase === 'setup_prompt' || phase === 'setup_match') {
      const spoken = window.prompt('Mock Fish Audio transcript', pendingUtterance.current)
      if (spoken == null) return
      await submitUtterance(spoken.trim() || pendingUtterance.current)
      return
    }
    if (phase === 'live' && plant) {
      const q =
        window.prompt('Ask about the plant (mock Gemini)', 'Why do the leaves look sad?') ?? ''
      if (!q.trim()) return
      setBusy(true)
      setToast('Thinking…')
      try {
        const res = await backend.ask(plant.plant_type_id, q.trim())
        setAnswer(res)
        setToast('Answer ready')
      } finally {
        setBusy(false)
      }
    }
  }

  async function onCollect() {
    if (phase !== 'live' || !plant) {
      setToast('Collect is available after setup')
      return
    }
    setBusy(true)
    try {
      const tel = await backend.collectNow(plant.plant_type_id)
      setTelemetry(tel)
      setToast(`Collected now · health ${tel.health_score}`)
    } finally {
      setBusy(false)
    }
  }

  async function onWater() {
    if (phase !== 'live') {
      setToast('Water relay stand-in (after setup)')
      return
    }
    setToast('Relay pulse sent (mock set_relay)')
  }

  async function selectFixture(index: number) {
    if (!plant) return
    setBusy(true)
    try {
      const tel = await backend.setFixture(plant.plant_type_id, index)
      setTelemetry(tel)
      setActiveFixture(backend.getFixtureIndex())
      setToast(`Fixture: ${tel.label ?? 'updated'}`)
    } finally {
      setBusy(false)
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    swipeStartX.current = e.clientX
  }

  function onPointerUp(e: React.PointerEvent) {
    if (swipeStartX.current == null || phase !== 'live') return
    const dx = e.clientX - swipeStartX.current
    swipeStartX.current = null
    if (Math.abs(dx) < 40) return
    setPage(dx < 0 ? 'history' : 'health')
  }

  return (
    <div className="app-stage">
      <div className="stage-inner">
        <header className="brand-lockup">
          <div className="mark">Deem</div>
          <p>Local device demo · mock backend</p>
        </header>

        <div className="device-shell">
          <div
            className="device-bezel"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          >
            <div className="device-screen">
              {phase === 'boot' && (
                <div className="overlay-screen">
                  <h1>Deem</h1>
                  <p>Plant monitor waking up…</p>
                </div>
              )}

              {(phase === 'setup_prompt' || phase === 'setup_match' || phase === 'sensor_check') && (
                <SetupFlow
                  phase={
                    phase === 'setup_prompt'
                      ? 'prompt'
                      : phase === 'setup_match'
                        ? 'match'
                        : 'sensor_check'
                  }
                  match={match}
                  sensorsOnline={sensorsOnline}
                  busy={busy}
                  onSubmitUtterance={submitUtterance}
                  onRetry={() => {
                    setMatch(null)
                    setPhase('setup_prompt')
                    setToast('Try another plant name')
                  }}
                />
              )}

              {phase === 'live' && plant && telemetry && (
                <>
                  <div className="page-dots" style={{ position: 'absolute', top: 8, left: 0, right: 0, zIndex: 2 }}>
                    <span className={page === 'health' ? 'on' : ''} />
                    <span className={page === 'history' ? 'on' : ''} />
                  </div>
                  <div className="screen-track" data-page={page}>
                    <HealthScreen plant={plant} telemetry={telemetry} />
                    <HistoryScreen plant={plant} days={history} />
                  </div>
                  {answer && (
                    <div
                      className="answer-bubble"
                      style={{ position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 3 }}
                    >
                      <strong>Ask</strong>
                      <div>{answer.answer}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <FakeButtons
          disabled={busy || phase === 'boot' || phase === 'sensor_check'}
          onVoice={onVoice}
          onCollect={onCollect}
          onConfirm={onConfirm}
          onWater={onWater}
        />

        <div className="status-toast" role="status">
          {toast}
        </div>

        {phase === 'live' && (
          <div className="fixture-bar" aria-label="Telemetry fixtures">
            {fixtureLabels.map((label, i) => (
              <button
                key={label}
                type="button"
                className={`chip${i === activeFixture % fixtureLabels.length ? ' active' : ''}`}
                onClick={() => selectFixture(i)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
