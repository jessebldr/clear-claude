import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LEAF_LIMIT, REPLY_LIMIT, plan } from '../../hooks/lib/answer.mjs'

const replies = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'replies')
const reply = (name) => readFileSync(join(replies, `${name}.md`), 'utf8')
// Everything a plan will put on screen, with the air and the heading markers taken out of the comparison.
const visible = (text) => text.replace(/^#{1,6}[ \t]+/gm, '').replace(/\s+/g, ' ').trim()
const drawn = (parts) => visible(parts.map((p) => (p.kind === 'heading' ? p.title : p.text)).join('\n'))

test('a reply with no heading is left to the engine', () => {
  for (const name of ['factual-stock', 'factual-partner', 'debug-stock', 'debug-partner', 'decision-partner', 'code-stock']) {
    assert.equal(plan(reply(name)), null, name)
  }
  assert.equal(plan('Just a sentence.'), null)
  assert.equal(plan(''), null)
})

test('a structured reply becomes section titles and untouched markdown, in order', () => {
  const parts = plan('Lead.\n\n## Why\n\nBecause.\n\n```js\n## not a heading\n```\n\n### Detail\nTail.\n\n# Title\n\nEnd.')
  assert.deepEqual(parts, [
    { kind: 'markdown', text: 'Lead.' },
    { kind: 'heading', depth: 2, title: 'Why' },
    // A sub-heading is drawn by the engine, as stock draws it: it stays in the markdown.
    { kind: 'markdown', text: 'Because.\n\n```js\n## not a heading\n```\n\n### Detail\nTail.' },
    { kind: 'heading', depth: 1, title: 'Title' },
    { kind: 'markdown', text: 'End.' },
  ])
})

test('a reply whose only headings are sub-headings is left to the engine', () => {
  assert.equal(plan('Lead.\n\n### Detail\n\nBody.\n\n#### Finer\n\nMore.'), null)
})

test('no word of a recorded reply is lost, added or moved', () => {
  const files = readdirSync(replies).filter((name) => name.endsWith('.md'))
  let planned = 0
  for (const name of files) {
    const text = readFileSync(join(replies, name), 'utf8')
    const parts = plan(text)
    if (parts === null) continue
    planned += 1
    assert.equal(drawn(parts), visible(text), name)
    for (const part of parts) if (part.kind === 'markdown') assert.ok(part.text.length <= LEAF_LIMIT, name)
  }
  assert.ok(planned >= 4, 'expected the structured replies to be planned')
})

test('only section titles are taken out, at the depth they were written', () => {
  const text = reply('structured-partner')
  const headings = plan(text).filter((p) => p.kind === 'heading')
  assert.deepEqual(headings.slice(0, 3).map((p) => [p.depth, p.title]), [
    [1, 'B-tree vs hash indexes'],
    [2, 'How a B-tree index works'],
    [2, 'How a hash index works'],
  ])
  assert.ok(headings.every((p) => p.depth <= 2))
  // Every sub-heading of the reply is still there, inside the markdown the engine draws.
  const markdown = plan(text).filter((p) => p.kind === 'markdown').map((p) => p.text).join('\n')
  for (const line of text.split('\n').filter((l) => /^#{3,6} /.test(l))) assert.ok(markdown.includes(line), line)
})

test('a heading whose title holds inline markdown stays with the engine', () => {
  const parts = plan('## Plain\n\nx\n\n## Use `git stash`\n\ny')
  assert.deepEqual(parts, [
    { kind: 'heading', depth: 2, title: 'Plain' },
    { kind: 'markdown', text: 'x\n\n## Use `git stash`\n\ny' },
  ])
  // With no heading left to draw, there is nothing to improve.
  assert.equal(plan('## Use `git stash`\n\ny'), null)
})

test('markdown too long for one leaf is cut at blank lines in column 0, never inside a fence', () => {
  const paragraph = `${'word '.repeat(400).trim()}.`
  const code = ['```text', ...Array.from({ length: 60 }, (_, i) => `line ${i}`), '', 'after a blank line inside the fence', '```'].join('\n')
  const body = [paragraph, paragraph, code, paragraph, paragraph, paragraph, paragraph].join('\n\n')
  assert.ok(body.length > LEAF_LIMIT)
  const parts = plan(`## Long\n\n${body}`)
  assert.ok(parts.length > 2)
  for (const part of parts.slice(1)) {
    assert.ok(part.text.length <= LEAF_LIMIT)
    assert.equal((part.text.match(/^```/gm) ?? []).length % 2, 0, 'a fence was cut in two')
  }
  assert.equal(drawn(parts), visible(`## Long\n\n${body}`))
})

test('an indented fence is not cut either, though a blank line and a column-0 line sit inside it', () => {
  const paragraph = `${'word '.repeat(400).trim()}.`
  const code = ['  ```text', ...Array.from({ length: 40 }, (_, i) => `line ${i}`), '', 'column zero, after a blank line, inside the fence', '  ```'].join('\n')
  const body = [paragraph, paragraph, paragraph, code, paragraph, paragraph, paragraph].join('\n\n')
  assert.ok(body.length > LEAF_LIMIT)
  const parts = plan(`## Long\n\n${body}`)
  for (const part of parts.slice(1)) assert.equal((part.text.match(/^ {0,3}```/gm) ?? []).length % 2, 0, 'a fence was cut in two')
  assert.equal(drawn(parts), visible(`## Long\n\n${body}`))
})

test('what cannot be cut safely goes to the engine whole', () => {
  const hugeCode = `\`\`\`text\n${'x'.repeat(LEAF_LIMIT + 1)}\n\`\`\``
  assert.equal(plan(`## Title\n\n${hugeCode}`), null)
  const oneParagraph = 'y'.repeat(LEAF_LIMIT + 1)
  assert.equal(plan(`## Title\n\n${oneParagraph}`), null)
})

test('a reply over the tree bound goes to the engine whole', () => {
  const big = `## Title\n\n${'paragraph.\n\n'.repeat(REPLY_LIMIT / 10)}`
  assert.ok(big.length > REPLY_LIMIT)
  assert.equal(plan(big), null)
})

test('a reply with carriage returns is left to the engine, not half-understood', () => {
  assert.equal(plan('Lead.\r\n\r\n## Why\r\n\r\nBecause.\r\n'), null)
})

test('a control character would have the surface refuse the tree, so the reply is the engine\'s from the start', () => {
  for (const hostile of ['\x1b[31mred\x1b[0m', 'bell\x07', 'nul\x00', 'c1 \x9b31m', 'vertical\x0btab']) {
    assert.equal(plan(`## Title\n\n${hostile}\n`), null, JSON.stringify(hostile))
  }
  // Tab and newline are the two a leaf may hold.
  assert.notEqual(plan('## Title\n\n\tindented with a tab\n'), null)
})

test('a link reference or a footnote defined in the reply keeps the reply in one render', () => {
  // Cut at "## Sources", the use and the definition would be drawn by two renders and the link lost.
  assert.equal(plan('See [the docs][d].\n\n## Sources\n\n[d]: https://example.com/docs\n'), null)
  assert.equal(plan('A claim.[^1]\n\n## Notes\n\n[^1]: The footnote.\n'), null)
  // Brackets that define nothing are ordinary text.
  assert.notEqual(plan('## Title\n\nAn array `[a]: b` in prose, and [a link](https://example.com).\n'), null)
})

test('raw HTML outside a fence gives the whole reply back: what is inside a block is not markdown', () => {
  // Found in review: stock hides this "## hidden"; cut out as a title it would have been drawn.
  assert.equal(plan('<!--\n## hidden\n-->\n\n## Visible\n\ntext'), null)
  assert.equal(plan('## Visible\n\n<details>\n<summary>More</summary>\n\n## Inside\n\n</details>'), null)
  assert.equal(plan('## Title\n\n  <div align="center">\n\ntext'), null)
  // HTML shown as code is code, and a tag in the middle of a line opens no block.
  assert.notEqual(plan('## Title\n\n```html\n<!--\n## in a sample\n-->\n```\n\ntext'), null)
  assert.notEqual(plan('## Title\n\nPress <kbd>ctrl</kbd>+<kbd>o</kbd>, or compare a < b.'), null)
})

test('a "title" longer than a row of words is left in the markdown', () => {
  const long = 'word '.repeat(40).trim()
  assert.equal(plan(`## ${long}\n\nbody`), null)
  assert.deepEqual(plan(`## Short\n\n## ${long}\n\nbody`), [
    { kind: 'heading', depth: 2, title: 'Short' },
    { kind: 'markdown', text: `## ${long}\n\nbody` },
  ])
})

test('anything that is not a string is left alone', () => {
  for (const value of [undefined, null, 42, {}, []]) assert.equal(plan(value), null)
})

test('blank lines at the edges of a run are layout, not content', () => {
  const parts = plan('\n\n## A\n\n\n\nbody\n\n\n## B\n')
  assert.deepEqual(parts, [
    { kind: 'heading', depth: 2, title: 'A' },
    { kind: 'markdown', text: 'body' },
    { kind: 'heading', depth: 2, title: 'B' },
  ])
})
