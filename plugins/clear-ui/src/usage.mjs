// Pure. No I/O, no Node API.
//
// The opt-in usage provider: what `claude -p /usage` is asked, what of its answer is believed, and
// what the status line may still say about it later. The status-line payload carries the session
// and weekly windows and nothing model-scoped; Claude Code's own headless `/usage` does, as a
// structured `usage_report` on a stream-json event. Measured on 2.1.278 and documented nowhere, so
// everything here is written for the day the shape changes: a run that does not match exactly is
// not an answer. See docs/research/headless-usage.md.

import { formatCountdown } from './layout.mjs'

export const USAGE_CACHE_VERSION = 1
// How often, and for how long an answer is believed. A weekly window moves slowly and arrives as a
// whole percent: sampled seven times over 24 minutes of one busy session, the scoped row went
// 64 -> 65 and the all-models row did not move. At ten minutes the bar is a point behind at worst
// at that rate, two or three with several sessions burning at once -- and every refresh is a full
// Claude Code start that rewrites ~/.claude.json and makes its start-up requests, against an
// endpoint the documentation calls often rate limited. Five minutes bought nothing for that.
/** One refresh per this long, at most, whether or not the last one worked. */
export const USAGE_REFRESH_MS = 10 * 60 * 1000
/**
 * Past this age the last good answer is not drawn: three attempts have failed. Claude Code's own
 * usage screen falls back to bars up to an hour old; a bar that cannot say how old it is gets half that.
 */
export const USAGE_MAX_AGE_MS = 30 * 60 * 1000

export const USAGE_COMMAND = '/usage'
// `/usage` is a built-in that makes no model turn and costs nothing, so it runs under any budget;
// the hardening is for the day it is not one. The budget does NOT prevent a first accidental model
// call: it is checked after a turn, so it stops the second. Measured with a real prompt in the
// command's place: one turn, then `error_max_budget_usd` and exit 1. What bounds that first turn is
// the cheapest model with no tools -- $0.004, where the same accident on the session's own model
// was $0.136 -- and what keeps its answer out of the cache is parseUsageRun, not the budget.
export const USAGE_BUDGET_USD = '0.0001'

/**
 * The whole argument vector, passed to spawn as an array and never through a shell. A shell is how
 * `/usage` stops being a command: Git Bash rewrites a leading slash into a path under its install
 * directory, and `C:/Program Files/Git/usage` is a prompt, answered by a model, for money.
 */
export const USAGE_ARGS = Object.freeze([
  '-p',
  USAGE_COMMAND,
  '--safe-mode',
  '--output-format',
  'stream-json',
  '--verbose',
  '--no-session-persistence',
  '--max-budget-usd',
  USAGE_BUDGET_USD,
  '--model',
  'haiku',
  '--tools',
  '',
])

const KINDS = new Set(['session', 'weekly_all', 'weekly_scoped'])
const SCOPED = 'weekly_scoped'
const SYNTHETIC_MODEL = '<synthetic>'
const MAX_ROWS = 16
const MAX_LABEL_LENGTH = 40
const MAX_PERCENT = 1000
const ZERO_TOKEN_KEYS = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']
const VERSION_TEXT = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/
// ISO-8601 with an offset. The fraction arrives in microseconds; a Date holds milliseconds.
const INSTANT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/

const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)
const fail = reason => ({ ok: false, reason })

function instantOf(text) {
  if (typeof text !== 'string') return null
  const [, base, fraction = '', zone] = text.match(INSTANT) ?? []
  if (!base) return null
  const ms = Date.parse(`${base}.${fraction.slice(0, 3).padEnd(3, '0')}${zone}`)
  return Number.isFinite(ms) ? ms : null
}

