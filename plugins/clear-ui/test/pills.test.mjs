// The pill look, as the design spec draws it: identity is typography in role colours, and only a
// metric is a chip -- a dark tint of its level under text in that level's hue.
import test from 'node:test'
import assert from 'node:assert/strict'
import { render } from '../src/render.mjs'
import { displayWidth } from '../src/sanitize.mjs'

const NOW = Date.UTC(2026, 8, 19, 6, 0)
const STATE = {
  model: 'Fable 5.1',
  effort: 'high',
  project: 'clear-claude',
  git: { branch: 'main', dirty: true, ahead: 0, behind: 0 },
  contextPercent: 43,
  fiveHour: { percent: 39, resetsAt: NOW + 42 * 60_000 },
  sevenDay: { percent: 58, resetsAt: NOW + (13 * 60 + 42) * 60_000 },
}
const NBSP = String.fromCharCode(0xa0)
const strip = line => line.replace(/\x1b\[[0-9;]*m/g, '')
const draw = (options = {}, state = STATE) => render(state, { columns: 139, now: NOW, timeZone: 'UTC', color: true, style: true, truecolor: true, look: 'pills', ...options })
const runsOf = row => [...row.matchAll(/\x1b\[([0-9;]*)m([^\x1b]*)/g)].map(([, codes, text]) => ({ codes, text })).filter(run => run.codes !== '0' && run.text !== '')
// Adjacent parts that share a style are one run, so a part is found inside its run.
const runWith = (row, text) => runsOf(row).find(run => run.text.replaceAll(NBSP, ' ').includes(text))
const fgOf = (row, text) => runWith(row, text)?.codes.replace(/;48;.*$/, '')
const bgOf = (row, text) => runWith(row, text)?.codes.match(/48;2;([\d;]+)$/)?.[1]

// The spec's roles, as SGR.
const PRIMARY = '38;2;230;237;243'
const SECONDARY = '38;2;148;163;184'
const WHERE = '38;2;96;165;250'
const GREEN = '38;2;34;197;94'
const AMBER = '38;2;245;158;11'
const RED = '38;2;239;68;68'

test('pills: identity is typography and only the metrics have a surface', () => {
  const [row] = draw()
  const plain = strip(row).replaceAll(NBSP, ' ')
  assert.match(plain, /^Fable 5\.1  high  │  clear-claude on main  ●  +ctx 43%   5h 39% · 42m   7d 58% · 13h42m $/)
  assert.doesNotMatch(plain, /[▬█─▄]/, 'no bar of any kind: the spec lists heavy bars under "don\'t"')
  assert.equal(displayWidth(strip(row)), 135, 'the bar still spans exactly the usable width')

  const runs = runsOf(row)
  const identity = runs.slice(0, runs.findIndex(run => run.text.includes('ctx')) - 1)
  for (const run of identity) assert.doesNotMatch(run.codes, /(^|;)48;/, `a background under ${JSON.stringify(run.text)}`)
  // Nothing is left to Claude Code's repaint: every word carries its own foreground.
  for (const run of runs) assert.match(run.codes, /(^|;)38;2;\d+;\d+;\d+/, JSON.stringify(run.text))
  assert.ok(row.endsWith('\x1b[0m'), 'nothing is left switched on after the row')
})

test('pills: the identity hierarchy of the spec -- model, effort, rule, project on branch, dirty dot', () => {
  const [row] = draw()
  assert.equal(fgOf(row, 'Fable 5.1'), `1;${PRIMARY}`, 'the model: primary, bold')
  assert.equal(fgOf(row, 'high'), SECONDARY, 'effort: a muted modifier')
  assert.equal(fgOf(row, 'clear-claude'), WHERE, 'the project: the accent')
  assert.equal(fgOf(row, ' on '), SECONDARY)
  assert.equal(fgOf(row, 'main'), `1;${WHERE}`, 'the branch: the accent again, bold -- one unit with the project')
  assert.equal(fgOf(row, '  ●'), '38;2;249;115;22', 'the dirty dot has a colour of its own')
  assert.equal(fgOf(row, '  │  '), '38;2;71;85;105', 'the separator is the quietest thing drawn')
  // A light Claude Code theme gets the light set: the same roles on a light ground.
  const [light] = draw({ theme: 'light' })
  assert.equal(fgOf(light, 'Fable 5.1'), '1;38;2;15;23;42')
  assert.equal(fgOf(light, 'clear-claude'), '38;2;29;78;216')
})

test('pills: a healthy row -- the context chip is green-tinted, the quotas are neutral', () => {
  const [row] = draw()
  assert.equal(fgOf(row, 'ctx '), GREEN)
  assert.equal(bgOf(row, 'ctx '), '14;36;24')
  assert.equal(fgOf(row, '43%'), `1;${PRIMARY}`, 'a healthy number is primary, not a hue')
  for (const label of ['5h ', '7d ']) {
    assert.equal(fgOf(row, label), SECONDARY)
    assert.equal(bgOf(row, label), '30;41;59')
  }
  assert.equal(fgOf(row, '42m'), SECONDARY, 'the time is meta')
  // One ground per chip: a chip is never split into a filled and an empty part.
  const grounds = new Set(runsOf(row).map(run => run.codes.match(/48;2;([\d;]+)$/)?.[1]).filter(Boolean))
  assert.deepEqual([...grounds].sort(), ['14;36;24', '30;41;59'])
})

test('pills: warning and critical tint the chip and colour its label and number; the time stays meta', () => {
  const hot = { ...STATE, contextPercent: 84, fiveHour: { percent: 96, resetsAt: NOW + 42 * 60_000 }, sevenDay: { percent: 87, resetsAt: NOW + 30 * 60 * 60_000 } }
  const [row] = draw({}, hot)
  assert.match(strip(row).replaceAll(NBSP, ' '), / ctx 84%   5h 96% · 42m   7d 87% · 1d6h $/, 'no "!" marks: with colour on, the chip says the level')
  assert.equal(fgOf(row, 'ctx '), AMBER)
  assert.equal(fgOf(row, '84%'), `1;${AMBER}`)
  assert.equal(bgOf(row, '84%'), '43;32;11')
  assert.equal(fgOf(row, '5h '), RED)
  assert.equal(fgOf(row, '96%'), `1;${RED}`)
  assert.equal(bgOf(row, '96%'), '42;18;21')
  assert.equal(fgOf(row, '42m'), SECONDARY)
  assert.equal(fgOf(row, '7d '), AMBER)
  // Without colour the level has to be text again.
  assert.match(render(hot, { columns: 139, now: NOW }).join(' '), /84%!(?!!).*96%!!/)
})

test('pills: session start -- an unknown context is a neutral chip, not a green one', () => {
  const [row] = draw({}, { model: 'Fable 5.1', contextPercent: null })
  assert.equal(bgOf(row, 'ctx '), '30;41;59')
  assert.equal(fgOf(row, 'ctx '), SECONDARY)
})

test('pills: without 24-bit colour the 256 palette is used, and the text still carries the level', () => {
  const [indexed] = draw({ truecolor: false }, { ...STATE, contextPercent: 96 })
  assert.equal(strip(indexed), strip(draw({}, { ...STATE, contextPercent: 96 })[0]))
  assert.doesNotMatch(indexed, /[34]8;2;/)
  assert.match(indexed, /\x1b\[1;38;5;255mFable 5\.1/)
  assert.match(indexed, /\x1b\[1;38;5;203;48;5;236m96%/, 'red on the one grey chip the cube allows')
})

test('pills: colour is what a chip is made of, so without it the text look is drawn', () => {
  const text = render(STATE, { columns: 139, now: NOW, timeZone: 'UTC', look: 'pills' })
  assert.deepEqual(text, render(STATE, { columns: 139, now: NOW, timeZone: 'UTC' }))
  assert.deepEqual(draw({ color: false }), render(STATE, { columns: 139, now: NOW, timeZone: 'UTC', style: true }))
  for (const look of ['__proto__', 'vivid', '']) assert.deepEqual(draw({ look }), draw({ look: 'text' }), look)
})

test('pills: every row fits every width; hostile names are neutralised; the activity row is typography too', () => {
  const state = { ...STATE, project: `\x1b[31mevil${String.fromCodePoint(0x202e)}`, verification: { status: 'edited', at: NOW }, activity: { agents: 2, failed: 1, oldestStart: NOW - 400_000, background: 1 } }
  for (let columns = 20; columns <= 200; columns += 3) {
    for (const row of draw({ columns }, state)) {
      assert.ok(displayWidth(strip(row)) <= columns - 4, `${columns}: ${JSON.stringify(strip(row))}`)
      assert.ok(![...strip(row)].some(c => c.codePointAt(0) >= 0x202a && c.codePointAt(0) <= 0x202e), 'a bidi override survived')
      assert.doesNotMatch(strip(row), /[\x00-\x1f\x7f-\x9f]/)
    }
  }
  const rows = draw({}, state)
  assert.match(strip(rows.at(-1)), /^2 agents · 1 failed! · 6m  │  1 background$/)
  assert.equal(fgOf(rows.at(-1), '2'), `1;${PRIMARY}`)
  assert.equal(fgOf(rows.at(-1), ' agents'), SECONDARY)
})

test('text look: the numbers are bright only where the theme is known', () => {
  const opts = { columns: 139, now: NOW, timeZone: 'UTC', color: true, style: true }
  assert.match(render(STATE, { ...opts, theme: 'dark' })[0], /\x1b\[1;97mFable 5\.1/)
  assert.match(render(STATE, { ...opts, theme: 'light' })[0], /\x1b\[1;30m43%/)
  assert.match(render(STATE, opts)[0], /\x1b\[1mFable 5\.1/, 'unknown theme: bold alone')
  assert.match(render(STATE, { ...opts, theme: '__proto__' })[0], /\x1b\[1mFable 5\.1/)
})

// A terminal has cells, not pixels: no hairline border, no 4 px radius. A chip can end in a cap
// glyph instead, where the terminal draws that glyph itself.
const CAP_LEFT = String.fromCodePoint(0xe0b6)
const CAP_RIGHT = String.fromCodePoint(0xe0b4)

test('caps: a rounded chip is exactly as wide as a square one, and its caps carry the chip colour on no background', () => {
  const [square] = draw()
  const [round] = draw({ caps: 'round' })
  assert.equal(displayWidth(strip(round)), displayWidth(strip(square)), 'the cap takes the pad cell, so nothing reflows')
  assert.equal(strip(round).replaceAll(CAP_LEFT, NBSP).replaceAll(CAP_RIGHT, NBSP), strip(square))
  assert.equal([...strip(round)].filter(ch => ch === CAP_LEFT).length, 3)
  assert.equal([...strip(round)].filter(ch => ch === CAP_RIGHT).length, 3)

  const runs = runsOf(round)
  const caps = runs.filter(run => run.text === CAP_LEFT || run.text === CAP_RIGHT)
  assert.equal(caps.length, 6)
  for (const cap of caps) assert.doesNotMatch(cap.codes, /(^|;)48;/, 'a cap sits on the terminal background')
  // The cap's foreground is the background of the chip it closes.
  assert.equal(caps[0].codes, '38;2;14;36;24')
  assert.equal(bgOf(round, 'ctx '), '14;36;24')
  assert.equal(caps[2].codes, '38;2;30;41;59')
})

test('caps: square is the default, ASCII has no caps, and a hostile name cannot smuggle one in', () => {
  const hasCap = row => strip(row).includes(CAP_LEFT) || strip(row).includes(CAP_RIGHT)
  assert.equal(hasCap(draw()[0]), false)
  assert.equal(hasCap(draw({ caps: '__proto__' })[0]), false)
  const ascii = strip(draw({ caps: 'round', charset: 'ascii' })[0])
  assert.ok([...ascii].every(ch => ch.codePointAt(0) < 0x80 || ch === NBSP), 'the ASCII charset stays ASCII')
  // The project name is untrusted; private-use characters are stripped from it like any other.
  assert.equal(hasCap(draw({}, { ...STATE, project: `${CAP_LEFT}evil${CAP_RIGHT}` })[0]), false)
})

// Shipped once and photographed: sextant chip ends (U+1FB2B, U+1FB1B) arrived in a real session as
// grey crosses. Claude Code does not carry a character outside the Basic Multilingual Plane through
// its status line intact, so nothing this renderer draws of its own accord may be one.
test('everything the renderer draws is in the Basic Multilingual Plane', () => {
  const busy = { ...STATE, contextPercent: 96, verification: { status: 'failed', at: NOW }, activity: { agents: 2, failed: 1, oldestStart: NOW - 400_000, background: 1 }, git: { branch: 'main', dirty: true, ahead: 2, behind: 1 } }
  for (const look of ['pills', 'text']) {
    for (const caps of ['round', 'square', 'soft']) {
      for (const charset of ['unicode', 'ascii']) {
        for (const columns of [40, 80, 139]) {
          for (const row of draw({ look, caps, charset, columns }, busy)) {
            const astral = [...strip(row)].filter(ch => ch.codePointAt(0) > 0xffff)
            assert.deepEqual(astral, [], `${look} ${caps} ${charset} ${columns}`)
          }
        }
      }
    }
  }
  assert.deepEqual(draw({ caps: 'soft' }), draw({ caps: 'square' }), 'a retired setting falls back to square, not to a broken glyph')
})
