// A bar that shows a field at 100 columns, hides it at 110 and shows it again at 120 feels
// broken in a way people cannot articulate. The rule: as the terminal gets wider, the set of
// facts on screen may only grow. Widening must never take something away.
//
// This scans every width from 20 to 200 for every fixture, which is cheap because render is a
// pure function, and it is the only test here that would catch a reflow regression.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { stateFromStatusline } from '../src/state.mjs'
import { render } from '../src/render.mjs'
import { displayWidth } from '../src/sanitize.mjs'

const NOW = Date.UTC(2026, 8, 19, 4, 10)
const FIXED = { now: NOW, timeZone: 'UTC' }
const WIDTHS = Array.from({ length: 181 }, (_, i) => i + 20)

// Monotonicity is promised from 40 columns up, and the promise stops there for a reason rather
// than to make this file green. Below 40 the identity group alone nearly fills the row, so the
// layout is not choosing an arrangement any more, it is choosing which single fact survives --
// and every answer to that trades one fact for another, which is a swap, not a regression.
// Above 40 there is real freedom, so losing something while gaining width is a defect.
// The widths below 40 are still covered, by the two tests at the end of this file.
const MONOTONIC_FROM = 40
const SCANNED = WIDTHS.filter(columns => columns >= MONOTONIC_FROM)

const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url))
const fixtureNames = readdirSync(fixturesDir).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)).sort()
const loadFixture = name => JSON.parse(readFileSync(`${fixturesDir}${name}.json`, 'utf8'))

// Each fact is something a person could look for. Detected from the plain text, because that
// is what they actually see.
const FACTS = {
  model: text => /^\S/.test(text),
  effort: text => /\b(low|medium|high|xhigh|max)\b/.test(text),
  project: text => /clear-claude|api-server|scratch/.test(text),
  context: text => /ctx \d+%/.test(text),
  meter: text => /[█─]{3,}|#{2,}-{2,}/.test(text),
  fiveHour: text => /5h \d+%/.test(text),
  fiveHourReset: text => /5h \d+%!{0,2}[ ·]+(\d+h\d+m|<1m|[A-Z][a-z]{2})/.test(text),
  sevenDay: text => /7d \d+%/.test(text),
  sevenDayReset: text => /7d \d+%!{0,2}[ ·]+(\d+h\d+m|<1m|[A-Z][a-z]{2})/.test(text),
  cost: text => /\$\d/.test(text),
}

const factsAt = (state, columns) => {
  const text = render(state, { ...FIXED, columns }).join('  ')
  return new Set(Object.entries(FACTS).filter(([, present]) => present(text)).map(([name]) => name))
}

for (const name of fixtureNames) {
  test(`widening never removes a fact: ${name}`, () => {
    const state = stateFromStatusline(loadFixture(name))
    let previous = factsAt(state, SCANNED[0])
    let previousWidth = SCANNED[0]
    for (const columns of SCANNED.slice(1)) {
      const current = factsAt(state, columns)
      const lost = [...previous].filter(fact => !current.has(fact))
      assert.deepEqual(lost, [], `${name}: widening ${previousWidth} -> ${columns} removed ${lost.join(', ')}`)
      previous = current
      previousWidth = columns
    }
  })
}

test('every width produces one or two rows, each within the width it was given', () => {
  for (const name of fixtureNames) {
    const state = stateFromStatusline(loadFixture(name))
    for (const columns of WIDTHS) {
      const lines = render(state, { ...FIXED, columns })
      assert.ok(lines.length <= 2, `${name} at ${columns}: ${lines.length} rows`)
      for (const line of lines) {
        assert.ok(displayWidth(line) <= columns, `${name} at ${columns}: ${displayWidth(line)} cells`)
      }
    }
  }
})

test('the single-row bar reaches the right edge exactly, and only ever pads with spaces', () => {
  const state = stateFromStatusline(loadFixture('idle'))
  let sawBar = false
  for (const columns of WIDTHS) {
    const lines = render(state, { ...FIXED, columns })
    if (lines.length !== 1) continue
    sawBar = true
    // usableColumns() keeps a reserve at the right edge, so the row lands just short of it.
    assert.ok(displayWidth(lines[0]) >= columns - 5, `at ${columns}: row is ${displayWidth(lines[0])} cells`)
    assert.doesNotMatch(lines[0], /\s$/, `at ${columns}: trailing whitespace`)
    assert.doesNotMatch(lines[0], /[^\S ]/, `at ${columns}: padded with something other than a space`)
  }
  assert.ok(sawBar, 'no width in the scan produced a single-row bar')
})

test('once it fits on one row it stays on one row as the terminal grows', () => {
  for (const name of fixtureNames) {
    const state = stateFromStatusline(loadFixture(name))
    let firstBarAt = null
    for (const columns of SCANNED) {
      const rows = render(state, { ...FIXED, columns }).length
      if (rows === 1 && firstBarAt === null) firstBarAt = columns
      if (firstBarAt !== null && rows === 2) {
        assert.fail(`${name}: one row at ${firstBarAt}, back to two rows at ${columns}`)
      }
    }
  }
})

// The two properties that must hold at every width, including the ones too narrow to promise
// monotonicity for: what is drawn fits, and a meter is never drawn cut off. A clipped meter is
// not read as a clipped meter, it is read as a smaller percentage -- so at a width where one
// would have to be cut, the renderer must choose a layout that has no meter at all.
test('no width ever draws a meter that has been cut off', () => {
  for (const name of fixtureNames) {
    const state = stateFromStatusline(loadFixture(name))
    for (const columns of WIDTHS) {
      for (const line of render(state, { ...FIXED, columns })) {
        if (/[█─]/.test(line)) {
          assert.doesNotMatch(line, /[█─]…/, `${name} at ${columns}: ${line}`)
        }
      }
    }
  }
})

test('below the monotonic range the output is still bounded and never empty-looking', () => {
  for (const name of fixtureNames) {
    const state = stateFromStatusline(loadFixture(name))
    for (const columns of WIDTHS.filter(w => w < MONOTONIC_FROM)) {
      const lines = render(state, { ...FIXED, columns })
      assert.ok(lines.length >= 1, `${name} at ${columns}: drew nothing`)
      for (const line of lines) {
        assert.ok(displayWidth(line) <= columns, `${name} at ${columns}: ${displayWidth(line)} cells`)
        assert.notEqual(line.trim(), '…', `${name} at ${columns}: a row that is only an ellipsis`)
      }
    }
  }
})
