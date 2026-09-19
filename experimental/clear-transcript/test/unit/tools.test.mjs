import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cells, clean, clip, groupPlan } from '../../hooks/lib/tools.mjs'

const call = (tool, input, extra = {}) => ({ tool_use_id: `toolu_${tool}`, tool, input, isRunning: false, isErrored: false, isInterrupted: false, output: undefined, ...extra })
const group = (calls, extra = {}) => ({ calls, isActive: false, isExpanded: false, ...extra })
const read = (path) => call('Read', { file_path: path })
const bash = (command, extra) => call('Bash', { command, description: 'ignored' }, extra)

// The group recorded from a real session on 2.1.278 (shapes only): three reads, then two shell commands that
// failed. Stock folds it into "Read 3 files, ran 2 shell commands".
const RECORDED = group([
  read('C:\\work\\src\\sum.mjs'),
  read('C:\\work\\src\\format.mjs'),
  read('C:\\work\\src\\parse.mjs'),
  bash('node --test', { isErrored: true, output: 'Exit code 1\nnot ok 2 - adds negative numbers too' }),
  bash('node missing-file.js', { isErrored: true, output: 'Exit code 1\nError: Cannot find module' }),
])

test('a settled group names its targets and gives each failure a line', () => {
  assert.deepEqual(groupPlan(RECORDED, 120), {
    summary: 'Read sum.mjs, format.mjs, parse.mjs',
    failures: [
      { label: 'failed', target: 'node --test', reason: 'Exit code 1' },
      { label: 'failed', target: 'node missing-file.js', reason: 'Exit code 1' },
    ],
  })
})

test('a passing command is named, not counted', () => {
  const plan = groupPlan(group([bash('node --test')]), 100)
  assert.deepEqual(plan, { summary: 'Ran node --test', failures: [] })
})

test('the engine keeps the row while the group is live, running or expanded', () => {
  assert.equal(groupPlan({ ...RECORDED, isActive: true }, 120), null)
  assert.equal(groupPlan({ ...RECORDED, isExpanded: true }, 120), null)
  assert.equal(groupPlan(group([read('a.md'), bash('npm test', { isRunning: true })]), 120), null)
})

test('settled means the engine said so: a flag that is missing or not a boolean is doubt', () => {
  const { isActive, isExpanded, ...flagless } = RECORDED
  assert.equal(groupPlan(flagless, 120), null)
  assert.equal(groupPlan({ ...RECORDED, isActive: undefined }, 120), null)
  assert.equal(groupPlan({ ...RECORDED, isExpanded: 0 }, 120), null)
  const { isRunning, ...callWithoutFlag } = read('a.md')
  assert.equal(groupPlan(group([callWithoutFlag]), 120), null)
  assert.equal(groupPlan(group([{ ...read('a.md'), isRunning: 'no' }]), 120), null)
})

test('anything that is not a group of calls is left alone', () => {
  for (const props of [null, undefined, {}, { calls: [] }, { calls: 'x' }, group([null])]) {
    assert.equal(groupPlan(props, 120), null)
  }
  for (const columns of [undefined, null, '120', 20, 0, -80, NaN, Infinity, -Infinity]) {
    assert.equal(groupPlan(RECORDED, columns), null, String(columns))
  }
  assert.notEqual(groupPlan(RECORDED, 120.5), null)
})

test('props that throw when they are read give the row to the engine, not an exception', () => {
  const throwing = { get input() { throw new Error('boom') } }
  assert.equal(groupPlan(group([{ ...read('a.md'), ...{} }, Object.defineProperties({ tool: 'Read', isRunning: false, isErrored: false, isInterrupted: false }, Object.getOwnPropertyDescriptors(throwing))]), 120), null)
  const proxy = new Proxy({}, { get() { throw new Error('boom') } })
  assert.equal(groupPlan(proxy, 120), null)
  assert.equal(groupPlan(group([bash('make', { isErrored: true, output: new Proxy({}, { get() { throw new Error('boom') } }) })]), 120), null)
})

