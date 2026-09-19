// The opt-in usage provider. `claude` is never run here: a small script stands in for it, started
// the way the provider starts the real one, and records exactly what it was given.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describeUsage, parseUsageRun, refreshDue, USAGE_ARGS, USAGE_REFRESH_MS, USAGE_MAX_AGE_MS, usageOf, usageRecordOf } from '../src/usage.mjs'
import { claimRefresh, findClaude, lastAttemptAt, readUsageCache, refreshUsage } from '../src/usage-cache.mjs'
import { resolveConfig } from '../src/config.mjs'
import { findGit } from '../src/git.mjs'
import { stateFromStatusline } from '../src/state.mjs'
import { render } from '../src/render.mjs'
import { displayWidth } from '../src/sanitize.mjs'

const NOW = Date.UTC(2026, 8, 19, 15, 30)
const MINUTE = 60 * 1000

// The shape measured on Claude Code 2.1.278, with the account's own text left out.
const LIMITS = [
  { kind: 'session', group: 'session', percent: 25, resets_at: '2026-09-19T16:20:00.092825+00:00', scope: null, severity: 'normal', is_active: false },
  { kind: 'weekly_all', group: 'weekly', percent: 68, resets_at: '2026-09-19T20:00:00.092843+00:00', scope: null, severity: 'normal', is_active: true },
  { kind: 'weekly_scoped', group: 'weekly', percent: 64, resets_at: '2026-09-19T19:59:59.092985+00:00', scope: { model: { display_name: 'Fable' }, surface: null }, severity: 'normal', is_active: false },
]
const ZERO_USAGE = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 0 } }
const clone = value => JSON.parse(JSON.stringify(value))

/** A stream-json run. `edit` receives `{ init, assistant, result }` to break one thing at a time. */
function stream(edit = () => {}, limits = LIMITS) {
  const events = {
    init: { type: 'system', subtype: 'init', model: 'claude-haiku-4-5-20251001', claude_code_version: '2.1.278', tools: [], plugins: [] },
    assistant: {
      type: 'assistant',
      message: { model: '<synthetic>', role: 'assistant', usage: clone(ZERO_USAGE), content: [{ type: 'text', text: 'Current week (Fable): 99% used' }] },
      usage_report: { session: { total_cost_usd: 0 }, rate_limits: { limits: clone(limits), extra_usage: { is_enabled: false } } },
    },
    result: { type: 'result', subtype: 'success', is_error: false, local_command: 'usage', num_turns: 0, total_cost_usd: 0, duration_api_ms: 0, usage: clone(ZERO_USAGE), modelUsage: {}, result: 'Current week (Fable): 99% used' },
  }
  edit(events)
  return Object.values(events).flat().map(event => JSON.stringify(event)).join('\n') + '\n'
}

const reasonOf = (edit, exitCode = 0) => {
  const parsed = parseUsageRun(stream(edit), exitCode, NOW)
  assert.equal(parsed.ok, false)
  return parsed.reason
}

test('the measured run becomes one generic record: kinds, a label, percents and epoch resets', () => {
  const parsed = parseUsageRun(stream(), 0, NOW)
  assert.deepEqual(parsed, {
    ok: true,
    record: {
      version: 1,
      fetchedAt: NOW,
      claudeCode: '2.1.278',
      limits: [
        { kind: 'session', label: null, percent: 25, resetsAt: Date.UTC(2026, 8, 19, 16, 20, 0, 92) },
        { kind: 'weekly_all', label: null, percent: 68, resetsAt: Date.UTC(2026, 8, 19, 20, 0, 0, 92) },
        { kind: 'weekly_scoped', label: 'Fable', percent: 64, resetsAt: Date.UTC(2026, 8, 19, 19, 59, 59, 92) },
      ],
    },
  })
  assert.deepEqual(usageRecordOf(clone(parsed.record)), parsed.record, 'what is written is what is read back')
})

