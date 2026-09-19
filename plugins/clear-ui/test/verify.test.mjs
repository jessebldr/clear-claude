import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isVerification, RECORD_MAX_AGE_MS, splitCommand, verificationOf, verifyEntriesOf } from '../src/verify.mjs'
import { readRecord, safeSessionId, writeRecord } from '../src/session-state.mjs'
import { render } from '../src/render.mjs'

const ENTRIES = ['node --test', 'uv run pytest']

test('verifyEntriesOf keeps clean strings only, bounded and normalised', () => {
  assert.deepEqual(verifyEntriesOf({ verify: ['  npm   test ', '', 7, null, 'x'.repeat(201)] }), ['npm test'])
  assert.equal(verifyEntriesOf({ verify: Array.from({ length: 50 }, (_, i) => `cmd ${i}`) }).length, 32)
  for (const config of [null, undefined, [], {}, { verify: 'npm test' }, { verify: { 0: 'npm test' } }]) {
    assert.deepEqual(verifyEntriesOf(config), [])
  }
})

test('splitCommand follows operators and leaves quoted ones alone', () => {
  assert.deepEqual(splitCommand('cd a && node --test 2>&1 | tail -3; echo done'), [
    { stages: ['cd a'], then: '&&' },
    { stages: ['node --test 2>&1', 'tail -3'], then: ';' },
    { stages: ['echo done'], then: null },
  ])
  assert.deepEqual(splitCommand(`git commit -m "fix; node --test && more | x" || true`), [
    { stages: [`git commit -m "fix; node --test && more | x"`], then: '||' },
    { stages: ['true'], then: null },
  ])
  assert.deepEqual(splitCommand(`echo 'a && b'`), [{ stages: [`echo 'a && b'`], then: null }])
})

test('a listed command counts when the exit status of the call is its own', () => {
  for (const command of [
    'node --test',
    '  node   --test  ',
    'node --test test/render.test.mjs',
    'cd plugins/clear-ui && node --test',
    'node --test && echo ok',
    'uv run pytest -q 2>&1',
    'node --test # the whole suite',
    'node --test \\\n  test/render.test.mjs',
    'cd C:\\work\\clear-ui && node --test',
    'node --test --test-name-pattern "a && b"',
    'node --test;',
  ]) {
    assert.equal(isVerification(command, ENTRIES), true, command)
  }
})

test('a listed command does not count where its failure would be hidden, or where it is not run', () => {
  for (const command of [
    'node --test | tail -5',
    'node --test 2>&1 | grep fail',
    'node --test; echo done',
    'node --test || true',
    'node --test\necho done',
    'node --test &',
    // Reached through `||`, it ran only if something before it failed -- usually it did not run.
    'false || node --test',
    'git diff --quiet || node --test',
    // Each of these exits 0 with a failing suite, or without running it at all. An earlier
    // scanner let an apostrophe in a comment swallow the `exit 0` after it.
    "node --test # don't stop on failure\nexit 0",
    'node --test --prefix "C:\\proj\\" ; exit 0',
    "cat > ci.sh <<'EOF'\nnode --test &&\nEOF",
    'echo $(true && node --test 2>&1)',
    "trap 'exit 0' EXIT; node --test",
    'node --test `date`',
    'node --test "unclosed',
    'echo "node --test"',
    'git commit -m "ran node --test"',
    'git commit -m "x; node --test"',
    'node --testing',
    'xnode --test',
    'node',
    '',
  ]) {
    assert.equal(isVerification(command, ENTRIES), false, command)
  }
  assert.equal(isVerification('node --test', []), false)
  for (const command of [null, undefined, 7, {}]) assert.equal(isVerification(command, ENTRIES), false)
})

