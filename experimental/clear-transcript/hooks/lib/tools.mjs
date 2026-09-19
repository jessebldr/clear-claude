// Pure. No I/O, no Node API, no engine API.
//
// Decides what a settled tool group says. Stock Claude Code folds a finished run of reads, searches and shell
// commands into a count ("Read 3 files, ran 2 shell commands"), which drops two things a reader needs: WHICH
// file or command, and WHETHER one of them failed. The plan returned here keeps the row one line tall, names
// the targets, and gives every failed call a line of its own. `null` means "leave this row to the engine",
// and is the answer while the group is live, while any call runs, and in the expanded view (ctrl+o,
// --verbose), where the engine draws every call in full.
//
// Every string here was written by a model or a tool and is untrusted: it is cleaned before it is drawn.

// ESC sequences first, so that their payload goes with them; then every control and bidi character.
const ESCAPES = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[PX^_][^\x1b]*(?:\x1b\\)?|\x1b\[[0-?]*[ -/]*[@-~]?|\x1b[@-_]?/g
const CONTROLS = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g
const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]|\p{Extended_Pictographic}/u

// A name among other names is held to TARGET_CELLS so that one long command cannot push the rest out; a name
// alone in its phrase, and a failed call's, may use the row. Each kind of call is left MIN_PHRASE cells at
// least, and the row is the viewport less the two-cell gutter on either side.
const TARGET_CELLS = 48
const FAILED_TARGET_CELLS = 72
const MIN_PHRASE = 24
const MIN_NAME = 8
const MIN_REASON = 16
const GUTTERS = 4
const SEPARATOR = ' · '
const MIN_COLUMNS = 40

export function clean(value) {
  if (typeof value !== 'string') return ''
  return value.replace(ESCAPES, '').replace(CONTROLS, '').replace(/\s+/g, ' ').trim()
}

export function cells(text) {
  let width = 0
  for (const char of text) width += WIDE.test(char) ? 2 : 1
  return width
}

export function clip(text, max) {
  if (cells(text) <= max) return text
  let out = ''
  let width = 0
  for (const char of text) {
    const w = WIDE.test(char) ? 2 : 1
    if (width + w > max - 1) break
    out += char
    width += w
  }
  return `${out.trimEnd()}…`
}

function firstLine(value) {
  if (typeof value !== 'string') return ''
  const line = value.split('\n').find((l) => l.trim() !== '') ?? ''
  return clean(line)
}

function baseName(path) {
  const name = clean(path).split(/[\\/]/).filter(Boolean).pop()
  return name ?? ''
}

function host(url) {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#\s]+)/i.exec(clean(url))
  return match ? match[1] : clean(url)
}

// verb, then what names the call. An unknown tool is named by itself: `mcp__github__get_issue` reads
// "github get_issue".
function describe(call) {
  const input = call.input !== null && typeof call.input === 'object' ? call.input : {}
  switch (call.tool) {
    case 'Read':
    case 'NotebookRead':
      return { verb: 'read', target: baseName(input.file_path ?? input.notebook_path) }
    case 'Grep':
    case 'Glob':
      return { verb: 'searched', target: clean(input.pattern) === '' ? '' : `"${clean(input.pattern)}"` }
    case 'LS':
      return { verb: 'listed', target: baseName(input.path) }
    case 'Bash':
    case 'PowerShell':
      return { verb: 'ran', target: firstLine(input.command) }
    case 'WebFetch':
      return { verb: 'fetched', target: host(input.url) }
    case 'WebSearch':
      return { verb: 'searched the web for', target: clean(input.query) === '' ? '' : `"${clean(input.query)}"` }
    default: {
      const name = clean(call.tool).replace(/^mcp__/, '').replace(/__/g, ' ')
      return { verb: 'called', target: name }
    }
  }
}

// The engine hands an errored call the text the model read, which opens with "Error: "; the row already says
// "failed", so the word is not repeated.
function reasonOf(call) {
  let reason = ''
  if (typeof call.output === 'string') reason = firstLine(call.output)
  else if (call.output !== null && typeof call.output === 'object' && typeof call.output.stderr === 'string') reason = firstLine(call.output.stderr)
  return reason.replace(/^Error:\s*/i, '')
}

// As many names as fit, then "+N more": the count of what is left, never a count instead of names.
function phrase(verb, targets, room) {
  const named = targets.filter((t) => t !== '')
  const unnamed = targets.length - named.length
  const unique = [...new Set(named)]
  const shown = []
  let used = cells(verb) + 1
  const widest = unique.length === 1 ? room : TARGET_CELLS
  for (const target of unique) {
    const rest = unique.length - shown.length - 1
    const reserve = rest > 0 ? cells(` +${rest} more`) : 0
    const lead = shown.length > 0 ? 2 : 0
    const free = room - used - lead - reserve
    // The first name is always shown, cut to the room it has; a later one only if it fits.
    const clipped = clip(target, Math.min(widest, shown.length === 0 ? Math.max(MIN_NAME, free) : widest))
    if (shown.length > 0 && cells(clipped) > free) break
    shown.push(clipped)
    used += cells(clipped) + lead
  }
  const hidden = unique.length - shown.length + unnamed
  if (shown.length === 0) return `${verb} ${hidden} ${hidden === 1 ? 'call' : 'calls'}`
  return `${verb} ${shown.join(', ')}${hidden > 0 ? ` +${hidden} more` : ''}`
}

export function groupPlan(props, columns) {
  if (props === null || typeof props !== 'object' || !Array.isArray(props.calls) || props.calls.length === 0) return null
  if (props.isExpanded === true || props.isActive === true) return null
  if (props.calls.some((call) => call === null || typeof call !== 'object' || call.isRunning === true)) return null
  if (typeof columns !== 'number' || columns < MIN_COLUMNS) return null

  const groups = []
  const failures = []
  for (const call of props.calls) {
    const { verb, target } = describe(call)
    if (call.isErrored === true || call.isInterrupted === true) {
      const label = call.isInterrupted === true ? 'interrupted' : 'failed'
      const named = clip(target === '' ? clean(call.tool) : target, Math.min(FAILED_TARGET_CELLS, columns - GUTTERS - cells(label) - 2))
      const room = columns - GUTTERS - cells(label) - 2 - cells(named) - cells(SEPARATOR)
      failures.push({ label, target: named, reason: room < MIN_REASON ? '' : clip(reasonOf(call), room) })
      continue
    }
    const last = groups[groups.length - 1]
    if (last !== undefined && last.verb === verb) last.targets.push(target)
    else groups.push({ verb, targets: [target] })
  }

  // The row is given out in order, so the kinds that ran first keep their names; each later kind is
  // promised MIN_PHRASE cells, and whatever an earlier one leaves unused goes to the next.
  let left = columns - GUTTERS
  const phrases = groups.map((group, i) => {
    const later = groups.length - i - 1
    const text = phrase(group.verb, group.targets, Math.max(MIN_PHRASE, left - later * (MIN_PHRASE + cells(SEPARATOR))))
    left -= cells(text) + cells(SEPARATOR)
    return text
  })
  let summary = phrases.join(SEPARATOR)
  if (summary !== '') summary = summary[0].toUpperCase() + summary.slice(1)
  return { summary, failures }
}