test('kinds are phrased in the order they first ran, the same kind merged only while adjacent', () => {
  const plan = groupPlan(group([
    read('a.md'),
    call('Grep', { pattern: 'TODO' }),
    call('Glob', { pattern: '**/*.ts' }),
    read('b.md'),
  ]), 140)
  assert.equal(plan.summary, 'Read a.md · searched "TODO", "**/*.ts" · read b.md')
})

test('a target used more than once is named once, with how often', () => {
  assert.equal(groupPlan(group([read('src/a.md'), read('src/a.md'), read('lib/b.md')]), 100).summary, 'Read a.md (2x), b.md')
  // Three runs of one command are three runs, and say so.
  assert.equal(groupPlan(group([bash('npm test'), bash('npm test'), bash('npm test')]), 100).summary, 'Ran npm test (3x)')
})

// Every call of a group is on the row exactly once: named, inside an "(Nx)", or inside a "+N more".
function accountedFor(summary) {
  if (summary === '') return 0
  let calls = 0
  for (const part of summary.split(' · ')) {
    const counted = /^\+(\d+) more$/.exec(part) ?? /^\S+(?: \S+)*? (\d+) calls?$/.exec(part)
    if (counted !== null) {
      calls += Number(counted[1])
      continue
    }
    const tail = / \+(\d+) more$/.exec(part)
    const names = (tail === null ? part : part.slice(0, tail.index)).replace(/^(?:read|searched the web for|searched|listed|ran|fetched|called) /i, '').split(', ')
    calls += names.reduce((sum, name) => sum + Number(/ \((\d+)x\)$/.exec(name)?.[1] ?? 1), 0) + Number(tail?.[1] ?? 0)
  }
  return calls
}

test('found in review: many kinds in turn never outgrow the row, and no call drops out of the count', () => {
  const alternating = group([0, 1, 2].flatMap((i) => [read(`src/some-rather-long-module-name-${i}.ts`), call('Grep', { pattern: `a fairly long search pattern number ${i}` })]))
  for (const columns of [40, 60, 80, 142, 250]) {
    const { summary } = groupPlan(alternating, columns)
    assert.ok(4 + cells(summary) <= columns, `${columns}: ${4 + cells(summary)} cells: ${summary}`)
    assert.equal(accountedFor(summary), 6, summary)
  }
  assert.equal(groupPlan(alternating, 60).summary, 'Read some-rather-l… · searched "a fairly long… · +4 more')
})

test('no width from 40 to 260 columns and no mix of calls makes a row wider than the terminal', () => {
  const tools = ['Read', 'Grep', 'Bash', 'WebFetch', 'mcp__x__y']
  for (let n = 0; n < 3000; n += 1) {
    const calls = Array.from({ length: 1 + (n % 9) }, (_, j) => {
      const tool = tools[(n * 7 + j * 3) % 5]
      const name = `${'n'.repeat(1 + ((n * 13 + j * 17) % 90))}${j % 3}`
      return call(tool, { file_path: `d/${name}`, pattern: name, command: name, url: `https://${name}.example` })
    })
    const columns = 40 + ((n * 11) % 221)
    const { summary } = groupPlan(group(calls), columns)
    assert.ok(4 + cells(summary) <= columns, `${columns}: ${summary}`)
    assert.equal(accountedFor(summary), calls.length, `${columns}: ${summary}`)
  }
})

test('what does not fit is counted as "more", never in place of every name', () => {
  const many = group(Array.from({ length: 14 }, (_, i) => read(`src/module-number-${i}.ts`)))
  const { summary } = groupPlan(many, 80)
  assert.match(summary, /^Read module-number-0\.ts, .* \+\d+ more$/)
  assert.ok(cells(summary) <= 80, summary)
  const shown = summary.split(', ').length
  assert.equal(Number(/\+(\d+) more/.exec(summary)[1]), 14 - shown)
})

test('a multi-line command is named by its first line', () => {
  assert.equal(groupPlan(group([bash('cd /tmp &&\n  npm test')]), 100).summary, 'Ran cd /tmp &&')
})

