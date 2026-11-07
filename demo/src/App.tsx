import { useEffect, useRef, useState } from 'react'
import { FakeButtons } from './components/FakeButtons'
import { HealthScreen } from './components/screens/HealthScreen'
import { HistoryScreen } from './components/screens/HistoryScreen'
import { SetupFlow } from './components/screens/SetupFlow'
import { backend } from './mock/backend'
import type { AskAnswer, DailyHealth, PlantMatch, PlantType, ScreenPage, Telemetry } from './lib/types'
import './styles/global.css'

type AppPhase = 'boot' | 'setup_prompt' | 'setup_match' | 'sensor_check' | 'live'

const SENSOR_ORDER = ['Soil', 'AQI', 'Temp/RH', 'Relay']

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('boot')
  const [busy, setBusy] = useState(false)
  const [match, setMatch] = useState<PlantMatch | null>(null)
  const [plant, setPlant] = useState<PlantType | null>(null)
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null)
  const [history, setHistory] = useState<DailyHealth[]>([])
  const [page, setPage] = useState<ScreenPage>('health')
  const [sensorsOnline, setSensorsOnline] = useState<string[]>([])
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
    setSensorsOnline([])
    for (const name of SENSOR_ORDER) {
      await delay(320)
      setSensorsOnline((prev) => [...prev, name])
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
  }

  async function onConfirm() {
    if (phase === 'setup_match' && match) {
      await runSensorCheck(match.plant)
    }
  }

  function onVoice() {
    if (phase === 'live') {
      setAsking(true)
      setAnswer(null)
    }
  }

  async function sendAsk() {
    if (!plant || !question.trim()) return
    setBusy(true)
    try {
      const res = await backend.ask(plant.plant_type_id, question.trim())
      setAnswer(res)
      setAsking(false)
    } finally {
      setBusy(false)
    }
  }

  async function onCollect() {
    if (phase !== 'live' || !plant) return
    setBusy(true)
    try {
      const tel = await backend.collectNow(plant.plant_type_id)
      setTelemetry(tel)
      setNotice(`now ${tel.health_score}`)
    } finally {
      setBusy(false)
    }
  }

  function onWater() {
    if (phase !== 'live') return
    setNotice('relay on')
    window.setTimeout(() => setNotice(null), 1200)
  }

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button, input')) return
    swipeStartX.current = e.clientX
  }

  function onPointerUp(e: React.PointerEvent) {
    if (swipeStartX.current == null || phase !== 'live') return
    const dx = e.clientX - swipeStartX.current
    swipeStartX.current = null
    if (Math.abs(dx) < 36) return
    setPage(dx < 0 ? 'history' : 'health')
    setAnswer(null)
  }

  return (
    <div className="app-stage">
      <div className="device">
        <div className="bezel">
          <div className="screen" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
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
                sensorsOnline={sensorsOnline}
                busy={busy}
                onSubmitUtterance={submitUtterance}
                onConfirmMatch={onConfirm}
                onRetry={() => {
                  setMatch(null)
                  setPhase('setup_prompt')
                }}
              />
            )}

            {phase === 'live' && plant && telemetry && (
              <>
                <div className="screen-track" data-page={page}>
                  <HealthScreen plant={plant} telemetry={telemetry} />
                  <HistoryScreen plant={plant} days={history} />
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
                    <div className="ask-sheet-label">{answer ? 'ASK' : 'NOW'}</div>
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
          </div>
        </div>

        <FakeButtons
          disabled={busy || phase === 'boot' || phase === 'sensor_check'}
          onVoice={onVoice}
          onCollect={() => void onCollect()}
          onConfirm={() => void onConfirm()}
          onWater={onWater}
        />
      </div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
