import { FakeVoice, FishAudioVoice } from './lib/voice'
import type { VoiceService } from './lib/voice'

/**
 * Real Fish Audio speech-to-text by default. For local UI work without a mic or key:
 *   VITE_VOICE=fake  (optional VITE_FAKE_VOICE_TEXT="dracaena|why is it drooping?")
 */
function createVoice(): VoiceService {
  if (import.meta.env.VITE_VOICE === 'fake') {
    const phrases = (import.meta.env.VITE_FAKE_VOICE_TEXT ?? 'dracaena|why is it drooping?|should I water it?').split('|')
    return new FakeVoice(phrases)
  }
  return new FishAudioVoice()
}

export const voice: VoiceService = createVoice()
