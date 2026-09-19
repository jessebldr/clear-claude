import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { blocks, isBlank, isPlainTitle } from '../../hooks/lib/blocks.mjs'

const replies = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'replies')
const kinds = (text) => blocks(text).map((b) => b.kind)
const rejoin = (text) => blocks(text).map((b) => b.raw).join('\n')

test('cuts headings and fenced code out of prose, in order', () => {
  const text = ['Lead sentence.', '', '## Why', '', 'Because.', '', '```js', 'const a = 1', '```', '', 'Tail.'].join('\n')
  assert.deepEqual(kinds(text), ['prose', 'heading', 'prose', 'code', 'prose'])
  const [, heading, , code] = blocks(text)
  assert.deepEqual({ depth: heading.depth, title: heading.title }, { depth: 2, title: 'Why' })
  assert.deepEqual({ language: code.language, source: code.source }, { language: 'js', source: 'const a = 1' })
})

test('never drops, adds or moves a character', () => {
  const samples = [
    '',
    '\n',
    'one line',
    '# H\n',
    '```\nopen and never closed\n## not a heading here',
    'a\n\n\n\nb',
    '~~~text\n```\nstill code\n```\n~~~\nafter',
    '````md\n```js\ninner\n```\n````',
    'trailing space heading\n## Title ##   \nx',
    'line\r\nwith\r\ncarriage returns\r\n## H\r\n',
  ]
  for (const sample of samples) assert.equal(rejoin(sample), sample)
})

test('every recorded reply survives the cut byte for byte', () => {
  const files = readdirSync(replies).filter((name) => name.endsWith('.md'))
  assert.ok(files.length >= 6, 'the recorded replies are missing')
  for (const name of files) {
    const text = readFileSync(join(replies, name), 'utf8')
    assert.equal(rejoin(text), text, name)
  }
})

test('a fence that never closes stays prose, and so does everything after it', () => {
  const text = 'Before.\n\n```bash\nnpm test\n\n## Looks like a heading'
  assert.deepEqual(kinds(text), ['prose'])
})

test('a longer fence holds a shorter one, and a tilde fence holds backticks', () => {
  assert.deepEqual(kinds('````md\n```js\nx\n```\n````'), ['code'])
  assert.equal(blocks('````md\n```js\nx\n```\n````')[0].source, '```js\nx\n```')
  assert.deepEqual(kinds('~~~\n```\n~~~'), ['code'])
  // A shorter run of the same character does not close it.
  assert.deepEqual(kinds('````\n```\nstill open'), ['prose'])
})

test('a closing fence may be indented and may trail spaces, but not words', () => {
  assert.deepEqual(kinds('```\nx\n   ```  '), ['code'])
  assert.deepEqual(kinds('```\nx\n``` not a close'), ['prose'])
})

test('a backtick fence whose info string holds a backtick is not a fence', () => {
  assert.deepEqual(kinds('``` `js`\nx\n```'), ['prose'])
})

test('indented fences and headings are left where they are', () => {
  const list = '- step one\n\n  ```bash\n  npm ci\n  ```\n\n- step two\n  ## not lifted'
  assert.deepEqual(kinds(list), ['prose'])
  assert.deepEqual(kinds('> ## quoted heading\n> ```\n> quoted code\n> ```'), ['prose'])
})

test('what is not an ATX heading stays prose', () => {
  for (const line of ['#hashtag', '#', '## ', '####### seven', 'Setext\n======', '\\## escaped']) {
    assert.deepEqual(kinds(line), ['prose'], line)
  }
})

test('a heading inside a fence is code', () => {
  const [code] = blocks('```md\n## Title\n```')
  assert.equal(code.kind, 'code')
  assert.equal(code.source, '## Title')
})

test('the language is the first word of the info string', () => {
  assert.equal(blocks('```ts title="a.ts"\nx\n```')[0].language, 'ts')
  assert.equal(blocks('```\nx\n```')[0].language, '')
})

test('an empty fenced block is code with an empty source', () => {
  const [code] = blocks('```\n```')
  assert.deepEqual({ kind: code.kind, source: code.source }, { kind: 'code', source: '' })
})

test('closing hashes and trailing spaces are not part of a title', () => {
  assert.equal(blocks('## Title ##  ')[0].title, 'Title')
  assert.equal(blocks('### C# and F#')[0].title, 'C# and F#')
})

test('a plain title has no character inline markdown reads', () => {
  for (const title of ['Why it works', 'Step 1: install', 'Trade-offs (short)', 'Kết luận', 'C# and F#']) {
    assert.equal(isPlainTitle(title), true, title)
  }
  for (const title of ['Use `git stash`', '**Bold**', 'a_b', '[link](x)', 'a <b>', 'AT&T', 'https://x.y', 'a \\ b', '~~gone~~']) {
    assert.equal(isPlainTitle(title), false, title)
  }
})

test('blank prose is recognised as blank', () => {
  assert.equal(isBlank({ kind: 'prose', raw: ' \n\t' }), true)
  assert.equal(isBlank({ kind: 'prose', raw: 'x' }), false)
  assert.equal(isBlank({ kind: 'code', raw: '' }), false)
})
