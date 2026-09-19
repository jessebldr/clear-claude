import test from 'node:test'
import assert from 'node:assert/strict'
import { barCells, breakpointOf, fitLine, formatCountdown, formatReset, spreadLine, usableColumns } from '../src/layout.mjs'
import { displayWidth } from '../src/sanitize.mjs'

test('breakpoints: 80 is wide, 50 is medium, anything unknown is narrow', () => {
  assert.equal(breakpointOf(200), 'wide')
  assert.equal(breakpointOf(80), 'wide')
  assert.equal(breakpointOf(79), 'medium')
  assert.equal(breakpointOf(50), 'medium')
  assert.equal(breakpointOf(49), 'narrow')
  for (const unknown of [undefined, null, 0, -5, NaN, 80.5, '120']) assert.equal(breakpointOf(unknown), 'narrow')
})

test('usableColumns keeps a right-hand reserve and is undefined for an unknown width', () => {
  assert.equal(usableColumns(120), 116)
  assert.equal(usableColumns(undefined), undefined)
  assert.equal(usableColumns(0), undefined)
  assert.equal(usableColumns(-3), undefined)
})

// This asserted usableColumns(8) === 10 until a review pointed out that it was pinning the
// defect: a terminal that says it has 8 columns was handed 10 and wrapped. A budget may be
// smaller than the terminal, never larger.
test('usableColumns never exceeds the width the terminal declared', () => {
  for (let columns = 1; columns <= 200; columns++) {
    const usable = usableColumns(columns)
    assert.ok(usable <= columns, `${columns} columns -> ${usable} usable`)
    assert.ok(usable >= 1, `${columns} columns -> ${usable} usable`)
  }
})

test('barCells clamps and always sums to the requested size', () => {
  assert.deepEqual(barCells(0, 10), { filled: 0, empty: 10 })
  assert.deepEqual(barCells(31, 10), { filled: 3, empty: 7 })
  assert.deepEqual(barCells(100, 10), { filled: 10, empty: 0 })
  assert.deepEqual(barCells(250, 10), { filled: 10, empty: 0 })
  assert.deepEqual(barCells(-4, 10), { filled: 0, empty: 10 })
})

test('only 100% fills the meter: the critical range stays distinguishable', () => {
  // A plain round drew 95, 96, 99 and 100 identically, which is the one range where the
  // difference is worth seeing.
  for (const percent of [95, 96, 99, 99.9]) {
    assert.equal(barCells(percent, 10).filled, 9, `${percent}% must not look full`)
  }
  assert.equal(barCells(100, 10).filled, 10)
})

test('any value above zero keeps at least one cell', () => {
  assert.equal(barCells(0, 10).filled, 0)
  for (const percent of [0.1, 3, 4.9]) assert.equal(barCells(percent, 10).filled, 1, `${percent}%`)
  assert.equal(barCells(12, 10).filled, 1)
})

test('in between, the meter still lands on the nearest cell', () => {
  assert.equal(barCells(67, 10).filled, 7)
  assert.equal(barCells(44, 10).filled, 4)
  assert.equal(barCells(85, 10).filled, 9)
})

test('formatCountdown', () => {
  assert.equal(formatCountdown(30 * 1000), '<1m')
  assert.equal(formatCountdown(42 * 60 * 1000), '42m')
  assert.equal(formatCountdown((2 * 60 + 10) * 60 * 1000), '2h10m')
  assert.equal(formatCountdown((23 * 60 + 5) * 60 * 1000), '23h05m')
  // Beyond a day: days and hours, the form the design spec draws ("1d6h").
  assert.equal(formatCountdown(24 * 60 * 60 * 1000), '1d0h')
  assert.equal(formatCountdown((30 * 60 + 59) * 60 * 1000), '1d6h')
  assert.equal(formatCountdown(6.9 * 24 * 60 * 60 * 1000), '6d21h')
})

test('formatReset: one countdown form for every window, nothing for the past or unknown', () => {
  const now = Date.UTC(2026, 8, 19, 4, 10)
  assert.equal(formatReset(now + 42 * 60 * 1000, now), '42m')
  assert.equal(formatReset(Date.UTC(2026, 8, 23, 20, 0), now), '4d15h')
  assert.equal(formatReset(now - 1, now), '')
  assert.equal(formatReset(now, now), '')
  assert.equal(formatReset(null, now), '')
  assert.equal(formatReset(now + 1000, undefined), '')
})

const seg = (plain, priority) => ({ plain, styled: `<${plain}>`, priority })
const sep = { plain: ' · ', styled: ' · ' }

test('fitLine prints styled text and measures plain text', () => {
  assert.equal(fitLine([seg('aa', 0), seg('bb', 1)], sep, undefined), '<aa> · <bb>')
  assert.equal(fitLine([seg('aa', 0), seg('bb', 1)], sep, 7), '<aa> · <bb>')
})

test('fitLine drops the least important segment first, the later one on a tie', () => {
  const segments = [seg('model', 0), seg('effort', 3), seg('project', 2), seg('branch', 1)]
  assert.equal(fitLine(segments, sep, 24), '<model> · <project> · <branch>')
  assert.equal(fitLine(segments, sep, 15), '<model> · <branch>')
  assert.equal(fitLine([seg('a', 1), seg('b', 1), seg('c', 1)], sep, 5), '<a> · <b>')
})

test('fitLine cuts the last remaining segment and skips empty ones', () => {
  assert.equal(fitLine([seg('abcdefghij', 0), seg('zz', 1)], sep, 6), 'abcde…')
  assert.equal(fitLine([seg('', 0), seg('only', 1)], sep, 20), '<only>')
  assert.equal(fitLine([], sep, 20), '')
})

// The two anchors are what make it read as a bar rather than a paragraph; the fallback to
// stacking is what keeps it honest when the terminal is too narrow for two anchors.
const line = (plain, styled = plain) => ({ plain, styled })

test('spreadLine puts the two groups on the two edges and fills between', () => {
  const out = spreadLine(line('left'), line('right'), 20)
  assert.equal(out, 'left           right')
  assert.equal(displayWidth(out), 20)
})

test('spreadLine measures the plain text and prints the styled text', () => {
  const out = spreadLine(line('ab', '<ab>'), line('cd', '[cd]'), 10)
  assert.equal(out, '<ab>      [cd]')
  assert.equal(displayWidth(out.replace(/[<>[\]]/g, '')), 10)
})

test('spreadLine refuses when the gap would be too small, so the caller can stack instead', () => {
  assert.equal(spreadLine(line('12345'), line('67890'), 12), null, 'a two-space gap is not a gap')
  assert.notEqual(spreadLine(line('12345'), line('67890'), 13), null)
  assert.equal(spreadLine(line('12345'), line('67890'), 4), null)
})

test('spreadLine refuses an unknown width or an empty side', () => {
  assert.equal(spreadLine(line('left'), line('right'), undefined), null)
  assert.equal(spreadLine(line(''), line('right'), 40), null)
  assert.equal(spreadLine(line('left'), line(''), 40), null)
})

test('spreadLine counts wide characters, so the right edge is where it looks', () => {
  const out = spreadLine(line('日本'), line('ab'), 10)
  assert.equal(displayWidth(out), 10)
})
