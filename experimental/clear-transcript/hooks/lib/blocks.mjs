// Pure. No I/O, no Node API, no engine API: it loads inside a function-hooks module and under `node --test`.
//
// Cuts an assistant reply's markdown into the few block kinds Clear Transcript draws itself, and leaves
// everything else as prose for Claude Code's own Markdown renderer. It finds block BOUNDARIES only. It never
// reads inline markdown, never reorders and never drops a character:
//
//     blocks(text).map((b) => b.raw).join('\n') === text          (held by a test, for every fixture)
//
// Anything it is not sure about stays prose, because prose is drawn exactly as stock Claude Code draws it:
// a fence that never closes, a setext heading, raw HTML, and any fence or heading that is indented. An
// indented one may belong to a list item or a quote, and lifting it out would move it; one that starts in
// column 0 cannot belong to either.

// A fence opens with three or more of one fence character. A backtick fence's info string holds no backtick.
const FENCE_OPEN = /^(`{3,}|~{3,})(.*)$/
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/
const ATX_HEADING = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/

function openFence(line) {
  const match = FENCE_OPEN.exec(line)
  if (match === null) return null
  const [, marker, info] = match
  if (marker[0] === '`' && info.includes('`')) return null
  return { marker, language: info.trim().split(/\s+/)[0] ?? '' }
}

function closes(line, open) {
  const match = FENCE_CLOSE.exec(line)
  return match !== null && match[1][0] === open.marker[0] && match[1].length >= open.marker.length
}

export function blocks(text) {
  const lines = text.split('\n')
  const out = []
  let prose = []
  const pushProse = () => {
    if (prose.length > 0) out.push({ kind: 'prose', raw: prose.join('\n') })
    prose = []
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const open = openFence(line)
    if (open !== null) {
      let end = -1
      for (let j = i + 1; j < lines.length; j += 1) {
        if (closes(lines[j], open)) {
          end = j
          break
        }
      }
      // Never closed: the reply was cut short, or this is not a fence at all. The rest is prose.
      if (end === -1) {
        prose.push(...lines.slice(i))
        break
      }
      pushProse()
      out.push({
        kind: 'code',
        raw: lines.slice(i, end + 1).join('\n'),
        language: open.language,
        source: lines.slice(i + 1, end).join('\n'),
      })
      i = end
      continue
    }
    const heading = ATX_HEADING.exec(line)
    if (heading !== null && heading[2].trim() !== '') {
      pushProse()
      out.push({ kind: 'heading', raw: line, depth: heading[1].length, title: heading[2].trim() })
      continue
    }
    prose.push(line)
  }
  pushProse()
  return out
}

// True when a heading's title is plain words: no character that inline markdown gives a meaning to. Such a
// title can be drawn as text without reading markdown; any other title is left to the Markdown renderer.
export function isPlainTitle(title) {
  return !/[`*_~\[\]<>\\&!|]|https?:/.test(title)
}

export function isBlank(block) {
  return block.kind === 'prose' && block.raw.trim() === ''
}
