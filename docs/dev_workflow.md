# Development workflow

We all work in the same GitHub repo (no forks).

## Branch, PR, merge
1. Branch from `main` with a short name (`feat/...`, `fix/...`, `docs/...`).
2. Small commits with clear messages. Run `git status` before you commit: never `git add -A` blindly.
3. `git push -u origin <branch>`, open a PR into `main` saying what changed and how you tested it.
4. Review, merge, pull `main` before the next piece. Close obsolete PRs rather than stacking parallel copies.
5. Never push to `main` directly and never force-push. (The one exception was removing a committed WiFi password from history; after that everyone ran `git fetch --all && git reset --hard origin/main`.)

## Secrets (the repo is public)
Never commit a WiFi password, token, API key or connection string; never paste one in a PR, log or chat. They live in gitignored files (`pi/.env`, `hackathon2026/src/secrets.h`, `demo/.env.local`) or in Railway variables. Variable names and who uses them are listed in the root `README.md`.

## Try it without hardware
```bash
cd demo && npm install && npm run dev       # http://127.0.0.1:5173, fake sensors
```
Checklist:
- [ ] Boot shows the setup prompt with the on-screen **mic** button; tap it, say a plant (e.g. "dracaena"), tap again.
- [ ] Confirm the match; the sensor check walks DHT11, SEN63C, soil in order.
- [ ] Health page shows the score, a hint to ask by voice, and swiping left/right shows inputs and the hourly history.
- [ ] `?scenario=dry_soil` (also `overwatered`, `cold_snap`, `too_hot`, `dry_air`, `humid_air`, `high_co2`, `dusty_pm25`, `dusty_pm10`) shows the wilted plant, one sentence of advice and the alert sound (`?silent` mutes it).
- [ ] `?kiosk` fills a 240x320 screen with no frame.

## Tests
```bash
cd demo && npm test && npm run build         # UI, server, knowledge, voice
cd dashboard && npm test
cd ingest && npm test
cd pi && .venv/bin/pytest
wsl sh hackathon2026/host_test/run.sh        # firmware logic against fake sensors, prints ALL PASSED
python ingest/e2e_pi_sink.py                 # the Pi's real relay -> ingest -> API
```

## Railway
Project `hackrpi-delts`. Services and their Root Directory: `Deem` = `demo`, `ingest` service = `ingest`, `dashboard` = `dashboard`. Services deploy from `main` when connected to GitHub; otherwise `railway up ./<dir> --path-as-root --service <name> --ci` from the repo root. A deploy is only live when `railway deployment list --service <name>` shows SUCCESS: check an endpoint, not just the green tick.

## Decision log
Record product and architecture calls in `decisions.md` (newest first), and update `docs/mqtt_contract.md` before changing a topic or payload.
