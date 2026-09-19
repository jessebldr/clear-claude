// Runs the real entry point in a fresh process. The contract under test: exit 0, empty
// stderr, and no output at all when the input is anything but a statusline payload.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('../bin/statusline.mjs', import.meta.url))
// Fixture reset times are written relative to 2026-09-19 04:10 UTC, the moment the golden renders
// pass as `now`. The entry uses the real clock, so they are moved to the same distance from the
// real now -- otherwise every test that expects a quota starts failing the minute the fixture's
// window "resets", which is how this was found, two hours and ten minutes after it was written.
const FIXTURE_NOW_SECONDS = Date.UTC(2026, 8, 19, 4, 10) / 1000
const fixture = name => {
  const payload = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
  // Half a minute past, so a countdown reads the same in two runs a few seconds apart.
  const shift = Math.round(Date.now() / 1000) - FIXTURE_NOW_SECONDS + 30
  for (const window of Object.values(payload.rate_limits ?? {})) {
    if (Number.isFinite(window?.resets_at)) window.resets_at += shift
  }
  return JSON.stringify(payload)
}

function run({ input, env = {}, closeStdin = true }) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    // A clean environment: the host's COLUMNS, NO_COLOR or TERM must not leak into a test.
    const base = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TZ: 'UTC' }
    const child = spawn(process.execPath, [entry], { env: { ...base, ...env }, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => (stdout += chunk))
    child.stderr.on('data', chunk => (stderr += chunk))
    child.stdin.on('error', () => {})
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr, ms: Date.now() - started }))
    if (input !== undefined) child.stdin.write(input)
    if (closeStdin) child.stdin.end()
  })
}

// TERM=dumb is the only setting that removes every escape, so it is what the tests comparing
// plain text use. NO_COLOR removes the hues but keeps dim, and has a test of its own.
const PLAIN = { TERM: 'dumb' }

const silent = result => {
  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, '')
}

test('a valid payload prints two lines and exits 0 with an empty stderr', async () => {
  const result = await run({ input: fixture('idle'), env: { COLUMNS: '60', ...PLAIN } })
  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  const lines = result.stdout.split('\n')
  assert.equal(lines.length, 3)
  assert.equal(lines[0], 'Fable 5.1  high  │  clear-claude')
  assert.match(lines[1], /^ctx 31% █+─+  │  5h 9%/)
  assert.equal(lines[2], '')
})

test('COLUMNS decides the layout; a wide terminal gets the single-row bar', async () => {
  const wide = await run({ input: fixture('idle'), env: { COLUMNS: '120', ...PLAIN } })
  const rows = wide.stdout.split('\n').filter(Boolean)
  assert.equal(rows.length, 1, 'a 120-column terminal should get one full-width row')
  assert.match(rows[0], /^Fable 5\.1 .* {3,}ctx 31% █+─+ /)
  assert.ok(rows[0].length >= 114 && rows[0].length <= 116, `row is ${rows[0].length} cells`)
})

// Without a declared width nothing may be padded -- padding to a guessed width is how a bar
// becomes two wrapped rows -- but the rows must still be bounded, or a long name runs past the
// screen. Both halves of that were wrong before a review pointed at them.
test('an absent or unusable COLUMNS stacks the rows and pads nothing', async () => {
  for (const columns of [undefined, 'abc', '0', '-3']) {
    const env = columns === undefined ? { ...PLAIN } : { COLUMNS: columns, ...PLAIN }
    const result = await run({ input: fixture('idle'), env })
    const rows = result.stdout.split('\n').filter(Boolean)
    assert.equal(rows.length, 2, String(columns))
    for (const row of rows) {
      assert.doesNotMatch(row, / {3,}\S/, `${columns}: looks padded: ${row}`)
      assert.ok(row.length <= 76, `${columns}: ${row.length} cells is past the assumed width`)
    }
  }
})

