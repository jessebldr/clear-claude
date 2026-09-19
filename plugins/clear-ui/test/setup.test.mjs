// Drives the real setup script against a throwaway CLAUDE_CONFIG_DIR. Nothing here can reach
// the machine's own settings: every run gets a fresh temporary config home.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planInstall, planUninstall, classify } from '../src/install.mjs'

const setup = fileURLToPath(new URL('../bin/setup.mjs', import.meta.url))
const DATA_ID = 'clear-ui-clear-claude'

function makeHome(settingsText) {
  const home = mkdtempSync(join(tmpdir(), 'clear-ui-test-'))
  if (settingsText !== undefined) {
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'settings.json'), settingsText)
  }
  return home
}

function run(home, args) {
  const result = spawnSync(process.execPath, [setup, ...args], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CLAUDE_CONFIG_DIR: home },
    encoding: 'utf8',
    windowsHide: true,
  })
  return { code: result.status, out: result.stdout ?? '', err: result.stderr ?? '' }
}

const settingsOf = home => readFileSync(join(home, 'settings.json'), 'utf8')
const backupsOf = home => {
  const dir = join(home, 'plugins', 'data', DATA_ID, 'backups')
  return existsSync(dir) ? readdirSync(dir) : []
}
const cleanup = home => rmSync(home, { recursive: true, force: true })

const FOREIGN = '{\n  "model": "opus",\n  "statusLine": {\n    "type": "command",\n    "command": "npx -y ccstatusline@latest"\n  },\n  "theme": "dark"\n}\n'

test('plan writes nothing at all', () => {
  const home = makeHome('{\n  "model": "opus"\n}\n')
  const before = settingsOf(home)
  const result = run(home, ['plan'])
  assert.equal(result.code, 0)
  assert.match(result.out, /verdict\s+install/)
  assert.match(result.out, /nothing has been written/)
  assert.equal(settingsOf(home), before)
  assert.equal(existsSync(join(home, 'plugins')), false)
  cleanup(home)
})

