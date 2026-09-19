#!/usr/bin/env node
// Clear UI agent feed: a `subagentStatusLine` command used as a data feed and nothing else.
//
// Claude Code pipes the agent panel's rows to this command on every panel refresh. It prints
// nothing -- every row omitted from the output keeps Claude Code's own rendering, so the panel is
// never altered -- and records what is running for the status line to count.
//
// What is stored per task: its type, status and start time. Never the name, the description or
// the label, which are written by the model about the user's work -- the row draws counts.
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const leave = () => process.exit(0)
process.on('uncaughtException', leave)
process.on('unhandledRejection', leave)

const MAX_TASKS = 64

// As the status line does: the data directory is the parent of the installed runtime.
function dataDirOf(env, entryUrl) {
  if (env.CLEAR_UI_DATA_DIR) return env.CLEAR_UI_DATA_DIR
  const runtimeDir = resolve(dirname(fileURLToPath(entryUrl)), '..')
  return basename(runtimeDir) === 'runtime' ? dirname(runtimeDir) : undefined
}

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : null)

async function main() {
  const [{ readStdin }, { writeRecord }] = await Promise.all([import('../src/stdin.mjs'), import('../src/session-state.mjs')])
  const input = await readStdin(process.stdin)
  const dataDir = dataDirOf(process.env, import.meta.url)
  if (input === null || !dataDir || !Array.isArray(input.tasks)) return leave()
  const now = Date.now()
  const tasks = input.tasks
    .filter(task => typeof task === 'object' && task !== null)
    .slice(0, MAX_TASKS)
    .map(task => ({
      type: text(task.type, 24),
      status: text(task.status, 24),
      startTime: Number.isFinite(task.startTime) ? task.startTime : null,
    }))
  writeRecord(join(dataDir, 'state'), input.session_id, 'agents', { at: now, tasks }, now)
  leave()
}

try {
  await main()
} catch {
  leave()
}
