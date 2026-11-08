// Labels old readings so nothing uses them (the dashboard, the screen history and Gemini all skip labelled rows).
// The rows are NOT deleted: they stay in the table with the label, e.g. for showing what bad data looked like.
//
//   dry run (default):  node ingest/scripts/label_test_data.mjs --before 2026-11-08T10:00:00Z
//   really do it:       node ingest/scripts/label_test_data.mjs --before 2026-11-08T10:00:00Z --apply
//   options:            --label bad_test_data   --device esp32-pot-01
//
// Reads TIGER_DATABASE_URL from the environment (never pass it on the command line), e.g.
//   npx @railway/cli run --service authentic-perception node ingest/scripts/label_test_data.mjs --before ...
import pg from 'pg'
import { PgStore } from '../server/store.mjs'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback)
}

const before = arg('before')
const label = arg('label', 'bad_test_data')
const device = arg('device')
const apply = process.argv.includes('--apply')

if (!before || Number.isNaN(new Date(before).getTime())) {
  console.error('--before <ISO time> is required: readings older than that get the label (e.g. 2026-11-08T10:00:00Z)')
  process.exit(2)
}
if (!/^[a-z0-9_]{1,40}$/.test(label)) {
  console.error('--label must be lowercase letters, digits and underscores')
  process.exit(2)
}
const url = process.env.TIGER_DATABASE_URL
if (!/^postgres(ql)?:\/\//.test(url ?? '')) {
  console.error('TIGER_DATABASE_URL is not set to a postgres:// connection string')
  process.exit(2)
}

const store = new PgStore(new pg.Pool({ connectionString: url, max: 2 }))
try {
  await store.init() // makes sure the label column exists
  const beforeIso = new Date(before).toISOString()
  const n = await store.countUnlabeledBefore(beforeIso, device)
  console.log(`${n} unlabelled reading(s) older than ${beforeIso}${device ? ` for ${device}` : ''}`)
  if (!apply) {
    console.log('dry run: nothing changed. Add --apply to label them.')
  } else {
    const done = await store.labelBefore(beforeIso, label, device)
    console.log(`labelled ${done} reading(s) as "${label}"`)
  }
} finally {
  await store.close()
}
