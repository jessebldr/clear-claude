// Node-only: branch, dirty state and ahead/behind from one `git status` call.
//
// The status line is re-run every couple of seconds, so the call sits behind a short cache, and
// it is bounded: a repository too large to answer in time keeps showing the last value it did
// answer with. Every failure -- no git, not a repository, a timeout, a cache that cannot be
// written -- resolves to a value or to null. Nothing here throws and nothing prints.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, delimiter, dirname, isAbsolute, join } from 'node:path'
import { writeFileAtomic } from './atomic.mjs'

export const GIT_TIMEOUT_MS = 150
export const GIT_TTL_MS = 5000
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const SHORT_OID_LENGTH = 7
const CACHE_FILES_KEPT = 32
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Pure. `git status --porcelain=v2 --branch` output -> { branch, dirty, ahead, behind }, or null
 * when there is no branch header to read.
 */
export function parseStatus(text) {
  if (typeof text !== 'string') return null
  let head = null
  let oid = null
  let ahead = 0
  let behind = 0
  let dirty = false
  for (const line of text.split('\n')) {
    if (line === '') continue
    if (!line.startsWith('# ')) {
      dirty = true
      continue
    }
    const [, key, value] = line.match(/^# (\S+) (.*)$/) ?? []
    if (key === 'branch.head') head = value
    else if (key === 'branch.oid') oid = value
    else if (key === 'branch.ab') {
      const [, plus, minus] = value.match(/^\+(\d+) -(\d+)$/) ?? []
      ahead = Number(plus ?? 0)
      behind = Number(minus ?? 0)
    }
  }
  if (head === null) return null
  // A detached HEAD has no name to show, so it is shown as what it is: a commit.
  const detached = head === '(detached)'
  const branch = detached ? (oid && oid !== '(initial)' ? oid.slice(0, SHORT_OID_LENGTH) : null) : head
  if (!branch) return null
  return { branch, dirty, ahead, behind }
}

/** The absolute path of the git executable on PATH, or null. No shell, no `where`. */
export function findGit(env = process.env, platform = process.platform) {
  const names = platform === 'win32' ? ['git.exe'] : ['git']
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    if (dir === '' || !isAbsolute(dir)) continue
    for (const name of names) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return platform === 'win32' ? behindShim(candidate) : candidate
    }
  }
  return null
}

// Git for Windows puts a launcher on PATH, `Git\cmd\git.exe`, which starts the real git as a
// child. Killing the launcher on a timeout leaves that child running, orphaned -- one more every
// cache period in a repository slow enough to time out. The real executable dies when killed.
function behindShim(launcher) {
  if (basename(dirname(launcher)).toLowerCase() !== 'cmd') return launcher
  for (const flavour of ['mingw64', 'clangarm64', 'mingw32']) {
    const real = join(dirname(dirname(launcher)), flavour, 'bin', 'git.exe')
    if (existsSync(real)) return real
  }
  return launcher
}

const cacheFileFor = (cacheDir, cwd) =>
  join(cacheDir, `git-${createHash('sha256').update(cwd).digest('hex').slice(0, 16)}.json`)

function readCache(file, cwd) {
  try {
    const entry = JSON.parse(readFileSync(file, 'utf8'))
    if (entry?.cwd !== cwd || !Number.isFinite(entry.at)) return null
    return { at: entry.at, value: entry.value ?? null }
  } catch {
    return null
  }
}

function writeCache(file, cwd, at, value) {
  try {
    if (writeFileAtomic(file, JSON.stringify({ cwd, at, value }))) prune(join(file, '..'), at)
  } catch {
    // A cache that cannot be written only costs the next run a git call.
  }
}

// One small file per directory ever worked in would otherwise grow without limit. Entries are
// worthless seconds after they are written, so anything a day old goes once there are many.
function prune(cacheDir, now) {
  const names = readdirSync(cacheDir).filter(name => name.startsWith('git-'))
  if (names.length <= CACHE_FILES_KEPT) return
  for (const name of names) {
    const file = join(cacheDir, name)
    if (now - statSync(file).mtimeMs > CACHE_MAX_AGE_MS) rmSync(file, { force: true })
  }
}

const runGit = (git, cwd, env, timeoutMs) =>
  new Promise(resolve => {
    execFile(
      git,
      ['status', '--porcelain=v2', '--branch'],
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
        encoding: 'utf8',
        // Never take a lock a real git command would wait for, and never ask anyone anything.
        env: { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
      },
      (error, stdout) => {
        if (!error) return resolve({ outcome: 'ok', stdout })
        // Killed by the timeout (or an over-long listing): the repository is there but slow.
        if (error.killed || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return resolve({ outcome: 'slow' })
        resolve({ outcome: 'none' })
      },
    )
  })

/**
 * The branch name straight from `.git/HEAD`, for a repository too slow to answer `git status`
 * and with no earlier answer to fall back on. Dirty state is unknown here, and says so: null is
 * not drawn, where false would claim a clean tree nobody checked.
 */
export function readHead(cwd) {
  try {
    let dir = cwd
    for (let depth = 0; depth < 64; depth++) {
      const dotGit = join(dir, '.git')
      if (existsSync(dotGit)) {
        let gitDir = dotGit
        try {
          // A worktree or submodule has a `.git` file pointing at the real directory.
          const pointer = readFileSync(dotGit, 'utf8').match(/^gitdir: (.+)$/m)
          if (pointer) gitDir = isAbsolute(pointer[1].trim()) ? pointer[1].trim() : join(dir, pointer[1].trim())
        } catch {
          // EISDIR: `.git` is the directory itself.
        }
        const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
        const [, name] = head.match(/^ref: refs\/heads\/(.+)$/) ?? []
        const branch = name ?? (/^[0-9a-f]{7,64}$/.test(head) ? head.slice(0, SHORT_OID_LENGTH) : null)
        return branch ? { branch, dirty: null, ahead: 0, behind: 0 } : null
      }
      const parent = join(dir, '..')
      if (parent === dir) return null
      dir = parent
    }
    return null
  } catch {
    return null
  }
}

/**
 * @param cwd     directory to ask about; anything but an absolute path resolves to null
 * @param options cacheDir: where the cache lives, undefined for no cache
 *                now: epoch ms · env · timeoutMs · ttlMs · git: executable path, for tests
 * @returns { branch, dirty, ahead, behind } or null
 */
export async function readGit(cwd, options = {}) {
  try {
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) return null
    const { cacheDir, now = Date.now(), env = process.env, timeoutMs = GIT_TIMEOUT_MS, ttlMs = GIT_TTL_MS } = options
    const file = cacheDir ? cacheFileFor(cacheDir, cwd) : null
    const cached = file ? readCache(file, cwd) : null
    if (cached && now - cached.at >= 0 && now - cached.at < ttlMs) return cached.value

    const git = options.git ?? findGit(env)
    if (!git || !existsSync(cwd)) return null

    const result = await runGit(git, cwd, env, timeoutMs)
    // Slow restarts the clock, so a huge repository costs one timed-out call per TTL rather than
    // one per tick -- which also means the last answer would otherwise never expire. So the branch
    // is always read fresh from HEAD, and the last answer is kept only while it is still about
    // that branch; after a checkout the dirty mark is unknown, not remembered.
    let value = null
    if (result.outcome === 'ok') value = parseStatus(result.stdout)
    else if (result.outcome === 'slow') {
      const head = readHead(cwd)
      value = head && cached?.value?.branch === head.branch ? cached.value : (head ?? cached?.value ?? null)
    }
    if (file) writeCache(file, cwd, now, value)
    return value
  } catch {
    return null
  }
}
