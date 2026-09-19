// Spike A — hello-runtime. Question: does a hooks module load and receive events at all?
// Observe only: every hook returns next(e) untouched. Output dir: $CLEAR_SPIKE_OUT or .spike-out.
const seen = []

async function record($, event, detail) {
  seen.push({ n: seen.length + 1, event, at: Date.now(), ...detail })
  const dir = (await $.env.get('CLEAR_SPIKE_OUT')) ?? '.spike-out'
  await $.fs.write(`${dir}/hello-runtime.json`, JSON.stringify(seen, null, 2))
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await record($, 'session.start', { inputKeys: Object.keys(e) })
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    await record($, 'prompt.submit', { inputKeys: Object.keys(e), textLength: e.text.length })
    return next(e)
  })
  on('turn.start', async ($, e, next) => {
    await record($, 'turn.start', { inputKeys: Object.keys(e) })
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await record($, 'turn.complete', { inputKeys: Object.keys(e), reason: e.reason, resultKeys: Object.keys(r ?? {}) })
    return r
  })
  on('session.measure', async ($, e, next) => {
    await record($, 'session.measure', { changed: e.changed, context: e.context, rateLimits: e.rateLimits, hasCost: e.cost !== undefined })
    return next(e)
  })
  on('session.end', async ($, e, next) => {
    await record($, 'session.end', { reason: e.reason })
    return next(e)
  })
}