test('verificationOf reports what was observed, and nothing once it is stale', () => {
  const now = 10_000_000
  assert.deepEqual(verificationOf({ at: now - 5000, failed: false }, null, now), { status: 'verified', at: now - 5000 })
  assert.deepEqual(verificationOf({ at: now - 5000, failed: false }, { at: now - 9000 }, now), { status: 'verified', at: now - 5000 })
  assert.deepEqual(verificationOf({ at: now - 5000, failed: false }, { at: now - 1000 }, now), { status: 'edited', at: now - 5000 })
  assert.deepEqual(verificationOf({ at: now - 5000, failed: true }, { at: now - 1000 }, now), { status: 'failed', at: now - 5000 })
  // The record is written when the command finishes; an edit made while it ran may be unseen.
  assert.equal(verificationOf({ at: now - 5000, failed: false, durationMs: 60_000 }, { at: now - 30_000 }, now).status, 'edited')
  assert.equal(verificationOf({ at: now - 5000, failed: false, durationMs: 60_000 }, { at: now - 90_000 }, now).status, 'verified')
  assert.equal(verificationOf(null, { at: now - 1000 }, now), null, 'an edit alone says nothing')
  assert.equal(verificationOf({ at: now - RECORD_MAX_AGE_MS - 1, failed: false }, null, now), null)
  assert.equal(verificationOf({ at: now + 60_000, failed: false }, null, now), null, 'a record from the future is not trusted')
  for (const record of [{}, { at: 'now' }, { at: null }, [], 'x']) assert.equal(verificationOf(record, null, now), null)
})

test('session ids become safe file names or nothing', () => {
  assert.equal(safeSessionId('3f2a-BC_9'), '3f2a-BC_9')
  assert.equal(safeSessionId('../../etc/passwd'), 'etcpasswd')
  assert.equal(safeSessionId('a'.repeat(200)).length, 64)
  for (const id of ['', '../..', null, undefined, 7]) assert.equal(safeSessionId(id), null)
})

test('records round-trip, and a missing, oversized or malformed one reads as null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clear-ui-state-'))
  assert.equal(writeRecord(dir, 'abc', 'verify', { at: 5, failed: false }), true)
  assert.deepEqual(readRecord(dir, 'abc', 'verify'), { at: 5, failed: false })
  assert.equal(readRecord(dir, 'abc', 'edit'), null)
  assert.equal(readRecord(dir, '../abc', 'verify')?.at, 5, 'the id is sanitised the same way on both sides')
  assert.equal(writeRecord(dir, '', 'verify', {}), false)

  writeFileSync(join(dir, 'abc.edit.json'), '[1, 2')
  assert.equal(readRecord(dir, 'abc', 'edit'), null)
  writeFileSync(join(dir, 'abc.edit.json'), JSON.stringify({ at: 1, padding: 'x'.repeat(20000) }))
  assert.equal(readRecord(dir, 'abc', 'edit'), null)
  assert.equal(readdirSync(dir).filter(name => name.endsWith('.tmp')).length, 0)
  rmSync(dir, { recursive: true, force: true })
})

const STATE = { model: 'Fable 5.1', project: 'demo', git: { branch: 'main', dirty: false, ahead: 0, behind: 0 }, contextPercent: 31 }
// 2026-09-19 10:42 UTC
const AT = Date.UTC(2026, 8, 19, 10, 42)
const draw = (verification, options = {}) => render({ ...STATE, verification }, { columns: 120, timeZone: 'UTC', ...options }).join('\n')

