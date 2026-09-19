// Pure. No I/O, no Node API, no engine API.
//
// Decides how one assistant text block is laid out: which headings Clear Transcript draws itself, and which
// runs of markdown go, untouched, to Claude Code's own Markdown renderer. It returns a plan of plain data; the
// hooks module turns the plan into elements. `null` means "leave this block to the engine", and is the answer
// whenever there is nothing to improve or any doubt.
//
// Stock draws every heading level the same, as bold. Only SECTION titles (h1, h2) are taken out and drawn:
// deeper headings already look the way this design wants them, so they stay in the markdown and the engine
// draws them. A reply with no section title is therefore left to the engine whole, and is byte-identical to
// stock. Fewer cuts also means fewer seams between two renders of one document.
import { blocks, isPlainTitle } from './blocks.mjs'

// What one Markdown leaf may hold (claude-code.d.ts, MarkdownProps.text: "At most 10000 characters"; measured
// with `claude plugin test`: 10,000 passes, 10,001 is refused).
export const LEAF_LIMIT = 10000
// A drawn tree may hold 100,000 characters of text at most; well under it, a reply is the engine's to draw.
export const REPLY_LIMIT = 60000
export const SECTION_DEPTH = 2
// A title is one row of words. Anything longer is a paragraph someone put a # in front of.
export const TITLE_LIMIT = 120

// A leaf that holds a control character other than tab and newline is refused by the surface, and the whole
// tree with it; a carriage return is one. Such a reply is the engine's from the start.
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/
// A link reference or a footnote is defined in one place and used in another. Cut into leaves, the use and
// the definition can land in different renders, and the link would come out as its brackets.
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]\n]+\]:[ \t]*\S/m
// A line that opens with a tag, a comment or a declaration may start a raw HTML block, and what is inside
// one is not markdown: a "## line" in a comment is hidden by stock and must not be drawn as a title. Telling
// where such a block ends takes an HTML-aware parser, so outside a fence any such line gives the reply back.
const HTML_BLOCK = /^ {0,3}<[A-Za-z!?/]/m

const BLANK_EDGES = /^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g
// A fence wherever it sits: in column 0, indented, behind a list marker or a quote mark. Used only to know
// where NOT to cut, so reading too many lines as fences costs a place to cut and nothing else.
const ANY_FENCE = /^(?:[ \t>]*(?:[-*+]|\d+[.)])[ \t]+)?[ \t>]*(`{3,}|~{3,})(.*)$/
const ANY_FENCE_CLOSE = /^[ \t>]*(`{3,}|~{3,})[ \t]*$/

// Cuts markdown that is too long for one leaf at blank lines, and only where the next line starts in column
// 0 outside a fence: a place where no list item, quote or table can be continuing. Returns null when some
// piece still does not fit (one enormous code block), so the caller leaves the whole reply to the engine.
function leaves(text) {
  if (text.length <= LEAF_LIMIT) return [text]
  const lines = text.split('\n')
  const out = []
  let current = []
  let size = 0
  let fence = null
  let lastBreak = -1
  const close = (upTo) => {
    out.push(current.slice(0, upTo).join('\n'))
    current = current.slice(upTo)
    size = current.reduce((sum, line) => sum + line.length + 1, 0)
    lastBreak = -1
  }
  for (const line of lines) {
    // Anything that looks like a fence counts as one here: a wrong guess only costs a place to cut.
    if (fence === null && current.length > 0 && current[current.length - 1].trim() === '' && /^\S/.test(line)) {
      lastBreak = current.length
    }
    if (size + line.length + 1 > LEAF_LIMIT && lastBreak > 0) close(lastBreak)
    if (fence === null) {
      const open = ANY_FENCE.exec(line)
      if (open !== null && !(open[1][0] === '`' && open[2].includes('`'))) fence = open[1]
    } else {
      const close = ANY_FENCE_CLOSE.exec(line)
      if (close !== null && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null
    }
    current.push(line)
    size += line.length + 1
  }
  out.push(current.join('\n'))
  const trimmed = out.map((piece) => piece.replace(BLANK_EDGES, '')).filter((piece) => piece !== '')
  return trimmed.every((piece) => piece.length <= LEAF_LIMIT) ? trimmed : null
}

export function plan(text) {
  if (typeof text !== 'string' || text.length > REPLY_LIMIT) return null
  if (CONTROL.test(text) || REFERENCE_DEFINITION.test(text)) return null
  const parts = []
  let run = []
  let drawn = 0
  const closeRun = () => {
    const markdown = run.join('\n').replace(BLANK_EDGES, '')
    run = []
    if (markdown === '') return true
    const pieces = leaves(markdown)
    if (pieces === null) return false
    for (const piece of pieces) parts.push({ kind: 'markdown', text: piece })
    return true
  }
  for (const block of blocks(text)) {
    if (block.kind === 'heading' && block.depth <= SECTION_DEPTH && block.title.length <= TITLE_LIMIT && isPlainTitle(block.title)) {
      if (!closeRun()) return null
      parts.push({ kind: 'heading', depth: block.depth, title: block.title })
      drawn += 1
      continue
    }
    if (block.kind === 'prose' && HTML_BLOCK.test(block.raw)) return null
    run.push(block.raw)
  }
  if (!closeRun()) return null
  return drawn === 0 ? null : parts
}