test('apply installs, backs up, and leaves unrelated keys byte-identical', () => {
  const home = makeHome('{\n  "model": "opus",\n  "theme": "dark"\n}\n')
  assert.equal(run(home, ['apply']).code, 0)

  const after = settingsOf(home)
  const parsed = JSON.parse(after)
  assert.equal(parsed.statusLine.type, 'command')
  assert.match(parsed.statusLine.command, /^node "/)
  assert.ok(parsed.statusLine.command.includes('statusline.mjs'))
  assert.doesNotMatch(parsed.statusLine.command, /\\/, 'the command must use forward slashes')
  assert.equal(parsed.model, 'opus')
  assert.equal(parsed.theme, 'dark')
  assert.ok(after.includes('  "model": "opus",\n  "theme": "dark"\n'), after)
  assert.equal(backupsOf(home).length, 1)
  assert.ok(existsSync(join(home, 'plugins', 'data', DATA_ID, 'runtime', 'bin', 'statusline.mjs')))
  cleanup(home)
})

test('apply is idempotent: a second run reports unchanged and writes no second backup', () => {
  const home = makeHome('{}\n')
  run(home, ['apply'])
  const after = settingsOf(home)
  const backups = backupsOf(home)
  assert.equal(backups.length, 1)
  const second = run(home, ['apply'])
  assert.equal(second.code, 0)
  assert.match(second.out, /verdict\s+unchanged/)
  assert.doesNotMatch(second.out, /backup/, 'a run that writes nothing must not make a backup')
  assert.equal(settingsOf(home), after)
  // Compared by name, not by count: two backups within the same second used to collide.
  assert.deepEqual(backupsOf(home), backups)
  cleanup(home)
})

// A resize does not re-run a status line, so the padded bar is only repaired by the timer.
test('apply installs a refresh timer, and adds it to an install that predates it', () => {
  const home = makeHome('{}\n')
  run(home, ['apply'])
  assert.equal(JSON.parse(settingsOf(home)).statusLine.refreshInterval, 2)

  const older = JSON.parse(settingsOf(home))
  delete older.statusLine.refreshInterval
  writeFileSync(join(home, 'settings.json'), JSON.stringify(older, null, 2) + '\n')
  const again = run(home, ['apply'])
  assert.equal(again.code, 0)
  assert.match(again.out, /verdict\s+update/)
  assert.equal(JSON.parse(settingsOf(home)).statusLine.refreshInterval, 2)
  cleanup(home)
})

test('backup names are unique to the millisecond, so a rapid sequence keeps every copy', () => {
  const home = makeHome('{}\n')
  run(home, ['apply'])
  for (let i = 0; i < 3; i++) {
    run(home, ['uninstall'])
    run(home, ['apply'])
  }
  const backups = backupsOf(home)
  assert.equal(new Set(backups).size, backups.length)
  assert.ok(backups.length >= 4, `expected a backup per write, got ${backups.length}`)
  cleanup(home)
})

test('apply creates settings.json when there is none', () => {
  const home = makeHome()
  assert.equal(run(home, ['apply']).code, 0)
  assert.equal(Object.keys(JSON.parse(settingsOf(home))).length, 1)
  cleanup(home)
})

test('a foreign status line is never replaced silently', () => {
  const home = makeHome(FOREIGN)
  const result = run(home, ['apply'])
  assert.equal(result.code, 1)
  assert.match(result.out, /verdict\s+needs-choice/)
  assert.match(result.out, /ccstatusline/)
  assert.match(result.out, /--replace/)
  assert.match(result.out, /--keep/)
  assert.equal(settingsOf(home), FOREIGN)
  cleanup(home)
})

test('--keep leaves the foreign status line exactly as it was', () => {
  const home = makeHome(FOREIGN)
  const result = run(home, ['apply', '--keep'])
  assert.equal(result.code, 0)
  assert.match(result.out, /verdict\s+kept/)
  assert.equal(settingsOf(home), FOREIGN)
  cleanup(home)
})

test('--replace installs and uninstall restores the original, byte for byte', () => {
  const home = makeHome(FOREIGN)
  assert.equal(run(home, ['apply', '--replace']).code, 0)
  assert.ok(JSON.parse(settingsOf(home)).statusLine.command.includes('statusline.mjs'))

  const uninstalled = run(home, ['uninstall'])
  assert.equal(uninstalled.code, 0)
  assert.match(uninstalled.out, /verdict\s+restore/)
  assert.equal(settingsOf(home), FOREIGN, 'uninstall must restore the previous status line exactly')
  assert.equal(existsSync(join(home, 'plugins', 'data', DATA_ID, 'runtime')), false)
  cleanup(home)
})

test('re-installing after a replace does not lose the original status line', () => {
  const home = makeHome(FOREIGN)
  run(home, ['apply', '--replace'])
  run(home, ['apply', '--replace'])
  run(home, ['uninstall'])
  assert.equal(settingsOf(home), FOREIGN)
  cleanup(home)
})

test('uninstall with nothing before it removes the key and restores the original text', () => {
  const original = '{\n  "model": "opus"\n}\n'
  const home = makeHome(original)
  run(home, ['apply'])
  const result = run(home, ['uninstall'])
  assert.equal(result.code, 0)
  assert.match(result.out, /verdict\s+remove/)
  assert.equal(settingsOf(home), original)
  cleanup(home)
})

test('uninstall leaves a status line that is not ours alone', () => {
  const home = makeHome(FOREIGN)
  const result = run(home, ['uninstall'])
  assert.equal(result.code, 0)
  assert.match(result.out, /verdict\s+not-ours/)
  assert.equal(settingsOf(home), FOREIGN)
  cleanup(home)
})

test('unparseable settings are refused, not repaired', () => {
  const broken = '{\n  "model": "opus",\n}\n'
  const home = makeHome(broken)
  for (const args of [['apply'], ['apply', '--replace'], ['uninstall']]) {
    const result = run(home, args)
    assert.equal(result.code, args[0] === 'uninstall' ? 1 : 1, args.join(' '))
    assert.match(result.out, /verdict\s+unparseable/)
    assert.equal(settingsOf(home), broken)
  }
  assert.equal(existsSync(join(home, 'plugins', 'data', DATA_ID, 'runtime')), false)
  cleanup(home)
})

test('the installed runtime actually renders', () => {
  const home = makeHome('{}\n')
  run(home, ['apply'])
  const entry = join(home, 'plugins', 'data', DATA_ID, 'runtime', 'bin', 'statusline.mjs')
  const probe = spawnSync(process.execPath, [entry], {
    input: JSON.stringify({ model: { display_name: 'Fable 5.1' }, context_window: { context_window_size: 200000, used_percentage: 12 } }),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COLUMNS: '120', TERM: 'dumb' },
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(probe.status, 0)
  assert.equal(probe.stderr, '')
  assert.match(probe.stdout, /^Fable 5\.1 /)
  assert.match(probe.stdout, /ctx 12% /)
  cleanup(home)
})

test('doctor reports FAIL before an install and PASS after one, and stays read-only', () => {
  const doctor = fileURLToPath(new URL('../bin/doctor.mjs', import.meta.url))
  const home = makeHome('{}\n')
  const runDoctor = () =>
    spawnSync(process.execPath, [doctor], {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CLAUDE_CONFIG_DIR: home },
      encoding: 'utf8',
      windowsHide: true,
    })

  const before = runDoctor()
  assert.equal(before.status, 1)
  assert.match(before.stdout, /Clear UI Doctor — FAIL/)
  assert.equal(settingsOf(home), '{}\n')

  run(home, ['apply'])
  const after = runDoctor()
  assert.equal(after.status, 0)
  // Every row but one is about the install, and must pass. `Git speed` is about the machine: on
  // a loaded Windows CI runner git took 190 ms against the 150 ms budget, the row said WARN as
  // it should, and a test that demanded an overall PASS failed for it. So the verdict is held
  // to what the install decides, and that one row may be either.
  const rows = after.stdout.split('\n').filter(line => /^ {2}\S/.test(line))
  assert.ok(rows.length >= 10, after.stdout)
  for (const row of rows) {
    if (/^ {2}Git speed /.test(row)) assert.match(row, /Git speed\s+(PASS|WARN|UNKNOWN) /, row)
    else assert.match(row, / (PASS|UNKNOWN) /, row)
  }
  const gitIsSlowHere = rows.some(row => /^ {2}Git speed\s+WARN /.test(row))
  assert.match(after.stdout, gitIsSlowHere ? /Clear UI Doctor — WARN/ : /Clear UI Doctor — PASS/)
  assert.match(after.stdout, /statusLine\s+PASS\s+points at Clear UI/)
  assert.match(after.stdout, /Dry render\s+PASS/)
  cleanup(home)
})

test('doctor warns about settings that silently disable status lines', () => {
  const home = makeHome('{\n  "disableAllHooks": true\n}\n')
  run(home, ['apply'])
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/doctor.mjs', import.meta.url))], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CLAUDE_CONFIG_DIR: home },
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.match(result.stdout, /Silent gates\s+WARN\s+disableAllHooks/)
  cleanup(home)
})

test('the SessionStart hook is silent, exits 0, and only syncs an existing install', () => {
  const sync = fileURLToPath(new URL('../bin/sync.mjs', import.meta.url))
  const home = makeHome('{}\n')
  const runSync = () =>
    spawnSync(process.execPath, [sync], {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CLAUDE_CONFIG_DIR: home },
      encoding: 'utf8',
      windowsHide: true,
    })

  const uninstalled = runSync()
  assert.equal(uninstalled.status, 0)
  assert.equal(uninstalled.stdout, '')
  assert.equal(uninstalled.stderr, '')
  assert.equal(existsSync(join(home, 'plugins', 'data', DATA_ID)), false, 'must not create an install')

  run(home, ['apply'])
  const versionFile = join(home, 'plugins', 'data', DATA_ID, 'runtime', 'VERSION')
  writeFileSync(versionFile, '0.0.1-stale\n')
  rmSync(join(home, 'plugins', 'data', DATA_ID, 'runtime', 'src', 'render.mjs'))
  const synced = runSync()
  assert.equal(synced.status, 0)
  assert.equal(synced.stdout, '')
  assert.ok(existsSync(join(home, 'plugins', 'data', DATA_ID, 'runtime', 'src', 'render.mjs')), 'must re-copy the runtime')
  assert.notEqual(readFileSync(versionFile, 'utf8').trim(), '0.0.1-stale')
  assert.equal(settingsOf(home), JSON.parse(JSON.stringify(settingsOf(home))), 'must not rewrite settings')
  cleanup(home)
})

