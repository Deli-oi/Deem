// Copies the MVP device pieces this dashboard reuses (the mini display, alert rules, plant data
// and sprites) from ../demo into src/shared and public/. The copies are committed so this folder
// builds and deploys on its own (Railway root directory = dashboard).
//
//   npm run sync        (after changing the device UI, plant data or sprites in demo/)
//
// Edit the originals in demo/, never the copies.
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const demo = join(here, '../../demo')
const out = join(here, '..')

const SRC = [
  'lib/types.ts',
  'lib/mqttContract.ts',
  'lib/healthScore.ts',
  'lib/alerts.ts',
  'lib/airQuality.ts',
  'lib/advice.ts',
  'components/ActivityRings.tsx',
  'components/Sprite.tsx',
  'components/PageFoot.tsx',
  'components/screens/HealthScreen.tsx',
  'components/screens/InputsScreen.tsx',
  'components/screens/HistoryScreen.tsx',
  'components/screens/FailureScreen.tsx',
]

const BANNER = '// SYNCED FROM demo/src/%s. Do not edit here: change it in demo/ and run `npm run sync`.\n'

function copy(from, to, transform = (s) => s) {
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, transform(readFileSync(from, 'utf-8')))
}

for (const f of SRC) copy(join(demo, 'src', f), join(out, 'src/shared', f), (s) => BANNER.replace('%s', f) + s)

// Device CSS: the web fonts are loaded in index.html instead.
copy(join(demo, 'src/styles/global.css'), join(out, 'src/shared/styles/device.css'), (s) =>
  `/* SYNCED FROM demo/src/styles/global.css. Do not edit here: change it in demo/ and run \`npm run sync\`. */\n` +
  s.replace(/@import url\([^)]*\);?\n?/, ''),
)

copy(join(demo, 'public/plants/seed_all.json'), join(out, 'src/shared/plants/seed_all.json'))

mkdirSync(join(out, 'public/sprites'), { recursive: true })
cpSync(join(demo, 'public/sprites'), join(out, 'public/sprites'), { recursive: true })

const count = (d) => readdirSync(d, { recursive: true }).filter((f) => statSync(join(d, f)).isFile()).length
console.log(`synced ${SRC.length} source files, device.css, seed_all.json and ${count(join(out, 'public/sprites'))} sprites`)
