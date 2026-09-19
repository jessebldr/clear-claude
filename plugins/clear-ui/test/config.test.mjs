import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, PRESETS, resolveConfig } from '../src/config.mjs'
import { render } from '../src/render.mjs'

test('no config at all is the essential preset, with nothing to report', () => {
  for (const raw of [undefined, null]) {
    assert.deepEqual(resolveConfig(raw), { preset: 'essential', charset: null, look: 'pills', caps: 'square', show: PRESETS.essential, problem: null })
  }
})

test('a named preset is taken whole', () => {
  assert.deepEqual(resolveConfig({ version: 1, preset: 'minimal' }).show, PRESETS.minimal)
  assert.deepEqual(resolveConfig({ preset: 'full' }).show, PRESETS.full)
  assert.equal(resolveConfig({ preset: 'full', charset: 'ascii' }).charset, 'ascii')
})

test('show overrides a preset one key at a time; custom starts from essential', () => {
  const custom = resolveConfig({ preset: 'custom', show: { effort: false, cost: 'never', lines: true } })
  assert.equal(custom.preset, 'custom')
  assert.deepEqual(custom.show, { ...PRESETS.essential, effort: false, cost: 'never', lines: true })
  assert.equal(resolveConfig({ preset: 'minimal', show: { model: true } }).show.model, true)
  assert.equal(resolveConfig({ show: { cost: true } }).show.cost, 'always')
  assert.equal(resolveConfig({ show: { cost: false } }).show.cost, 'never')
})

test('unknown keys and values of the wrong type are ignored, never fatal', () => {
  const resolved = resolveConfig({
    version: 1,
    theme: 'neon',
    charset: 'klingon',
    show: { model: 'yes', effort: 0, cost: 'sometimes', widgets: ['x'], __proto__: { git: false } },
  })
  assert.deepEqual(resolved, { preset: 'essential', charset: null, look: 'pills', caps: 'square', show: PRESETS.essential, problem: null })
})

test('what cannot be honoured is reported, and the default is drawn', () => {
  for (const raw of [[], 'essential', 7, true]) {
    assert.match(resolveConfig(raw).problem, /not a JSON object/)
    assert.deepEqual(resolveConfig(raw).show, PRESETS.essential)
  }
  assert.match(resolveConfig({ version: 2, preset: 'minimal' }).problem, /version 2/)
  assert.deepEqual(resolveConfig({ version: 2, preset: 'minimal' }).show, PRESETS.essential)
  assert.match(resolveConfig({ preset: 'maximal' }).problem, /unknown preset "maximal"/)
})

test('a preset can never be changed by resolving a config', () => {
  resolveConfig({ preset: 'minimal', show: { model: true } }).show.git = true
  assert.equal(PRESETS.minimal.model, false)
  assert.equal(PRESETS.minimal.git, false)
})

test('loadConfig: missing, malformed and byte-order-marked files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clear-ui-config-'))
  const file = join(dir, 'config.json')
  assert.equal(loadConfig(undefined).problem, null)
  assert.equal(loadConfig(file).problem, null)

  writeFileSync(file, '{ "preset": "minimal", ')
  assert.match(loadConfig(file).problem, /not valid JSON/)
  assert.deepEqual(loadConfig(file).show, PRESETS.essential)

  writeFileSync(file, `${String.fromCodePoint(0xfeff)}{ "preset": "minimal" }`)
  assert.deepEqual(loadConfig(file), { preset: 'minimal', charset: null, look: 'pills', caps: 'square', show: PRESETS.minimal, problem: null })
  rmSync(dir, { recursive: true, force: true })
})

const STATE = {
  model: 'Sonnet 5',
  effort: 'high',
  project: 'api-server',
  git: { branch: 'main', dirty: true, ahead: 0, behind: 0 },
  contextPercent: 31,
  fiveHour: { percent: 9, resetsAt: null },
  sevenDay: { percent: 51, resetsAt: null },
  costUsd: 1.5,
  linesAdded: 120,
  linesRemoved: 14,
  outputStyle: 'Clear Partner',
}
const draw = (show, columns = 160) => render(STATE, { columns, now: 0, show })

test('render: essential is what an absent `show` draws', () => {
  assert.deepEqual(draw(PRESETS.essential), draw(undefined))
  assert.deepEqual(draw({}), draw(undefined))
})

test('render: minimal is the capacity row alone', () => {
  assert.deepEqual(draw(PRESETS.minimal), ['ctx 31% ███───────  │  5h 9%  │  7d 51%'])
})

test('render: full adds the output style, the session cost and the lines changed', () => {
  const [bar] = draw(PRESETS.full)
  assert.match(bar, /^Sonnet 5 {2}high {2}│ {2}api-server on main  ● {2}│ {2}Clear Partner {3,}ctx 31%/)
  assert.match(bar, /7d 51% {2}│ {2}\$1\.50 {2}│ {2}\+120 -14$/)
  // The extras are the first things to go when the row gets tight, and the quotas never are.
  const tight = draw(PRESETS.full, 60).join('\n')
  assert.match(tight, /5h 9%/)
  assert.doesNotMatch(tight, /\+120/)
})

test('render: the default output style is not worth a segment', () => {
  assert.doesNotMatch(render({ ...STATE, outputStyle: 'default' }, { columns: 160, show: PRESETS.full }).join('\n'), /default/)
})

test('render: each segment can be switched off on its own', () => {
  assert.doesNotMatch(draw({ git: false }).join('\n'), /main/)
  assert.doesNotMatch(draw({ context: false }).join('\n'), /ctx/)
  assert.doesNotMatch(draw({ fiveHour: false, sevenDay: false, cost: 'never' }).join('\n'), /5h|7d|\$/)
  // With the quotas hidden, `auto` lets the cost stand in for them, as it does for an API key.
  assert.match(draw({ fiveHour: false, sevenDay: false }).join('\n'), /\$1\.50/)
  assert.deepEqual(draw({ ...PRESETS.minimal, context: false, fiveHour: false, sevenDay: false, cost: 'never' }), [])
})
