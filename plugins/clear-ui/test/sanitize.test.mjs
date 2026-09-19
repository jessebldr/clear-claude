import test from 'node:test'
import assert from 'node:assert/strict'
import { displayWidth, sanitize, truncate } from '../src/sanitize.mjs'

const ESC = '\x1b'
const BEL = '\x07'

test('plain text passes through unchanged', () => {
  assert.equal(sanitize('feature/login-form_v2'), 'feature/login-form_v2')
})

test('non-strings become the empty string', () => {
  for (const value of [undefined, null, 42, {}, [], true]) assert.equal(sanitize(value), '')
})

test('CSI sequences are removed, including an unterminated one', () => {
  assert.equal(sanitize(`${ESC}[31mred${ESC}[0m`), 'red')
  assert.equal(sanitize(`${ESC}[2J${ESC}[Hclear`), 'clear')
  assert.equal(sanitize(`tail${ESC}[`), 'tail')
})

test('OSC sequences are removed whole, with either terminator', () => {
  assert.equal(sanitize(`${ESC}]0;window title${BEL}name`), 'name')
  assert.equal(sanitize(`${ESC}]8;;https://evil.example${ESC}\\link${ESC}]8;;${ESC}\\`), 'link')
})

test('an unterminated OSC swallows the rest rather than leaking its payload', () => {
  assert.equal(sanitize(`safe${ESC}]0;never closed`), 'safe')
})

test('8-bit C1 CSI and OSC are removed with their payload', () => {
  assert.equal(sanitize('a\x9b2Jb'), 'ab')
  assert.equal(sanitize('a\x9d0;title\x9cb'), 'ab')
})

test('C0, DEL and C1 characters become single spaces', () => {
  assert.equal(sanitize('one\r\ntwo\tthree\x00four\x7ffive\x85six'), 'one two three four five six')
})

test('bidi overrides, isolates and invisible separators are removed', () => {
  assert.equal(sanitize('ab\u202ecd\u202c'), 'ab cd')
  assert.equal(sanitize('\u2066x\u2069\u200by\ufeff'), 'x y')
  assert.equal(sanitize('line\u2028sep\u2029end'), 'line sep end')
})

test('whitespace is collapsed and trimmed', () => {
  assert.equal(sanitize('   a    b   '), 'a b')
})

test('output is capped by display width, not by code units', () => {
  assert.equal(sanitize('abcdefghij', 5), 'abcd…')
  assert.equal(sanitize('日本語日本語', 7), '日本語…')
  assert.equal(displayWidth(sanitize('日本語日本語', 7)), 7)
  assert.equal(sanitize('abcdefghij', 6, '...'), 'abc...')
})

test('displayWidth: ASCII 1, CJK 2, emoji 2, combining marks 0', () => {
  assert.equal(displayWidth('abc'), 3)
  assert.equal(displayWidth('日本'), 4)
  assert.equal(displayWidth('🚀'), 2)
  assert.equal(displayWidth('e\u{301}'), 1)
  assert.equal(displayWidth('👨\u200d👩\u200d👧'), 2)
})

test('truncate never splits a grapheme and handles tiny budgets', () => {
  assert.equal(truncate('👨\u200d👩\u200d👧👨\u200d👩\u200d👧👨\u200d👩\u200d👧', 3), '👨\u200d👩\u200d👧…')
  assert.equal(truncate('abc', 0), '')
  assert.equal(truncate('abc', 1), '…')
  assert.equal(truncate('abc', 3), 'abc')
})

test('very long input is bounded before any work is done', () => {
  const result = sanitize(`${ESC}[31m`.repeat(100000) + 'x', 10)
  assert.ok(displayWidth(result) <= 10)
})

test('private-use characters are removed: a name cannot draw an icon, or fake the end of a chip', () => {
  const pua = [0xe0b6, 0xe0b4, 0xf101, 0xf0000].map(cp => String.fromCodePoint(cp))
  assert.equal(sanitize(`${pua[0]}main${pua[1]}`), 'main')
  assert.equal(sanitize(`fea${pua[2]}ture${pua[3]}`), 'feature')
})