// These run against the wall clock, so they use fixtures whose state does not depend on it:
// `warning` carries a context at 84% and `critical` one at 96%. A rate-limit window would be
// hidden here once its reset moment passed, which is correct and makes it a poor assertion.
test('colour is on by default, and the three levels are all present', async () => {
  const warn = (await run({ input: fixture('warning'), env: { COLUMNS: '120', CLEAR_UI_LOOK: 'text' } })).stdout
  assert.match(warn, /\x1b\[1;33m84%!/, 'a warning value should be bold yellow')
  assert.match(warn, /\x1b\[1mFable 5\.1/, 'the model should be bold; brightness needs a known theme')
  // Faint is for structure. Measured in a real session it is 2.6:1 against the background, so a
  // word in it -- a label, a reset time -- is a word nobody can read.
  assert.match(warn, /\x1b\[2m  │  \x1b\[0m/, 'the rule between groups is faint')
  for (const [, faint] of warn.matchAll(/\x1b\[2m([^\x1b]*)\x1b\[0m/g)) assert.doesNotMatch(faint, /[A-Za-z0-9]/, `faint text: ${JSON.stringify(faint)}`)
  // One glyph for the fill and the groove: a bar of one height, told apart by hue and weight.
  assert.match(warn, /\x1b\[33m▬{8}\x1b\[0m\x1b\[2m▬{2}\x1b\[0m/)

  const crit = (await run({ input: fixture('critical'), env: { COLUMNS: '120', CLEAR_UI_LOOK: 'text' } })).stdout
  assert.match(crit, /\x1b\[1;31m96%!!/, 'a critical value should be bold red')
})

// https://no-color.org FAQ: "Should the presence of NO_COLOR disable other styling such as
// bold, underline, and italic? No." Dropping dim too would flatten the whole hierarchy, which
// is the thing that makes the line readable in the first place.
test('NO_COLOR removes the hues and keeps dim; TERM=dumb removes every escape', async () => {
  const noColor = (await run({ input: fixture('critical'), env: { COLUMNS: '120', NO_COLOR: '1' } })).stdout
  assert.doesNotMatch(noColor, /\x1b\[[0-9;]*3[13]m/, 'no hue under NO_COLOR')
  assert.match(noColor, /\x1b\[2m/, 'dim survives NO_COLOR')
  assert.match(noColor, /\x1b\[1m/, 'bold survives NO_COLOR')
  // Severity is still legible with no colour at all, because it is also text.
  assert.match(noColor, /96%!!/)

  const dumb = (await run({ input: fixture('critical'), env: { COLUMNS: '120', ...PLAIN } })).stdout
  assert.doesNotMatch(dumb, /\x1b/, 'a dumb terminal gets no escapes at all')
  assert.match(dumb, /96%!!/)
})

test('CLEAR_UI_CHARSET=ascii selects the ASCII glyphs', async () => {
  const ascii = (await run({ input: fixture('idle'), env: { COLUMNS: '120', CLEAR_UI_CHARSET: 'ascii', ...PLAIN } })).stdout
  assert.match(ascii, /ctx 31% ###-------  \|  5h 9%/)
  assert.doesNotMatch(ascii, /[^\x00-\x7f]/, 'the ASCII charset must emit no non-ASCII byte')
  const unicode = (await run({ input: fixture('idle'), env: { COLUMNS: '120', ...PLAIN } })).stdout
  assert.match(unicode, /│/)
})

test('a payload is rendered as soon as it is complete, even if stdin never closes', async () => {
  const result = await run({ input: fixture('idle'), env: { COLUMNS: '60', ...PLAIN }, closeStdin: false })
  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  assert.match(result.stdout, /^Fable 5\.1/)
  assert.ok(result.ms < 3000, `took ${result.ms} ms`)
})

test('a hostile payload never puts an escape or control character on stdout', async () => {
  const result = await run({ input: fixture('hostile'), env: { COLUMNS: '120', ...PLAIN } })
  assert.equal(result.code, 0)
  assert.doesNotMatch(result.stdout, /[\x00-\x09\x0b-\x1f\x7f-\x9f\u202e\u2066]/)
  const rows = result.stdout.split('\n').filter(Boolean)
  assert.ok(rows.length >= 1 && rows.length <= 2, `expected one or two rows, got ${rows.length}`)
})

// Found by deleting one file from a real installed copy: a static import of a missing module
// crashes before any handler exists, so the entry loads the renderer dynamically instead.
test('an incomplete runtime copy is silent, not a stack trace', async () => {
  const home = mkdtempSync(join(tmpdir(), 'clear-ui-broken-'))
  try {
    for (const relative of ['bin/statusline.mjs', 'src/stdin.mjs', 'src/state.mjs', 'src/layout.mjs', 'src/sanitize.mjs']) {
      const target = join(home, relative)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), target)
    }
    // src/render.mjs is deliberately absent: mid-update, or a half-copied install.
    const child = spawnSync(process.execPath, [join(home, 'bin', 'statusline.mjs')], {
      input: fixture('idle'),
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COLUMNS: '120' },
      encoding: 'utf8',
      windowsHide: true,
    })
    assert.equal(child.status, 0, 'a broken runtime must still exit 0')
    assert.equal(child.stderr, '', 'a broken runtime must not write to stderr')
    assert.equal(child.stdout, '', 'a broken runtime must print nothing')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('empty stdin is silent', async () => silent(await run({ input: '' })))
test('whitespace-only stdin is silent', async () => silent(await run({ input: ' \n\t ' })))
test('malformed JSON is silent', async () => silent(await run({ input: '{"model": {"display_name": ' })))
test('JSON that is not an object is silent', async () => silent(await run({ input: '[1, 2, 3]' })))
test('an object that is not a statusline payload is silent', async () => silent(await run({ input: '{"hello": "world"}' })))
test('binary garbage is silent', async () => silent(await run({ input: Buffer.from([0xff, 0xfe, 0x00, 0x1b, 0x5b]) })))

test('oversized stdin is silent', async () => {
  const huge = JSON.stringify({ model: { display_name: 'x' }, padding: 'y'.repeat(400 * 1024) })
  silent(await run({ input: huge }))
})

test('stdin that never sends a byte and never closes still exits, silently', async () => {
  const result = await run({ closeStdin: false })
  silent(result)
  assert.ok(result.ms < 3000, `took ${result.ms} ms`)
})

test('an incomplete payload on a pipe that never closes still exits, silently', async () => {
  const result = await run({ input: '{"model": {', closeStdin: false })
  silent(result)
  assert.ok(result.ms < 3000, `took ${result.ms} ms`)
})

// Phase C: the entry asks git about the directory in the payload, and reads config.json from the
// data directory. Neither may cost the contract anything: exit 0, empty stderr.
const payloadIn = dir => JSON.stringify({ ...JSON.parse(fixture('idle')), cwd: dir, workspace: { current_dir: dir, project_dir: dir } })

test('the branch of the payload directory is drawn, with its dirty mark', async t => {
  const repo = mkdtempSync(join(tmpdir(), 'clear-ui-entry-git-'))
  const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true })
  if (git('init', '-q', '-b', 'trunk').status !== 0) {
    rmSync(repo, { recursive: true, force: true })
    return t.skip('git is not available')
  }
  writeFileSync(join(repo, 'a.txt'), 'a\n')

  // This is about what is drawn once git has answered, not about how fast git is: on a Windows
  // CI runner a git spawn alone can cost more than the default 150 ms, and the bar would then
  // rightly draw the branch without the mark.
  const result = await run({ input: payloadIn(repo), env: { ...PLAIN, COLUMNS: '140', CLEAR_UI_GIT_TIMEOUT_MS: '2000' } })
  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  assert.match(result.stdout, / on trunk  ● /)
  rmSync(repo, { recursive: true, force: true, maxRetries: 3 })
})

test('a directory that is not a repository, or no git on PATH, draws the rest', async () => {
  const plain = mkdtempSync(join(tmpdir(), 'clear-ui-entry-plain-'))
  for (const env of [{ ...PLAIN, COLUMNS: '140' }, { ...PLAIN, COLUMNS: '140', PATH: '' }]) {
    const result = await run({ input: payloadIn(plain), env })
    assert.equal(result.code, 0)
    assert.equal(result.stderr, '')
    assert.match(result.stdout, /^Fable 5\.1 {2}high {2}│ {2}clear-ui-entry-plain-\S+ {3,}ctx 31%/)
  }
  rmSync(plain, { recursive: true, force: true })
})

test('config.json in the data directory chooses what is drawn; a broken one draws the default', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'clear-ui-entry-data-'))
  const env = { ...PLAIN, COLUMNS: '140', CLEAR_UI_DATA_DIR: dataDir }
  const byDefault = await run({ input: fixture('idle'), env })

  writeFileSync(join(dataDir, 'config.json'), '{ "version": 1, "preset": "minimal", "charset": "ascii" }')
  const minimal = await run({ input: fixture('idle'), env })
  assert.equal(minimal.stderr, '')
  assert.match(minimal.stdout, /^ctx 31% ###-------  \|  5h 9%/)
  assert.doesNotMatch(minimal.stdout, /Fable/)

  // The environment is per terminal, so it outranks the file.
  const unicode = await run({ input: fixture('idle'), env: { ...env, CLEAR_UI_CHARSET: 'unicode' } })
  assert.match(unicode.stdout, /│/)

  writeFileSync(join(dataDir, 'config.json'), '{ "preset": "minimal", ')
  const broken = await run({ input: fixture('idle'), env })
  assert.equal(broken.code, 0)
  assert.equal(broken.stderr, '')
  assert.equal(broken.stdout, byDefault.stdout)
  rmSync(dataDir, { recursive: true, force: true })
})

// Chip ends are square unless asked otherwise. Round ends are glyphs the terminal has to draw
// itself -- anywhere else they are empty boxes -- so `auto` rounds only where that is known.
test('chip ends are square by default; round is opt-in, and auto rounds only where the terminal draws the caps', async () => {
  const CAP = String.fromCodePoint(0xe0b6)
  const out = async env => (await run({ input: fixture('idle'), env: { COLUMNS: '140', ...env } })).stdout
  const capped = async env => (await out(env)).includes(CAP)
  for (const env of [{}, { TERM_PROGRAM: 'vscode' }, { WT_SESSION: 'abc' }]) assert.equal(await capped(env), false, `square by default: ${JSON.stringify(env)}`)

  const auto = { CLEAR_UI_CAPS: 'auto' }
  assert.equal(await capped(auto), false, 'auto, an unknown terminal: square')
  assert.equal(await capped({ ...auto, TERM_PROGRAM: 'Apple_Terminal' }), false, 'macOS Terminal has neither the glyph nor a renderer for it')
  for (const env of [{ TERM_PROGRAM: 'vscode' }, { WT_SESSION: 'abc' }, { TERM_PROGRAM: 'iTerm.app' }, { KITTY_WINDOW_ID: '1' }, { TERM_PROGRAM: 'WezTerm' }]) {
    assert.equal(await capped({ ...auto, ...env }), true, JSON.stringify(env))
    assert.equal([...(await out({ ...auto, ...env }))].some(ch => ch.codePointAt(0) > 0xffff), false, 'never a character outside the BMP')
  }
  assert.equal(await capped({ CLEAR_UI_CAPS: 'round' }), true, 'round outright, whatever the terminal')
  assert.equal(await capped({ CLEAR_UI_CAPS: 'round', CLEAR_UI_LOOK: 'text' }), false, 'the text look has no chips to round')
  assert.equal(await capped({ CLEAR_UI_CAPS: 'round', NO_COLOR: '1' }), false)
})