test('a run is believed only when it proves it was the built-in, with no turn, cost, API time or token', () => {
  assert.equal(reasonOf(() => {}, 1), 'exit')
  assert.equal(reasonOf(() => {}, null), 'exit')
  assert.equal(reasonOf(e => (e.result.local_command = undefined)), 'not-the-builtin')
  assert.equal(reasonOf(e => (e.result.local_command = 'cost')), 'not-the-builtin')
  assert.equal(reasonOf(e => (e.result.num_turns = 1)), 'model-turn')
  assert.equal(reasonOf(e => (e.result.total_cost_usd = 0.003978)), 'model-turn')
  assert.equal(reasonOf(e => (e.result.duration_api_ms = 6925)), 'model-turn')
  assert.equal(reasonOf(e => delete e.result.num_turns), 'model-turn', 'absent is not zero')
  assert.equal(reasonOf(e => (e.result.usage.output_tokens = 8)), 'tokens')
  assert.equal(reasonOf(e => (e.result.usage.cache_read_input_tokens = 15553)), 'tokens')
  assert.equal(reasonOf(e => delete e.result.usage), 'tokens')
  assert.equal(reasonOf(e => (e.result.modelUsage = { 'claude-haiku-4-5': { costUSD: 0 } })), 'model-usage')
  assert.equal(reasonOf(e => (e.result.is_error = true)), 'result-error')
  assert.equal(reasonOf(e => (e.result.subtype = 'error_max_budget_usd')), 'result-error')
  assert.equal(reasonOf(e => (e.result = [e.result, e.result])), 'result-count')
  assert.equal(reasonOf(e => delete e.result), 'result-count')
  // What the path-conversion accident looked like: a real model answered.
  assert.equal(reasonOf(e => (e.assistant = [{ type: 'assistant', message: { model: 'claude-fable-5-1' } }, e.assistant])), 'real-model')
  assert.equal(reasonOf(e => (e.assistant.message.model = 'claude-haiku-4-5-20251001')), 'real-model')
  assert.equal(reasonOf(e => delete e.assistant.usage_report), 'report-count')
  assert.equal(parseUsageRun(stream() + '{"type": "resu', 0, NOW).reason, 'unparseable')
  assert.equal(parseUsageRun('', 0, NOW).reason, 'result-count')
  assert.equal(parseUsageRun(undefined, 0, NOW).reason, 'input')
})

// Measured offline with a stale snapshot: exit 0, is_error false, the text still printing the old
// percentages with nothing to mark them, and `limits: null`. The text is never an answer.
test('only usage_report is read: null limits is a failure whatever the text says, and the text is never parsed', () => {
  assert.equal(reasonOf(e => (e.assistant.usage_report.rate_limits.limits = null)), 'no-limits')
  assert.equal(reasonOf(e => delete e.assistant.usage_report.rate_limits), 'no-limits')
  const rewritten = parseUsageRun(stream(e => {
    e.assistant.message.content[0].text = 'Current week (Fable): 12% used'
    e.result.result = '\u001b[31mnothing a parser would want'
  }), 0, NOW)
  assert.equal(rewritten.ok, true)
  assert.equal(rewritten.record.limits[2].percent, 64)
})

test('needed fields are validated; unknown fields, kinds and scopes are ignored', () => {
  for (const broken of [{ percent: '64' }, { percent: null }, { percent: -1 }, { percent: Infinity }, { percent: 1001 }, { resets_at: 1789834800 }, { resets_at: 'tomorrow' }, { kind: 7 }]) {
    assert.equal(parseUsageRun(stream(() => {}, [LIMITS[0], { ...LIMITS[2], ...broken }]), 0, NOW).reason, 'row-schema', JSON.stringify(broken))
  }
  assert.equal(parseUsageRun(stream(() => {}, ['weekly']), 0, NOW).reason, 'row-schema')
  assert.equal(parseUsageRun(stream(() => {}, Array(17).fill(LIMITS[0])), 0, NOW).reason, 'too-many-rows')

  const tolerant = parseUsageRun(stream(e => (e.future_event = { type: 'telemetry', anything: [1, 2] }), [
    { ...LIMITS[1], a_new_field: { nested: true }, resets_at: null },
    { kind: 'monthly_all', percent: 'not even a number' },
    { ...LIMITS[2], scope: { model: null, surface: { display_name: 'Web' } } },
    { ...LIMITS[2], scope: { model: { display_name: 'x'.repeat(41) } } },
    { ...LIMITS[2], percent: 104.5, scope: { model: { display_name: '  Some Future Model  ', id: 'ignored' } } },
  ]), 0, NOW)
  assert.equal(tolerant.ok, true)
  assert.deepEqual(tolerant.record.limits, [
    { kind: 'weekly_all', label: null, percent: 68, resetsAt: null },
    { kind: 'weekly_scoped', label: 'Some Future Model', percent: 104.5, resetsAt: Date.UTC(2026, 8, 19, 19, 59, 59, 92) },
  ])
})

test('the provider stores whatever model the row names; no model is named in its code', () => {
  for (const file of ['../src/usage.mjs', '../src/usage-cache.mjs', '../bin/usage-refresh.mjs']) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /fable|opus|sonnet/i, file)
  }
})

test('state: scoped rows while they can be believed, nothing past 30 minutes or past their reset', () => {
  const { record } = parseUsageRun(stream(() => {}, [...LIMITS, { ...LIMITS[2], percent: 9, resets_at: '2026-09-19T15:40:00Z', scope: { model: { display_name: 'Other' } } }]), 0, NOW)
  const scoped = { label: 'Fable', percent: 64, resetsAt: Date.UTC(2026, 8, 19, 19, 59, 59, 92) }
  assert.deepEqual(usageOf(record, NOW + MINUTE), { fetchedAt: NOW, weeklyScoped: [scoped, { label: 'Other', percent: 9, resetsAt: Date.UTC(2026, 8, 19, 15, 40) }] })
  assert.deepEqual(usageOf(record, NOW + 11 * MINUTE).weeklyScoped, [scoped], 'a window that has reset is dropped')
  assert.notEqual(usageOf(record, NOW + USAGE_MAX_AGE_MS), null)
  assert.equal(usageOf(record, NOW + USAGE_MAX_AGE_MS + 1), null)
  assert.equal(usageOf(record, NOW - 1), null, 'a record from the future is a changed clock')
  assert.equal(usageOf(null, NOW), null)
  assert.equal(usageOf({ ...record, limits: record.limits.slice(0, 2) }, NOW), null, 'no scoped row, nothing to say')

  assert.equal(refreshDue(null, NOW), true)
  assert.equal(refreshDue(record, NOW + USAGE_REFRESH_MS - 1), false)
  assert.equal(refreshDue(record, NOW + USAGE_REFRESH_MS), true)
  assert.equal(refreshDue(record, NOW - 1), true)
})

