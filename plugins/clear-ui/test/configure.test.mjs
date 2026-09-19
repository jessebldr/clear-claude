// Drives the real configure script against a throwaway CLAUDE_CONFIG_DIR.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = name => fileURLToPath(new URL(`../bin/${name}.mjs`, import.meta.url))
const DATA = ['plugins', 'data', 'clear-ui-clear-claude']

const makeHome = () => mkdtempSync(join(tmpdir(), 'clear-ui-configure-'))
const configOf = home => join(home, ...DATA, 'config.json')
const readConfig = home => JSON.parse(readFileSync(configOf(home), 'utf8'))
function run(home, name, args) {
  const result = spawnSync(process.execPath, [script(name), ...args], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CLAUDE_CONFIG_DIR: home },
    encoding: 'utf8',
    windowsHide: true,
  })
  return { code: result.status, out: result.stdout ?? '', err: result.stderr ?? '' }
}
const cleanup = home => rmSync(home, { recursive: true, force: true })

test('show writes nothing and describes the default', () => {
  const home = makeHome()
  const result = run(home, 'configure', ['show'])
  assert.equal(result.code, 0)
  assert.match(result.out, /preset\s+essential/)
  assert.match(result.out, /none; drawing the default/)
  assert.equal(existsSync(join(home, 'plugins')), false)
  cleanup(home)
})

test('preset, set and charset each write one valid file, and reset removes it', () => {
  const home = makeHome()
  assert.equal(run(home, 'configure', ['preset', 'full']).code, 0)
  assert.deepEqual(readConfig(home), { preset: 'full', version: 1 })

  assert.equal(run(home, 'configure', ['set', 'git', 'off']).code, 0)
  assert.equal(run(home, 'configure', ['set', 'cost', 'never']).code, 0)
  assert.equal(run(home, 'configure', ['charset', 'ascii']).code, 0)
  assert.deepEqual(readConfig(home), { preset: 'full', version: 1, show: { git: false, cost: 'never' }, charset: 'ascii' })

  // A preset is taken whole: the overrides written for the last one go, the charset stays.
  assert.equal(run(home, 'configure', ['preset', 'minimal']).code, 0)
  assert.deepEqual(readConfig(home), { preset: 'minimal', version: 1, charset: 'ascii' })

  assert.equal(run(home, 'configure', ['reset']).code, 0)
  assert.equal(existsSync(configOf(home)), false)
  cleanup(home)
})

test('bad arguments change nothing and say how to use it', () => {
  const home = makeHome()
  for (const args of [['preset', 'maximal'], ['set', 'weather', 'on'], ['set', 'git', 'maybe'], ['charset', 'klingon'], ['explode']]) {
    const result = run(home, 'configure', args)
    assert.equal(result.code, 1, args.join(' '))
    assert.match(result.out, /^usage:/m)
    assert.equal(result.err, '')
  }
  assert.equal(existsSync(configOf(home)), false)
  cleanup(home)
})

test('a config file that does not parse is refused, not repaired', () => {
  const home = makeHome()
  mkdirSync(join(home, ...DATA), { recursive: true })
  const broken = '{ "preset": "minimal", '
  writeFileSync(configOf(home), broken)
  const result = run(home, 'configure', ['preset', 'full'])
  assert.equal(result.code, 1)
  assert.match(result.out, /nothing was changed/)
  assert.equal(readFileSync(configOf(home), 'utf8'), broken)
  assert.match(run(home, 'doctor', []).out, /Config\s+WARN\s+config\.json is not valid JSON/)
  cleanup(home)
})

test('uninstall takes the config and the git cache with it', () => {
  const home = makeHome()
  writeFileSync(join(home, 'settings.json'), '{}\n')
  assert.equal(run(home, 'setup', ['apply']).code, 0)
  assert.equal(run(home, 'configure', ['preset', 'minimal']).code, 0)
  mkdirSync(join(home, ...DATA, 'cache'), { recursive: true })
  writeFileSync(join(home, ...DATA, 'cache', 'git-0000000000000000.json'), '{}')

  assert.equal(run(home, 'setup', ['uninstall']).code, 0)
  assert.equal(existsSync(configOf(home)), false)
  assert.equal(existsSync(join(home, ...DATA, 'cache')), false)
  cleanup(home)
})

test("uninstall removes Clear UI's files even when the status line is no longer Clear UI's", () => {
  const home = makeHome()
  writeFileSync(join(home, 'settings.json'), '{}\n')
  assert.equal(run(home, 'setup', ['apply']).code, 0)
  assert.equal(run(home, 'configure', ['preset', 'minimal']).code, 0)
  const foreign = '{\n  "statusLine": {\n    "type": "command",\n    "command": "npx -y ccstatusline@latest"\n  }\n}\n'
  writeFileSync(join(home, 'settings.json'), foreign)

  const result = run(home, 'setup', ['uninstall'])
  assert.equal(result.code, 0)
  assert.match(result.out, /verdict\s+not-ours/)
  assert.equal(readFileSync(join(home, 'settings.json'), 'utf8'), foreign, 'their status line is left alone')
  assert.equal(existsSync(configOf(home)), false)
  assert.equal(existsSync(join(home, ...DATA, 'runtime')), false)
  cleanup(home)
})

test('usage is off until asked for, on is one key, and off removes it again', () => {
  const home = makeHome()
  assert.match(run(home, 'configure', ['show']).out, /usage\s+off/)
  assert.equal(run(home, 'configure', ['preset', 'full']).code, 0)
  assert.equal(run(home, 'configure', ['usage', 'on']).code, 0)
  assert.deepEqual(readConfig(home), { preset: 'full', usage: true, version: 1 })
  assert.match(run(home, 'configure', ['show']).out, /usage\s+on/)
  // A preset is about what is drawn; it neither grants nor withdraws the opt-in.
  assert.equal(run(home, 'configure', ['preset', 'minimal']).code, 0)
  assert.equal(readConfig(home).usage, true)
  assert.equal(run(home, 'configure', ['usage', 'off']).code, 0)
  assert.deepEqual(readConfig(home), { preset: 'minimal', version: 1 })
  assert.equal(run(home, 'configure', ['usage', 'maybe']).code, 1)
  cleanup(home)
})
