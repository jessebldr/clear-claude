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

const BLANK_EDGES = /^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g
const FENCE = /^ {0,3}(`{3,}|~{3,})/

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
    const mark = FENCE.exec(line)
    if (mark !== null) {
      if (fence === null) fence = mark[1]
      else if (mark[1][0] === fence[0] && mark[1].length >= fence.length && line.trim() === mark[1]) fence = null
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
    if (block.kind === 'heading' && block.depth <= SECTION_DEPTH && isPlainTitle(block.title)) {
      if (!closeRun()) return null
      parts.push({ kind: 'heading', depth: block.depth, title: block.title })
      drawn += 1
      continue
    }
    run.push(block.raw)
  }
  if (!closeRun()) return null
  return drawn === 0 ? null : parts
}
