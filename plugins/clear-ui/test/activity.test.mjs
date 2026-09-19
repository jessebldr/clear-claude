import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { activityOf, AGENTS_MAX_AGE_MS, backgroundCount, BACKGROUND_MAX_AGE_MS } from '../src/activity.mjs'
import { render } from '../src/render.mjs'
import { displayWidth } from '../src/sanitize.mjs'

const NOW = 50_000_000
const task = (status, startTime = NOW - 1000, type = 'local_agent') => ({ type, status, startTime })

test('activityOf counts what is running, and is null when nothing is', () => {
  const agents = { at: NOW - 3000, tasks: [task('running', NOW - 400_000), task('running', NOW - 90_000), task('completed')] }
  assert.deepEqual(activityOf(agents, null, NOW), { agents: 2, failed: 0, oldestStart: NOW - 400_000, background: 0 })
  assert.deepEqual(activityOf(null, { at: NOW - 60_000, running: 1 }, NOW), { agents: 0, failed: 0, oldestStart: null, background: 1 })
  assert.equal(activityOf({ at: NOW, tasks: [task('completed')] }, { at: NOW, running: 0 }, NOW), null)
  assert.equal(activityOf(null, null, NOW), null)
  assert.equal(activityOf({ at: NOW, tasks: [task('failed')] }, null, NOW).failed, 1)
})

test('activityOf stops believing a record nobody is refreshing', () => {
  const agents = at => ({ at, tasks: [task('running')] })
  assert.ok(activityOf(agents(NOW - AGENTS_MAX_AGE_MS), null, NOW))
  assert.equal(activityOf(agents(NOW - AGENTS_MAX_AGE_MS - 1), null, NOW), null, 'the panel is gone')
  assert.equal(activityOf(agents(NOW + 5000), null, NOW), null, 'a record from the future')
  assert.equal(activityOf(null, { at: NOW - BACKGROUND_MAX_AGE_MS - 1, running: 2 }, NOW), null)
  for (const record of [{}, { at: NOW }, { at: NOW, tasks: 'x' }, { at: NOW, tasks: [null, 7, {}] }, [], 'x']) {
    assert.equal(activityOf(record, record, NOW), null)
  }
  for (const running of [-1, 1.5, '2', null]) assert.equal(activityOf(null, { at: NOW, running }, NOW), null)
})

test('backgroundCount counts running commands and leaves sub-agents to the agent feed', () => {
  const tasks = [
    { id: 'a', type: 'shell', status: 'running', command: 'npm run dev' },
    { id: 'b', type: 'shell', status: 'completed' },
    { id: 'c', type: 'local_agent', status: 'running' },
    { id: 'd', status: 'running' },
    null,
    'x',
  ]
  assert.equal(backgroundCount(tasks), 2)
  for (const value of [undefined, null, {}, 'running', 3]) assert.equal(backgroundCount(value), 0)
})

const STATE = { model: 'Fable 5.1', project: 'demo', contextPercent: 31 }
const draw = (activity, options = {}) => render({ ...STATE, activity }, { columns: 120, now: NOW, ...options })

test('render: a third row, only while something runs, and counts only', () => {
  assert.equal(draw(null).length, 1)
  assert.equal(draw(undefined).length, 1)
  assert.deepEqual(draw({ agents: 2, failed: 0, oldestStart: NOW - 6 * 60_000 - 5000, background: 1 }).slice(1), ['2 agents \u00b7 6m  \u2502  1 background'])
  assert.deepEqual(draw({ agents: 1, failed: 0, oldestStart: NOW - 30_000, background: 0 }).slice(1), ['1 agent'], 'no elapsed under a minute')
  assert.deepEqual(draw({ agents: 0, failed: 0, oldestStart: null, background: 3 }).slice(1), ['3 background'])
  assert.deepEqual(draw({ agents: 3, failed: 1, oldestStart: NOW - 120_000, background: 1 }).slice(1), ['3 agents \u00b7 1 failed! \u00b7 2m  \u2502  1 background'])
  assert.deepEqual(draw({ agents: 0, failed: 2, oldestStart: null, background: 0 }).slice(1), ['2 failed!'])
  assert.equal(draw({ agents: 2, failed: 0, oldestStart: null, background: 1 }, { show: { activity: false } }).length, 1)
  assert.deepEqual(draw({ agents: 2, failed: 0, oldestStart: null, background: 1 }, { charset: 'ascii' }).slice(1), ['2 agents  |  1 background'])
})

