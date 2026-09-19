// Pure. No I/O, no Node API.
//
// Maps Claude Code's statusline stdin JSON onto the small state the renderer draws. The
// renderer never sees the raw payload, so another host (a function-hooks module fed by
// `session.measure`) can build the same state from a different source later.
//
// Every field is optional and distrusted: a missing, null or wrongly typed value becomes
// null and its segment disappears. Unknown fields are ignored. Strings are passed on raw:
// the renderer sanitizes everything it prints, in one place.

const EFFORT_LEVEL = /^[a-z]{1,8}$/

const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)
const stringOrNull = value => (typeof value === 'string' && value !== '' ? value : null)
const finiteOrNull = value => (typeof value === 'number' && Number.isFinite(value) ? value : null)

function lastPathSegment(path) {
  if (typeof path !== 'string') return ''
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : ''
}

function contextPercentOf(contextWindow) {
  if (!isObject(contextWindow)) return null
  const native = finiteOrNull(contextWindow.used_percentage)
  if (native !== null) return native
  // used_percentage is null before the first API response and right after /compact; when
  // the token counts are there anyway, derive it the way Claude Code does (input side only).
  const size = finiteOrNull(contextWindow.context_window_size)
  const usage = contextWindow.current_usage
  if (size === null || size <= 0 || !isObject(usage)) return null
  const tokens = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']
    .map(key => finiteOrNull(usage[key]))
    .filter(count => count !== null)
  if (tokens.length === 0) return null
  return (tokens.reduce((sum, count) => sum + count, 0) / size) * 100
}

function rateWindowOf(window) {
  if (!isObject(window)) return null
  const percent = finiteOrNull(window.used_percentage)
  if (percent === null) return null
  const resetsAtSeconds = finiteOrNull(window.resets_at)
  return { percent, resetsAt: resetsAtSeconds === null ? null : resetsAtSeconds * 1000 }
}

/**
 * Returns the render state, or null when `input` does not look like a statusline payload
 * (nothing is drawn for it).
 */
export function stateFromStatusline(input) {
  if (!isObject(input)) return null
  if (!isObject(input.model) && !isObject(input.context_window)) return null

  const workspace = isObject(input.workspace) ? input.workspace : {}
  const effortLevel = isObject(input.effort) ? input.effort.level : null
  const rateLimits = isObject(input.rate_limits) ? input.rate_limits : {}
  const costs = isObject(input.cost) ? input.cost : {}
  const cost = finiteOrNull(costs.total_cost_usd)

  return {
    model: isObject(input.model) ? stringOrNull(input.model.display_name) : null,
    effort: typeof effortLevel === 'string' && EFFORT_LEVEL.test(effortLevel) ? effortLevel : null,
    project: stringOrNull(lastPathSegment(workspace.project_dir) || lastPathSegment(input.cwd)),
    // Native stdin has no branch or dirty state; the entry fills this from one `git status`.
    git: null,
    gitDir: stringOrNull(workspace.current_dir) ?? stringOrNull(input.cwd) ?? stringOrNull(workspace.project_dir),
    contextPercent: contextPercentOf(input.context_window),
    fiveHour: rateWindowOf(rateLimits.five_hour),
    sevenDay: rateWindowOf(rateLimits.seven_day),
    costUsd: cost,
    // Drawn only by the `full` preset.
    linesAdded: finiteOrNull(costs.total_lines_added),
    linesRemoved: finiteOrNull(costs.total_lines_removed),
    outputStyle: isObject(input.output_style) ? stringOrNull(input.output_style.name) : null,
    // Names the session's state files. The entry fills `verification` from them.
    sessionId: stringOrNull(input.session_id),
    verification: null,
    activity: null,
    // Model-scoped weekly usage, which the payload does not carry. The entry fills it from the
    // opt-in provider's cache, and the renderer draws it as one more quota chip.
    usage: null,
  }
}
