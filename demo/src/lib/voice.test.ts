import { describe, expect, it, vi } from 'vitest'
import { cleanTranscript, FakeVoice, transcribeAudio, VoiceError, voiceMessage } from './voice'

describe('cleanTranscript', () => {
  it('removes Fish Audio tags, extra spaces and trailing punctuation', () => {
    expect(cleanTranscript('<|speaker:0|> Golden pothos.')).toBe('Golden pothos')
    expect(cleanTranscript('  why is it   drooping?  ')).toBe('why is it drooping')
    expect(cleanTranscript('')).toBe('')
  })
})

describe('transcribeAudio', () => {
  const blob = new Blob(['audio'], { type: 'audio/webm' })

  it('posts the audio to /api/transcribe and returns the cleaned text', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ text: 'Dracaena.' }), { status: 200 }))
    expect(await transcribeAudio(blob, fetchImpl as unknown as typeof fetch)).toBe('Dracaena')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/transcribe')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('audio/webm')
  })

  it('maps 503 to not_configured', async () => {
    const fetchImpl = async () => new Response('{}', { status: 503 })
    await expect(transcribeAudio(blob, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      code: 'not_configured',
    })
  })

  it('maps other failures and network errors to failed', async () => {
    await expect(
      transcribeAudio(blob, (async () => new Response('{}', { status: 502 })) as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'failed' })
    await expect(
      transcribeAudio(blob, (async () => {
        throw new Error('offline')
      }) as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'failed' })
  })
})

describe('voiceMessage', () => {
  it('gives a plain-language message per error', () => {
    expect(voiceMessage(new VoiceError('denied'))).toContain('microphone')
    expect(voiceMessage(new VoiceError('not_configured'))).toContain('not set up')
    expect(voiceMessage(new Error('x'))).toContain('Try again')
  })
})

describe('FakeVoice', () => {
  it('cycles through its phrases, one per recording', async () => {
    const fake = new FakeVoice(['dracaena', 'why is it drooping'])
    const say = async () => (await fake.listen()).finish()
    expect(await say()).toBe('dracaena')
    expect(await say()).toBe('why is it drooping')
    expect(await say()).toBe('dracaena')
  })
})