test('render: the row gives up elapsed first, then the long word, and never the failure', () => {
  const activity = { agents: 12, failed: 1, oldestStart: NOW - 45 * 60_000, background: 2 }
  const rowAt = columns => draw(activity, { columns }).at(-1)
  assert.equal(rowAt(60), '12 agents \u00b7 1 failed! \u00b7 45m  \u2502  2 background')
  assert.equal(rowAt(44), '12 agents \u00b7 1 failed!  \u2502  2 background')
  assert.equal(rowAt(36), '12 agents \u00b7 1 failed!  \u2502  2 bg')
  assert.equal(rowAt(28), '12 agents \u00b7 1 failed!')
  for (let columns = 12; columns <= 120; columns++) {
    assert.ok(displayWidth(rowAt(columns)) <= columns - 4, `${columns} columns`)
  }
})

test('render: hostile counts draw nothing strange', () => {
  for (const activity of [{ agents: '2' }, { agents: -1 }, { agents: 1e9, background: NaN }, { agents: 2.5 }, [], 'x', 7]) {
    for (const line of draw(activity)) assert.match(line, /^[\x20-\x7e\u00b7\u2502\u2588\u2500]*$/)
  }
  // Clamped, so no number of any size can widen the row past two digits.
  assert.deepEqual(draw({ agents: 1e9, failed: 0, background: 0 }).slice(1), ['99 agents'])
})

// End to end: the real feed and the real Stop hook write, the real status line reads.
const bin = name => fileURLToPath(new URL(`../bin/${name}.mjs`, import.meta.url))
const DATA = ['plugins', 'data', 'clear-ui-clear-claude']

function world() {
  const home = mkdtempSync(join(tmpdir(), 'clear-ui-activity-'))
  const dataDir = join(home, ...DATA)
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CLAUDE_CONFIG_DIR: home, CLEAR_UI_DATA_DIR: dataDir, TERM: 'dumb', COLUMNS: '120' }
  const run = (name, payload) => {
    const result = spawnSync(process.execPath, [bin(name)], { input: JSON.stringify({ session_id: 'sess-1', ...payload }), env, encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0)
    assert.equal(result.stderr, '')
    return result.stdout
  }
  const bar = () => run('statusline', { model: { display_name: 'Fable 5.1' }, context_window: { used_percentage: 31 } }).trimEnd().split('\n')
  return { home, dataDir, run, bar, cleanup: () => rmSync(home, { recursive: true, force: true }) }
}

test('feed: prints nothing, so the agent panel keeps its own rows, and stores no model-written text', () => {
  const { dataDir, run, bar, cleanup } = world()
  const tasks = [
    { id: 't1', name: 'general-purpose', type: 'local_agent', status: 'running', description: 'SECRET plan', label: 'SECRET label', startTime: Date.now() - 130_000, cwd: 'C:/SECRET' },
    { id: 't2', name: 'Explore', type: 'local_agent', status: 'completed', description: 'x', startTime: Date.now() - 50_000 },
  ]
  assert.equal(run('agents', { columns: 100, tasks }), '')
  const stored = readFileSync(join(dataDir, 'state', 'sess-1.agents.json'), 'utf8')
  assert.doesNotMatch(stored, /SECRET|general-purpose|Explore|t1/)
  assert.deepEqual(bar().slice(1), ['1 agent \u00b7 2m'])

  assert.equal(run('agents', { tasks: [] }), '')
  assert.equal(bar().length, 1, 'the row goes when the panel empties')

  for (const payload of [{ tasks: 'x' }, { tasks: [null, 5, { status: 9 }] }, {}]) assert.equal(run('agents', payload), '')
  cleanup()
})

test('Stop hook: records a background count only where setup switched the row on', () => {
  const { dataDir, run, bar, cleanup } = world()
  const stop = { hook_event_name: 'Stop', background_tasks: [{ id: 'b1', type: 'shell', status: 'running', command: 'npm run dev --token SECRET' }] }
  assert.equal(run('observe', stop), '')
  assert.equal(existsSync(join(dataDir, 'state')), false, 'not switched on: nothing recorded')

  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, 'activity-on'), 'on\n')
  assert.equal(run('observe', stop), '')
  assert.deepEqual(bar().slice(1), ['1 background'])
  assert.doesNotMatch(readdirSync(join(dataDir, 'state')).map(name => readFileSync(join(dataDir, 'state', name), 'utf8')).join(''), /SECRET|npm/)

  assert.equal(run('observe', { hook_event_name: 'SessionStart' }), '')
  assert.equal(bar().length, 1, 'a new session starts from none')
  cleanup()
})
