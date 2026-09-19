// A guard for a mistake that already happened once: an escape such as \\u202e written into a
// source file as the raw character it denotes. Phase A's first test run failed because a regex
// had a literal U+2028 in it, and the failure looked like a syntax error with no visible cause.
//
// Raw invisible characters in source are also how a reviewer gets shown one thing while the
// parser sees another, so this belongs in the suite regardless of the original accident.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const CODE = new Set(['.mjs', '.js', '.json', '.md'])
const SKIP = new Set(['node_modules', 'golden', 'fixtures'])

function sourceFiles(dir = root, found = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.git')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, found)
    else if (CODE.has(extname(name))) found.push(full)
  }
  return found
}

const forbidden = codePoint =>
  (codePoint < 0x20 && codePoint !== 0x0a && codePoint !== 0x0d && codePoint !== 0x09) ||
  (codePoint >= 0x7f && codePoint <= 0x9f) ||
  codePoint === 0x061c ||
  (codePoint >= 0x200b && codePoint <= 0x200f) ||
  (codePoint >= 0x2028 && codePoint <= 0x202e) ||
  (codePoint >= 0x2060 && codePoint <= 0x2069) ||
  codePoint === 0xfeff

const label = codePoint => `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`

test('no source file contains a raw control, bidi or zero-width character', () => {
  const offences = []
  for (const file of sourceFiles()) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const hits = [...line].map(char => char.codePointAt(0)).filter(forbidden)
        if (hits.length > 0) offences.push(`${relative(root, file)}:${index + 1} ${[...new Set(hits)].map(label).join(' ')}`)
      })
  }
  assert.deepEqual(
    offences,
    [],
    `write these as \\uXXXX escapes instead:\n  ${offences.join('\n  ')}`,
  )
})

test('the guard actually detects what it is looking for', () => {
  const raw = `a${String.fromCodePoint(0x202e)}b`
  assert.equal([...raw].map(c => c.codePointAt(0)).filter(forbidden).length, 1)
  assert.equal([...String.raw`a\u202eb`].map(c => c.codePointAt(0)).filter(forbidden).length, 0)
})

test('the render path is ASCII apart from the glyphs it draws with', () => {
  // A look-alike character in src/ would change what is drawn, so every non-ASCII character
  // there is either one of the renderer's own glyphs or written as an escape.
  const allowed = new Set([...'\u{2502}\u{b7}\u{2588}\u{25ac}\u{25cf}\u{2500}\u{2014}\u{2191}\u{2193}\u{2026}'].map(c => c.codePointAt(0)))
  const offences = []
  for (const file of sourceFiles(join(root, 'src'))) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        for (const char of line) {
          const codePoint = char.codePointAt(0)
          if (codePoint > 0x7e && !allowed.has(codePoint)) offences.push(`${relative(root, file)}:${index + 1} ${label(codePoint)} ${JSON.stringify(char)}`)
        }
      })
  }
  assert.deepEqual(offences, [], offences.join('\n'))
})
