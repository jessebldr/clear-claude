#!/usr/bin/env node
// Clear UI setup: plan · apply · uninstall.
//
// This is the only thing in Clear Claude that writes to the user's settings.json, and it is a
// script rather than a model instruction so that the edit is the same every time, on every
// machine, and reviewable before it happens. `plan` writes nothing at all.
//
//   node bin/setup.mjs plan
//   node bin/setup.mjs apply [--replace | --keep] [--activity | --no-activity]
//   node bin/setup.mjs uninstall
//
// Exit codes: 0 done or nothing to do · 1 needs a choice or refused · 2 unexpected failure.
import { existsSync, mkdirSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { planInstall, planUninstall } from '../src/install.mjs'
import {
  agentFeedFor,
  installRuntime,
  paths,
  pluginRoot,
  pluginVersion,
  readTextOr,
  stamp,
  statusLineFor,
  writeAtomic,
} from '../src/paths.mjs'

const BACKUPS_KEPT = 10
const FEED_KEY = 'subagentStatusLine'

const say = line => process.stdout.write(`${line}\n`)

/**
 * Describes someone else's status line without quoting it.
 *
 * A status-line command can carry a token, a signed URL or a password in an argument, and this
 * output is relayed by a skill, which puts it in the model's transcript as well as on screen.
 * An earlier version truncated the command at 120 characters and called that redaction; it was
 * not -- `tool --token SECRET` is shorter than that and printed in full. Only the name of the
 * program survives now, and every argument is replaced, whatever it looks like.
 */
function describeCommand(statusLine) {
  const raw = typeof statusLine?.command === 'string' ? statusLine.command : ''
  if (raw === '') return 'a status line of an unrecognised shape'
  // The program is the first bare or quoted word; everything after it is an argument.
  const [, quoted, bare] = raw.match(/^\s*(?:"([^"]*)"|'([^']*)'|(\S+))/) ?? []
  const program = quoted ?? bare ?? raw.trim().split(/\s+/)[0] ?? ''
  const name = program.split(/[\\/]/).filter(Boolean).pop() ?? program
  const safeName = /^[\w.+-]{1,40}$/.test(name) ? name : 'a program'
  const args = raw.slice(raw.indexOf(program) + program.length).trim()
  return args === '' ? safeName : `${safeName} [arguments hidden]`
}

function backup(place, settingsText) {
  if (settingsText === '') return null
  mkdirSync(place.backupDir, { recursive: true })
  const file = join(place.backupDir, `settings-${stamp()}.json`)
  writeAtomic(file, settingsText)
  const older = readdirSync(place.backupDir).filter(name => name.startsWith('settings-')).sort().slice(0, -BACKUPS_KEPT)
  for (const name of older) rmSync(join(place.backupDir, name), { force: true })
  return file
}

function describe(place, version, plan) {
  say(`Clear UI ${version}`)
  say(`  settings   ${place.settings}${existsSync(place.settings) ? '' : '  (does not exist yet)'}`)
  say(`  runtime    ${place.runtimeDir}`)
  if (plan.existing) say(`  current    ${plan.existingProduct ?? 'an unrecognised status line'} — ${describeCommand(plan.existing)}`)
  say(`  verdict    ${plan.action}: ${plan.reason}`)
}

const readJsonOr = (file, fallback = null) => {
  try {
    return JSON.parse(readTextOr(file, ''))
  } catch {
    return fallback
  }
}

/**
 * The activity row's data feed: a second settings key, opt-in, installed and removed by the same
 * rules as the first -- planned before it is written, never over someone else's without being
 * told to, the previous value kept for uninstall. `write` false is the dry run.
 */
function activity(place, mode, choice, write) {
  const settingsText = readTextOr(place.settings)
  const plan =
    mode === 'on'
      ? planInstall({ settingsText, desired: agentFeedFor(place.agentsEntry), runtimePath: place.runtimeDir, choice, key: FEED_KEY })
      : planUninstall({ settingsText, previous: readJsonOr(place.previousAgentsFile), runtimePath: place.runtimeDir, key: FEED_KEY })
  say(`  activity   ${plan.action}: ${plan.reason}`)
  if (plan.action === 'needs-choice') {
    say('             --replace takes it over (restorable); without it the activity row stays off.')
    return 1
  }
  if (plan.action === 'unparseable') return 1
  if (!write || plan.nextText === null) return 0

  if (mode === 'on' && plan.existing && plan.action === 'replace' && !existsSync(place.previousAgentsFile)) {
    writeAtomic(place.previousAgentsFile, JSON.stringify(plan.existing, null, 2) + '\n')
  }
  backup(place, settingsText)
  writeAtomic(place.settings, plan.nextText)
  if (mode === 'off' && existsSync(place.previousAgentsFile)) unlinkSync(place.previousAgentsFile)
  return 0
}

// The Stop hook belongs to the plugin and runs whether or not the row was asked for, so it looks
// for this file before it records anything.
function markActivity(place, on) {
  if (on) writeAtomic(place.activityMarker, 'on\n')
  else rmSync(place.activityMarker, { force: true })
}

function apply(choice, activityMode) {
  const place = paths()
  const version = pluginVersion()
  const settingsText = readTextOr(place.settings)
  const desired = statusLineFor(place.entry)
  const plan = planInstall({ settingsText, desired, runtimePath: place.runtimeDir, choice })
  describe(place, version, plan)

  if (plan.action === 'unparseable') {
    say('')
    say('Nothing was changed. Fix the JSON yourself and run this again — this tool will not')
    say('rewrite a settings file it cannot read, because that would discard what is in it.')
    return 1
  }
  if (plan.action === 'needs-choice') {
    say('')
    say('Choose one:')
    say(`  node "${join(pluginRoot(), 'bin', 'setup.mjs')}" apply --replace   install Clear UI (the current one is backed up and restorable)`)
    say(`  node "${join(pluginRoot(), 'bin', 'setup.mjs')}" apply --keep      keep what you have and do nothing`)
    return 1
  }
  if (plan.action === 'kept') return 0

  installRuntime(pluginRoot(), place.runtimeDir, version)
  // Record what was there before this install, so uninstall can put it back. Only on the first
  // install: a re-install must not overwrite the original with our own command.
  if (plan.existing && plan.action === 'replace' && !existsSync(place.previousFile)) {
    writeAtomic(place.previousFile, JSON.stringify(plan.existing, null, 2) + '\n')
  }
  // Only back up a file we are about to change: a re-install that writes nothing should not
  // push a real backup out of the retained window with a copy of itself.
  const saved = plan.nextText === null ? null : backup(place, settingsText)
  if (plan.nextText !== null) writeAtomic(place.settings, plan.nextText)

  say('')
  if (saved) say(`  backup     ${saved}`)
  say(`  installed  ${desired.command}`)
  const feed = activityMode ? activity(place, activityMode, choice, true) : 0
  if (activityMode && feed === 0) markActivity(place, activityMode === 'on')
  if (plan.action !== 'unchanged') say('  Restart Claude Code, or run /reload-plugins, to see it.')
  return feed
}

function uninstall() {
  const place = paths()
  const settingsText = readTextOr(place.settings)
  const previousText = readTextOr(place.previousFile, '')
  let previous = null
  try {
    previous = previousText === '' ? null : JSON.parse(previousText)
  } catch {
    previous = null
  }
  const plan = planUninstall({ settingsText, previous, runtimePath: place.runtimeDir })
  say(`Clear UI uninstall`)
  say(`  settings   ${place.settings}`)
  say(`  verdict    ${plan.action}: ${plan.reason}`)

  if (plan.action === 'unparseable') return 1
  // The status line may already be gone, or be someone else's by now; what Clear UI left on disk
  // is still Clear UI's to remove.
  const saved = plan.nextText === null ? null : backup(place, settingsText)
  if (plan.nextText !== null) writeAtomic(place.settings, plan.nextText)
  activity(place, 'off', 'ask', true)
  markActivity(place, false)
  if (existsSync(place.previousFile)) unlinkSync(place.previousFile)
  rmSync(place.runtimeDir, { recursive: true, force: true })
  rmSync(place.cacheDir, { recursive: true, force: true })
  rmSync(join(place.dataDir, 'state'), { recursive: true, force: true })
  rmSync(place.config, { force: true })
  say('')
  if (saved) say(`  backup     ${saved}`)
  say(`  ${plan.nextText === null ? "Clear UI's files are removed." : 'The status line is gone after a restart.'} Backups are kept in`)
  say(`  ${place.backupDir}`)
  return 0
}

function main(argv) {
  const command = argv[0] ?? 'plan'
  const choice = argv.includes('--replace') ? 'replace' : argv.includes('--keep') ? 'keep' : 'ask'
  const activityMode = argv.includes('--no-activity') ? 'off' : argv.includes('--activity') ? 'on' : null
  if (command === 'plan') {
    const place = paths()
    const plan = planInstall({
      settingsText: readTextOr(place.settings),
      desired: statusLineFor(place.entry),
      runtimePath: place.runtimeDir,
      choice,
    })
    describe(place, pluginVersion(), plan)
    if (activityMode) activity(place, activityMode, choice, false)
    say('')
    say('This was a dry run: nothing has been written. Run `apply` to install.')
    return 0
  }
  if (command === 'apply') return apply(choice, activityMode)
  if (command === 'uninstall') return uninstall()
  say('usage: setup.mjs [plan | apply [--replace|--keep] [--activity|--no-activity] | uninstall]')
  return 2
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  say(`Clear UI setup failed without changing anything: ${error.message}`)
  process.exitCode = 2
}
