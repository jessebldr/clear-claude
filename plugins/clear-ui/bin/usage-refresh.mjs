#!/usr/bin/env node
// Clear UI usage worker: one headless `claude -p /usage`, and the cache file when it is believed.
//
//   node bin/usage-refresh.mjs <cache directory> [--report]
//
// Started detached by the status line, at most once per ten minutes across every session, and
// only where `configure.mjs usage on` was run. It reads no credential and calls no API itself:
// Claude Code does both, the way it does for its own /usage screen. Like every hook here it prints
// nothing and always exits 0. `--report` is for a person or the doctor: one JSON line saying
// whether the run was believed, and if not, why.
import { isAbsolute } from 'node:path'

const leave = () => process.exit(0)
process.on('uncaughtException', leave)
process.on('unhandledRejection', leave)
process.stdout.on('error', leave)

async function main() {
  const [cacheDir, ...flags] = process.argv.slice(2)
  if (typeof cacheDir !== 'string' || !isAbsolute(cacheDir)) return leave()
  const { refreshUsage } = await import('../src/usage-cache.mjs')
  const outcome = await refreshUsage({ cacheDir })
  if (!flags.includes('--report')) return leave()
  process.stdout.write(JSON.stringify(outcome) + '\n', leave)
}

try {
  await main()
} catch {
  leave()
}
