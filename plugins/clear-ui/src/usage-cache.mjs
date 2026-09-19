// Node-only: the usage provider's file, its single-flight claim, and the one `claude` run.
//
// The status line reads the file and nothing else. When the file is old it claims the refresh and
// starts a detached worker, which is the only thing here that runs `claude` -- 1.85 s measured,
// seven times the status line's whole budget. A failed refresh writes nothing: the last good
// answer stays until it is too old to draw, and the next attempt is a full interval away.
import { spawn } from 'node:child_process'
import { accessSync, closeSync, constants, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import { writeFileAtomic } from './atomic.mjs'
import { parseUsageRun, USAGE_ARGS, USAGE_REFRESH_MS, usageRecordOf } from './usage.mjs'

const CACHE_NAME = 'usage.json'
const LOCK_NAME = /^usage-(\d{1,12})\.lock$/
const MAX_CACHE_BYTES = 16 * 1024
const MAX_OUTPUT_BYTES = 1024 * 1024
// Measured 1.8-2.1 s. A run still going at this point is not going to answer.
export const USAGE_RUN_TIMEOUT_MS = 30 * 1000

/** The last good record, or null. Never throws. */
export function readUsageCache(cacheDir) {
  try {
    if (!cacheDir) return null
    const file = join(cacheDir, CACHE_NAME)
    if (statSync(file).size > MAX_CACHE_BYTES) return null
    return usageRecordOf(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return null
  }
}

/**
 * Whether this process, and no other, may start a refresh now. Never throws.
 *
 * Every session's status line runs every two seconds, so many processes find the file old in the
 * same instant. The claim is a lock file named after the current interval and created with `wx`:
 * the file system lets exactly one creator of a name succeed, and nobody ever takes a lock over,
 * which is where a lock that expires gets raced. The lock is never released. It is the record
 * that an attempt was made, so a refresh that fails is not retried two seconds later, and the
 * newest lock's age keeps two attempts either side of an interval boundary apart.
 *
 * What is left: two processes that list the directory within the same millisecond or so, one each
 * side of a boundary, both start a worker. That costs a second `claude` run, which Claude Code
 * answers from its own 60 s snapshot, and the two atomic writes of the same answer do not collide.
 */
export function claimRefresh(cacheDir, now = Date.now(), intervalMs = USAGE_REFRESH_MS) {
  try {
    if (!cacheDir || !Number.isFinite(now)) return false
    mkdirSync(cacheDir, { recursive: true })
    const mine = `usage-${Math.floor(now / intervalMs)}.lock`
    let blocked = false
    for (const name of readdirSync(cacheDir)) {
      if (!LOCK_NAME.test(name)) continue
      if (name === mine) {
        blocked = true
        continue
      }
      // Every interval has a lock name of its own, so old ones are cleared here, on every look
      // and whoever wins: a lock an interval old blocks nothing, and one from the future is a
      // changed clock, not a recent attempt. What stays is the one lock that still means something.
      const age = ageOf(join(cacheDir, name), now)
      if (age !== null && age >= 0 && age < intervalMs) blocked = true
      else rmSync(join(cacheDir, name), { force: true })
    }
    if (blocked) return false
    closeSync(openSync(join(cacheDir, mine), 'wx'))
    return true
  } catch {
    return false
  }
}

// null when the file went away between the listing and the look: another process cleared it.
function ageOf(file, now) {
  try {
    return now - statSync(file).mtimeMs
  } catch {
    return null
  }
}

/** When a refresh was last attempted, believed or not: the newest lock's time, or null. Reads only. */
export function lastAttemptAt(cacheDir) {
  try {
    const times = readdirSync(cacheDir)
      .filter(name => LOCK_NAME.test(name))
      .map(name => statSync(join(cacheDir, name)).mtimeMs)
    return times.length === 0 ? null : Math.max(...times)
  } catch {
    return null
  }
}

/**
 * The absolute path of the `claude` executable on PATH, or null. No shell, no `where`, no PATHEXT.
 *
 * Windows: `claude.exe` and nothing else. An npm install puts `claude.cmd` (and `claude.ps1`, and
 * an extensionless sh script) on PATH, and none of them can be started without a shell, which
 * this provider does not have. POSIX: `claude`, which has to be a file this user may execute --
 * the native binary, or npm's symlink to a script with a shebang, which the kernel starts itself.
 * A directory of that name, or a file without the execute bit, is passed over for the next entry.
 */
export function findClaude(env = process.env, platform = process.platform) {
  const name = platform === 'win32' ? 'claude.exe' : 'claude'
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    if (dir === '' || !isAbsolute(dir)) continue
    const candidate = join(dir, name)
    if (isRunnable(candidate, platform)) return candidate
  }
  return null
}

function isRunnable(file, platform) {
  try {
    if (!statSync(file).isFile()) return false
    // Windows has no execute bit; there the extension is the whole of it.
    if (platform !== 'win32') accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Starts the worker and lets go of it: no pipe, no wait, and it outlives this process. */
export function startRefresh(worker, cacheDir, env = process.env) {
  try {
    const child = spawn(process.execPath, [worker, cacheDir], { detached: true, stdio: 'ignore', windowsHide: true, shell: false, env })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

// The timer is ours, as it is for git: whichever of "finished" and "too slow" comes first decides,
// once, and nothing that arrives afterwards changes the verdict.
//
// Unlike git, a stopped run is reported only once the process is gone. Nobody is waiting on this
// worker, so the wait costs nothing, and a refresh that has returned has then left nothing
// behind: a killed process keeps its working directory -- the cache directory -- busy for a
// moment on Windows, which is how the first CI run of this on a loaded runner failed (EBUSY,
// removing the directory). The grace period bounds the wait for a process that will not die.
const KILL_GRACE_MS = 2000
const run = (command, args, { cwd, env, timeoutMs }) =>
  new Promise(resolve => {
    let verdict = null
    let stdout = ''
    let grace
    const finish = () => {
      clearTimeout(timer)
      clearTimeout(grace)
      resolve(verdict)
    }
    const stop = reason => {
      if (verdict) return
      verdict = { reason }
      child.stdout?.destroy()
      child.kill()
      grace = setTimeout(finish, KILL_GRACE_MS)
    }
    // stdin is closed and stderr goes nowhere: the run cannot ask anyone anything, and nothing it
    // says outside the JSON stream is read.
    const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    const timer = setTimeout(() => stop('timeout'), timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
      if (stdout.length > MAX_OUTPUT_BYTES) stop('output-too-large')
    })
    child.on('error', () => {
      verdict ??= { reason: 'spawn' }
      finish()
    })
    child.on('close', code => {
      verdict ??= { code, stdout }
      finish()
    })
  })

/**
 * One refresh: run `claude`, believe the answer or do not, and write the cache only when it is
 * believed. Resolves to `{ ok, reason }`; never rejects, prints nothing.
 *
 * @param options cacheDir · env · now: () => epoch ms · timeoutMs
 *                command, prefixArgs: the executable and what precedes USAGE_ARGS, for tests
 */
export async function refreshUsage(options = {}) {
  try {
    const { cacheDir, env = process.env, now = Date.now, timeoutMs = USAGE_RUN_TIMEOUT_MS, prefixArgs = [] } = options
    if (typeof cacheDir !== 'string' || !isAbsolute(cacheDir)) return { ok: false, reason: 'no-cache-dir' }
    const command = options.command ?? findClaude(env)
    if (!command) return { ok: false, reason: 'no-claude' }
    mkdirSync(cacheDir, { recursive: true })
    // The cache directory is the working directory: one Clear UI owns, with no project in it.
    const result = await run(command, [...prefixArgs, ...USAGE_ARGS], { cwd: cacheDir, env, timeoutMs })
    if (result.reason) return { ok: false, reason: result.reason }
    const parsed = parseUsageRun(result.stdout, result.code, now())
    if (!parsed.ok) return parsed
    return writeFileAtomic(join(cacheDir, CACHE_NAME), JSON.stringify(parsed.record)) ? { ok: true, reason: null } : { ok: false, reason: 'write' }
  } catch {
    return { ok: false, reason: 'unexpected' }
  }
}
