// Spike D — state. Question: does module state survive across turns, and does $.store survive across processes?
// Spike E — compact. Question: is there a usable compaction event, what does it carry, can it be passed through?
// Observe only. Output dir: $CLEAR_SPIKE_OUT or .spike-out. Records counts and keys, never message text.
const log = []
let turnsThisProcess = 0

async function record($, entry) {
  log.push({ n: log.length + 1, at: Date.now(), ...entry })
  const dir = (await $.env.get('CLEAR_SPIKE_OUT')) ?? '.spike-out'
  await $.fs.write(`${dir}/state-compact.json`, JSON.stringify(log, null, 2))
}

export function register(on) {
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    turnsThisProcess += 1
    const turnsEver = Number((await $.store.get('turnsEver')) ?? 0) + 1
    await $.store.set('turnsEver', turnsEver)
    $.ui.status(`spike-state: turn ${turnsThisProcess} this process, ${turnsEver} ever`)
    await record($, { event: 'turn.complete', turnsThisProcess, turnsEver, reason: e.reason })
    return r
  })
  on('session.compact', async ($, e, next) => {
    const before = { trigger: e.trigger, agentId: e.agentId ?? null, hasInstructions: typeof e.instructions === 'string', messagesIn: e.messages.length, messageKeys: Object.keys(e.messages[0] ?? {}) }
    const r = await next(e)
    await record($, { event: 'session.compact', ...before, resultKeys: Object.keys(r ?? {}), messagesOut: r?.messages?.length ?? null, skipped: r?.skip ?? null })
    return r
  })
}