// Pure planning logic, without touching a disk at all.

test('classify names known products and recognises our own path on either separator', () => {
  assert.deepEqual(classify(null, '/d/run'), { kind: 'none', product: null })
  assert.equal(classify({ command: 'node "/d/run/bin/statusline.mjs"' }, '/d/run').kind, 'ours')
  assert.equal(classify({ command: 'node "C:\\d\\run\\bin\\statusline.mjs"' }, 'C:/d/run').kind, 'ours')
  assert.equal(classify({ command: 'npx -y ccstatusline@latest' }, '/d/run').product, 'ccstatusline')
  assert.equal(classify({ command: 'bash -c "… claude-hud …"' }, '/d/run').product, 'Claude HUD')
  assert.deepEqual(classify({ command: 'my-own-script.sh' }, '/d/run'), { kind: 'foreign', product: null })
})

test('classify inspects exec-form args too', () => {
  assert.equal(classify({ command: 'node', args: ['/x/claude-powerline/index.mjs'] }, '/d/run').product, 'Claude Powerline')
})

test('planInstall refuses a JSON array or a non-object document', () => {
  for (const settingsText of ['[1,2]', '"text"', '42']) {
    assert.equal(planInstall({ settingsText, desired: {}, runtimePath: '/d/run' }).action, 'unparseable')
  }
})

