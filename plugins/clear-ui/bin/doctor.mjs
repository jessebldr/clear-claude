#!/usr/bin/env node
// Clear UI doctor: is the status line installed, current, and actually able to draw?
//
// Strictly read-only. It reads settings.json to answer a question and reports only which keys
// are set, never their contents — a diagnostic that prints someone's settings into a terminal
// is a data leak with no diagnostic benefit.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { loadConfig } from '../src/config.mjs'
import { findGit, gitTimeoutOf } from '../src/git.mjs'
import { classify } from '../src/install.mjs'
import { paths, pluginVersion, readTextOr, RUNTIME_FILES, runtimeIsCurrent } from '../src/paths.mjs'
import { join } from 'node:path'

const rows = []
const check = (name, result, detail) => rows.push({ name, result, detail })

const place = paths()
const version = pluginVersion()
const settingsText = readTextOr(place.settings)

const [major] = process.versions.node.split('.').map(Number)
check('Node runtime', major >= 18 ? 'PASS' : 'FAIL', `node ${process.versions.node}${major >= 18 ? '' : ' — Clear UI needs 18 or newer'}`)

let settings = null
if (settingsText === '') {
  check('Settings file', 'WARN', `${place.settings} does not exist — run setup`)
} else {
  try {
    settings = JSON.parse(settingsText)
    check('Settings file', 'PASS', place.settings)
  } catch (error) {
    check('Settings file', 'FAIL', `${place.settings} is not valid JSON: ${error.message}`)
  }
}

const statusLine = settings?.statusLine ?? null
const { kind, product } = classify(statusLine, place.runtimeDir)
if (kind === 'ours') check('statusLine', 'PASS', 'points at Clear UI')
else if (kind === 'none') check('statusLine', settings === null ? 'UNKNOWN' : 'FAIL', 'not set — run setup')
else check('statusLine', 'FAIL', `set to ${product ?? 'another status line'} — Clear UI is not drawing`)

// Without the timer the bar is only redrawn on the next message, so a resize leaves it clipped
// or stranded until then.
if (kind === 'ours') {
  const interval = statusLine.refreshInterval
  if (Number.isFinite(interval) && interval >= 1) check('Refresh timer', 'PASS', `every ${interval} s — the bar repairs itself after a resize`)
  else check('Refresh timer', 'WARN', 'not set — the bar stays wrong after a resize until the next message; run setup apply')
}

const missing = RUNTIME_FILES.filter(relative => !existsSync(join(place.runtimeDir, relative)))
if (missing.length > 0) check('Runtime files', 'FAIL', `${missing.length} missing under ${place.runtimeDir}`)
else if (runtimeIsCurrent(place, version)) check('Runtime files', 'PASS', `${version} at ${place.runtimeDir}`)
else check('Runtime files', 'WARN', `installed ${readTextOr(place.versionFile).trim() || 'unknown'}, plugin is ${version} — restart or run setup apply`)

// A config that cannot be honoured draws the default, silently; this is where it is said aloud.
const config = loadConfig(place.config)
if (config.problem) check('Config', 'WARN', `${config.problem} — drawing the default`)
else check('Config', 'PASS', existsSync(place.config) ? `preset ${config.preset}` : 'no file; drawing the default')

check(
  'Uninstall safety',
  'PASS',
  existsSync(place.previousFile) ? 'a previous status line is recorded and will be restored' : 'nothing to restore; uninstall will remove the key',
)

// Gates that silently disable every status line. Report only whether the key is set.
const gates = ['disableAllHooks', 'allowManagedHooksOnly'].filter(key => settings?.[key])
check('Silent gates', gates.length === 0 ? 'PASS' : 'WARN', gates.length === 0 ? 'none set' : `${gates.join(', ')} set — status lines are disabled or restricted`)
check('Workspace trust', 'UNKNOWN', 'a status line only runs in a trusted folder; Claude Code decides that, not this check')

if (missing.length === 0) {
  const payload = JSON.stringify({
    model: { display_name: 'Doctor' },
    workspace: { project_dir: place.configHome },
    context_window: { context_window_size: 200000, used_percentage: 42 },
  })
  const started = Date.now()
  const probe = spawnSync(process.execPath, [place.entry], {
    input: payload,
    // TERM=dumb, not NO_COLOR: NO_COLOR keeps bold and dim, and their escapes would be printed raw
    // into the table below.
    env: { ...process.env, COLUMNS: '120', TERM: 'dumb' },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  })
  const ms = Date.now() - started
  const lines = (probe.stdout ?? '').trimEnd().split('\n').filter(Boolean)
  if (probe.status === 0 && lines.length > 0) check('Dry render', 'PASS', `${ms} ms · ${lines.join(' ⏎ ')}`)
  else check('Dry render', 'FAIL', `exit ${probe.status}, ${lines.length} lines in ${ms} ms`)
}

// A git slower than its budget costs the dirty mark and says nothing, so say it here. Timed
// the way the status line runs it, in the directory the doctor was started from.
{
  const git = findGit()
  const budget = gitTimeoutOf(process.env)
  const time = () => {
    const started = process.hrtime.bigint()
    const run = spawnSync(git, ['status', '--porcelain=v2', '--branch'], { cwd: process.cwd(), windowsHide: true, encoding: 'utf8', timeout: 10000 })
    return { ms: Number(process.hrtime.bigint() - started) / 1e6, ok: run.status === 0 }
  }
  if (!git) check('Git speed', 'UNKNOWN', 'git is not on PATH; the bar is drawn without a branch')
  else if (!time().ok) check('Git speed', 'UNKNOWN', 'not started inside a repository; run the doctor from one to time git there')
  else {
    const median = [time(), time(), time()].map(t => t.ms).sort((a, b) => a - b)[1]
    const detail = `git status takes ${median.toFixed(0)} ms here, budget ${budget} ms`
    if (median <= budget * 0.7) check('Git speed', 'PASS', detail)
    else check('Git speed', 'WARN', `${detail} — the dirty mark will often be missing; set CLEAR_UI_GIT_TIMEOUT_MS higher for this machine`)
  }
}

const verdict = rows.some(r => r.result === 'FAIL') ? 'FAIL' : rows.some(r => r.result === 'WARN') ? 'WARN' : 'PASS'
const width = Math.max(...rows.map(r => r.name.length))
process.stdout.write(`Clear UI Doctor — ${verdict}\n\n`)
for (const row of rows) process.stdout.write(`  ${row.name.padEnd(width)}  ${row.result.padEnd(7)} ${row.detail}\n`)
process.exitCode = verdict === 'FAIL' ? 1 : 0