test('a cache file is distrusted like any other input', () => {
  const { record } = parseUsageRun(stream(), 0, NOW)
  for (const edit of [r => (r.version = 2), r => (r.fetchedAt = '15:30'), r => (r.limits = null), r => (r.limits[2].label = null), r => (r.limits[0].label = 'x'), r => (r.limits[1].percent = '68'), r => (r.limits[1].resetsAt = 'soon'), r => (r.limits[0].kind = 'daily')]) {
    const tampered = clone(record)
    edit(tampered)
    assert.equal(usageRecordOf(tampered), null, String(edit))
  }
  assert.equal(usageRecordOf([]), null)
  assert.equal(readUsageCache(join(tmpdir(), 'clear-ui-no-such-directory')), null)
  assert.equal(readUsageCache(undefined), null)
})

// ---- the run itself, against a stand-in for `claude` ----

const FAKE = `
import { readFileSync, writeFileSync } from 'node:fs'
writeFileSync(process.env.FAKE_ARGV_FILE, JSON.stringify(process.argv.slice(2)))
writeFileSync(process.env.FAKE_ARGV_FILE + '.pid', String(process.pid))
process.stdout.write(readFileSync(process.env.FAKE_STDOUT_FILE, 'utf8'))
if (process.env.FAKE_HANG) setInterval(() => {}, 1000)
else process.exitCode = Number(process.env.FAKE_EXIT ?? 0)
`

function sandbox(t) {
  const dir = mkdtempSync(join(tmpdir(), 'clear-ui-usage-'))
  // Patient, as test/git.test.mjs is: a process that has just ended can keep its working
  // directory busy for a moment on Windows, and the detached worker a tick starts is such a one.
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 }))
  const fake = join(dir, 'fake-claude.mjs')
  writeFileSync(fake, FAKE)
  const cacheDir = join(dir, 'data', 'cache')
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, FAKE_ARGV_FILE: join(dir, 'argv.json'), FAKE_STDOUT_FILE: join(dir, 'stdout.jsonl') }
  const refresh = (stdout, extraEnv = {}, options = {}) => {
    writeFileSync(env.FAKE_STDOUT_FILE, stdout)
    return refreshUsage({ cacheDir, env: { ...env, ...extraEnv }, command: process.execPath, prefixArgs: [fake], now: () => NOW, ...options })
  }
  return { dir, fake, cacheDir, env, refresh, argv: () => JSON.parse(readFileSync(env.FAKE_ARGV_FILE, 'utf8')) }
}

test('a believed run writes the cache, and `claude` receives the argument vector byte for byte', async t => {
  const box = sandbox(t)
  assert.deepEqual(await box.refresh(stream()), { ok: true, reason: null })
  assert.deepEqual(box.argv(), [...USAGE_ARGS])
  assert.equal(box.argv()[1], '/usage')
  assert.equal(box.argv().at(-1), '', 'the empty --tools value survives as an argument of its own')
  assert.equal(readUsageCache(box.cacheDir).limits[2].label, 'Fable')
  assert.deepEqual(readdirSync(box.cacheDir), ['usage.json'], 'no temporary file is left behind')
})

test('a failed run never overwrites the last good cache', async t => {
  const box = sandbox(t)
  await box.refresh(stream())
  const good = readFileSync(join(box.cacheDir, 'usage.json'), 'utf8')
  const failures = [
    [stream(e => (e.assistant.usage_report.rate_limits.limits = null)), {}, {}, 'no-limits'],
    [stream(e => (e.result.num_turns = 1)), {}, {}, 'model-turn'],
    [stream(), { FAKE_EXIT: '1' }, {}, 'exit'],
    ['not json at all\n', {}, {}, 'unparseable'],
    [stream(), { FAKE_HANG: '1' }, { timeoutMs: 1500 }, 'timeout'],
    [stream(), {}, { command: join(box.dir, 'no-such-claude') }, 'spawn'],
  ]
  for (const [stdout, extraEnv, options, reason] of failures) {
    assert.deepEqual(await box.refresh(stdout, extraEnv, options), { ok: false, reason })
    assert.equal(readFileSync(join(box.cacheDir, 'usage.json'), 'utf8'), good, reason)
    if (reason === 'timeout') {
      // A refresh that has returned has left no process behind: the run it stopped is gone, not
      // merely signalled. (Signal 0 asks whether the process exists without touching it.)
      const pid = Number(readFileSync(`${box.env.FAKE_ARGV_FILE}.pid`, 'utf8'))
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, `the stopped run (pid ${pid}) is still alive`)
    }
  }
  assert.deepEqual(await refreshUsage({ cacheDir: box.cacheDir, env: { PATH: '' } }), { ok: false, reason: 'no-claude' })
  assert.deepEqual(await refreshUsage({ cacheDir: 'relative/cache' }), { ok: false, reason: 'no-cache-dir' })
})

