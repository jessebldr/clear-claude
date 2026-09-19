// parseStatus is pure and tested on text. readGit is tested against real throwaway repositories,
// because what it promises -- a value or null, never a throw, never a hang -- is a promise about
// a real process.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findGit, GIT_TIMEOUT_MS, gitTimeoutOf, parseStatus, readGit, readHead } from '../src/git.mjs'

test('gitTimeoutOf: the default, a machine that asks for more, and nonsense', () => {
  assert.equal(gitTimeoutOf({}), GIT_TIMEOUT_MS)
  assert.equal(gitTimeoutOf({ CLEAR_UI_GIT_TIMEOUT_MS: '400' }), 400)
  assert.equal(gitTimeoutOf({ CLEAR_UI_GIT_TIMEOUT_MS: '5' }), 50, 'never so short that git cannot answer at all')
  assert.equal(gitTimeoutOf({ CLEAR_UI_GIT_TIMEOUT_MS: '999999' }), 2000, 'never so long that the bar stalls')
  for (const junk of ['', 'fast', 'NaN', '-', null]) assert.equal(gitTimeoutOf({ CLEAR_UI_GIT_TIMEOUT_MS: junk }), GIT_TIMEOUT_MS)
  assert.equal(gitTimeoutOf(undefined), GIT_TIMEOUT_MS)
})

const OID = '1234567890abcdef1234567890abcdef12345678'
const header = (head, extra = '') => `# branch.oid ${OID}\n# branch.head ${head}\n${extra}`

test('parseStatus: a clean branch with no upstream', () => {
  assert.deepEqual(parseStatus(header('main')), { branch: 'main', dirty: false, ahead: 0, behind: 0 })
})

test('parseStatus: ahead, behind and every kind of change line', () => {
  const upstream = '# branch.upstream origin/main\n# branch.ab +2 -3\n'
  assert.deepEqual(parseStatus(header('main', upstream)), { branch: 'main', dirty: false, ahead: 2, behind: 3 })
  for (const change of ['1 .M N... 100644 100644 100644 a b file', '2 R. N... 1 1 1 a b R100 new\told', 'u UU N... 1 1 1 1 a b c file', '? untracked']) {
    assert.equal(parseStatus(header('main', `${upstream}${change}\n`)).dirty, true, change)
  }
})

test('parseStatus: a detached HEAD is shown as its commit, an unborn branch by its name', () => {
  assert.equal(parseStatus(header('(detached)')).branch, '1234567')
  assert.equal(parseStatus('# branch.oid (initial)\n# branch.head trunk\n').branch, 'trunk')
  assert.equal(parseStatus('# branch.oid (initial)\n# branch.head (detached)\n'), null)
})

test('parseStatus: anything that is not a status listing is null', () => {
  for (const text of ['', 'fatal: not a git repository', '1 .M file', null, undefined, 42]) assert.equal(parseStatus(text), null)
})

