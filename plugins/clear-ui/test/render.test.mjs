import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { stateFromStatusline } from '../src/state.mjs'
import { render, THRESHOLDS } from '../src/render.mjs'
import { displayWidth } from '../src/sanitize.mjs'

// Saturday 2026-09-19 04:10 UTC. Fixture reset times are written relative to this moment.
const NOW = Date.UTC(2026, 8, 19, 4, 10)
const FIXED = { now: NOW, timeZone: 'UTC' }

const VARIANTS = [
  ['wide (120 columns)', { columns: 120 }],
  ['medium (60 columns)', { columns: 60 }],
  ['narrow (40 columns)', { columns: 40 }],
  ['unknown width', {}],
  ['wide, ascii', { columns: 120, charset: 'ascii' }],
  ['wide, color', { columns: 120, color: true }],
]

const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url))
const goldenDir = fileURLToPath(new URL('./golden/', import.meta.url))
const fixtureNames = readdirSync(fixturesDir).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)).sort()
const loadFixture = name => JSON.parse(readFileSync(`${fixturesDir}${name}.json`, 'utf8'))

// ESC is written as ␛ so a golden file is readable and can never restyle a terminal.
const visible = line => line.replaceAll('\x1b', '␛')
const snapshotOf = input =>
  VARIANTS.map(([label, options]) => {
    const lines = render(stateFromStatusline(input), { ...FIXED, ...options })
    return [`== ${label}`, ...lines.map(visible)].join('\n')
  }).join('\n\n') + '\n'

for (const name of fixtureNames) {
  test(`golden: ${name}`, () => {
    const actual = snapshotOf(loadFixture(name))
    const goldenPath = `${goldenDir}${name}.txt`
    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(goldenPath, actual)
    const expected = readFileSync(goldenPath, 'utf8').replaceAll('\r\n', '\n')
    assert.equal(actual, expected)
  })
}

