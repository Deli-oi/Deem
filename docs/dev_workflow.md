# Deem development workflow

We work **on the same GitHub repo** (`Deli-oi/Deem`). No forks.

## Branch → PR → merge

1. Branch from `main`: `cursor/<short-name>-a00d` (Cloud Agent convention) or a named feature branch.
2. Commit in small, reviewable chunks with clear messages.
3. `git push -u origin <branch>`.
4. Open / update a PR into `main` (document what changed and how to test).
5. Review → merge → pull `main` locally before the next feature.

Close obsolete PRs instead of stacking forks. Prefer updating an existing PR branch over opening parallel duplicates for the same work.

## Local visual UI test (primary)

The device demo lives in `demo/` and uses a **mock backend** (no secrets required).

```bash
cd demo
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**

Checklist:

- [ ] Boot → setup prompt shows **Deem** branding + device chrome
- [ ] Type / voice a plant (e.g. `dracaena`) → Confirm match
- [ ] Sensor check → health score + metrics
- [ ] Swipe screen left/right for history
- [ ] Collect / fixture chips update readings
- [ ] Ask (voice button on live screen) returns mock advice
- [ ] Dracaena sprite visible top-left (style check)

```bash
npm test
npm run build
```

## Railway preview (secondary)

Project: `hackrpi-delts` · Service: `Deem` · Root directory: **`demo`**

Deploys from GitHub on this repo. After UI changes merge (or when the service watches the feature branch), Railway rebuilds the demo static app.

If a deploy fails with “could not determine how to build”, confirm **Root Directory = `demo`** in the service settings.

## Secrets (do not paste in chat)

Add via Cursor Secrets / Railway variables when ready:

| Name | Use |
|------|-----|
| `RAILWAY_API_TOKEN` | Account token for CLI (`RAILWAY_API_TOKEN`, not `RAILWAY_TOKEN`) |
| `GEMINI_API_KEY` | Gemini |
| `FISH_AUDIO_API_KEY` | Fish Audio |
| `TIGER_DATABASE_URL` | Tiger Data / Postgres connection |

Local mock UI works without these.

## Decision log

Record product/architecture calls in `decisions.md` (newest first). Keep `docs/build_plan.md` phase checkboxes current.
