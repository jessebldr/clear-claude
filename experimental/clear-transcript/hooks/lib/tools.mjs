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

// Whole sequences first, so that their payload goes with them and does not stay behind as text ("31m",
// "(0"); then every control and bidi character that is left. ECMA-48, most specific first:
//   OSC              ESC ] … (BEL | ESC \)       and its 8-bit form  9D … (BEL | 9C)
//   DCS SOS PM APC   ESC P|X|^|_ … ESC \         and their 8-bit forms 90|98|9E|9F … 9C
//   CSI              ESC [ params intermediates final, and 9B …
//   any other        ESC intermediates final     (charset selection "ESC ( 0" is one)
const ESCAPES =
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x9d[^\x07\x9c]*[\x07\x9c]?|\x1b[PX^_][^\x1b]*(?:\x1b\\)?|[\x90\x98\x9e\x9f][^\x9c]*\x9c?|(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]?|\x1b[ -/]*[0-~]?/g
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

// A row shows a few dozen cells of any string, so only its head is ever read: a command or an error text
// can be megabytes long, and this runs on every raise of a group.
const HEAD = 4096

export function clean(value) {
  if (typeof value !== 'string') return ''
  return value.slice(0, HEAD).replace(ESCAPES, '').replace(CONTROLS, '').replace(/\s+/g, ' ').trim()
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
  const line = value.slice(0, HEAD).split('\n').find((l) => l.trim() !== '') ?? ''
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

// Every call is accounted for exactly once: named (a name used three times reads "a.md (3x)"), counted in a
// "+N more", or on a failure line. `calls` is how many calls a phrase stands for, shown or not.
function phrase(verb, targets, room) {
  const counts = new Map()
  let unnamed = 0
  for (const target of targets) {
    if (target === '') unnamed += 1
    else counts.set(target, (counts.get(target) ?? 0) + 1)
  }
  const names = [...counts.keys()]
  const shown = []
  let shownCalls = 0
  let used = cells(verb) + 1
  for (const name of names) {
    const times = counts.get(name)
    const suffix = times > 1 ? ` (${times}x)` : ''
    const restCalls = targets.length - shownCalls - times
    const reserve = restCalls > 0 ? cells(` +${restCalls} more`) : 0
    const lead = shown.length > 0 ? 2 : 0
    const free = room - used - lead - reserve - cells(suffix)
    // The first name is always shown, cut to the room it has; a later one only if it fits whole.
    const widest = names.length === 1 && unnamed === 0 ? free : Math.min(TARGET_CELLS, shown.length === 0 ? free : TARGET_CELLS)
    const clipped = clip(name, Math.max(MIN_NAME, widest))
    if (shown.length > 0 && cells(clipped) > free) break
    shown.push(`${clipped}${suffix}`)
    shownCalls += times
    used += cells(clipped) + cells(suffix) + lead
  }
  const hidden = targets.length - shownCalls
  if (shown.length === 0) return { text: `${verb} ${hidden} ${hidden === 1 ? 'call' : 'calls'}`, calls: targets.length }
  return { text: `${verb} ${shown.join(', ')}${hidden > 0 ? ` +${hidden} more` : ''}`, calls: targets.length }
}

const more = (calls) => (calls > 0 ? `+${calls} more` : '')
const joined = (phrases, hidden) => [...phrases.map((p) => p.text), more(hidden)].filter((t) => t !== '').join(SEPARATOR)

// One row, one budget. It is given out in the order the kinds ran. Before a kind takes its share, MIN_PHRASE
// cells are set aside for each later kind the row can still hold, so a second kind is named rather than
// counted where there is room for both; the kinds the row cannot hold are counted in one last "+N more".
// Whatever is built is then checked against the row, and kinds are folded into that count until it fits.
function summarise(groups, budget) {
  const phrases = []
  let hidden = 0
  let left = budget
  const share = MIN_PHRASE + cells(SEPARATOR)
  groups.forEach((group, i) => {
    const later = groups.slice(i + 1)
    const held = Math.max(0, Math.min(later.length, Math.floor((left - MIN_PHRASE) / share)))
    const beyond = later.slice(held).reduce((sum, g) => sum + g.targets.length, 0)
    const reserve = held * share + (beyond > 0 ? cells(SEPARATOR) + cells(more(beyond)) : 0)
    const room = left - reserve
    if (hidden > 0 || (i > 0 && room < MIN_PHRASE)) {
      hidden += group.targets.length
      return
    }
    const made = phrase(group.verb, group.targets, room)
    phrases.push(made)
    left -= cells(made.text) + cells(SEPARATOR)
  })
  while (phrases.length > 1 && cells(joined(phrases, hidden)) > budget) hidden += phrases.pop().calls
  const summary = joined(phrases, hidden)
  return cells(summary) > budget ? clip(summary, budget) : summary
}

function planOf(props, columns) {
  if (props === null || typeof props !== 'object' || !Array.isArray(props.calls) || props.calls.length === 0) return null
  // Settled means the engine said so, in so many words. A flag that is missing or is not a boolean is doubt.
  if (props.isExpanded !== false || props.isActive !== false) return null
  if (props.calls.some((call) => call === null || typeof call !== 'object' || call.isRunning !== false)) return null
  if (!Number.isFinite(columns) || columns < MIN_COLUMNS) return null
  const budget = Math.floor(columns) - GUTTERS

  const groups = []
  const failures = []
  for (const call of props.calls) {
    const { verb, target } = describe(call)
    if (call.isErrored === true || call.isInterrupted === true) {
      const label = call.isInterrupted === true ? 'interrupted' : 'failed'
      const named = clip(target === '' ? clean(call.tool) : target, Math.max(MIN_NAME, Math.min(FAILED_TARGET_CELLS, budget - cells(label) - 2)))
      const room = budget - cells(label) - 2 - cells(named) - cells(SEPARATOR)
      failures.push({ label, target: named, reason: room < MIN_REASON ? '' : clip(reasonOf(call), room) })
      continue
    }
    const last = groups[groups.length - 1]
    if (last !== undefined && last.verb === verb) last.targets.push(target)
    else groups.push({ verb, targets: [target] })
  }

  let summary = summarise(groups, budget)
  if (summary !== '') summary = summary[0].toUpperCase() + summary.slice(1)
  return { summary, failures }
}

// The props are the engine's plain data. Should they ever not be - a getter that throws, a proxy - the row
// is the engine's, like everything else that is in doubt.
export function groupPlan(props, columns) {
  try {
    return planOf(props, columns)
  } catch {
    return null
  }
}
