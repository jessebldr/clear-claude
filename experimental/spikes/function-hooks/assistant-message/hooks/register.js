// Spike F — assistant-message. Question: can ui.render improve how an AssistantMessage is drawn without
// re-implementing Markdown and without losing the original reply?
// Records SHAPES only: prop keys and types, text length, line and block counts, timings, viewport. Never the
// text itself. Output: $CLEAR_SPIKE_OUT/assistant-message-<mode>.json (or ./.spike-out).
//
// CLEAR_SPIKE_MODE picks what is drawn, so each run answers one question:
//   observe  (default) pass-through; measures how the component is raised while a reply streams
//   rewrite  next() with props.text given a first line "[spike] rewritten"; the engine's own renderer draws it
//   wrap     a returned tree: a dim "[spike]" label over ONE native <Markdown> holding the whole text
//   split    a returned tree built from PARTS: prose -> <Markdown>, fenced code -> <Code>, headings -> <Text bold>
//   multi    next() called once PER PART and the engine's own drawings stacked, a [spike] rule between them
//   final    turn.complete marks the turn's last block and invalidates; that block gets a "[spike] final" label
// In every mode: while the view is the expanded one (ctrl+o, --verbose) the engine's own drawing is returned, a
// flip of that view invalidates, and /spike-raw turns every rewrite off and on. Every visible change says [spike].
const FENCE = /^\s*(```|~~~)/
const HEADING = /^(#{1,6})\s+(.*)$/

const log = []
const ids = new Map()
const others = {}
let mode = null
let t0 = null
let dirty = 0
// UserMessage carries isExpanded (the ctrl+o transcript, --verbose); AssistantMessage does not. If rows are raised in
// transcript order, the last value seen on a UserMessage says which view an AssistantMessage is being drawn for.
let expandedView = null
let raw = false
let lastBlock = null
let finalBlock = null

function shape(text) {
  const lines = text.split('\n')
  let fences = 0
  let inFence = false
  let headings = 0
  let tableRows = 0
  let listItems = 0
  let maxLine = 0
  for (const line of lines) {
    if (line.length > maxLine) maxLine = line.length
    if (FENCE.test(line)) {
      fences += 1
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (HEADING.test(line)) headings += 1
    else if (/^\s*\|.*\|\s*$/.test(line)) tableRows += 1
    else if (/^\s*([-*+]|\d+[.)])\s/.test(line)) listItems += 1
  }
  return { len: text.length, lines: lines.length, fences, openFence: inFence, headings, tableRows, listItems, maxLine, endsWithNewline: text.endsWith('\n') }
}

// Prose, fenced code and headings, in order. An unclosed fence (a reply still streaming) stays prose.
function parts(text) {
  const out = []
  let prose = []
  const lines = text.split('\n')
  const pushProse = () => {
    if (prose.join('').trim() !== '') out.push({ kind: 'prose', text: prose.join('\n') })
    prose = []
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const open = FENCE.exec(line)
    if (open) {
      const end = lines.findIndex((l, j) => j > i && l.trim() === open[1])
      if (end === -1) {
        prose.push(...lines.slice(i))
        break
      }
      pushProse()
      out.push({ kind: 'code', language: line.trim().slice(open[1].length).trim() || undefined, text: lines.slice(i + 1, end).join('\n'), fenced: lines.slice(i, end + 1).join('\n') })
      i = end
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      pushProse()
      out.push({ kind: 'heading', depth: heading[1].length, text: heading[2] })
      continue
    }
    prose.push(line)
  }
  pushProse()
  return out
}

async function flush($) {
  const dir = (await $.env.get('CLEAR_SPIKE_OUT')) ?? '.spike-out'
  await $.fs.write(`${dir}/assistant-message-${mode}.json`, JSON.stringify({ mode, instances: ids.size, renders: log.length, others, log }, null, 1))
  dirty = 0
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'spike-raw', description: '[spike] turn the transcript rewrite off or on' })
    return next(e)
  })
  on('command.run', { command: 'spike-raw' }, async ($) => {
    raw = !raw
    $.ui.invalidate('ui.render')
    return { text: `[spike] rewrites are ${raw ? 'off: the engine draws every row' : 'on'}` }
  })
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (mode === 'final' && lastBlock !== null && finalBlock !== lastBlock) {
      finalBlock = lastBlock
      $.ui.invalidate('ui.render')
    }
    return result
  })
  on('ui.render', async ($, e, next) => {
    if (mode === null) mode = (await $.env.get('CLEAR_SPIKE_MODE')) ?? 'observe'
    if (e.component === 'UserMessage' && typeof e.props?.isExpanded === 'boolean' && e.props.isExpanded !== expandedView) {
      const now = await $.clock.now()
      log.push({ t: t0 === null ? 0 : now - t0, flip: 'UserMessage.isExpanded', to: e.props.isExpanded })
      expandedView = e.props.isExpanded
      $.ui.invalidate('ui.render')
    }
    if (e.component !== 'AssistantMessage') {
      others[e.component] = (others[e.component] ?? 0) + 1
      return next(e)
    }
    const now = await $.clock.now()
    if (t0 === null) t0 = now
    if (!ids.has(e.requestId)) ids.set(e.requestId, ids.size)
    lastBlock = e.requestId
    const props = e.props ?? {}
    const text = typeof props.text === 'string' ? props.text : ''
    log.push({
      t: now - t0,
      instance: ids.get(e.requestId),
      surface: e.surface,
      propTypes: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v])),
      isFirstOfReply: props.isFirstOfReply,
      onScreen: props.onScreen == null ? props.onScreen : Object.keys(props.onScreen),
      viewport: e.viewport,
      expandedView,
      raw,
      ...shape(text),
    })
    dirty += 1
    if (dirty >= 10 || log.length < 4) await flush($)

    if (expandedView === true || raw) return next(e)
    if (mode === 'rewrite') {
      return next({ ...e, props: { ...props, text: `*[spike] rewritten*\n\n${text}` } })
    }
    const { Box, Text, Markdown, Code } = $.ui.resolve(e)
    if (mode === 'final') {
      const drawn = await next(e)
      if (e.requestId !== finalBlock) return drawn
      return h(Box, { flexDirection: 'column' }, h(Box, { marginTop: 1, marginLeft: 2 }, h(Text, { bold: true, color: 'green' }, '[spike] final answer of the turn')), drawn)
    }
    if (mode === 'multi') {
      const drawings = []
      let first = props.isFirstOfReply
      for (const p of parts(text)) {
        if (p.kind === 'heading') {
          drawings.push(h(Box, { marginTop: 1, marginLeft: 2 }, h(Text, { bold: true, underline: true }, `[spike] ${p.text}`)))
          continue
        }
        drawings.push(await next({ ...e, props: { ...props, text: p.kind === 'code' ? p.fenced : p.text, isFirstOfReply: first } }))
        first = false
      }
      return h(Box, { flexDirection: 'column' }, ...drawings)
    }
    if (mode === 'wrap' || mode === 'split') {
      const label = h(Text, { dimColor: true }, `[spike] ${mode} · ${text.length} chars · ${e.viewport?.columns ?? '?'} cols`)
      if (mode === 'wrap' || text.length > 10000) {
        return h(Box, { flexDirection: 'column', marginTop: 1, paddingLeft: 2 }, label, h(Markdown, { text: text.slice(0, 10000) }))
      }
      const children = parts(text).map((p) => {
        if (p.kind === 'heading') return h(Text, { bold: true, underline: p.depth <= 2 }, p.text)
        if (p.kind === 'code') return h(Box, { marginLeft: 2 }, h(Code, { source: p.text, language: p.language }))
        return h(Markdown, { text: p.text })
      })
      return h(Box, { flexDirection: 'column', rowGap: 1, marginTop: 1, paddingLeft: 2 }, label, ...children)
    }
    return next(e)
  })
  on('session.end', async ($, e, next) => {
    if (mode !== null) await flush($)
    return next(e)
  })
}