// A row of a kind this version knows must be well formed, or nothing in the report is believed:
// a percent that stopped being a number means the schema moved. A kind it does not know is
// skipped, and so is a scoped row with no model name on it -- both are what a newer Claude Code
// would add, not what a broken one would send.
function rowOf(raw) {
  if (!isObject(raw) || typeof raw.kind !== 'string') return undefined
  if (!KINDS.has(raw.kind)) return null
  if (typeof raw.percent !== 'number' || !Number.isFinite(raw.percent) || raw.percent < 0 || raw.percent > MAX_PERCENT) return undefined
  const resetsAt = raw.resets_at === null || raw.resets_at === undefined ? null : instantOf(raw.resets_at)
  if (resetsAt === null && raw.resets_at !== null && raw.resets_at !== undefined) return undefined
  if (raw.kind !== SCOPED) return { kind: raw.kind, label: null, percent: raw.percent, resetsAt }
  // Whatever the model is called is what is stored: no model is named in this file.
  const name = isObject(raw.scope) && isObject(raw.scope.model) ? raw.scope.model.display_name : null
  const label = typeof name === 'string' ? name.trim() : ''
  if (label === '' || label.length > MAX_LABEL_LENGTH) return null
  return { kind: SCOPED, label, percent: raw.percent, resetsAt }
}

/**
 * The stdout and exit code of one `claude` run -> `{ ok: true, record }` or `{ ok: false, reason }`.
 *
 * A run is an answer only when it proves it was the built-in command and nothing else: exit 0, one
 * successful result naming `usage` as a local command, no turn, no cost, no API time, no token, no
 * model, and every assistant message a synthetic one. Only `usage_report` is read. The rendered
 * text is not, anywhere: offline with a stale snapshot, Claude Code prints the old percentages with
 * no mark on them while the structured `limits` is null -- the text cannot be told from an answer.
 */
export function parseUsageRun(stdout, exitCode, now) {
  if (exitCode !== 0) return fail('exit')
  if (typeof stdout !== 'string' || !Number.isFinite(now)) return fail('input')
  const events = []
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue
    try {
      events.push(JSON.parse(line))
    } catch {
      return fail('unparseable')
    }
  }
  const results = events.filter(event => isObject(event) && event.type === 'result')
  if (results.length !== 1) return fail('result-count')
  const [result] = results
  if (result.subtype !== 'success' || result.is_error !== false) return fail('result-error')
  if (result.local_command !== 'usage') return fail('not-the-builtin')
  if (result.num_turns !== 0 || result.total_cost_usd !== 0 || result.duration_api_ms !== 0) return fail('model-turn')
  if (!isObject(result.usage) || ZERO_TOKEN_KEYS.some(key => result.usage[key] !== 0)) return fail('tokens')
  if (!isObject(result.modelUsage) || Object.keys(result.modelUsage).length !== 0) return fail('model-usage')

  const assistants = events.filter(event => isObject(event) && event.type === 'assistant')
  if (assistants.some(event => !isObject(event.message) || event.message.model !== SYNTHETIC_MODEL)) return fail('real-model')
  const reports = assistants.filter(event => isObject(event.usage_report))
  if (reports.length !== 1) return fail('report-count')
  const rateLimits = reports[0].usage_report.rate_limits
  // null here is Claude Code saying it could not reach the endpoint and had no fresh snapshot.
  if (!isObject(rateLimits) || !Array.isArray(rateLimits.limits)) return fail('no-limits')
  if (rateLimits.limits.length > MAX_ROWS) return fail('too-many-rows')

  const limits = []
  for (const raw of rateLimits.limits) {
    const row = rowOf(raw)
    if (row === undefined) return fail('row-schema')
    if (row !== null) limits.push(row)
  }
  const init = events.find(event => isObject(event) && event.type === 'system' && event.subtype === 'init')
  const version = init?.claude_code_version
  return {
    ok: true,
    record: { version: USAGE_CACHE_VERSION, fetchedAt: now, claudeCode: typeof version === 'string' && VERSION_TEXT.test(version) ? version : null, limits },
  }
}

