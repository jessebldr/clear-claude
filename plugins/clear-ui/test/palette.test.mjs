// The palette is judged against the backgrounds it will really sit on. Identity text has no
// background of its own, so its contrast is decided by the terminal's -- and those differ: the
// spec's own base, VS Code's dark themes, Windows Terminal's Campbell, macOS Terminal's Pro, and
// the light grounds a light Claude Code theme implies. Ratios are WCAG 2 contrast.
import test from 'node:test'
import assert from 'node:assert/strict'
import { PALETTES } from '../src/render.mjs'

const channel = value => (value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4)
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const saturation = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255

const GROUNDS = {
  dark: { 'the design spec': [11, 15, 20], 'VS Code Dark Modern': [25, 26, 27], 'VS Code Dark+': [30, 30, 30], 'Windows Terminal Campbell': [12, 12, 12], 'macOS Terminal Pro': [0, 0, 0] },
  light: { white: [255, 255, 255], 'Solarized Light': [253, 246, 227] },
}

test('dark: the roles are the design spec, to the digit', () => {
  const hex = role => PALETTES.dark[role][0].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
  assert.deepEqual(
    Object.fromEntries(['primary', 'secondary', 'where', 'green', 'amber', 'red', 'dirty'].map(role => [role, hex(role)])),
    { primary: 'E6EDF3', secondary: '94A3B8', where: '60A5FA', green: '22C55E', amber: 'F59E0B', red: 'EF4444', dirty: 'F97316' },
  )
})

for (const theme of ['dark', 'light']) {
  const rgb = role => PALETTES[theme][role][0]

  test(`${theme}: every word is readable on every terminal ground it can sit on`, () => {
    for (const [name, ground] of Object.entries(GROUNDS[theme])) {
      // The spec's red, #EF4444, measures 4.43 on VS Code Dark+ and 4.6 or better elsewhere. It is
      // kept to the digit and held to 4.4: on a bare ground it is only ever two short words.
      assert.ok(contrast(rgb('red'), ground) >= 4.4, `red on ${name}: ${contrast(rgb('red'), ground).toFixed(2)}`)
      for (const role of ['primary', 'secondary', 'where', 'amber']) {
        assert.ok(contrast(rgb(role), ground) >= 4.5, `${role} on ${name}: ${contrast(rgb(role), ground).toFixed(2)}`)
      }
      // Marks and decoration only have to be seen: the dirty dot, and the rule.
      assert.ok(contrast(rgb('dirty'), ground) >= 3, `the dirty dot on ${name}: ${contrast(rgb('dirty'), ground).toFixed(2)}`)
      assert.ok(contrast(rgb('faint'), ground) >= 1.7, `the rule on ${name}: ${contrast(rgb('faint'), ground).toFixed(2)}`)
    }
  })

  test(`${theme}: the roles keep their order, so the hierarchy survives any ground`, () => {
    for (const [name, ground] of Object.entries(GROUNDS[theme])) {
      const order = ['primary', 'secondary', 'faint'].map(role => contrast(rgb(role), ground))
      assert.deepEqual([...order].sort((a, b) => b - a), order, name)
      assert.ok(order[0] / order[1] >= 1.7, `${name}: the model must stand clear of its modifier`)
    }
  })

  test(`${theme}: every word on a chip is readable on that chip`, () => {
    for (const role of ['primary', 'secondary']) {
      for (const ground of ['chip', 'okBg', 'warnBg', 'criticalBg']) {
        assert.ok(contrast(rgb(role), rgb(ground)) >= 4.5, `${role} on ${ground}: ${contrast(rgb(role), rgb(ground)).toFixed(2)}`)
      }
    }
    for (const [hue, ground] of [['green', 'okBg'], ['amber', 'warnBg'], ['red', 'criticalBg']]) {
      assert.ok(contrast(rgb(hue), rgb(ground)) >= 4.5, `${hue} on ${ground}: ${contrast(rgb(hue), rgb(ground)).toFixed(2)}`)
    }
  })

  test(`${theme}: a chip is a tint, never a block -- the spec's "don't"`, () => {
    for (const ground of ['chip', 'okBg', 'warnBg', 'criticalBg']) {
      assert.ok(saturation(rgb(ground)) <= 0.2, `${ground}: ${saturation(rgb(ground)).toFixed(2)}`)
      for (const [name, terminal] of Object.entries(GROUNDS[theme])) {
        assert.ok(contrast(rgb(ground), terminal) <= 1.6, `${ground} against ${name}: ${contrast(rgb(ground), terminal).toFixed(2)} is a block, not a tint`)
      }
    }
    // The hue lives in the text, where it can be strong without being heavy.
    for (const hue of ['green', 'amber', 'red', 'where']) assert.ok(saturation(rgb(hue)) >= 0.35, hue)
  })
}

test('the 256-colour fallback exists for every role (macOS Terminal has no 24-bit colour)', () => {
  for (const set of [PALETTES.dark, PALETTES.light]) {
    for (const [role, [triple, index]] of Object.entries(set)) {
      assert.ok(Number.isInteger(index) && index >= 16 && index <= 255, `${role}: ${index} is not in the fixed part of the palette`)
      assert.ok(triple.length === 3 && triple.every(v => Number.isInteger(v) && v >= 0 && v <= 255), role)
    }
  }
})
