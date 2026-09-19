#!/usr/bin/env node
// Clear UI configure: choose what the status line draws.
//
//   node bin/configure.mjs show
//   node bin/configure.mjs preset <essential|minimal|full>
//   node bin/configure.mjs set <segment> <on|off>          cost also takes auto|always|never
//   node bin/configure.mjs look <pills|text>
//   node bin/configure.mjs caps <square|round|auto>        the ends of a chip
//   node bin/configure.mjs charset <unicode|ascii>
//   node bin/configure.mjs usage <on|off>                  the opt-in usage provider; off by default
//   node bin/configure.mjs reset                          back to the default: no file at all
//
// Writes one file, config.json in the plugin data directory, and nothing else. Like setup, it
// refuses to rewrite a file it cannot parse: whatever is in it is the user's, and a tool that
// "repairs" it discards it.
//
// Exit codes: 0 done · 1 refused or bad arguments · 2 unexpected failure.
import { existsSync, rmSync } from 'node:fs'
import { CAPS, loadConfig, CONFIG_VERSION, LOOKS, PRESETS } from '../src/config.mjs'
import { paths, readTextOr, writeAtomic } from '../src/paths.mjs'

const say = line => process.stdout.write(`${line}\n`)
const SEGMENTS = Object.keys(PRESETS.essential)
// Two cells clear of the longest name: a fixed 12 printed `weeklyScopedon`.
const SEGMENT_COLUMN = Math.max(...SEGMENTS.map(key => key.length)) + 2

function describe(place) {
  const config = loadConfig(place.config)
  say(`Clear UI configuration`)
  say(`  file      ${place.config}${existsSync(place.config) ? '' : '  (none; drawing the default)'}`)
  say(`  preset    ${config.preset}`)
  say(`  look      ${config.look}  (CLEAR_UI_LOOK in the environment outranks this)`)
  say(`  caps      ${config.caps}  (CLEAR_UI_CAPS in the environment outranks this)`)
  say(`  charset   ${config.charset ?? 'unicode'}  (CLEAR_UI_CHARSET in the environment outranks this)`)
  say(`  usage     ${config.usage ? 'on   (runs `claude -p /usage` in the background, at most every 10 minutes)' : 'off  (the status line reaches no network)'}`)
  for (const key of SEGMENTS) say(`  ${key.padEnd(SEGMENT_COLUMN)}${config.show[key] === true ? 'on' : config.show[key] === false ? 'off' : config.show[key]}`)
  if (config.problem) say(`  problem   ${config.problem}`)
  return config.problem ? 1 : 0
}

/** The file as an object to edit, or a refusal. A missing file is an empty object. */
function readForEdit(place) {
  const text = readTextOr(place.config, '')
  if (text.trim() === '') return {}
  try {
    const parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed
  } catch {
    // Falls through to the refusal below.
  }
  say(`${place.config} is not a JSON object this tool can edit; nothing was changed.`)
  say('Fix it by hand, or run `reset` to delete it and start from the default.')
  return null
}

function write(place, next) {
  writeAtomic(place.config, JSON.stringify({ ...next, version: CONFIG_VERSION }, null, 2) + '\n')
  say('')
  say('  The status line picks this up on its next refresh; no restart is needed.')
  return describe(place)
}

function main(argv) {
  const place = paths()
  const [command = 'show', first, second] = argv
  if (command === 'show') return describe(place)
  if (command === 'reset') {
    rmSync(place.config, { force: true })
    return describe(place)
  }

  if (command === 'preset' && Object.hasOwn(PRESETS, first ?? '')) {
    const current = readForEdit(place)
    if (current === null) return 1
    // A preset is taken whole: overrides written for the previous one would silently undo it.
    const { show: _dropped, ...rest } = current
    return write(place, { ...rest, preset: first })
  }
  if (command === 'look' && LOOKS.includes(first)) {
    const current = readForEdit(place)
    return current === null ? 1 : write(place, { ...current, look: first })
  }
  if (command === 'caps' && CAPS.includes(first)) {
    const current = readForEdit(place)
    return current === null ? 1 : write(place, { ...current, caps: first })
  }
  if (command === 'charset' && ['unicode', 'ascii'].includes(first)) {
    const current = readForEdit(place)
    return current === null ? 1 : write(place, { ...current, charset: first })
  }
  if (command === 'usage' && ['on', 'off'].includes(first)) {
    const current = readForEdit(place)
    if (current === null) return 1
    // Off is the absence of the key, so a file that never opted in and one that opted out read alike.
    const { usage: _dropped, ...rest } = current
    return write(place, first === 'on' ? { ...rest, usage: true } : rest)
  }
  if (command === 'set' && SEGMENTS.includes(first)) {
    const allowed = first === 'cost' ? { on: 'always', off: 'never', auto: 'auto', always: 'always', never: 'never' } : { on: true, off: false }
    if (Object.hasOwn(allowed, second ?? '')) {
      const current = readForEdit(place)
      if (current === null) return 1
      const show = typeof current.show === 'object' && current.show !== null && !Array.isArray(current.show) ? current.show : {}
      return write(place, { ...current, show: { ...show, [first]: allowed[second] } })
    }
  }

  say('usage: configure.mjs show')
  say(`       configure.mjs preset <${Object.keys(PRESETS).join('|')}>`)
  say(`       configure.mjs set <${SEGMENTS.join('|')}> <on|off>   (cost: auto|always|never)`)
  say(`       configure.mjs look <${LOOKS.join('|')}>`)
  say(`       configure.mjs caps <${CAPS.join('|')}>`)
  say('       configure.mjs charset <unicode|ascii>')
  say('       configure.mjs usage <on|off>')
  say('       configure.mjs reset')
  return 1
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  say(`Clear UI configure failed: ${error.message}`)
  process.exitCode = 2
}