test('an interrupted call is named as one, and is not called a failure', () => {
  const plan = groupPlan(group([bash('sleep 600', { isInterrupted: true, output: 'Interrupted by user' })]), 100)
  assert.deepEqual(plan, { summary: '', failures: [{ label: 'interrupted', target: 'sleep 600', reason: 'Interrupted by user' }] })
})

test('a failure with a structured result reads its stderr', () => {
  const plan = groupPlan(group([bash('make', { isErrored: true, output: { stdout: '', stderr: '\nmake: *** No targets.\n' } })]), 100)
  assert.equal(plan.failures[0].reason, 'make: *** No targets.')
})

test('the "Error:" the engine puts in front of a reason is not repeated after "failed"', () => {
  const plan = groupPlan(group([bash('node --test', { isErrored: true, output: 'Error: Exit code 1\nnot ok 2' })]), 100)
  assert.equal(plan.failures[0].reason, 'Exit code 1')
})

test('an unknown tool is named by itself', () => {
  const plan = groupPlan(group([call('mcp__github__get_issue', { number: 7 }), call('WebFetch', { url: 'https://example.com/a/b?c=1' })]), 120)
  assert.equal(plan.summary, 'Called github get_issue · fetched example.com')
})

test('a call with no usable input is still accounted for', () => {
  assert.equal(groupPlan(group([call('Read', null), call('Read', {})]), 100).summary, 'Read 2 calls')
  assert.equal(groupPlan(group([call('Bash', {}, { isErrored: true, output: 'Exit code 2' })]), 100).failures[0].target, 'Bash')
})

test('text a model or a tool wrote is cleaned before it is drawn', () => {
  const hostile = 'ok\x1b[31m red \x1b]8;;https://evil.example\x07link\x1b]8;;\x07 \u202egnp.exe\x00\r\nnext'
  assert.equal(clean(hostile), 'ok red link gnp.exe next')
  const plan = groupPlan(group([bash(`echo ${hostile}`, { isErrored: true, output: `\x1b[2JExit code 1` })]), 120)
  assert.equal(plan.failures[0].target, 'echo ok red link gnp.exe')
  assert.equal(plan.failures[0].reason, 'Exit code 1')
  for (const value of [plan.failures[0].target, plan.failures[0].reason]) assert.doesNotMatch(value, /[\x00-\x1f\x7f-\x9f\u202e]/)
})

test('an escape sequence goes whole: its parameters do not stay behind as text', () => {
  const cases = [
    ['a\x1b[31mred\x1b[0mb', 'aredb', 'CSI, 7-bit'],
    ['a\x9b31mred\x9b0mb', 'aredb', 'CSI, 8-bit (found in review: "31m" stayed)'],
    ['a\x1b(0qq\x1b(Bb', 'aqqb', 'charset selection (found in review: "(0" stayed)'],
    ['a\x1b]8;;https://evil.example\x07link\x1b]8;;\x07b', 'alinkb', 'OSC 8 hyperlink, BEL-terminated'],
    ['a\x1b]0;title\x1b\\b', 'ab', 'OSC, ST-terminated'],
    ['a\x9d0;title\x9cb', 'ab', 'OSC, 8-bit'],
    ['a\x1bPpayload\x1b\\b', 'ab', 'DCS'],
    ['a\x90payload\x9cb', 'ab', 'DCS, 8-bit'],
    ['a\x1b_apc\x1b\\b', 'ab', 'APC'],
    ['a\x1b#8b', 'ab', 'ESC with an intermediate'],
    ['a\x1bcb', 'ab', 'ESC with a final only (RIS)'],
    ['a\x1b', 'a', 'a lone ESC at the end'],
    // Unterminated: the rest is the sequence's payload, as it would be for a terminal, and goes with it.
    ['keep\x1b]0;never closed', 'keep', 'OSC, unterminated'],
    ['keep\x1bPnever closed', 'keep', 'DCS, unterminated'],
  ]
  for (const [hostile, expected, name] of cases) {
    assert.equal(clean(hostile), expected, name)
    assert.doesNotMatch(clean(hostile), /[\x00-\x1f\x7f-\x9f]/, name)
  }
})