const hasGit = findGit() !== null
const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
}
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'clear-ui-git-'))
  git(dir, 'init', '-q', '-b', 'trunk')
  writeFileSync(join(dir, 'a.txt'), 'a\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'first')
  return dir
}
// readGit answers "slow" the moment its timer fires and does not wait for the killed process to
// be gone. On Windows that process still holds the repository as its working directory for a
// moment -- measured, about 30 ms after the kill -- and removing the directory fails until then.
//
// rmSync's own `maxRetries` does not cover this, which is why this test stayed flaky with 30 of
// them: measured, a directory held by a process fails at once (EPERM here, EBUSY on the CI
// runner, 0 ms), because Node retries only after it has started emptying a directory, and the
// refusal comes before that. So the patience is a loop of our own.
function cleanup(dir) {
  for (let attempt = 1; ; attempt++) {
    try {
      return rmSync(dir, { recursive: true, force: true })
    } catch (error) {
      if (attempt >= 100 || !['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY'].includes(error.code)) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

// Neither side of the timeout may be a race against a real clock. On a Windows CI runner a git
// spawn takes longer than the 150 ms the status line allows, so a test about what git *answers*
// gives it all the time it wants. And a real git handed a 1 ms budget finishes first on a fast
// Linux runner, so "too slow" is a stand-in that never finishes: with node as the executable,
// `node status --porcelain=v2 --branch` runs the file below from the repository until the
// timeout kills it. The file is excluded, so the tree is exactly as dirty as it was.
const PATIENT = { timeoutMs: 30_000 }
function tooSlow(repo) {
  writeFileSync(join(repo, 'status'), 'setTimeout(() => {}, 600000)\n')
  mkdirSync(join(repo, '.git', 'info'), { recursive: true })
  appendFileSync(join(repo, '.git', 'info', 'exclude'), 'status\n')
  return { git: process.execPath, timeoutMs: 100 }
}

// The other stand-in: a git that exits 0 having delivered only the first line of its listing,
// while something it started may still hold its stdout pipe. However that comes about -- a
// timeout that fires between git's exit and the pipe closing used to produce exactly this, as
// a success with whatever had been read so far -- a listing without a branch header is not an
// answer.
function exitsEarlyPipeOpen(repo) {
  const script = [
    "const { spawn } = require('node:child_process')",
    "const { tmpdir } = require('node:os')",
    "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 4000)'], { cwd: tmpdir(), stdio: ['ignore', 'inherit', 'ignore'] }).unref()",
    "process.stdout.write('# branch.oid 1234567890abcdef1234567890abcdef12345678\\n', () => process.exit(0))",
  ].join('\n')
  writeFileSync(join(repo, 'status'), script + '\n')
  mkdirSync(join(repo, '.git', 'info'), { recursive: true })
  appendFileSync(join(repo, '.git', 'info', 'exclude'), 'status\n')
  return { git: process.execPath, timeoutMs: 1500 }
}

test('readGit: branch and dirty state of a real repository', { skip: !hasGit }, async () => {
  const repo = makeRepo()
  assert.deepEqual(await readGit(repo, PATIENT), { branch: 'trunk', dirty: false, ahead: 0, behind: 0 })
  writeFileSync(join(repo, 'b.txt'), 'b\n')
  assert.equal((await readGit(repo, PATIENT)).dirty, true)
  git(repo, 'checkout', '-q', '--detach')
  assert.match((await readGit(repo, PATIENT)).branch, /^[0-9a-f]{7}$/)
  cleanup(repo)
})

test('readGit: no repository, no git, and no usable directory are all null', { skip: !hasGit }, async () => {
  const plain = mkdtempSync(join(tmpdir(), 'clear-ui-plain-'))
  assert.equal(await readGit(plain), null)
  assert.equal(await readGit(plain, { env: { PATH: '' } }), null)
  assert.equal(await readGit(join(plain, 'missing')), null)
  for (const cwd of ['relative/path', '', null, undefined, 42]) assert.equal(await readGit(cwd), null)
  cleanup(plain)
})

test('readGit: answers from the cache inside the TTL and asks again after it', { skip: !hasGit }, async () => {
  const repo = makeRepo()
  const cacheDir = mkdtempSync(join(tmpdir(), 'clear-ui-cache-'))
  const now = 1_000_000
  assert.equal((await readGit(repo, { ...PATIENT, cacheDir, now })).dirty, false)
  writeFileSync(join(repo, 'b.txt'), 'b\n')
  assert.equal((await readGit(repo, { ...PATIENT, cacheDir, now: now + 4000 })).dirty, false, 'still inside the TTL')
  assert.equal((await readGit(repo, { ...PATIENT, cacheDir, now: now + 6000 })).dirty, true)
  assert.equal(readdirSync(cacheDir).filter(name => name.endsWith('.tmp')).length, 0)
  cleanup(repo)
  cleanup(cacheDir)
})

test('readGit: a repository too slow to answer keeps its last value, or falls back to HEAD', { skip: !hasGit }, async () => {
  const repo = makeRepo()
  const cacheDir = mkdtempSync(join(tmpdir(), 'clear-ui-cache-'))
  // A git that never answers inside its budget, which is what a huge repository looks like.
  const slow = tooSlow(repo)
  assert.deepEqual(await readGit(repo, slow), { branch: 'trunk', dirty: null, ahead: 0, behind: 0 })

  writeFileSync(join(repo, 'b.txt'), 'b\n')
  assert.equal((await readGit(repo, { ...PATIENT, cacheDir, now: 1000 })).dirty, true)
  assert.equal((await readGit(repo, { ...slow, cacheDir, now: 9000 })).dirty, true, 'the last real answer')
  cleanup(repo)
  cleanup(cacheDir)
})

test('readGit: a listing cut short by the timeout is never taken for an answer', { skip: !hasGit }, async () => {
  const repo = makeRepo()
  const cacheDir = mkdtempSync(join(tmpdir(), 'clear-ui-cache-'))
  writeFileSync(join(repo, 'b.txt'), 'b\n')
  const real = await readGit(repo, { ...PATIENT, cacheDir, now: 1000 })
  assert.equal(real.dirty, true)

  // git "succeeded" with one line of listing. That is treated as slow: the last real answer
  // stands, and the truncated listing is not cached either.
  const cut = exitsEarlyPipeOpen(repo)
  assert.deepEqual(await readGit(repo, { ...cut, cacheDir, now: 9000 }), real)
  assert.deepEqual(await readGit(repo, { cacheDir, now: 9500 }), real, 'and what was cached is that answer, not null')
  // With no earlier answer it is the branch from HEAD, dirty unknown -- not null, which is what
  // parsing the one line that did arrive would have produced.
  assert.deepEqual(await readGit(repo, cut), { branch: 'trunk', dirty: null, ahead: 0, behind: 0 })
  cleanup(repo)
  cleanup(cacheDir)
})

test('readGit: a corrupt cache file is ignored, not trusted and not fatal', { skip: !hasGit }, async () => {
  const repo = makeRepo()
  const cacheDir = mkdtempSync(join(tmpdir(), 'clear-ui-cache-'))
  await readGit(repo, { ...PATIENT, cacheDir, now: 1000 })
  const [name] = readdirSync(cacheDir)
  // Not JSON at all; then valid JSON that is about some other directory, or has no usable time.
  for (const text of ['{"cwd": 1, "at": ', JSON.stringify({ cwd: 'C:/elsewhere', at: 1400, value: { branch: 'evil' } }), JSON.stringify({ cwd: repo, at: 'soon', value: { branch: 'evil' } })]) {
    writeFileSync(join(cacheDir, name), text)
    assert.equal((await readGit(repo, { ...PATIENT, cacheDir, now: 1500 })).branch, 'trunk', text)
  }
  cleanup(repo)
  cleanup(cacheDir)
})

test('readGit: a slow repository still follows a checkout, and forgets a dirty mark that was about another branch', { skip: !hasGit }, async () => {
  const repo = makeRepo()
  const cacheDir = mkdtempSync(join(tmpdir(), 'clear-ui-cache-'))
  const slow = tooSlow(repo)
  writeFileSync(join(repo, 'b.txt'), 'b\n')
  assert.deepEqual(await readGit(repo, { ...PATIENT, cacheDir, now: 1000 }), { branch: 'trunk', dirty: true, ahead: 0, behind: 0 })
  git(repo, 'checkout', '-q', '-b', 'feature-x')
  for (const now of [7000, 3_600_000]) {
    assert.deepEqual(await readGit(repo, { ...slow, cacheDir, now }), { branch: 'feature-x', dirty: null, ahead: 0, behind: 0 })
  }
  cleanup(repo)
  cleanup(cacheDir)
})

test('findGit: on Windows the real executable is preferred to the launcher in Git\\cmd', () => {
  const root = mkdtempSync(join(tmpdir(), 'clear-ui-gitroot-'))
  for (const dir of ['cmd', join('mingw64', 'bin')]) {
    mkdirSync(join(root, dir), { recursive: true })
    writeFileSync(join(root, dir, 'git.exe'), '')
  }
  assert.equal(findGit({ PATH: join(root, 'cmd') }, 'win32'), join(root, 'mingw64', 'bin', 'git.exe'))
  rmSync(join(root, 'mingw64'), { recursive: true })
  assert.equal(findGit({ PATH: join(root, 'cmd') }, 'win32'), join(root, 'cmd', 'git.exe'), 'no real one to find: the launcher still works')
  assert.equal(findGit({ PATH: '' }, 'win32'), null)
  cleanup(root)
})

test('readHead: reads a branch without running git, and never claims a clean tree', { skip: !hasGit }, () => {
  const repo = makeRepo()
  assert.deepEqual(readHead(join(repo)), { branch: 'trunk', dirty: null, ahead: 0, behind: 0 })
  const plain = mkdtempSync(join(tmpdir(), 'clear-ui-plain-'))
  assert.equal(readHead(plain), null)
  cleanup(plain)
  cleanup(repo)
})

test('readGit: the cache directory does not grow without limit', { skip: !hasGit }, async () => {
  const repo = makeRepo()
  const cacheDir = mkdtempSync(join(tmpdir(), 'clear-ui-cache-'))
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  for (let i = 0; i < 40; i++) {
    const file = join(cacheDir, `git-${String(i).padStart(16, '0')}.json`)
    writeFileSync(file, '{}')
    utimesSync(file, old, old)
  }
  await readGit(repo, { ...PATIENT, cacheDir })
  assert.equal(readdirSync(cacheDir).length, 1)
  cleanup(repo)
  cleanup(cacheDir)
})
