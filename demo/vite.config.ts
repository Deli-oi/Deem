import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // `npm run dev` + `node server/index.mjs` (with FISH_AUDIO_API_KEY) gives real voice locally.
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.mjs'],
  },
})
