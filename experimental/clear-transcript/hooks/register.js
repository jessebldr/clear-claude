// Clear Transcript: how the conversation is drawn inside stock Claude Code. A function-hooks module (early
// access): it loads only where function hooks are enabled, and the API may change between releases.
//
// It hooks ui.render and nothing else that the engine acts on: no tool.call, no prompt, no model text. Two
// rows are redrawn, and only on the terminal:
//   AssistantMessage  section titles (h1, h2) are underlined; every other character goes to the engine's Markdown
//   ToolGroup         a settled group names its targets, and a failed call gets a line of its own
// Everything else, and either of these whenever there is doubt, is `next(e)`: the engine's own drawing.
//
// The original is always one step away. In the expanded view (ctrl+o, --verbose) every row is the engine's.
// `/clear-transcript off` does the same for the normal view, for the rest of the session.
//
// The decisions live in ./lib, as pure functions over plain data; this file only turns their plans into
// elements. The elements come from the surface's table, `h` is the engine's global.
import { REPLY_LIMIT, plan } from './lib/answer.mjs'
import { groupPlan } from './lib/tools.mjs'

const COMMAND = 'clear-transcript'
const REPLY_BULLET = '●'
const REMEMBERED = 64

// How a section title (h1, h2) is drawn. Stock draws every heading level as plain bold, so a reply's sections
// cannot be told from its sub-headings or from a bold lead-in; underlining the section titles makes the two
// levels visible with weight and underline alone: no hue, no glyph, no dim. Deeper headings stay in the
// markdown and are the engine's. ATTRIBUTES ONLY: a title keeps the one row and the blank rows stock gives it,
// so a reply is exactly as tall as stock's and nothing a person is reading moves when this tree takes the row.
const SECTION = { bold: true, underline: true }

// State of ONE session: session.start puts all of it back, so "off for this session" ends with the session.
let isOn = true
// Which view is being drawn. A ToolGroup says so itself (isExpanded) and is never drawn expanded, whatever
// this holds. An AssistantMessage carries no such prop, so for answers the view is LEARNT from UserMessage,
// whose isExpanded means exactly "the view draws rows in full". When the value flips, every row is asked for
// again, so the order in which rows arrive does not matter. (A ToolGroup's flag is not used for this: an
// outer hook may unfold one group by policy, and two sources that disagree would redraw for ever.) What this
// cannot cover is an expanded view in which no UserMessage is raised at all: there an answer keeps its
// underlined titles - same words, same rows - and /clear-transcript off is the way back that depends on
// nothing.
let isExpandedView = false
const plans = new Map()

function learnView($, props) {
  if (typeof props?.isExpanded !== 'boolean' || props.isExpanded === isExpandedView) return
  isExpandedView = props.isExpanded
  // A cached answer is reused for a row whose props did not change, so ask for the rows again.
  $.ui.invalidate('ui.render')
}

// A reply is raised again on every scroll and view change, with the same text. Keys are whole replies, so a
// reply too long to be planned is not remembered: plan() turns it away in one comparison anyway.
function planned(text) {
  if (typeof text !== 'string' || text.length > REPLY_LIMIT) return null
  if (plans.has(text)) return plans.get(text)
  const parts = plan(text)
  if (plans.size >= REMEMBERED) plans.delete(plans.keys().next().value)
  plans.set(text, parts)
  return parts
}

export function register(on, options) {
  const drawsAnswers = options?.headings !== false
  const drawsToolGroups = options?.toolGroups !== false

  on('session.start', async ($, e, next) => {
    isOn = true
    isExpandedView = false
    plans.clear()
    await $.command.register({ name: COMMAND, description: 'Clear Transcript: draw the transcript as stock Claude Code does, or not', argumentHint: 'on | off' })
    return next(e)
  })

  // Answers with text only: no `context`, so the model never hears of it. The engine puts the plugin's name in
  // front of the text, so the text does not repeat it.
  on('command.run', { command: COMMAND }, ($, e) => {
    const wanted = e.args.trim().toLowerCase()
    if (wanted === 'on' || wanted === 'off') {
      isOn = wanted === 'on'
      $.ui.invalidate('ui.render')
    }
    return { text: isOn ? 'on. ctrl+o shows every row as Claude Code draws it; /clear-transcript off does the same in place.' : 'off for this session: every row is drawn by Claude Code. /clear-transcript on brings it back.' }
  })

  on('ui.render', { component: 'UserMessage', surface: 'terminal' }, ($, e, next) => {
    learnView($, e.props)
    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage', surface: 'terminal' }, async ($, e, next) => {
    if (!isOn || !drawsAnswers || isExpandedView) return next(e)
    const parts = planned(e.props.text)
    if (parts === null) return next(e)
    const { Box, Text, Markdown } = await $.ui.resolve(e)
    const rows = parts.map((part, i) => {
      const drawn = part.kind === 'markdown' ? h(Markdown, { text: part.text }) : h(Text, SECTION, part.title)
      return h(Box, { marginTop: i === 0 ? 0 : 1 }, drawn)
    })
    // The engine leaves a blank row above a reply and draws its bullet in a two-cell gutter; a tree that
    // takes the row's place has to bring both.
    return h(Box, { flexDirection: 'row', marginTop: 1 }, h(Box, { minWidth: 2 }, h(Text, null, e.props.isFirstOfReply ? REPLY_BULLET : ' ')), h(Box, { flexDirection: 'column', flexGrow: 1 }, ...rows))
  })

  on('ui.render', { component: 'ToolGroup', surface: 'terminal' }, async ($, e, next) => {
    if (!isOn || !drawsToolGroups || isExpandedView) return next(e)
    const group = groupPlan(e.props, e.viewport?.columns)
    if (group === null) return next(e)
    const { Box, Text } = await $.ui.resolve(e)
    const rows = []
    if (group.summary !== '') rows.push(h(Text, { dimColor: true, wrap: 'truncate-end' }, group.summary))
    for (const failure of group.failures) {
      rows.push(h(Text, { wrap: 'truncate-end' }, h(Text, failure.label === 'failed' ? { color: 'error' } : null, failure.label), `  ${failure.target}`, failure.reason === '' ? '' : h(Text, { dimColor: true }, ` · ${failure.reason}`)))
    }
    return h(Box, { flexDirection: 'column', marginTop: 1, paddingLeft: 2 }, ...rows)
  })
}
