// Governed-stack drift check.
//
// The infrastructure-baseline spec carries a governed technology stack table
// whose `npm package` column is machine-readable. This script compares every
// row whose package cell is not `n/a` against package.json and exits non-zero
// on any mismatch, so the table cannot silently diverge from reality. It
// exists because the table drifted twice within a day of being written
// (sqlite-wasm's constraint, then the i18n stack) and only manual audits
// caught it.
//
// The spec lives inside the change while it is active and moves to
// openspec/specs/ when the change is archived; both locations are searched.
import { readFileSync, existsSync } from 'node:fs'

const CANDIDATES = [
  'openspec/changes/infrastructure-baseline/specs/infrastructure-baseline/spec.md',
  'openspec/specs/infrastructure-baseline/spec.md',
]

const specPath = CANDIDATES.find((p) => existsSync(p))
if (!specPath) {
  console.error('drift-check: no infrastructure-baseline spec found at:\n  ' + CANDIDATES.join('\n  '))
  process.exit(1)
}

const spec = readFileSync(specPath, 'utf8')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const deps = { ...pkg.dependencies, ...pkg.devDependencies }

const strip = (cell) => cell.trim().replace(/^`|`$/g, '')

// Governed rows are 4-cell table lines: | Concern | Component | package | constraint |
const rows = []
for (const line of spec.split('\n')) {
  const m = line.match(/^\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|$/)
  if (!m) continue
  const [concern, component, pkgName, constraint] = m.slice(1).map(strip)
  if (concern === 'Concern' || /^-+$/.test(concern)) continue
  rows.push({ concern, component, pkgName, constraint })
}

if (rows.length === 0) {
  console.error(`drift-check: found no governed stack rows in ${specPath} -- table format changed?`)
  process.exit(1)
}

const failures = []
let checked = 0
for (const { concern, pkgName, constraint } of rows) {
  // The Runtime row has no npm package, but its constraint IS engines.node.
  // It gets an explicit comparison because an EOL Node range once survived in
  // the table unnoticed -- n/a rows had no automated check at all.
  if (concern === 'Runtime') {
    checked++
    const actual = pkg.engines?.node
    const expected = constraint.replace(/\\\|/g, '|')
    if (actual !== expected) {
      failures.push(`engines.node (Runtime): spec says '${expected}', package.json says '${actual}'`)
    }
    continue
  }
  if (pkgName === 'n/a') continue
  checked++
  const actual = deps[pkgName]
  if (actual === undefined) {
    failures.push(`${pkgName} (${concern}): in the governed table but not in package.json`)
  } else if (actual !== constraint.replace(/\\\|/g, '|')) {
    failures.push(`${pkgName} (${concern}): spec says '${constraint}', package.json says '${actual}'`)
  }
}

if (failures.length) {
  console.error(`drift-check: governed stack table (${specPath}) has drifted from package.json:`)
  for (const f of failures) console.error('  - ' + f)
  console.error('Fix: amend the table via an OpenSpec change, or align package.json.')
  process.exit(1)
}

console.log(`drift-check: ${checked} governed packages match package.json (${rows.length} rows, ${rows.length - checked} n/a). Spec: ${specPath}`)
