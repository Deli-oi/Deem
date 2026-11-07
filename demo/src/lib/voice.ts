/**
 * Voice input. Hold the MIC key -> record -> release -> Fish Audio speech-to-text.
 *
 * The Fish Audio API key never reaches the browser: audio goes to this app's own
 * `/api/transcribe` (demo/server), which adds the key and forwards to Fish Audio.
 */

export type VoiceErrorCode = 'unsupported' | 'denied' | 'not_configured' | 'failed'

export class VoiceError extends Error {
  code: VoiceErrorCode
  constructor(code: VoiceErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

/** A recording in progress. */
export interface Listening {
  /** Stop recording, transcribe, and return the cleaned text ("" if nothing was heard). */
  finish(): Promise<string>
  /** Stop and throw the audio away (key released too quickly). */
  cancel(): void
}

export interface VoiceService {
  /** Start recording. `onAutoStop` fires if the max length is reached before the key is released. */
  listen(maxMs: number, onAutoStop: () => void): Promise<Listening>
}

/** Fish Audio adds tags like <|speaker:0|>; drop them, then trim and strip trailing punctuation. */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/<\|[^|]*\|>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?。！？]+$/u, '')
    .trim()
}

export function voiceMessage(err: unknown): string {
  const code = err instanceof VoiceError ? err.code : 'failed'
  switch (code) {
    case 'denied':
      return 'Allow the microphone.'
    case 'unsupported':
      return 'No microphone found.'
    case 'not_configured':
      return 'Voice is not set up yet.'
    default:
      return 'Could not hear that. Try again.'
  }
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

function pickMime(): string | undefined {
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
}

export async function transcribeAudio(blob: Blob, fetchImpl: typeof fetch = fetch): Promise<string> {
  let res: Response
  try {
    res = await fetchImpl('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'audio/webm' },
      body: blob,
    })
  } catch {
    throw new VoiceError('failed')
  }
  if (res.status === 503) throw new VoiceError('not_configured')
  if (!res.ok) throw new VoiceError('failed')
  const body = (await res.json()) as { text?: unknown }
  return cleanTranscript(typeof body.text === 'string' ? body.text : '')
}

/** Browser microphone + Fish Audio (through the server). */
export class FishAudioVoice implements VoiceService {
  async listen(maxMs: number, onAutoStop: () => void): Promise<Listening> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new VoiceError('unsupported')
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      throw new VoiceError('denied')
    }
    const mime = pickMime()
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })
    const release = () => stream.getTracks().forEach((t) => t.stop())
    const timer = window.setTimeout(onAutoStop, maxMs)
    recorder.start()

    return {
      cancel() {
        window.clearTimeout(timer)
        if (recorder.state !== 'inactive') recorder.stop()
        release()
      },
      async finish() {
        window.clearTimeout(timer)
        if (recorder.state !== 'inactive') recorder.stop()
        await stopped
        release()
        if (chunks.length === 0) return ''
        return transcribeAudio(new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' }))
      },
    }
  }
}

/**
 * Canned phrases for local UI work without a microphone or API key
 * (`VITE_VOICE=fake`). Cycles through the list on each recording.
 */
export class FakeVoice implements VoiceService {
  private i = 0
  private phrases: string[]

  constructor(phrases: string[]) {
    this.phrases = phrases
  }

  async listen(): Promise<Listening> {
    const phrase = this.phrases[this.i++ % this.phrases.length] ?? ''
    return {
      cancel() {},
      finish: async () => {
        await new Promise((r) => setTimeout(r, 400))
        return phrase
      },
    }
  }
}
