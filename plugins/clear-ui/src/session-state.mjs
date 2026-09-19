// Node-only: the small files through which observers tell the status line what happened.
//
// One producer per file, so nobody reads, modifies and writes back: `<session>.verify.json` is
// written only by a finished verification command and `<session>.edit.json` only by an edit.
// Hooks run concurrently, and with a single shared file two of them finishing together would
// lose one update; with one writer per file the last write is simply the newest fact.
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomic } from './atomic.mjs'

const STATE_FILES_KEPT = 64
const STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_STATE_BYTES = 16 * 1024

/** A session id as a file name: nothing outside [A-Za-z0-9_-], bounded, or null. */
export function safeSessionId(sessionId) {
  if (typeof sessionId !== 'string') return null
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
  return safe === '' ? null : safe
}

const fileFor = (stateDir, sessionId, kind) => join(stateDir, `${sessionId}.${kind}.json`)

/** The record, or null when it is missing, oversized or not an object. Never throws. */
export function readRecord(stateDir, sessionId, kind) {
  try {
    const id = safeSessionId(sessionId)
    if (!stateDir || !id) return null
    const file = fileFor(stateDir, id, kind)
    if (statSync(file).size > MAX_STATE_BYTES) return null
    const record = JSON.parse(readFileSync(file, 'utf8'))
    return typeof record === 'object' && record !== null && !Array.isArray(record) ? record : null
  } catch {
    return null
  }
}

/** Atomic: a temporary file and one rename. Returns whether it was written. Never throws. */
export function writeRecord(stateDir, sessionId, kind, record, now = Date.now()) {
  try {
    const id = safeSessionId(sessionId)
    if (!stateDir || !id) return false
    if (!writeFileAtomic(fileFor(stateDir, id, kind), JSON.stringify(record))) return false
    prune(stateDir, now)
    return true
  } catch {
    return false
  }
}

// Sessions end without telling anyone, so their files are cleared by age once there are many.
function prune(stateDir, now) {
  const names = readdirSync(stateDir)
  if (names.length <= STATE_FILES_KEPT) return
  for (const name of names) {
    const file = join(stateDir, name)
    if (now - statSync(file).mtimeMs > STATE_MAX_AGE_MS) rmSync(file, { force: true })
  }
}
