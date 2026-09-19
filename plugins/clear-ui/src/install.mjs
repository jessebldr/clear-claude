// Pure. No I/O, no Node API.
//
// Decides what an install or uninstall would do to a settings document, and produces the new
// text. Every decision a person needs to approve is visible in the returned plan, and nothing
// here can touch a file: `plan` and `apply` run the same function and differ only in whether
// the caller writes the result.
import { locateKey, removeKey, setKey } from './jsonedit.mjs'

// Commands belonging to other status-line products, so a conflict can be named rather than
// described as "something else". Matched against the whole command string, lower-cased.
const KNOWN_PRODUCTS = [
  [/claude-hud/, 'Claude HUD'],
  [/ccstatusline/, 'ccstatusline'],
  [/claude-powerline/, 'Claude Powerline'],
  [/claude-tui|claudetui/, 'ClaudeTUI'],
  [/ccusage/, 'ccusage'],
]

export const KEY = 'statusLine'

const commandTextOf = statusLine => {
  if (typeof statusLine !== 'object' || statusLine === null) return ''
  const command = typeof statusLine.command === 'string' ? statusLine.command : ''
  const args = Array.isArray(statusLine.args) ? statusLine.args.filter(a => typeof a === 'string') : []
  return [command, ...args].join(' ')
}

/** Identifies whose status line this is: 'none', 'ours', or 'foreign'. */
export function classify(statusLine, ourRuntimePath) {
  if (statusLine === undefined || statusLine === null) return { kind: 'none', product: null }
  const text = commandTextOf(statusLine)
  const normalise = value => value.toLowerCase().replaceAll('\\', '/')
  if (ourRuntimePath && normalise(text).includes(normalise(ourRuntimePath))) return { kind: 'ours', product: 'Clear UI' }
  for (const [pattern, product] of KNOWN_PRODUCTS) if (pattern.test(normalise(text))) return { kind: 'foreign', product }
  return { kind: 'foreign', product: null }
}

/**
 * @param settingsText raw settings.json text; '' when the file does not exist
 * @param desired      the statusLine object to install
 * @param runtimePath  the path that identifies our own command
 * @param choice       'ask' (default), 'replace' or 'keep'
 * @param key          the settings key to install under; the main status line by default
 * @returns a plan: { action, reason, existing, existingProduct, nextText }
 *          action is one of 'create' | 'install' | 'update' | 'replace' | 'unchanged' |
 *          'needs-choice' | 'kept' | 'unparseable'
 *          nextText is null for every action that writes nothing.
 */
export function planInstall({ settingsText, desired, runtimePath, choice = 'ask', key = KEY }) {
  const blank = settingsText.trim() === ''
  if (blank) {
    return {
      action: 'create',
      reason: 'no settings file yet',
      existing: null,
      existingProduct: null,
      nextText: setKey('{}', key, desired) + '\n',
    }
  }

  let parsed
  try {
    parsed = JSON.parse(settingsText)
  } catch (error) {
    return {
      action: 'unparseable',
      reason: `settings.json is not valid JSON (${error.message}); nothing was changed`,
      existing: null,
      existingProduct: null,
      nextText: null,
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { action: 'unparseable', reason: 'settings.json is not a JSON object', existing: null, existingProduct: null, nextText: null }
  }
  // A document whose key our text scanner cannot find, although JSON.parse sees it, would be
  // edited in the wrong place. Refusing is the only safe answer.
  if (key in parsed && locateKey(settingsText, key) === null) {
    return { action: 'unparseable', reason: `settings.json has a ${key} this tool cannot edit safely`, existing: null, existingProduct: null, nextText: null }
  }

  const existing = parsed[key] ?? null
  const { kind, product } = classify(existing, runtimePath)
  const write = () => setKey(settingsText, key, desired)

  if (kind === 'none') return { action: 'install', reason: `no ${key} set`, existing: null, existingProduct: null, nextText: write() }
  if (kind === 'ours') {
    const nextText = write()
    return nextText === settingsText
      ? { action: 'unchanged', reason: 'already installed and up to date', existing, existingProduct: product, nextText: null }
      : { action: 'update', reason: 'Clear UI is installed; its command needs updating', existing, existingProduct: product, nextText }
  }
  if (choice === 'replace') {
    return { action: 'replace', reason: `replacing the existing ${key}`, existing, existingProduct: product, nextText: write() }
  }
  if (choice === 'keep') {
    return { action: 'kept', reason: `the existing ${key} was kept; Clear UI was not installed`, existing, existingProduct: product, nextText: null }
  }
  return {
    action: 'needs-choice',
    reason: `another ${key} is already set${product ? ` (${product})` : ''}; choose Keep or Replace`,
    existing,
    existingProduct: product,
    nextText: null,
  }
}

/**
 * @returns a plan: { action, reason, nextText }
 *          action is 'restore' | 'remove' | 'absent' | 'not-ours' | 'unparseable'
 */
export function planUninstall({ settingsText, previous, runtimePath, key = KEY }) {
  if (settingsText.trim() === '') return { action: 'absent', reason: 'no settings file', nextText: null }
  let parsed
  try {
    parsed = JSON.parse(settingsText)
  } catch (error) {
    return { action: 'unparseable', reason: `settings.json is not valid JSON (${error.message})`, nextText: null }
  }
  const existing = parsed?.[key] ?? null
  if (existing === null) return { action: 'absent', reason: `no ${key} is set`, nextText: null }

  const { kind, product } = classify(existing, runtimePath)
  if (kind !== 'ours') {
    return { action: 'not-ours', reason: `the current ${key} is not Clear UI's${product ? ` (${product})` : ''}; it was left alone`, nextText: null }
  }
  if (previous !== undefined && previous !== null) {
    return { action: 'restore', reason: 'restoring the status line that was there before', nextText: setKey(settingsText, key, previous) }
  }
  return { action: 'remove', reason: `removing ${key}; there was nothing before it`, nextText: removeKey(settingsText, key) }
}
