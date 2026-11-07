# Deem local device demo

Scaled mock of the ESP display + hardware buttons, backed by a **swappable mock
backend**. Replace `src/mock/backend.ts`’s exported `backend` with a Railway /
Mongo / Gemini implementation later — the UI talks only to the `DeemBackend`
interface.

## Run

```bash
cd demo
npm install
npm run dev
```

Open the printed local URL (default `http://127.0.0.1:5173`).

```bash
npm test
npm run build
```

## Demo flow

1. Boot → setup prompt
2. Type a plant name (or press **Voice / Ask** for a mock transcript)
3. **Confirm** the match → sensor check animation
4. Health page with score + metrics
5. **Swipe** left/right on the screen for history
6. **Collect** pulls the current fixture reading
7. Fixture chips under the device cycle dry soil / high CO₂ / etc.
8. **Voice / Ask** on the live screen runs the mock Q&A agent

## Data

- Plant knowledge seed: `public/plants/` (copied from repo `data/plants/`)
- Dracaena telemetry fixtures: `src/mock/fixtures/dracaena/`

## Swap the backend later

```ts
// src/mock/backend.ts
export const backend: DeemBackend = new MockBackend()
// → export const backend: DeemBackend = new RailwayBackend({ ... })
```

Secrets (Mongo, Gemini, Fish Audio, Railway) stay out of the repo — add them in
Cursor / Railway when you’re ready to deploy.