test('only the head of a huge command or error text is ever read', () => {
  const huge = `node run.js ${'x'.repeat(5_000_000)}`
  const started = performance.now()
  const plan = groupPlan(group([bash(huge), bash('make', { isErrored: true, output: `Exit code 2\n${'y'.repeat(5_000_000)}` })]), 120)
  assert.ok(performance.now() - started < 500, 'a row must not cost more than the blink of an eye')
  assert.match(plan.summary, /^Ran node run\.js x+…$/)
  assert.equal(plan.failures[0].reason, 'Exit code 2')
})

test('inputs of the wrong shape are named as calls, never thrown on', () => {
  const odd = group([call('Read', 7), call('Bash', ['ls']), call('Grep', { pattern: 42 }), call(undefined, {}), call('Bash', { command: { toString: 1 } })])
  assert.equal(groupPlan(odd, 120).summary, 'Read 1 call · ran 1 call · searched 1 call · called 1 call · ran 1 call')
})

test('long targets and reasons are clipped to a width, by cells', () => {
  assert.equal(clip('abcdef', 6), 'abcdef')
  assert.equal(clip('abcdefg', 6), 'abcde…')
  assert.equal(cells('日本語'), 6)
  assert.ok(cells(clip('日本語日本語日本語', 8)) <= 8)
})

// What a row costs on screen: the two-cell gutter on either side, then the text.
const rowCells = (failure) => 4 + cells(`${failure.label}  ${failure.target}${failure.reason === '' ? '' : ` · ${failure.reason}`}`)

test('a failure row never outgrows the terminal, and drops its reason before its command', () => {
  const long = bash(`node ${'x'.repeat(200)}`, { isErrored: true, output: `Exit code 1 ${'y'.repeat(200)}` })
  for (const columns of [40, 60, 80, 120, 200]) {
    const [failure] = groupPlan(group([long]), columns).failures
    assert.ok(rowCells(failure) <= columns, `${columns}: ${rowCells(failure)}`)
    assert.ok(failure.target.startsWith('node xxx'), `${columns}: the command is what stays`)
  }
  assert.equal(groupPlan(group([long]), 40).failures[0].reason, '')
  assert.notEqual(groupPlan(group([long]), 200).failures[0].reason, '')
})

test('the row is shared in order: a short first kind leaves its room to the next', () => {
  // Recorded on 2.1.278: the model piped its test runs, so the commands were long and none was flagged.
  const recorded = group([
    read('src/sum.mjs'), read('src/format.mjs'), read('src/parse.mjs'),
    bash('node --test 2>&1 | tail -40'),
    bash('node missing-file.js 2>&1 | tail -5; echo "exit=$?"'),
  ])
  // Both commands are named; the second is over the 48 cells a name among others may take, so it is clipped.
  assert.equal(groupPlan(recorded, 142).summary, 'Read sum.mjs, format.mjs, parse.mjs · ran node --test 2>&1 | tail -40, node missing-file.js 2>&1 | tail -5; echo "exit…')
  // The line fits the row at every width. Narrower, names give way to "+N more", and a kind the row cannot
  // hold at all is counted at the end: five calls are five calls at any width.
  for (const columns of [40, 60, 80, 100, 142]) assert.ok(4 + cells(groupPlan(recorded, columns).summary) <= columns, `${columns}: ${groupPlan(recorded, columns).summary}`)
  assert.equal(groupPlan(recorded, 60).summary, 'Read sum.mjs +2 more · ran node --test 2>&1 | t… +1 more')
  assert.equal(groupPlan(recorded, 40).summary, 'Read sum.mjs +2 more · +2 more')
})

test('a name alone in its phrase may use the row; among others it is held back', () => {
  const command = `node --test 2>&1 | grep -E "^. (tests|pass|fail|cancelled|skipped|todo)" | sort`
  assert.equal(groupPlan(group([bash(command)]), 142).summary, `Ran ${command}`)
  assert.ok(cells(groupPlan(group([bash(command)]), 60).summary) <= 56)
  const two = groupPlan(group([bash(command), bash('npm ci')]), 200).summary
  assert.match(two, /…, npm ci$/)
})
