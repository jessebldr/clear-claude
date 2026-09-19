// What to draw: a preset, optionally adjusted. `resolveConfig` is pure; `loadConfig` reads the
// one file it lives in.
//
// The default needs no file at all. A file that is missing, unreadable, unparseable or full of
// values this version does not know draws the default -- it is never rewritten and never an
// error on the status line. `problem` carries the reason for the doctor to report.
import { readFileSync } from 'node:fs'

export const CONFIG_VERSION = 1
export const DEFAULT_PRESET = 'essential'

const ESSENTIAL = {
  model: true,
  effort: true,
  project: true,
  git: true,
  context: true,
  fiveHour: true,
  sevenDay: true,
  // 'auto': only where there is no quota to show instead (API key, Bedrock, Vertex).
  cost: 'auto',
  lines: false,
  outputStyle: false,
  // Draws only in a project that opted in; see bin/observe.mjs.
  verification: true,
  // Draws only where setup installed the agent feed (`apply --activity`), and only while
  // something is running.
  activity: true,
}

export const PRESETS = {
  essential: ESSENTIAL,
  minimal: { ...ESSENTIAL, model: false, effort: false, project: false, git: false },
  full: { ...ESSENTIAL, cost: 'always', lines: true, outputStyle: true },
}

export const LOOKS = ['pills', 'text']
export const DEFAULT_LOOK = 'pills'
// Square is the default: the only other end a grid of cells can draw is a half-circle the full
// height of the row, which dogfooding judged too round for the spec's 4 px corner. 'auto' is round
// where the terminal is known to draw the cap glyphs itself, square elsewhere.
export const CAPS = ['square', 'round', 'auto']
export const DEFAULT_CAPS = 'square'
const COST_MODES = ['auto', 'always', 'never']
const CHARSETS = ['unicode', 'ascii']
const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Pure. Any value -> { preset, charset, show, problem }. Unknown keys and bad values are ignored. */
export function resolveConfig(raw) {
  const fallback = { preset: DEFAULT_PRESET, charset: null, look: DEFAULT_LOOK, caps: DEFAULT_CAPS, show: { ...PRESETS[DEFAULT_PRESET] }, problem: null }
  if (raw === undefined || raw === null) return fallback
  if (!isObject(raw)) return { ...fallback, problem: 'config.json is not a JSON object' }
  if (raw.version !== undefined && raw.version !== CONFIG_VERSION) {
    return { ...fallback, problem: `config.json is version ${JSON.stringify(raw.version)}; this Clear UI reads version ${CONFIG_VERSION}` }
  }

  // 'custom' is a preset plus overrides, and the preset it starts from is the default one.
  const named = typeof raw.preset === 'string' && Object.hasOwn(PRESETS, raw.preset) ? raw.preset : null
  const preset = named ?? (raw.preset === 'custom' ? 'custom' : DEFAULT_PRESET)
  const show = { ...PRESETS[named ?? DEFAULT_PRESET] }
  if (isObject(raw.show)) {
    for (const key of Object.keys(show)) {
      // Own keys only: an inherited value is not something anyone wrote in the file.
      const value = Object.hasOwn(raw.show, key) ? raw.show[key] : undefined
      if (key === 'cost') {
        if (COST_MODES.includes(value)) show.cost = value
        else if (typeof value === 'boolean') show.cost = value ? 'always' : 'never'
      } else if (typeof value === 'boolean') show[key] = value
    }
  }
  const unknownPreset = raw.preset !== undefined && named === null && raw.preset !== 'custom'
  return {
    preset,
    charset: CHARSETS.includes(raw.charset) ? raw.charset : null,
    look: LOOKS.includes(raw.look) ? raw.look : DEFAULT_LOOK,
    caps: CAPS.includes(raw.caps) ? raw.caps : DEFAULT_CAPS,
    show,
    problem: unknownPreset ? `unknown preset ${JSON.stringify(raw.preset)}; drawing ${DEFAULT_PRESET}` : null,
  }
}

/** Node. `file` undefined (no data directory) or missing draws the default, silently. */
export function loadConfig(file) {
  if (!file) return resolveConfig(undefined)
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return resolveConfig(undefined)
  }
  try {
    // A byte-order mark is what Notepad leaves at the front of a file it saved.
    return resolveConfig(JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text))
  } catch (error) {
    return { ...resolveConfig(undefined), problem: `config.json is not valid JSON (${error.message})` }
  }
}
