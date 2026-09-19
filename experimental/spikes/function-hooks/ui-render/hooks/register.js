// Spike C — ui-render. Questions: which components does the terminal raise ui.render for, can tool rows and
// agent activity be identified, and does a rewrite or a replacement tree actually draw?
// Records component names and prop KEYS only (never prop values). Output dir: $CLEAR_SPIKE_OUT or .spike-out.
// Two deliberate, harmless changes so the effect is visible in a terminal capture:
//   1. Spinner: message rewritten to "[spike] working"
//   2. ToolGroup (finished, not expanded): replaced by a one-line tree "[spike] N tool call(s) finished".
//      While e.props.isExpanded (ctrl+o) the engine's own drawing is returned, so detail stays recoverable.
//      (First run: a lone Bash call is drawn as ToolGroup on the terminal; ToolUse never fired on its own.)
const components = {}
let renders = 0

async function flush($) {
  const dir = (await $.env.get('CLEAR_SPIKE_OUT')) ?? '.spike-out'
  await $.fs.write(`${dir}/ui-render.json`, JSON.stringify({ renders, components }, null, 2))
}

export function register(on) {
  on('ui.render', async ($, e, next) => {
    renders += 1
    const seen = components[e.component] ?? { count: 0, surface: e.surface, hasRequestId: false, propKeys: [] }
    const isNew = seen.count === 0
    seen.count += 1
    seen.hasRequestId = seen.hasRequestId || typeof e.requestId === 'string'
    seen.propKeys = [...new Set([...seen.propKeys, ...Object.keys(e.props ?? {})])]
    if (e.component === 'ToolUse') seen.tools = [...new Set([...(seen.tools ?? []), e.props.tool])]
    if (e.component === 'Spinner') seen.modes = [...new Set([...(seen.modes ?? []), e.props.mode])]
    components[e.component] = seen
    if (isNew || renders % 20 === 0) await flush($)
    $.ui.status(`spike-ui: ${renders} renders, ${Object.keys(components).length} components`)

    if (e.component === 'Spinner') {
      return next({ ...e, props: { ...e.props, message: '[spike] working' } })
    }
    if (e.component === 'ToolGroup') {
      seen.callKeys = [...new Set([...(seen.callKeys ?? []), ...Object.keys(e.props.calls?.[0] ?? {})])]
      if (!e.props.isActive && !e.props.isExpanded) {
        const { Text } = $.ui.resolve(e)
        return h(Text, null, `[spike] ${e.props.calls.length} tool call(s) finished`)
      }
    }
    return next(e)
  })
  on('session.end', async ($, e, next) => {
    await flush($)
    return next(e)
  })
}