test('findClaude on Windows: claude.exe and nothing else -- never a .cmd, .bat, .ps1 or sh shim', t => {
  const box = sandbox(t)
  const [shims, native, decoy] = ['npm', 'native', 'decoy'].map(name => join(box.dir, name))
  for (const dir of [shims, native]) mkdirSync(dir)
  // What `npm i -g @anthropic-ai/claude-code` leaves on a Windows PATH.
  for (const name of ['claude', 'claude.cmd', 'claude.bat', 'claude.ps1', 'CLAUDE.COM']) writeFileSync(join(shims, name), '')
  assert.equal(findClaude({ PATH: shims }, 'win32'), null)
  assert.equal(findClaude({ PATH: shims, PATHEXT: '.CMD;.BAT;.EXE' }, 'win32'), null, 'PATHEXT is a shell convention and is not consulted')

  // A directory with the right name is not an executable; the next PATH entry is tried.
  mkdirSync(join(decoy, 'claude.exe'), { recursive: true })
  writeFileSync(join(native, 'claude.exe'), '')
  assert.equal(findClaude({ PATH: ['relative', '', shims, decoy, native].join(delimiter) }, 'win32'), join(native, 'claude.exe'))
  assert.equal(findClaude({ Path: native }, 'win32'), join(native, 'claude.exe'), 'Windows spells the variable Path')
  assert.equal(findClaude({}, 'win32'), null)
})

test('findClaude on POSIX: an executable file named claude, never claude.exe or a directory', t => {
  const box = sandbox(t)
  const [wrong, right] = ['wrong', 'right'].map(name => join(box.dir, name))
  mkdirSync(join(wrong, 'claude'), { recursive: true })
  mkdirSync(right)
  writeFileSync(join(right, 'claude.exe'), '')
  assert.equal(findClaude({ PATH: [wrong, right].join(delimiter) }, 'linux'), null)

  writeFileSync(join(right, 'claude'), '#!/usr/bin/env node\n', { mode: 0o644 })
  if (process.platform !== 'win32') {
    // Only a POSIX host has an execute bit to check.
    assert.equal(findClaude({ PATH: right }, 'linux'), null, 'not executable: passed over')
    chmodSync(join(right, 'claude'), 0o755)
  }
  assert.equal(findClaude({ PATH: [wrong, 'relative', right].join(delimiter) }, 'linux'), join(right, 'claude'))
  assert.equal(findClaude({ PATH: [wrong, right].join(delimiter) }, 'darwin'), join(right, 'claude'))
})

// ---- `/usage` must never reach a shell ----
//
// Found the expensive way: passed through Git Bash, "/usage" arrived as
// "C:/Program Files/Git/usage", which is not a command but a prompt. A model answered it: $0.136.

