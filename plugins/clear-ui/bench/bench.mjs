#!/usr/bin/env node
// Measures the status line the way Claude Code runs it: a fresh process per sample, the real
// entry, a real payload on stdin, and a real repository to ask git about.
//
//   node bench/bench.mjs            prints a table, exits 1 only past the hard ceiling
//   node bench/bench.mjs --strict   also exits 1 when a platform budget is missed
//
// The budgets are for a developer's machine. On a shared CI runner (`CI` set) they are printed
// but not judged: the same runner swings by half between runs (docs/roadmap-v2.md, Phase E), so
// "over budget" in that log says nothing about the code. `--strict` judges them anywhere.
//
// Lives outside test/ on purpose: `node --test` runs every file under a test directory, and a
// timing measurement is not a test -- on a shared CI runner it would fail for reasons that have
// nothing to do with the code. The hard ceiling is the one number worth failing a build for:
// past it a person sees the status line arrive late.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLES = 15
const HARD_CEILING_MS = 250
// docs/ui-architecture.md, "Performance budget". macOS and Linux share a column there; the
// macOS half was measured on Apple Silicon on 2026-09-20 (#2).
const BUDGET_MS = process.platform === 'win32' ? { cached: 90, miss: 130 } : { cached: 40, miss: 60 }

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entry = join(root, 'bin', 'statusline.mjs')
const repo = resolve(root, '..', '..')
const payload = JSON.stringify({
  ...JSON.parse(readFileSync(join(root, 'test', 'fixtures', 'idle.json'), 'utf8')),
  cwd: repo,
  workspace: { current_dir: repo, project_dir: repo },
})

function sample(dataDir) {
  const started = process.hrtime.bigint()
  const result = spawnSync(process.execPath, [entry], {
    input: payload,
    env: { ...process.env, COLUMNS: '120', CLEAR_UI_DATA_DIR: dataDir },
    encoding: 'utf8',
    windowsHide: true,
  })
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  if (result.status !== 0 || result.stderr !== '' || result.stdout === '') {
    throw new Error(`the entry broke its contract: exit ${result.status}, stderr ${JSON.stringify(result.stderr)}`)
  }
  return ms
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
function measure(prepare) {
  const times = []
  for (let i = 0; i < SAMPLES; i++) {
    const dataDir = prepare()
    times.push(sample(dataDir))
  }
  times.sort((a, b) => a - b)
  return { median: percentile(times, 0.5), p95: percentile(times, 0.95) }
}

const made = []
const freshDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'clear-ui-bench-'))
  made.push(dir)
  return dir
}

// Cached: one directory, warmed once, so every sample answers from the cache file.
// Miss: a new directory per sample, so every sample runs `git status`.
const warm = freshDir()
sample(warm)
const rows = [
  ['git cached', measure(() => warm), BUDGET_MS.cached],
  ['git cache miss', measure(freshDir), BUDGET_MS.miss],
]
for (const dir of made) rmSync(dir, { recursive: true, force: true })

const strict = process.argv.includes('--strict')
const sharedRunner = Boolean(process.env.CI) && !strict
let failed = false
console.log(`clear-ui bench · ${process.platform} · node ${process.versions.node} · ${SAMPLES} fresh processes each\n`)
for (const [name, { median, p95 }, budget] of rows) {
  const overBudget = median > budget
  const overCeiling = median > HARD_CEILING_MS
  if (overCeiling || (strict && overBudget)) failed = true
  const verdict = overCeiling ? 'OVER CEILING' : sharedRunner ? 'not judged' : overBudget ? 'over budget' : 'ok'
  console.log(`  ${name.padEnd(16)} median ${median.toFixed(0).padStart(4)} ms   p95 ${p95.toFixed(0).padStart(4)} ms   budget ${budget} ms   ${verdict}`)
}
console.log(`\n  hard ceiling ${HARD_CEILING_MS} ms (median)`)
if (sharedRunner) console.log('  shared runner: the budgets are a developer-machine target, shown for reference only')
process.exitCode = failed ? 1 : 0
