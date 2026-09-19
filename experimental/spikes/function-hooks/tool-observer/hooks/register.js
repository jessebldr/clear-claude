// Spike B — tool-observer. Question: can a hook see tool name, input, result, error status and timing
// without altering anything? Observe only: the result of next(e) is returned as received.
// Output dir: $CLEAR_SPIKE_OUT or .spike-out. A spike may record commands; production code must not.
const calls = []

export function register(on) {
  on('tool.call', async ($, e, next) => {
    const startedAt = Date.now()
    const r = await next(e)
    const result = r && typeof r.result === 'object' && r.result !== null ? r.result : null
    calls.push({
      n: calls.length + 1,
      tool: e.tool,
      toolUseId: e.tool_use_id ?? null,
      agentId: e.agentId ?? null,
      inputKeys: Object.keys(e),
      command: e.tool === 'Bash' ? e.command : undefined,
      filePath: typeof e.file_path === 'string' ? e.file_path : undefined,
      startedAt,
      ms: Date.now() - startedAt,
      envelopeKeys: Object.keys(r ?? {}),
      isError: r?.isError === true,
      denied: typeof r?.deny === 'string',
      resultKeys: result ? Object.keys(result) : null,
      interrupted: result?.interrupted,
      backgroundTaskId: result?.backgroundTaskId,
      returnCodeInterpretation: result?.returnCodeInterpretation,
      textHead: typeof r?.text === 'string' ? r.text.slice(0, 160) : null,
    })
    const dir = (await $.env.get('CLEAR_SPIKE_OUT')) ?? '.spike-out'
  await $.fs.write(`${dir}/tool-observer.json`, JSON.stringify(calls, null, 2))
    return r
  })
}