test('`/usage` cannot pass through a shell: the provider has no way to start one', () => {
  assert.ok(Object.isFrozen(USAGE_ARGS))
  assert.equal(USAGE_ARGS[0], '-p')
  assert.equal(USAGE_ARGS[1], '/usage')
  for (const file of ['../src/usage-cache.mjs', '../bin/usage-refresh.mjs', '../src/usage.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    const code = source.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n')
    for (const [, names] of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'node:child_process'/g)) {
      assert.deepEqual(names.split(',').map(name => name.trim()).filter(Boolean), ['spawn'], `${file}: spawn is the only way to start a process`)
    }
    assert.doesNotMatch(code, /\bexec(File)?(Sync)?\s*\(|\bspawnSync\s*\(/, file)
    const spawns = [...code.matchAll(/\bspawn\(([^\n]*)\)/g)].map(match => match[1])
    for (const call of spawns) assert.match(call, /shell: false/, `${file}: spawn(${call})`)
    assert.doesNotMatch(code.replaceAll('shell: false', ''), /\bshell\s*:/, `${file}: no other shell option`)
    if (file.endsWith('usage-cache.mjs')) assert.equal(spawns.length, 2, 'the worker and the `claude` run')
  }
})

test('the stand-in does detect path conversion: through Git Bash, `/usage` arrives as a path', t => {
  const git = process.platform === 'win32' ? findGit() : null
  // <Git>/cmd/git.exe or <Git>/mingw64/bin/git.exe -> <Git>/bin/bash.exe
  const bash = git ? [join(dirname(dirname(git)), 'bin', 'bash.exe'), join(dirname(dirname(dirname(git))), 'bin', 'bash.exe')].find(existsSync) : null
  if (!bash) return t.skip('only Git Bash on Windows rewrites a leading slash')
  const box = sandbox(t)
  writeFileSync(box.env.FAKE_STDOUT_FILE, '')
  const { MSYS_NO_PATHCONV: _off, MSYS2_ARG_CONV_EXCL: _excluded, ...ambient } = process.env
  const through = spawnSync(bash, ['-c', '"$0" "$1" -p /usage', process.execPath, box.fake], { env: { ...ambient, ...box.env }, encoding: 'utf8', windowsHide: true })
  assert.equal(through.status, 0, through.stderr)
  assert.notEqual(box.argv()[1], '/usage', 'Git Bash was expected to rewrite it; if it no longer does, this guard has nothing to detect')
  assert.match(box.argv()[1], /[\\/]usage$/)
})

// ---- single flight ----

const lockName = at => `usage-${Math.floor(at / USAGE_REFRESH_MS)}.lock`
const touch = (file, at) => {
  writeFileSync(file, '')
  utimesSync(file, new Date(at), new Date(at))
}

test('one claim per interval: the first wins, and a recent attempt blocks the next interval too', t => {
  const { cacheDir } = sandbox(t)
  const now = Date.now()
  assert.equal(claimRefresh(cacheDir, now), true)
  assert.equal(claimRefresh(cacheDir, now), false)
  assert.equal(claimRefresh(cacheDir, now + 2000), false)
  assert.deepEqual(readdirSync(cacheDir), [lockName(now)])
  assert.ok(Math.abs(lastAttemptAt(cacheDir) - now) < 5000)

  // Five seconds ago by the clock, but the far side of an interval boundary by name: a refresh
  // that failed is not retried early just because the name changed.
  const boundary = Math.ceil(now / USAGE_REFRESH_MS) * USAGE_REFRESH_MS + USAGE_REFRESH_MS
  rmSync(join(cacheDir, lockName(now)))
  touch(join(cacheDir, lockName(boundary - 5000)), boundary - 5000)
  assert.equal(claimRefresh(cacheDir, boundary), false)
  assert.equal(claimRefresh(undefined, now), false)
  assert.equal(lastAttemptAt(join(cacheDir, 'absent')), null)
})

test('old lock files are cleared, not accumulated: a day of intervals leaves one file', t => {
  const { cacheDir } = sandbox(t)
  mkdirSync(cacheDir, { recursive: true })
  const start = Math.floor(Date.now() / USAGE_REFRESH_MS) * USAGE_REFRESH_MS - 3 * 24 * 60 * MINUTE
  // As the provider runs: one claim per interval, each leaving its lock behind for the next.
  for (let i = 0; i < 144; i++) {
    const at = start + i * USAGE_REFRESH_MS
    assert.equal(claimRefresh(cacheDir, at), true, `interval ${i}`)
    utimesSync(join(cacheDir, lockName(at)), new Date(at), new Date(at))
    assert.deepEqual(readdirSync(cacheDir), [lockName(at)], `interval ${i}`)
  }

  // Leftovers from anywhere -- a crash, a changed clock, an older version -- go on the next look,
  // even one that loses, and nothing that is not a lock is touched.
  const now = start + 200 * USAGE_REFRESH_MS
  for (const age of [2, 3, 50]) touch(join(cacheDir, lockName(now - age * USAGE_REFRESH_MS)), now - age * USAGE_REFRESH_MS)
  touch(join(cacheDir, lockName(now + 90 * USAGE_REFRESH_MS)), now + 90 * USAGE_REFRESH_MS)
  touch(join(cacheDir, lockName(now)), now)
  for (const bystander of ['usage.json', 'git-0123456789abcdef.json', 'usage-notanumber.lock']) touch(join(cacheDir, bystander), now - 50 * USAGE_REFRESH_MS)
  assert.equal(claimRefresh(cacheDir, now + 1000), false, 'this interval is taken')
  assert.deepEqual(readdirSync(cacheDir).sort(), ['git-0123456789abcdef.json', 'usage-notanumber.lock', 'usage.json', lockName(now)].sort())
})

test('twelve processes claiming at once: exactly one may refresh', async t => {
  const { cacheDir } = sandbox(t)
  const module = pathToFileURL(fileURLToPath(new URL('../src/usage-cache.mjs', import.meta.url))).href
  // One shared instant, so every contender is in the same interval whatever the wall clock does.
  const script = `const { claimRefresh } = await import(${JSON.stringify(module)}); process.stdout.write(String(claimRefresh(${JSON.stringify(cacheDir)}, ${Date.now()})))`
  const contender = () =>
    new Promise(resolve => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], { windowsHide: true })
      let out = ''
      child.stdout.on('data', chunk => (out += chunk))
      child.on('close', () => resolve(out))
    })
  const outcomes = await Promise.all(Array.from({ length: 12 }, contender))
  assert.equal(outcomes.filter(outcome => outcome === 'true').length, 1, outcomes.join(' '))
  assert.equal(outcomes.filter(outcome => outcome === 'false').length, 11)
  assert.equal(readdirSync(cacheDir).length, 1)
})

