// Node-only: one atomic write, shared by everything the status line and the hooks keep on disk.
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const RENAME_ATTEMPTS = 4
const RENAME_PAUSE_MS = 5

const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Writes `text` to `file` through a temporary file and one rename, so a reader never sees half a
 * file. Returns whether it was written; never throws.
 *
 * On Windows a rename onto a file that another process has open fails with EPERM, and a status
 * line that runs every two seconds is such a reader. Measured with one writer against one reader
 * in a tight loop, most renames failed and each left its temporary file behind -- so the rename is
 * retried briefly, and the temporary file is removed when it still fails.
 */
export function writeFileAtomic(file, text) {
  const temporary = `${file}.${process.pid}.tmp`
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(temporary, text, { encoding: 'utf8', mode: 0o600 })
    for (let attempt = 1; ; attempt++) {
      try {
        renameSync(temporary, file)
        return true
      } catch (error) {
        if (attempt >= RENAME_ATTEMPTS || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error
        pause(RENAME_PAUSE_MS)
      }
    }
  } catch {
    try {
      rmSync(temporary, { force: true })
    } catch {
      // Nothing more to do about a file that can be neither renamed nor removed.
    }
    return false
  }
}
