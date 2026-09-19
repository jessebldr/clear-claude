// How long does `git status` really take here, measured the way the status line runs it?
//
//   node bench/git-latency.mjs [directory ...]      default: the current directory
//
// Same executable findGit() picks, same arguments, same environment, no shell, one fresh
// process per sample -- so the numbers can be held against GIT_TIMEOUT_MS. It answers one
// question: on this machine, in these repositories, how often would the status line give up
// on git and fall back to the branch name without a dirty mark?
//
// Not a test and not run by `node --test`: a timing is a measurement of a machine.
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { findGit, GIT_TIMEOUT_MS } from '../src/git.mjs'

const SAMPLES = Number(process.env.SAMPLES ?? 40)
const git = findGit()
if (!git) {
  console.log('git is not on PATH; nothing to measure')
  process.exit(0)
}

const once = cwd =>
  new Promise(done => {
    const started = process.hrtime.bigint()
    execFile(
      git,
      ['status', '--porcelain=v2', '--branch'],
      {
        cwd,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
      },
      error => done({ ms: Number(process.hrtime.bigint() - started) / 1e6, ok: !error }),
    )
  })

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]

console.log(`git latency · ${process.platform} · node ${process.versions.node} · ${SAMPLES} fresh processes each`)
console.log(`git: ${git}`)
console.log(`budget: ${GIT_TIMEOUT_MS} ms\n`)

for (const dir of process.argv.slice(2).length ? process.argv.slice(2) : ['.']) {
  const cwd = resolve(dir)
  const first = await once(cwd)
  if (!first.ok) {
    console.log(`${cwd}\n  not a repository, or git failed\n`)
    continue
  }
  const times = []
  for (let i = 0; i < SAMPLES; i++) times.push((await once(cwd)).ms)
  times.sort((a, b) => a - b)
  const over = times.filter(ms => ms > GIT_TIMEOUT_MS).length
  const f = ms => `${ms.toFixed(0).padStart(4)} ms`
  console.log(cwd)
  console.log(`  first call ${f(first.ms)}   (cold: nothing cached by the OS yet)`)
  console.log(`  median ${f(quantile(times, 0.5))}   p95 ${f(quantile(times, 0.95))}   max ${f(times[times.length - 1])}`)
  console.log(`  over budget: ${over} of ${SAMPLES} (${Math.round((100 * over) / SAMPLES)} %)\n`)
}