// ---- the entry ----

const entry = fileURLToPath(new URL('../bin/statusline.mjs', import.meta.url))
const idle = readFileSync(new URL('./fixtures/idle.json', import.meta.url), 'utf8')
// PATH is empty on purpose: the worker these ticks start finds no `claude` and ends at once.
const tick = dataDir =>
  new Promise(resolve => {
    const child = spawn(process.execPath, [entry], { env: { PATH: '', SystemRoot: process.env.SystemRoot, TERM: 'dumb', COLUMNS: '120', TZ: 'UTC', CLEAR_UI_DATA_DIR: dataDir }, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => (stdout += chunk))
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('close', code => resolve({ code, stdout, stderr }))
    child.stdin.end(idle)
  })

test('config: only the literal true opts in, and no preset does', () => {
  assert.equal(resolveConfig(undefined).usage, false)
  for (const preset of ['essential', 'minimal', 'full']) assert.equal(resolveConfig({ preset }).usage, false)
  for (const value of ['on', 1, 'true', {}, null]) assert.equal(resolveConfig({ usage: value }).usage, false, JSON.stringify(value))
  assert.equal(resolveConfig({ usage: true }).usage, true)
  assert.equal(resolveConfig({ show: { usage: true } }).usage, false)
})

test('by default the entry starts nothing and writes nothing, however old or absent the cache', async t => {
  const box = sandbox(t)
  const dataDir = dirname(box.cacheDir)
  mkdirSync(dataDir, { recursive: true })
  const result = await tick(dataDir)
  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  assert.deepEqual(readdirSync(dataDir), [], 'no cache directory, no lock, no worker')
})

test('opted in: five ticks at once claim one refresh, draw exactly what they drew before, and stay silent', async t => {
  const box = sandbox(t)
  const dataDir = dirname(box.cacheDir)
  mkdirSync(dataDir, { recursive: true })
  const before = await tick(dataDir)
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({ version: 1, usage: true }))
  const ticks = await Promise.all(Array.from({ length: 5 }, () => tick(dataDir)))
  for (const result of ticks) {
    assert.equal(result.code, 0)
    assert.equal(result.stderr, '')
    assert.equal(result.stdout, before.stdout, 'with no answer there is nothing to draw')
  }
  assert.equal(readdirSync(box.cacheDir).filter(name => name.endsWith('.lock')).length, 1)
  await tick(dataDir)
  assert.equal(readdirSync(box.cacheDir).filter(name => name.endsWith('.lock')).length, 1, 'a later tick does not claim again')
  assert.equal(existsSync(join(box.cacheDir, 'usage.json')), false, 'with no `claude` to run, nothing is written')
})

test('opted in with a fresh cache: the entry draws the row and claims nothing; past 30 minutes it does neither', async t => {
  const box = sandbox(t)
  const dataDir = dirname(box.cacheDir)
  mkdirSync(box.cacheDir, { recursive: true })
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({ version: 1, usage: true }))
  // The entry runs on the real clock, so the window resets a day from the real now.
  const tomorrow = new Date(Date.now() + 24 * 60 * MINUTE).toISOString()
  const { record } = parseUsageRun(stream(() => {}, LIMITS.map(row => ({ ...row, resets_at: tomorrow }))), 0, Date.now())
  writeFileSync(join(box.cacheDir, 'usage.json'), JSON.stringify(record))
  const result = await tick(dataDir)
  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  // Not anchored: once the fixture's own weekly window has passed, the label grows a "7d".
  assert.match(result.stdout, /Fable 64%/, 'the cached scoped row is drawn')
  assert.deepEqual(readdirSync(box.cacheDir), ['usage.json'])

  // The same file, 31 minutes old: too old to draw, and old enough to ask again.
  writeFileSync(join(box.cacheDir, 'usage.json'), JSON.stringify({ ...record, fetchedAt: Date.now() - 31 * MINUTE }))
  const stale = await tick(dataDir)
  assert.doesNotMatch(stale.stdout, /Fable 64%/)
  assert.equal(readdirSync(box.cacheDir).filter(name => name.endsWith('.lock')).length, 1)
})

// ---- looking without touching: the doctor ----

