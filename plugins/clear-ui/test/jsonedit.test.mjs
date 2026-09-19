import test from 'node:test'
import assert from 'node:assert/strict'
import { locateKey, removeKey, setKey } from '../src/jsonedit.mjs'

const SL = { type: 'command', command: 'node "x"' }

test('locateKey finds a top-level key and ignores nested ones', () => {
  const text = '{\n  "a": { "statusLine": 1 },\n  "statusLine": 2\n}'
  const at = locateKey(text, 'statusLine')
  assert.equal(text.slice(at.start, at.end), '"statusLine": 2')
})

test('locateKey returns null for an absent key, a non-object, or broken text', () => {
  assert.equal(locateKey('{"a": 1}', 'statusLine'), null)
  assert.equal(locateKey('[1,2]', 'statusLine'), null)
  assert.equal(locateKey('', 'statusLine'), null)
})

test('locateKey steps over strings that contain braces and escaped quotes', () => {
  const text = '{\n  "a": "}{ \\" statusLine",\n  "statusLine": 3\n}'
  const at = locateKey(text, 'statusLine')
  assert.equal(text.slice(at.start, at.end), '"statusLine": 3')
})

test('setKey replaces a value in place and leaves every other byte alone', () => {
  const text = '{\n  "model": "opus",\n  "statusLine": { "type": "command", "command": "old" },\n  "theme": "dark"\n}\n'
  const next = setKey(text, 'statusLine', SL)
  assert.equal(JSON.parse(next).statusLine.command, 'node "x"')
  assert.ok(next.startsWith('{\n  "model": "opus",\n'))
  assert.ok(next.endsWith(',\n  "theme": "dark"\n}\n'))
})

test('setKey inserts as the first key of a non-empty object', () => {
  const next = setKey('{\n  "model": "opus"\n}\n', 'statusLine', SL)
  assert.match(next, /^\{\n {2}"statusLine": \{/)
  assert.equal(JSON.parse(next).model, 'opus')
})

test('setKey handles an empty object and unusual formatting', () => {
  assert.deepEqual(JSON.parse(setKey('{}', 'statusLine', SL)).statusLine, SL)
  assert.deepEqual(JSON.parse(setKey('{ }', 'statusLine', SL)).statusLine, SL)
  const tight = setKey('{"a":1,"b":2}', 'statusLine', SL)
  assert.deepEqual(JSON.parse(tight), { statusLine: SL, a: 1, b: 2 })
})

test('setKey writes a nested object indented to its position', () => {
  const next = setKey('{\n  "a": 1\n}\n', 'statusLine', SL)
  assert.ok(next.includes('\n    "type": "command"'), next)
})

const ROUND_TRIP = [
  '{}',
  '{\n  "model": "opus"\n}\n',
  '{\n  "model": "opus",\n  "theme": "dark"\n}\n',
  '{"a":1,"b":2}',
  '{\n  "nested": { "deep": { "x": [1, 2, 3] } }\n}\n',
  '{\n  "weird": "a } b , c",\n  "n": 1.5e3,\n  "t": true,\n  "z": null\n}\n',
]

test('adding then removing the key restores the original text byte for byte', () => {
  for (const original of ROUND_TRIP) {
    const restored = removeKey(setKey(original, 'statusLine', SL), 'statusLine')
    assert.equal(restored, original, JSON.stringify(original))
  }
})

test('removing a key that was already there leaves valid JSON without it', () => {
  for (const text of [
    '{\n  "statusLine": 1,\n  "a": 2\n}\n',
    '{\n  "a": 2,\n  "statusLine": 1\n}\n',
    '{\n  "statusLine": 1\n}\n',
    '{"statusLine":1,"a":2}',
    '{"a":2,"statusLine":1}',
  ]) {
    const next = removeKey(text, 'statusLine')
    const parsed = JSON.parse(next)
    assert.equal('statusLine' in parsed, false, next)
    assert.doesNotMatch(next, /,\s*[}\]]/, `trailing comma in ${JSON.stringify(next)}`)
  }
})

test('removeKey is a no-op when the key is absent', () => {
  assert.equal(removeKey('{\n  "a": 1\n}\n', 'statusLine'), '{\n  "a": 1\n}\n')
})