/** A cache file's contents, as distrusted as the run that produced them. The record, or null. */
export function usageRecordOf(value) {
  if (!isObject(value) || value.version !== USAGE_CACHE_VERSION || !Number.isFinite(value.fetchedAt)) return null
  if (!Array.isArray(value.limits) || value.limits.length > MAX_ROWS) return null
  const limits = []
  for (const row of value.limits) {
    if (!isObject(row) || !KINDS.has(row.kind)) return null
    if (typeof row.percent !== 'number' || !Number.isFinite(row.percent) || row.percent < 0 || row.percent > MAX_PERCENT) return null
    if (row.resetsAt !== null && !Number.isFinite(row.resetsAt)) return null
    const scoped = row.kind === SCOPED
    if (scoped ? typeof row.label !== 'string' || row.label === '' || row.label.length > MAX_LABEL_LENGTH : row.label !== null) return null
    limits.push({ kind: row.kind, label: row.label, percent: row.percent, resetsAt: row.resetsAt })
  }
  return { version: USAGE_CACHE_VERSION, fetchedAt: value.fetchedAt, claudeCode: typeof value.claudeCode === 'string' && VERSION_TEXT.test(value.claudeCode) ? value.claudeCode : null, limits }
}

/**
 * The doctor's line: whether the provider is on, how old its last good answer is, and when it last
 * tried. Read-only by construction -- it is given what was already on disk. Counts, not labels: a
 * label is text that arrived from outside, and the doctor's output is relayed into a transcript.
 *
 * @returns { result: 'PASS' | 'WARN' | 'UNKNOWN', detail }
 */
export function describeUsage({ enabled, record, lastAttemptAt, hasClaude, now }) {
  if (!enabled) return { result: 'PASS', detail: 'off (the default) -- the status line reaches no network' }
  if (!hasClaude) return { result: 'WARN', detail: 'on, but there is no `claude` executable on PATH (on Windows only claude.exe counts: a .cmd shim needs a shell)' }
  const ago = at => (Number.isFinite(at) && at <= now ? `${formatCountdown(now - at)} ago` : null)
  const attempt = ago(lastAttemptAt)
  const tried = attempt ? `last attempt ${attempt}` : 'no attempt recorded'
  if (!record) {
    return attempt
      ? { result: 'WARN', detail: `on · no good answer yet · ${tried} -- run usage-refresh.mjs with --report to see why` }
      : { result: 'UNKNOWN', detail: 'on · no answer yet -- the first refresh starts with the next status line tick' }
  }
  const age = now - record.fetchedAt
  const scoped = record.limits.filter(row => row.kind === SCOPED).length
  const what = `last good answer ${ago(record.fetchedAt) ?? 'dated in the future'}${record.claudeCode ? ` (Claude Code ${record.claudeCode})` : ''} · ${scoped} scoped row${scoped === 1 ? '' : 's'}`
  if (!(age >= 0 && age <= USAGE_MAX_AGE_MS)) return { result: 'WARN', detail: `on · ${what} · too old to draw (over ${formatCountdown(USAGE_MAX_AGE_MS)}) · ${tried}` }
  return { result: 'PASS', detail: `on · ${what} · ${tried} · refreshed every ${formatCountdown(USAGE_REFRESH_MS)} at most` }
}

/** Whether the record is old enough to ask again. A record from the future is a changed clock. */
export function refreshDue(record, now) {
  if (!record) return true
  const age = now - record.fetchedAt
  return !(age >= 0 && age < USAGE_REFRESH_MS)
}

/**
 * What the status line may say: the model-scoped weekly rows, while they can still be believed.
 * The session and all-models windows stay with the status-line payload, which is always newer.
 *
 * @returns { fetchedAt, weeklyScoped: [{ label, percent, resetsAt }] } or null
 */
export function usageOf(record, now) {
  if (!record || !Number.isFinite(now)) return null
  const age = now - record.fetchedAt
  if (!(age >= 0 && age <= USAGE_MAX_AGE_MS)) return null
  // A window that has reset since the fetch is back near zero; its old percent is about nothing.
  const weeklyScoped = record.limits
    .filter(row => row.kind === SCOPED && (row.resetsAt === null || row.resetsAt > now))
    .map(({ label, percent, resetsAt }) => ({ label, percent, resetsAt }))
  return weeklyScoped.length === 0 ? null : { fetchedAt: record.fetchedAt, weeklyScoped }
}