test('render: words, not marks, beside the branch', () => {
  assert.match(draw({ status: 'verified', at: AT }), /main {2}│ {2}verified 10:42 {3,}ctx/)
  assert.match(draw({ status: 'failed', at: AT }), /main {2}│ {2}verify failed 10:42 {3,}ctx/)
  // No time: the only time on hand is the verification's, which the edit has made stale.
  assert.match(draw({ status: 'edited', at: AT }), /main {2}│ {2}edited since {3,}ctx/)
  assert.match(draw({ status: 'verified', at: AT }, { timeZone: 'Asia/Ho_Chi_Minh' }), /verified 17:42/)
  assert.match(draw({ status: 'edited', at: AT }, { color: true }), /\x1b\[33medited since\x1b\[0m/)
})

test('render: nothing is drawn without a record, for an unknown status, or when switched off', () => {
  const bare = draw(null)
  assert.equal(draw(undefined), bare)
  assert.equal(draw({ status: 'pending', at: AT }), bare)
  assert.equal(draw({ status: '__proto__', at: AT }), bare)
  assert.equal(draw({ status: 'verified', at: AT }, { show: { verification: false } }), bare)
})

// End to end: the real hook handler writes, the real status line reads.
const observe = fileURLToPath(new URL('../bin/observe.mjs', import.meta.url))
const statusline = fileURLToPath(new URL('../bin/statusline.mjs', import.meta.url))
const DATA = ['plugins', 'data', 'clear-ui-clear-claude']

function world({ optIn }) {
  const home = mkdtempSync(join(tmpdir(), 'clear-ui-observe-home-'))
  const project = mkdtempSync(join(tmpdir(), 'clear-ui-observe-project-'))
  if (optIn) {
    mkdirSync(join(project, '.claude'))
    writeFileSync(join(project, '.claude', 'clear-ui.json'), JSON.stringify({ verify: ENTRIES }))
  }
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CLAUDE_CONFIG_DIR: home, CLAUDE_PROJECT_DIR: project, TZ: 'UTC' }
  const hook = payload => {
    const result = spawnSync(process.execPath, [observe], {
      input: JSON.stringify({ session_id: 'sess-1', cwd: project, ...payload }),
      env,
      encoding: 'utf8',
      windowsHide: true,
    })
    assert.equal(result.status, 0)
    assert.equal(result.stdout, '', 'a hook that prints puts text in the model context')
    assert.equal(result.stderr, '')
  }
  const bar = () =>
    spawnSync(process.execPath, [statusline], {
      input: JSON.stringify({ session_id: 'sess-1', model: { display_name: 'Fable 5.1' }, context_window: { used_percentage: 31 } }),
      env: { ...env, COLUMNS: '120', TERM: 'dumb', CLEAR_UI_DATA_DIR: join(home, ...DATA) },
      encoding: 'utf8',
      windowsHide: true,
    }).stdout
  const stateDir = join(home, ...DATA, 'state')
  const cleanup = () => [home, project].forEach(dir => rmSync(dir, { recursive: true, force: true }))
  return { hook, bar, stateDir, cleanup }
}
const bash = (command, extra = {}) => ({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, duration_ms: 2826.4, ...extra })

test('observe: a project that has not opted in records nothing, edits included', () => {
  const { hook, stateDir, cleanup } = world({ optIn: false })
  hook(bash('node --test'))
  hook({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: 'a.js' } })
  assert.equal(existsSync(stateDir), false)
  cleanup()
})

test('observe: verified, then edited since, then failed, as the status line sees them', () => {
  const { hook, bar, stateDir, cleanup } = world({ optIn: true })
  assert.doesNotMatch(bar(), /verif|edited/)

  hook(bash('ls -la'))
  hook(bash('node --test | tail -3'))
  assert.equal(existsSync(stateDir), false, 'neither is a verification whose result can be known')

  hook({ ...bash('node --test'), tool_input: { command: 'node --test', run_in_background: true } })
  assert.equal(existsSync(stateDir), false, 'sent to the background, it has not finished, let alone passed')

  hook(bash('cd plugins/clear-ui && node --test'))
  assert.match(bar(), /verified \d\d:\d\d/)

  hook({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'a.js', content: 'secret' } })
  assert.match(bar(), /edited since/)

  hook(bash('node --test', { hook_event_name: 'PostToolUseFailure', error: 'Exit code 1\nnot ok 3', tool_response: undefined }))
  assert.match(bar(), /verify failed \d\d:\d\d/)

  hook(bash('node --test', { hook_event_name: 'PostToolUseFailure', error: 'interrupted', is_interrupt: true }))
  assert.match(bar(), /verify failed/, 'an interrupted run is not a result')

  // The command and its output never reach the disk; a hash, a flag and two numbers do.
  const stored = readdirSync(stateDir).map(name => readFileSync(join(stateDir, name), 'utf8')).join('\n')
  assert.doesNotMatch(stored, /node|--test|secret|a\.js|not ok/)
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(stateDir, 'sess-1.verify.json'), 'utf8'))).sort(), ['at', 'durationMs', 'failed', 'hash'])
  cleanup()
})

test('observe: hostile and malformed hook input is silent and writes nothing', () => {
  const { hook, stateDir, cleanup } = world({ optIn: true })
  hook(bash('node --test', { session_id: '../../../evil' }))
  assert.deepEqual(readdirSync(stateDir), ['evil.verify.json'], 'a hostile session id cannot leave the state directory')
  hook({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: null })
  hook({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 42 } })
  hook({ hook_event_name: 'Stop' })
  hook(bash('node --test', { session_id: null }))
  assert.deepEqual(readdirSync(stateDir), ['evil.verify.json'])
  cleanup()
})
