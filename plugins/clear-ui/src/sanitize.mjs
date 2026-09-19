// Pure. No I/O, no Node API: this file must also load inside a function-hooks module.
//
// Every string that reaches the terminal from outside (model name, directory name, and later
// branch and agent names) passes through sanitize() once, at the render boundary.

// ESC-introduced sequences, most specific first:
//   OSC  ESC ] … (BEL | ESC \)      hyperlinks, title changes
//   DCS/SOS/PM/APC  ESC P|X|^|_ … ESC \
//   CSI  ESC [ params intermediates final
//   any other two-byte ESC sequence
const ESCAPE_SEQUENCES =
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[PX^_][^\x1b]*(?:\x1b\\)?|\x1b\[[0-?]*[ -/]*[@-~]?|\x1b[@-_]?/g

// C1 CSI/OSC (8-bit forms) swallow their payload too, so the payload cannot survive as text.
const C1_SEQUENCES = /\x9b[0-?]*[ -/]*[@-~]?|\x9d[^\x07\x9c]*[\x07\x9c]?/g

// C0, DEL, C1, line/paragraph separators, bidi controls, zero-width space, word joiner, BOM.
const CONTROL_CHARACTERS =
  /[\x00-\x1f\x7f-\x9f\u061c\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g

const ZERO_WIDTH = /^[\p{M}\u200c\u200d\ufe00-\ufe0f]+$/u
// One grapheme, two cells: a flag (two regional indicators) and a keycap sequence are not
// matched by the ranges below, so they are tested first.
const WIDE_SEQUENCE = /^(?:[\u{1f1e6}-\u{1f1ff}]{2}|[0-9#*]\u{fe0f}?\u{20e3})/u
const WIDE =
  /[\u{1100}-\u{115f}\u{2e80}-\u{303e}\u{3041}-\u{33ff}\u{3400}-\u{4dbf}\u{4e00}-\u{9fff}\u{a000}-\u{a4cf}\u{ac00}-\u{d7a3}\u{f900}-\u{faff}\u{fe30}-\u{fe4f}\u{ff00}-\u{ff60}\u{ffe0}-\u{ffe6}\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]|\p{Extended_Pictographic}/u

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

function graphemes(text) {
  if (segmenter) return Array.from(segmenter.segment(text), part => part.segment)
  return Array.from(text)
}

function graphemeWidth(grapheme) {
  if (ZERO_WIDTH.test(grapheme)) return 0
  if (WIDE_SEQUENCE.test(grapheme)) return 2
  return WIDE.test(grapheme) ? 2 : 1
}

/** Terminal cells `text` occupies. `text` must already be free of escape sequences. */
export function displayWidth(text) {
  let width = 0
  for (const grapheme of graphemes(text)) width += graphemeWidth(grapheme)
  return width
}

/** Cuts `text` to at most `maxWidth` cells, ending in an ellipsis when something was cut. */
export function truncate(text, maxWidth, ellipsis = '…') {
  if (maxWidth <= 0) return ''
  if (displayWidth(text) <= maxWidth) return text
  const budget = maxWidth - displayWidth(ellipsis)
  if (budget <= 0) return ellipsis.slice(0, maxWidth)
  let out = ''
  let width = 0
  for (const grapheme of graphemes(text)) {
    const next = graphemeWidth(grapheme)
    if (width + next > budget) break
    out += grapheme
    width += next
  }
  return out + ellipsis
}

/**
 * Makes an untrusted value safe to print: escape sequences and control characters removed,
 * whitespace collapsed, width capped. Anything that is not a string becomes ''.
 */
export function sanitize(value, maxWidth = 64, ellipsis = '…') {
  if (typeof value !== 'string') return ''
  const clean = value
    .slice(0, 4096)
    .replace(ESCAPE_SEQUENCES, '')
    .replace(C1_SEQUENCES, '')
    .replace(CONTROL_CHARACTERS, ' ')
    // Private-use characters mean whatever the font says they mean -- in a patched font, any
    // icon at all -- and two of them are the caps this renderer ends its own chips with. A name
    // is never allowed to draw them.
    .replace(/\p{Co}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  return truncate(clean, maxWidth, ellipsis)
}