test("the doctor's line: off, no claude, no answer yet, a good answer, one too old to draw", () => {
  const { record } = parseUsageRun(stream(), 0, NOW)
  const line = options => describeUsage({ enabled: true, hasClaude: true, record: null, lastAttemptAt: null, now: NOW + 4 * MINUTE, ...options })
  assert.deepEqual(line({ enabled: false, record }), { result: 'PASS', detail: 'off (the default) -- the status line reaches no network' })
  assert.equal(line({ hasClaude: false }).result, 'WARN')
  assert.match(line({ hasClaude: false }).detail, /no `claude` executable on PATH/)
  assert.equal(line({}).result, 'UNKNOWN')
  assert.deepEqual(line({ lastAttemptAt: NOW }).result, 'WARN')
  assert.match(line({ lastAttemptAt: NOW }).detail, /no good answer yet · last attempt 4m ago/)
  assert.deepEqual(line({ record, lastAttemptAt: NOW }), {
    result: 'PASS',
    detail: 'on · last good answer 4m ago (Claude Code 2.1.278) · 1 scoped row · last attempt 4m ago · refreshed every 10m at most',
  })
  const stale = line({ record, lastAttemptAt: NOW + 40 * MINUTE, now: NOW + 45 * MINUTE })
  assert.equal(stale.result, 'WARN')
  assert.match(stale.detail, /last good answer 45m ago .* too old to draw \(over 30m\) · last attempt 5m ago/)
  assert.doesNotMatch(JSON.stringify([line({ record }), stale]), /Fable/, 'a label is outside text; the doctor counts rows and never prints one')
})

