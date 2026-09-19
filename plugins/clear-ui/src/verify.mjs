// Pure. No I/O, no Node API.
//
// Verification state is a record of observed facts, never an inference: a command the project
// itself named as its verification finished, at a time, and failed or did not; a file was edited
// after that, or was not. Whether the edit is *covered* by the command is not something a hook
// can know, so nothing here claims it.

export const MAX_ENTRIES = 32
export const MAX_ENTRY_LENGTH = 200
// A record older than this describes another working day; drawing it would be noise.
export const RECORD_MAX_AGE_MS = 24 * 60 * 60 * 1000

const normalise = text => text.trim().replace(/\s+/g, ' ')

/** The `verify` list of a project file, cleaned: strings only, bounded, normalised. */
export function verifyEntriesOf(projectConfig) {
  const list = projectConfig?.verify
  if (!Array.isArray(list)) return []
  return list
    .filter(entry => typeof entry === 'string' && entry.trim() !== '' && entry.length <= MAX_ENTRY_LENGTH)
    .slice(0, MAX_ENTRIES)
    .map(normalise)
}

/**
 * Splits a shell command into pipelines: [{ stages, then: '&&' | '||' | ';' | '&' | null }].
 *
 * It is not a shell parser, and the commands it sees come from two shells that disagree about
 * what a backslash means. So it follows only what reads the same in both, and returns [] for
 * anything else -- an unclosed quote, a backslash beside a quote, a here-document, a command
 * substitution. No pipelines means no match, which draws nothing; following a construct wrongly
 * is how a failing run would come to be recorded as a pass.
 */
export function splitCommand(command) {
  const pipelines = []
  let stages = []
  let current = ''
  let quote = null
  const endStage = () => {
    stages.push(normalise(current))
    current = ''
  }
  const endPipeline = then => {
    endStage()
    pipelines.push({ stages, then })
    stages = []
  }
  for (let i = 0; i < command.length; i++) {
    const char = command[i]
    const next = command[i + 1]
    const pair = command.slice(i, i + 2)
    // Bash escapes with a backslash and PowerShell does not, so beside a quote it decides where
    // the quote ends and the two shells decide differently.
    if (char === '\\' && (next === '"' || next === "'")) return []
    if (char === '`' || pair === '$(') return []
    if (quote) {
      if (char === quote) quote = null
      current += char
    } else if (char === '"' || char === "'") {
      quote = char
      current += char
    } else if (pair === '<<') return []
    else if (char === '\\' && (next === '\n' || next === '\r')) {
      // A continued line is one line.
      current += ' '
      i += next === '\r' && command[i + 2] === '\n' ? 2 : 1
    }
    // A comment runs to the end of its line, in both shells.
    else if (char === '#' && (i === 0 || /\s/.test(command[i - 1]))) {
      while (i + 1 < command.length && command[i + 1] !== '\n') i++
    } else if (pair === '&&' || pair === '||') {
      endPipeline(pair)
      i++
    } else if (char === ';' || char === '\n') endPipeline(';')
    // `2>&1` and `|&` are redirections, not the background operator.
    else if (char === '&' && command[i - 1] !== '>' && next !== '>' && command[i - 1] !== '|') endPipeline('&')
    else if (char === '|') endStage()
    else current += char
  }
  if (quote) return []
  endPipeline(null)
  return pipelines.filter(pipeline => pipeline.stages.some(stage => stage !== ''))
}

const startsWithEntry = (stage, entry) => stage === entry || stage.startsWith(`${entry} `)

/**
 * True when `command` runs a listed verification command in a position where the tool call's
 * exit status is that command's own.
 *
 * The position matters because the only evidence of failure a hook gets is the status of the
 * whole call. `npm test | tail` reports tail's status and `npm test; echo done` reports echo's,
 * so a failing run would be recorded as a pass; after `true || npm test` the command never ran
 * at all. Those are not counted: an honest blank is better than a wrong "verified". Only `&&`
 * may follow, because it cannot hide a failure.
 */
export function isVerification(command, entries) {
  if (typeof command !== 'string' || entries.length === 0) return false
  const pipelines = splitCommand(command)
  // A trap can replace the exit status of everything after it.
  if (pipelines.some(pipeline => pipeline.stages.some(stage => stage === 'trap' || stage.startsWith('trap ')))) return false
  for (let i = 0; i < pipelines.length; i++) {
    const last = pipelines[i].stages[pipelines[i].stages.length - 1]
    if (!entries.some(entry => startsWithEntry(last, entry))) continue
    // Reached through `||`, it ran only if something before it failed.
    if (i > 0 && pipelines[i - 1].then === '||') continue
    // A trailing `;` hides nothing; a trailing `&` hides everything, because the call returns
    // before the command has a result.
    const hidesNothing = (pipeline, offset) =>
      pipeline.then === '&&' || pipeline.then === null || (pipeline.then === ';' && i + offset === pipelines.length - 1)
    if (pipelines.slice(i).every(hidesNothing)) return true
  }
  return false
}

/**
 * What the status line should say, from the two records a session keeps.
 * @returns { status: 'verified' | 'failed' | 'edited', at } or null
 */
export function verificationOf(verifyRecord, editRecord, now) {
  const at = verifyRecord?.at
  if (!Number.isFinite(at) || !Number.isFinite(now) || at > now || now - at > RECORD_MAX_AGE_MS) return null
  if (verifyRecord.failed === true) return { status: 'failed', at }
  // An edit made while the command was still running is an edit it may not have seen.
  const startedAt = at - (Number.isFinite(verifyRecord.durationMs) && verifyRecord.durationMs > 0 ? verifyRecord.durationMs : 0)
  if (Number.isFinite(editRecord?.at) && editRecord.at > startedAt) return { status: 'edited', at }
  return { status: 'verified', at }
}
