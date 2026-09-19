#!/usr/bin/env node
// Clear UI statusline entry: read stdin -> map to state -> render -> print -> exit.
//
// Contract: always exit 0, never write to stderr, print nothing when anything is wrong.
// Claude Code blanks the status line on a non-zero exit, and an error message has no business
// on a status line. The explicit exit also guarantees no process can linger.
//
// The renderer is loaded with `await import` rather than a static import on purpose. A static
// import is resolved before any code in this file runs, so a runtime copy that is incomplete or
// mid-update crashes with a stack trace on stderr before a handler can exist — which is how
// this was found, by deleting one file from an installed copy. Dynamic import puts that failure
// inside the try below, where it prints nothing like every other failure.
// Node's own modules are the one thing a static import cannot fail to find.
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const leave = () => process.exit(0)
process.on('uncaughtException', leave)
process.on('unhandledRejection', leave)
process.stdout.on('error', leave)

// COLUMNS is what Claude Code sets for a status line, so it comes first. stderr is the only
// stream that may still be a terminal here (stdout is the captured pipe), so it is worth
// asking when COLUMNS is absent -- an older Claude Code, or another host.
function columnsOf(env) {
  const declared = Number.parseInt(env.COLUMNS ?? '', 10)
  if (Number.isInteger(declared) && declared > 0) return declared
  const measured = process.stderr?.columns
  return Number.isInteger(measured) && measured > 0 ? measured : undefined
}

// A terminal that cannot style at all gets plain text; NO_COLOR removes the hues but keeps
// dim, which is what its own FAQ asks for and what keeps the labels readable as labels.
const canStyle = env => env.TERM !== 'dumb'
const wantsColor = env => canStyle(env) && !env.NO_COLOR

// The ASCII glyphs exist for terminals and fonts that cannot draw the others. There is no
// reliable way to detect that from inside a status line, so it is asked for, never guessed.
const charsetOf = env => (env.CLEAR_UI_CHARSET === 'ascii' ? 'ascii' : 'unicode')

// The config file and the git cache live in the plugin data directory, which is the parent of
// the installed runtime this file runs from. Run from anywhere else -- a checkout, a test -- there
// is no data directory unless one is named: the default is drawn and git is asked every time.
function dataDirOf(env, entryUrl) {
  if (env.CLEAR_UI_DATA_DIR) return env.CLEAR_UI_DATA_DIR
  const runtimeDir = resolve(dirname(fileURLToPath(entryUrl)), '..')
  return basename(runtimeDir) === 'runtime' ? dirname(runtimeDir) : undefined
}

// Round chip ends are two Powerline glyphs. No font is asked to supply them: they are used only
// in terminals that draw them themselves, cell-exact, as they draw box characters -- VS Code
// (customGlyphs, on by default), Windows Terminal 1.20+, iTerm2, kitty, WezTerm, Ghostty. Anywhere
// else -- macOS Terminal, a plain xterm -- they would be an empty box at both ends of every chip,
// so the ends stay square.
function capsOf(setting, env) {
  if (setting === 'round' || setting === 'square') return setting
  const drawsThem = ['vscode', 'iTerm.app', 'WezTerm', 'ghostty'].includes(env.TERM_PROGRAM) || Boolean(env.WT_SESSION) || Boolean(env.KITTY_WINDOW_ID)
  return drawsThem ? 'round' : 'square'
}

// The theme Claude Code is set to, which decides what "bright" can safely mean in the text look.
// settings.json sits three directories above the data directory; anything unexpected is unknown.
function themeOf(dataDir) {
  try {
    if (!dataDir) return undefined
    const theme = JSON.parse(readFileSync(join(dataDir, '..', '..', '..', 'settings.json'), 'utf8')).theme
    return typeof theme !== 'string' ? undefined : theme.startsWith('dark') ? 'dark' : theme.startsWith('light') ? 'light' : undefined
  } catch {
    return undefined
  }
}

async function main() {
  const [{ readStdin }, { stateFromStatusline }, { render }, { readGit, gitTimeoutOf }, { loadConfig, LOOKS, CAPS }, { readRecord }, { verificationOf }, { activityOf }] = await Promise.all([
    import('../src/stdin.mjs'),
    import('../src/state.mjs'),
    import('../src/render.mjs'),
    import('../src/git.mjs'),
    import('../src/config.mjs'),
    import('../src/session-state.mjs'),
    import('../src/verify.mjs'),
    import('../src/activity.mjs'),
  ])
  const input = await readStdin(process.stdin)
  const state = stateFromStatusline(input)
  const dataDir = dataDirOf(process.env, import.meta.url)
  const config = loadConfig(dataDir ? join(dataDir, 'config.json') : undefined)
  if (state && config.show.git) {
    state.git = await readGit(state.gitDir, { cacheDir: dataDir ? join(dataDir, 'cache') : undefined, timeoutMs: gitTimeoutOf(process.env) })
  }
  const now = Date.now()
  if (state && dataDir && config.show.activity) {
    const stateDir = join(dataDir, 'state')
    state.activity = activityOf(readRecord(stateDir, state.sessionId, 'agents'), readRecord(stateDir, state.sessionId, 'background'), now)
  }
  if (state && dataDir && config.show.verification) {
    const stateDir = join(dataDir, 'state')
    state.verification = verificationOf(readRecord(stateDir, state.sessionId, 'verify'), readRecord(stateDir, state.sessionId, 'edit'), now)
  }
  // Opt-in, and the modules are not even loaded otherwise: by default this entry reaches no
  // network and starts no process but git. Here it only reads a file. When the file is old it may
  // start the detached worker -- once per ten minutes across every session -- and never waits.
  // CLEAR_UI_NO_USAGE_REFRESH is for a caller that must only look: the doctor's dry render.
  if (state && dataDir && config.usage) {
    const [{ usageOf, refreshDue }, { readUsageCache, claimRefresh, startRefresh }] = await Promise.all([import('../src/usage.mjs'), import('../src/usage-cache.mjs')])
    const cacheDir = join(dataDir, 'cache')
    const record = readUsageCache(cacheDir)
    state.usage = usageOf(record, now)
    if (!process.env.CLEAR_UI_NO_USAGE_REFRESH && refreshDue(record, now) && claimRefresh(cacheDir, now)) startRefresh(fileURLToPath(new URL('./usage-refresh.mjs', import.meta.url)), cacheDir)
  }
  const lines = render(state, {
    columns: columnsOf(process.env),
    now,
    // The environment is per terminal and the file is per machine, so the environment wins.
    charset: process.env.CLEAR_UI_CHARSET ? charsetOf(process.env) : (config.charset ?? 'unicode'),
    color: wantsColor(process.env),
    style: canStyle(process.env),
    show: config.show,
    look: LOOKS.includes(process.env.CLEAR_UI_LOOK) ? process.env.CLEAR_UI_LOOK : config.look,
    theme: themeOf(dataDir),
    caps: capsOf(CAPS.includes(process.env.CLEAR_UI_CAPS) ? process.env.CLEAR_UI_CAPS : config.caps, process.env),
    truecolor: /^(truecolor|24bit)$/i.test(process.env.COLORTERM ?? '') || process.env.TERM_PROGRAM === 'vscode' || Boolean(process.env.WT_SESSION),
  })
  if (lines.length === 0) return leave()
  // Exit from the write callback: stdout to a pipe is asynchronous on some platforms.
  process.stdout.write(lines.join('\n') + '\n', leave)
}

try {
  await main()
} catch {
  leave()
}
