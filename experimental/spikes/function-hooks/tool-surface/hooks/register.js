// Spike G — tool-surface. Question: what does ui.render raise around tool calls, sub-agents and background
// work on this build, and with which flags, so a transcript mod knows what it can safely redraw?
// Pass-through only: every hook returns next(e) unchanged. Records a timeline of component names, flags,
// tool names and KEY names (of props, inputs, outputs). Never a value of an input or an output.
// Output: $CLEAR_SPIKE_OUT/tool-surface.json (or ./.spike-out).
//
// It also observes tool.call, to line results up with the rows. Spike only: on 2.1.272-2.1.278 ANY tool.call
// hook on Bash, even this pass-through, breaks sub-agents that use worktree isolation (claude-code#92533).
// Nothing that ships may hook tool.call; Clear Transcript does not.
const timeline = []
const ids = new Map()
let t0 = null
let dirty = 0

const FLAGS = ['isRunning', 'isErrored', 'isInterrupted', 'isActive', 'isExpanded', 'isFirstOfReply', 'kind', 'mode', 'tool', 'command']

function keysOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `array(${v.length})`
  if (typeof v === 'object') return Object.keys(v)
  return typeof v
}

function describeCall(call) {
  return {
    tool: call.tool,
    isRunning: call.isRunning,
    isErrored: call.isErrored,
    isInterrupted: call.isInterrupted,
    keys: Object.keys(call),
    input: keysOf(call.input),
    output: keysOf(call.output),
  }
}

async function save($) {
  const dir = (await $.env.get('CLEAR_SPIKE_OUT')) ?? '.spike-out'
  await $.fs.write(`${dir}/tool-surface.json`, JSON.stringify({ instances: ids.size, renders: timeline.length, timeline }, null, 1))
  dirty = 0
}

export function register(on) {
  on('ui.render', async ($, e, next) => {
    if (e.component === 'AbovePrompt' || e.component === 'PromptHint' || e.component === 'SessionMode') return next(e)
    const now = await $.clock.now()
    if (t0 === null) t0 = now
    if (!ids.has(e.requestId)) ids.set(e.requestId, ids.size)
    const props = e.props ?? {}
    const row = { t: now - t0, component: e.component, instance: ids.get(e.requestId), propKeys: Object.keys(props), columns: e.viewport?.columns }
    for (const flag of FLAGS) if (flag in props && typeof props[flag] !== 'object') row[flag] = props[flag]
    if (typeof props.text === 'string') row.textLen = props.text.length
    if ('input' in props) row.input = keysOf(props.input)
    if ('output' in props) row.output = keysOf(props.output)
    if (Array.isArray(props.calls)) row.calls = props.calls.map(describeCall)
    const last = timeline[timeline.length - 1]
    const same = last && JSON.stringify({ ...last, t: 0, repeats: 0 }) === JSON.stringify({ ...row, t: 0, repeats: 0 })
    if (same) last.repeats = (last.repeats ?? 1) + 1
    else timeline.push(row)
    dirty += 1
    if (dirty >= 15) await save($)
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const now = await $.clock.now()
    timeline.push({ t: t0 === null ? 0 : now - t0, event: 'tool.call', tool: e.tool, agentId: typeof e.agentId === 'string', isError: result?.isError === true, resultKeys: keysOf(result?.result) })
    return result
  })
  on('session.end', async ($, e, next) => {
    await save($)
    return next(e)
  })
}