test('no output ever contains a control character other than the SGR codes render adds', () => {
  for (const name of fixtureNames) {
    for (const [, options] of VARIANTS) {
      for (const line of render(stateFromStatusline(loadFixture(name)), { ...FIXED, ...options })) {
        // The only escapes render may emit are the SGR codes it sets and the reset it pairs
        // them with: bold, dim, the hues, and bold with a hue.
        const withoutSgr = line.replace(/\x1b\[(?:0|1|2|31|32|33|1;31|1;33)m/g, '')
        assert.doesNotMatch(withoutSgr, /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/, `${name}: ${JSON.stringify(line)}`)
      }
    }
  }
})

test('every line fits the width it was given', () => {
  for (const name of fixtureNames) {
    for (const columns of [20, 30, 40, 50, 60, 79, 80, 120]) {
      for (const line of render(stateFromStatusline(loadFixture(name)), { ...FIXED, columns })) {
        assert.ok(displayWidth(line) <= columns, `${name} at ${columns}: ${line}`)
      }
    }
  }
})

test('render is deterministic and does not mutate its input', () => {
  const state = stateFromStatusline(loadFixture('warning'))
  const frozen = JSON.stringify(state)
  const first = render(state, { ...FIXED, columns: 120, color: true })
  assert.deepEqual(render(state, { ...FIXED, columns: 120, color: true }), first)
  assert.equal(JSON.stringify(state), frozen)
})

test('payloads that are not a statusline draw nothing', () => {
  for (const input of [null, undefined, 42, 'text', [], {}, { cwd: '/x' }, { model: 'Fable' }]) {
    assert.deepEqual(render(stateFromStatusline(input), FIXED), [], JSON.stringify(input))
  }
})

test('warnings are text first: the marker is present with colour off', () => {
  const capacity = render(stateFromStatusline(loadFixture('warning')), { ...FIXED, columns: 120 }).join('  ')
  assert.match(capacity, /84%!(?!!)/)
  assert.match(capacity, /96%!!/)
})

test('the marker follows the number that is displayed, not the raw value', () => {
  const shown = percent => render({ contextPercent: percent }, { columns: 60 }).join('  ')
  assert.match(shown(69.4), /ctx 69%(?!!)/)
  // 69.9 displays as 70%, so it must carry the marker 70% carries; showing a bare "70%"
  // beside a threshold of 70 reads as a bug to anyone looking at it.
  assert.match(shown(69.9), /ctx 70%!(?!!)/)
  assert.match(shown(70), /ctx 70%!(?!!)/)
  assert.match(shown(84.4), /ctx 84%!(?!!)/)
  assert.match(shown(84.9), /ctx 85%!!/)
  assert.match(shown(85), /ctx 85%!!/)
})

test('context and quotas turn at different places, because they are different kinds of number', () => {
  assert.deepEqual(THRESHOLDS, { context: { warn: 70, critical: 85 }, quota: { warn: 80, critical: 95 } })
  const row = percent => render({ contextPercent: percent, fiveHour: { percent, resetsAt: null }, sevenDay: { percent, resetsAt: null } }, { columns: 100 }).join('  ')
  // 75 %: context is past the point where Claude Code's own compaction is near; a quota is not.
  assert.match(row(75), /ctx 75%!(?!!).*5h 75%(?!!).*7d 75%(?!!)/)
  assert.match(row(82), /ctx 82%!(?!!).*5h 82%!(?!!)/)
  assert.match(row(90), /ctx 90%!!.*5h 90%!(?!!)/)
  assert.match(row(96), /ctx 96%!!.*5h 96%!!.*7d 96%!!/)
})

// Native stdin has no branch, so Phase A never fills state.git. The renderer already accepts
// it, and these tests pin that contract for the phase that does.
const withGit = git => ({ ...stateFromStatusline(loadFixture('idle')), git })

test('git: branch, dirty mark and ahead/behind on a wide terminal', () => {
  const [identity] = render(withGit({ branch: 'main', dirty: true, ahead: 2, behind: 1 }), { ...FIXED, columns: 80 })
  // Two units: who is working, and where -- the project "on" its branch, a dot when it is dirty.
  assert.equal(identity, 'Fable 5.1  high  │  clear-claude on main  ● ↑2 ↓1')
  const [ascii] = render(withGit({ branch: 'main', dirty: true, ahead: 2, behind: 1 }), { ...FIXED, columns: 80, charset: 'ascii' })
  assert.equal(ascii, 'Fable 5.1  high  |  clear-claude on main* +2 -1')
})

test('git: what joins two segments follows what is left when one is dropped', () => {
  const state = { model: 'Fable 5.1', effort: 'high', project: 'clear-claude', git: { branch: 'main', dirty: false } }
  const FIXED_ID = { ...FIXED, show: { context: false } }
  assert.deepEqual(render(state, { ...FIXED_ID, columns: 80 }), ['Fable 5.1  high  │  clear-claude on main'])
  // No project: "on" has nothing to point at, so the branch stands as its own unit.
  assert.deepEqual(render({ ...state, project: null }, { ...FIXED_ID, columns: 80 }), ['Fable 5.1  high  │  main'])
  assert.deepEqual(render(state, { ...FIXED, columns: 80, show: { context: false, project: false, effort: false } }), ['Fable 5.1  │  main'])
  // Dropped for room rather than switched off: the effort goes first, then the project.
  assert.deepEqual(render(state, { ...FIXED_ID, columns: 40 }), ['Fable 5.1  │  clear-claude on main'])
  assert.deepEqual(render(state, { ...FIXED_ID, columns: 24 }), ['Fable 5.1  │  main'])
  assert.deepEqual(render({ ...state, git: null }, { ...FIXED_ID, columns: 80 }), ['Fable 5.1  high  │  clear-claude'])
})

test('git: a narrow terminal drops what it must, keeping the branch and its dirty mark', () => {
  const [identity] = render(withGit({ branch: 'main', dirty: true, ahead: 2 }), { ...FIXED, columns: 40 })
  assert.match(identity, /^Fable 5\.1\b/)
  assert.match(identity, /main  ●/)
  assert.doesNotMatch(identity, /high/, 'effort is the first thing a narrow row gives up')
})

test('git: a hostile branch name is neutralised and capped', () => {
  const branch = '\x1b]8;;https://evil.example\x07feature/\x1b[2Jx\u202e\nrm -rf\x1b]8;;\x07' + 'y'.repeat(80)
  const [identity] = render(withGit({ branch, dirty: false }), { ...FIXED, columns: 80 })
  assert.doesNotMatch(identity, /[\x00-\x1f\x7f-\x9f\u202e]/)
  assert.ok(identity.includes('feature/x rm -rf'))
  assert.ok(identity.endsWith('…'))
})

test('cost shows only when no usage window is available, and never as $0.00', () => {
  const capacityOf = name => render(stateFromStatusline(loadFixture(name)), { ...FIXED, columns: 120 }).join('  ')
  assert.match(capacityOf('api-key'), /\$0\.42$/)
  assert.doesNotMatch(capacityOf('idle'), /\$/)
  assert.doesNotMatch(capacityOf('session-start'), /\$/)
})
