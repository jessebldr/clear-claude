#!/usr/bin/env node
// Optical checks on the real renderer's output, in pixels, with real fonts.
//
// A width test knows a row is 135 cells. It does not know that `*` rides two pixels above the
// lowercase beside it, that a half-block bar hangs four pixels under the digits, or that a pill
// has more air on one side of its text than the other -- and each of those shipped once and was
// found by a person looking at a screenshot. This rasterises the row with the fonts installed
// here and measures the ink itself:
//
//   baseline  every mark drawn by the font (the dirty dot, the middle dot, the arrows) has its
//             ink centred on the x-height of the text beside it, within a tolerance
//   rhythm    the air either side of a rule is the same, in ink pixels, not in cells
//   pills     the air inside a pill is the same on its left as on its right, and the gaps
//             between pills are equal
//
// Windows only (System.Drawing), and it measures the fonts on this machine, so it lives beside
// the bench rather than in the test suite. Exit 1 when a check fails.
//
//   node bench/optical.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '../src/render.mjs'

if (process.platform !== 'win32') {
  console.log('optical: skipped -- needs System.Drawing, which is Windows only')
  process.exit(0)
}

// An eighth of the font size: 1.5 px at 12 px. A fixed pixel count would fail every large font
// for an offset nobody can see, and pass every small one for an offset everybody can.
const BASELINE_TOLERANCE = 0.13
const RHYTHM_TOLERANCE_PX = 2
const FONTS = ['Cascadia Mono', 'Cascadia Code', 'Consolas', 'Lucida Console']
const SIZES = [12, 14, 16]

const now = Date.UTC(2026, 8, 19, 6, 0)
const state = {
  model: 'Fable 5.1',
  effort: 'high',
  project: 'clear-claude',
  git: { branch: 'main', dirty: true, ahead: 2, behind: 0 },
  contextPercent: 43,
  fiveHour: { percent: 39, resetsAt: now + 42 * 60_000 },
  sevenDay: { percent: 58, resetsAt: now + (13 * 60 + 42) * 60_000 },
  activity: { agents: 2, failed: 0, oldestStart: now - 6.2 * 60_000, background: 1 },
}
const options = { columns: 139, now, timeZone: 'UTC', color: true, style: true, truecolor: true, theme: 'dark' }

// An ANSI row -> cells of { ch, bg }, which is all the geometry needs.
function cellsOf(line) {
  const cells = []
  let bg = null
  for (const [, codes, text] of line.matchAll(/\x1b\[([0-9;]*)m|([^\x1b]+)/g).map(m => [m[0], m[1], m[2]])) {
    if (codes !== undefined) {
      if (codes === '0') bg = null
      const ground = codes.match(/(?:^|;)48;2;(\d+;\d+;\d+)/)
      if (ground) bg = ground[1]
    } else for (const ch of text) cells.push({ ch, bg })
  }
  return cells
}

const rows = []
for (const look of ['pills', 'text']) {
  render(state, { ...options, look }).forEach((line, index) => rows.push({ name: `${look} row ${index + 1}`, cells: cellsOf(line) }))
}

// Controls: the two defects that actually shipped. A check that cannot see them is not a check.
const swap = (row, from, to, name) => ({ name, control: true, cells: row.cells.map(cell => (cell.ch === from ? { ...cell, ch: to } : cell)) })
const textRow = rows.find(row => row.name === 'text row 1')
rows.push(swap(textRow, String.fromCodePoint(0x25cf), '*', 'control: a star for the dirty mark'))
rows.push(swap(textRow, String.fromCodePoint(0x25ac), String.fromCodePoint(0x2584), 'control: a half-block bar'))

const work = mkdtempSync(join(tmpdir(), 'clear-ui-optical-'))
const here = dirname(fileURLToPath(import.meta.url))
writeFileSync(join(work, 'in.json'), JSON.stringify({ fonts: FONTS, sizes: SIZES, rows }))
const ran = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'optical.ps1'), '-In', join(work, 'in.json'), '-Out', join(work, 'out.json')], { encoding: 'utf8', windowsHide: true })
if (ran.status !== 0) {
  console.error(ran.stderr || ran.stdout)
  process.exit(2)
}
const raw = readFileSync(join(work, 'out.json'), 'utf8')
const measured = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw)
rmSync(work, { recursive: true, force: true })

const BOX = ch => ch.codePointAt(0) >= 0x2500 && ch.codePointAt(0) <= 0x259f
const LETTER = /[A-Za-z0-9%!.$+\-]/
const failures = []
const caught = new Set()
let checks = 0