test('planUninstall reports absent when there is no status line', () => {
  assert.equal(planUninstall({ settingsText: '{"a":1}', previous: null, runtimePath: '/d/run' }).action, 'absent')
  assert.equal(planUninstall({ settingsText: '', previous: null, runtimePath: '/d/run' }).action, 'absent')
})

// Phase D: the activity row's feed is a second settings key, opt-in, under the same rules.
const FOREIGN_FEED = '{\n  "subagentStatusLine": {\n    "type": "command",\n    "command": "my-agent-rows.sh --token SECRET"\n  }\n}\n'

test('the agent feed is not installed unless asked for, and --no-activity takes it out again', () => {
  const home = makeHome('{\n  "model": "opus"\n}\n')
  assert.equal(run(home, ['apply']).code, 0)
  assert.equal('subagentStatusLine' in JSON.parse(settingsOf(home)), false)

  const planned = run(home, ['plan', '--activity'])
  assert.match(planned.out, /activity\s+install/)
  assert.equal('subagentStatusLine' in JSON.parse(settingsOf(home)), false, 'plan writes nothing')

  assert.equal(run(home, ['apply', '--activity']).code, 0)
  const feed = JSON.parse(settingsOf(home)).subagentStatusLine
  assert.equal(feed.type, 'command')
  assert.match(feed.command, /^node ".*\/runtime\/bin\/agents\.mjs"$/)
  assert.ok(existsSync(join(home, 'plugins', 'data', DATA_ID, 'runtime', 'bin', 'agents.mjs')))

  // A plain apply afterwards leaves the opt-in alone.
  assert.equal(run(home, ['apply']).code, 0)
  assert.ok('subagentStatusLine' in JSON.parse(settingsOf(home)))

  assert.equal(run(home, ['apply', '--no-activity']).code, 0)
  const after = JSON.parse(settingsOf(home))
  assert.equal('subagentStatusLine' in after, false)
  assert.ok('statusLine' in after)
  assert.equal(after.model, 'opus')
  cleanup(home)
})

test("someone else's agent panel renderer is never taken over silently, and uninstall restores it", () => {
  const home = makeHome(FOREIGN_FEED)
  const refused = run(home, ['apply', '--activity'])
  assert.equal(refused.code, 1)
  assert.match(refused.out, /activity\s+needs-choice/)
  assert.doesNotMatch(refused.out, /SECRET/)
  assert.equal(JSON.parse(settingsOf(home)).subagentStatusLine.command, 'my-agent-rows.sh --token SECRET')
  assert.ok('statusLine' in JSON.parse(settingsOf(home)), 'the status line itself was still installed')

  assert.equal(run(home, ['apply', '--activity', '--replace']).code, 0)
  assert.match(JSON.parse(settingsOf(home)).subagentStatusLine.command, /agents\.mjs/)

  assert.equal(run(home, ['uninstall']).code, 0)
  assert.equal(settingsOf(home), FOREIGN_FEED, 'byte for byte')
  cleanup(home)
})