test('CLEAR_UI_NO_USAGE_REFRESH: the entry reads the cache and claims nothing, however old it is', async t => {
  const box = sandbox(t)
  const dataDir = dirname(box.cacheDir)
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({ version: 1, usage: true }))
  const child = spawnSync(process.execPath, [entry], {
    input: idle,
    env: { PATH: '', SystemRoot: process.env.SystemRoot, TERM: 'dumb', COLUMNS: '120', CLEAR_UI_DATA_DIR: dataDir, CLEAR_UI_NO_USAGE_REFRESH: '1' },
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(child.status, 0)
  assert.equal(child.stderr, '')
  assert.notEqual(child.stdout, '')
  assert.deepEqual(readdirSync(dataDir), ['config.json'])
})

test('the doctor reports the provider and its dry render starts no refresh', t => {
  const home = mkdtempSync(join(tmpdir(), 'clear-ui-usage-doctor-'))
  t.after(() => rmSync(home, { recursive: true, force: true, maxRetries: 5 }))
  const bin = name => fileURLToPath(new URL(`../bin/${name}.mjs`, import.meta.url))
  // PATH is empty: even a refresh that did start would find no `claude`.
  const run = (name, args = []) => spawnSync(process.execPath, [bin(name), ...args], { env: { PATH: '', SystemRoot: process.env.SystemRoot, CLAUDE_CONFIG_DIR: home }, encoding: 'utf8', windowsHide: true })
  writeFileSync(join(home, 'settings.json'), '{}\n')
  assert.equal(run('setup', ['apply']).status, 0)
  assert.match(run('doctor').stdout, /Usage provider\s+PASS\s+off \(the default\)/)

  assert.equal(run('configure', ['usage', 'on']).status, 0)
  const cacheDir = join(home, 'plugins', 'data', 'clear-ui-clear-claude', 'cache')
  mkdirSync(cacheDir, { recursive: true })
  const { record } = parseUsageRun(stream(), 0, Date.now() - 45 * MINUTE)
  writeFileSync(join(cacheDir, 'usage.json'), JSON.stringify(record))
  const before = readFileSync(join(cacheDir, 'usage.json'), 'utf8')

  const report = run('doctor').stdout
  assert.match(report, /Dry render\s+PASS/)
  assert.match(report, /Usage provider\s+WARN\s+on, but there is no `claude` executable on PATH/)
  assert.deepEqual(readdirSync(cacheDir), ['usage.json'], 'no lock: the 45-minute-old cache did not start a refresh')
  assert.equal(readFileSync(join(cacheDir, 'usage.json'), 'utf8'), before)
})

// ---- the segment ----

const RENDER_NOW = Date.UTC(2026, 8, 19, 4, 10)
const idleState = () => ({ ...stateFromStatusline(JSON.parse(idle)), git: { branch: 'main', dirty: true, ahead: 0, behind: 0 } })
const scopedUsage = (percent, label = 'Fable', more = []) => ({ fetchedAt: RENDER_NOW, weeklyScoped: [{ label, percent, resetsAt: RENDER_NOW + 4 * 60 * MINUTE }, ...more] })
const draw = (state, options = {}) => render(state, { now: RENDER_NOW, timeZone: 'UTC', ...options })

test('segment: the scoped row stands after the weekly chip, under the label Claude Code gave it', () => {
  const state = { ...idleState(), usage: scopedUsage(65) }
  assert.deepEqual(draw(state, { columns: 140 }), [`Fable 5.1  high  │  clear-claude on main  ●${' '.repeat(24)}ctx 31% ███───────  │  5h 9% · 2h10m  │  7d 51% · 4d15h  │  Fable 65%`])
  assert.equal(draw(state, { columns: 90 })[1], 'ctx 31% ███───────  │  5h 9% · 2h10m  │  7d 51% · 4d15h  │  Fable 65%')
  assert.equal(draw(state, { columns: 90, charset: 'ascii' })[1], 'ctx 31% ###-------  |  5h 9%  2h10m  |  7d 51%  4d15h  |  Fable 65%')

  // No model is known to the renderer: any label is drawn, cleaned and bounded like a branch name.
  const other = draw({ ...idleState(), usage: scopedUsage(12, 'Some \u001b[31mFuture\u202e Model') }, { columns: 140 })[0]
  assert.match(other, /7d 51% · 4d15h  │  Some Future… 12%$/)
  assert.doesNotMatch(other, /[\x00-\x1f\u202e]/)
  assert.doesNotMatch(readFileSync(new URL('../src/render.mjs', import.meta.url), 'utf8').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n'), /Fable|Opus|Sonnet/)
})

test('segment: without the provider, or with nothing to believe, the bar is byte for byte what it was', () => {
  const bare = idleState()
  for (const columns of [140, 120, 100, 80, 60, 40, undefined]) {
    for (const look of [{}, { color: true, style: true, look: 'pills', theme: 'dark', truecolor: true }]) {
      const expected = draw(bare, { columns, ...look })
      for (const usage of [null, undefined, {}, { weeklyScoped: [] }, { weeklyScoped: 'Fable 65%' }, { weeklyScoped: [null, { label: '', percent: 65 }, { label: 'Fable', percent: 'many' }] }, scopedUsage(65, 'Fable').weeklyScoped]) {
        assert.deepEqual(draw({ ...bare, usage }, { columns, ...look }), expected, `${columns} ${JSON.stringify(usage)}`)
      }
      // A window that has reset describes a quota that no longer exists, as for the native chips.
      assert.deepEqual(draw({ ...bare, usage: { weeklyScoped: [{ label: 'Fable', percent: 65, resetsAt: RENDER_NOW - 1 }] } }, { columns, ...look }), expected)
      assert.deepEqual(draw({ ...bare, usage: scopedUsage(65) }, { columns, ...look, show: { weeklyScoped: false } }), expected, 'switched off')
    }
  }
})

test('segment: responsive -- first to go when the row is short, and never what breaks the single bar while healthy', () => {
  const state = { ...idleState(), usage: scopedUsage(65) }
  const bare = idleState()
  // Narrow and medium: dropped before the weekly chip it qualifies.
  for (const columns of [60, 50, 40, 30]) assert.deepEqual(draw(state, { columns }), draw(bare, { columns }), String(columns))
  // 116 columns: the bar fits on one row without the chip and would need two with it.
  assert.equal(draw(bare, { columns: 116 }).length, 1)
  assert.deepEqual(draw(state, { columns: 116 }), draw(bare, { columns: 116 }))
  // Where the bar is two rows anyway, the chip costs nothing and is drawn.
  assert.match(draw(state, { columns: 100 })[1], /  │  Fable 65%$/)
  assert.match(draw(state, {})[1], /  │  Fable 65%$/)
  for (const columns of [20, 30, 40, 50, 60, 79, 80, 100, 116, 120, 140]) {
    for (const line of draw(state, { columns })) assert.ok(displayWidth(line) <= columns, `${columns}: ${line}`)
  }

  // At the warning level it is a quota like the others: content comes before the single row.
  const hot = { ...idleState(), usage: scopedUsage(96) }
  assert.equal(draw(hot, { columns: 116 }).length, 2)
  assert.match(draw(hot, { columns: 116 })[1], /  │  Fable 96%!!$/)
  assert.match(draw({ ...idleState(), usage: scopedUsage(84) }, { columns: 116 })[1], /  │  Fable 84%!$/)
})

test('segment: with no weekly chip beside it the label says which window it is; at most two rows are drawn', () => {
  const state = { ...idleState(), usage: scopedUsage(65, 'Fable', [{ label: 'Second', percent: 40, resetsAt: null }, { label: 'Third', percent: 1, resetsAt: null }]) }
  assert.equal(draw(state, { columns: 140, show: { sevenDay: false } })[0].trimEnd().split('  │  ').slice(-2).join(' | '), '7d Fable 65% · 4h00m | 7d Second 40%')
  assert.doesNotMatch(draw(state, { columns: 200 })[0], /Third/)
})

test('segment: in the pills look it is a chip like the other quotas, all of it inside the BMP', () => {
  const look = { columns: 140, color: true, style: true, look: 'pills', theme: 'dark', truecolor: true }
  const [row] = draw({ ...idleState(), usage: scopedUsage(65) }, look)
  const neutral = '48;2;30;41;59'
  assert.ok(row.endsWith(`\x1b[38;2;148;163;184;${neutral}m\u00a0Fable \x1b[0m\x1b[1;38;2;230;237;243;${neutral}m65%\x1b[0m\x1b[38;2;148;163;184;${neutral}m\u00a0\x1b[0m`), JSON.stringify(row.slice(-160)))
  const [hot] = draw({ ...idleState(), usage: scopedUsage(96) }, look)
  assert.match(hot, /\x1b\[38;2;239;68;68;48;2;42;18;21m\u00a0?Fable /, 'critical: the red tint and the red label')
  for (const line of [row, hot]) assert.equal([...line].some(char => char.codePointAt(0) > 0xffff), false)
})