for (const face of [measured].flat()) {
  const centre = (face.xHeight.top + face.xHeight.bottom) / 2
  const report = { baseline: 0, rhythm: 0, pills: 0 }
  face.rows.forEach((row, r) => {
    const cells = rows[r].cells
    const drawn = [row.cells].flat()
    // The terminal draws block elements itself, to the cell: lower half, upper half, or all of it.
    const BLOCK = { 0x2584: [0.5, 1], 0x2580: [0, 0.5], 0x2588: [0, 1] }
    const ink = drawn.map((cellInk, i) => {
      const block = BLOCK[cells[i].ch.codePointAt(0)]
      return block ? { left: 0, right: face.cellW - 1, top: Math.round(block[0] * face.cellH), bottom: Math.round(block[1] * face.cellH) - 1 } : cellInk
    })
    const fail = message => (rows[r].control ? caught.add(rows[r].name) : failures.push(message))
    // Absolute ink extent of cell i, in pixels from the row's left edge. A rule is drawn by the
    // terminal down the middle of its cell.
    const extent = i => {
      if (cells[i].ch === '│' || cells[i].ch === '|') return { left: i * face.cellW + Math.floor(face.cellW / 2), right: i * face.cellW + Math.floor(face.cellW / 2) }
      return ink[i] ? { left: i * face.cellW + ink[i].left, right: i * face.cellW + ink[i].right } : null
    }
    const inkBefore = i => { for (let k = i - 1; k >= 0; k--) { const e = extent(k); if (e) return e } return null }
    const inkAfter = i => { for (let k = i + 1; k < cells.length; k++) { const e = extent(k); if (e) return e } return null }

    cells.forEach((cell, i) => {
      // baseline: marks the font draws, that are not letters. A mark is judged against the text
      // it stands beside -- the dirty dot against the lowercase of the branch, the middle dot and
      // the bar against the digits -- because that is the pair the eye compares.
      if (ink[i] && !LETTER.test(cell.ch) && (!BOX(cell.ch) || BLOCK[cell.ch.codePointAt(0)]) && cell.ch.trim() !== '' && cell.ch !== '…') {
        let beside = null
        for (let k = i - 1; k >= 0 && beside === null; k--) if (ink[k] && LETTER.test(cells[k].ch)) beside = ink[k]
        const reference = beside ? (beside.top + beside.bottom) / 2 : centre
        const off = (ink[i].top + ink[i].bottom) / 2 - reference
        checks++; report.baseline++
        if (Math.abs(off) > Math.max(1.5, face.px * BASELINE_TOLERANCE)) fail(`${face.font} ${face.px}px  ${row.name}: U+${cell.ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} sits ${off > 0 ? "below" : "above"} the centre of the text beside it by ${Math.abs(off).toFixed(1)} px`)
      }
      // rhythm: the air either side of a rule
      if (cell.ch === '│') {
        const before = inkBefore(i)
        const after = inkAfter(i)
        if (before && after) {
          const here_ = extent(i)
          const difference = Math.abs((here_.left - before.right) - (after.left - here_.right))
          checks++; report.rhythm++
          if (difference > RHYTHM_TOLERANCE_PX) failures.push(`${face.font} ${face.px}px  ${row.name}: the rule at cell ${i} has ${here_.left - before.right} px of air before it and ${after.left - here_.right} px after`)
        }
      }
    })

    // pills: runs of cells sharing a surface; a meter is one run of two grounds, so runs are
    // delimited by cells with no background at all.
    let start = null
    const gaps = []
    let lastEnd = null
    for (let i = 0; i <= cells.length; i++) {
      const on = i < cells.length && cells[i].bg !== null
      if (on && start === null) start = i
      if (!on && start !== null) {
        const first = inkAfter(start - 1)
        const last = inkBefore(i)
        const airLeft = first.left - start * face.cellW
        const airRight = i * face.cellW - 1 - last.right
        checks++; report.pills++
        if (Math.abs(airLeft - airRight) > RHYTHM_TOLERANCE_PX) failures.push(`${face.font} ${face.px}px  ${row.name}: the pill at cells ${start}-${i - 1} has ${airLeft} px of air on the left and ${airRight} px on the right`)
        if (lastEnd !== null) gaps.push(start - lastEnd)
        lastEnd = i
        start = null
      }
    }
    if (new Set(gaps).size > 1) failures.push(`${face.font} ${face.px}px  ${row.name}: the gaps between pills differ: ${gaps.join(', ')} cells`)
  })
  console.log(`  ${`${face.font} ${face.px}px`.padEnd(22)} cell ${face.cellW}x${face.cellH}  x-height rows ${face.xHeight.top}-${face.xHeight.bottom}   baseline ${report.baseline} · rhythm ${report.rhythm} · pills ${report.pills}`)
}

console.log(`\noptical: ${checks} checks, ${failures.length} failed  (baseline within ${BASELINE_TOLERANCE} of the font size, air within ${RHYTHM_TOLERANCE_PX} px)`)
for (const failure of failures) console.log(`  ✖ ${failure}`)
const controls = rows.filter(row => row.control)
for (const control of controls) {
  console.log(`  ${caught.has(control.name) ? 'caught' : 'MISSED'}  ${control.name}`)
  if (!caught.has(control.name)) failures.push(control.name)
}
process.exitCode = failures.length === 0 ? 0 : 1
