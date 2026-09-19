#!/usr/bin/env node
// Clear UI observer: the hook behind verification state (PostToolUse, PostToolUseFailure) and the
// background half of the activity row (Stop, SessionStart).
//
// It observes and records; it never renders and never decides anything for Claude. It prints
// nothing -- hook output lands in the model's context -- and always exits 0, because an observer
// must not be able to disturb the session it watches.
//
// Opt-in is per project and lives in the project: `.claude/clear-ui.json` with
//   { "verify": ["npm test", "uv run pytest"] }
// Without that file this exits at once and records nothing, edits included. A command counts as
// verification only when the project lists it; nothing is guessed from a command's name.
//
// What is stored: a hash of the command, whether it failed, when it finished and how long it
// took. Never the command, never its output.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const leave = () => process.exit(0)
process.on('uncaughtException', leave)
process.on('unhandledRejection', leave)

const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const MAX_PROJECT_FILE_BYTES = 64 * 1024

function projectEntries(projectDir, verifyEntriesOf) {
  try {
    const text = readFileSync(join(projectDir, '.claude', 'clear-ui.json'), 'utf8')
    if (text.length > MAX_PROJECT_FILE_BYTES) return []
    return verifyEntriesOf(JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text))
  } catch {
    return []
  }
}

async function main() {
  const [{ readStdin }, { isVerification, verifyEntriesOf }, { writeRecord }, { paths }, { backgroundCount }] = await Promise.all([
    import('../src/stdin.mjs'),
    import('../src/verify.mjs'),
    import('../src/session-state.mjs'),
    import('../src/paths.mjs'),
    import('../src/activity.mjs'),
  ])
  const input = await readStdin(process.stdin)
  if (input === null) return leave()
  // The same directory the status line reads, derived the same way, so the two always agree.
  const place = paths()
  const stateDir = join(place.dataDir, 'state')
  const now = Date.now()
  const event = input.hook_event_name

  // The activity row's other half. Stop is the only moment Claude Code says which background
  // commands are running, so the count is a snapshot of that moment; a new session starts from
  // none. Recorded only where setup switched the activity row on.
  if (event === 'Stop' || event === 'SessionStart') {
    if (existsSync(place.activityMarker)) {
      const running = event === 'Stop' ? backgroundCount(input.background_tasks) : 0
      writeRecord(stateDir, input.session_id, 'background', { at: now, running }, now)
    }
    return leave()
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd
  if (typeof projectDir !== 'string' || projectDir === '') return leave()
  const entries = projectEntries(projectDir, verifyEntriesOf)
  if (entries.length === 0) return leave()

  const tool = input.tool_name

  if (event === 'PostToolUse' && EDIT_TOOLS.has(tool)) {
    writeRecord(stateDir, input.session_id, 'edit', { at: now }, now)
  } else if (SHELL_TOOLS.has(tool) && (event === 'PostToolUse' || event === 'PostToolUseFailure')) {
    // An interrupted run has no result to record.
    if (input.is_interrupt === true || input.tool_response?.interrupted === true) return leave()
    // Nor has one sent to the background: the call returns at once, the command is still
    // running, and nothing fires when it ends.
    if (input.tool_input?.run_in_background === true) return leave()
    const command = input.tool_input?.command
    if (!isVerification(command, entries)) return leave()
    writeRecord(
      stateDir,
      input.session_id,
      'verify',
      {
        hash: createHash('sha256').update(command.trim()).digest('hex').slice(0, 16),
        failed: event === 'PostToolUseFailure',
        at: now,
        durationMs: Number.isFinite(input.duration_ms) ? Math.round(input.duration_ms) : null,
      },
      now,
    )
  }
  leave()
}

try {
  await main()
} catch {
  leave()
}
