// Node-only: where things live, and the two file operations that must not lose data.
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

// The plugin's data directory name, as Claude Code derives it from the plugin id
// `clear-ui@clear-claude` (every character outside [a-zA-Z0-9_-] becomes '-').
export const PLUGIN_DATA_ID = 'clear-ui-clear-claude'

// What the status line needs at run time, copied to a path that survives plugin updates
// because ${CLAUDE_PLUGIN_ROOT} does not: it moves to a new version directory on every update.
export const RUNTIME_FILES = [
  'bin/statusline.mjs',
  'bin/agents.mjs',
  'src/stdin.mjs',
  'src/state.mjs',
  'src/render.mjs',
  'src/git.mjs',
  'src/config.mjs',
  'src/session-state.mjs',
  'src/verify.mjs',
  'src/activity.mjs',
  'src/atomic.mjs',
  'src/layout.mjs',
  'src/sanitize.mjs',
]

export const pluginRoot = () => resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function paths(env = process.env) {
  const configHome = env.CLAUDE_CONFIG_DIR ? resolve(env.CLAUDE_CONFIG_DIR) : join(homedir(), '.claude')
  const dataDir = join(configHome, 'plugins', 'data', PLUGIN_DATA_ID)
  const runtimeDir = join(dataDir, 'runtime')
  return {
    configHome,
    settings: join(configHome, 'settings.json'),
    dataDir,
    runtimeDir,
    entry: join(runtimeDir, 'bin', 'statusline.mjs'),
    versionFile: join(runtimeDir, 'VERSION'),
    previousFile: join(dataDir, 'previous-statusline.json'),
    agentsEntry: join(runtimeDir, 'bin', 'agents.mjs'),
    previousAgentsFile: join(dataDir, 'previous-subagent-statusline.json'),
    activityMarker: join(dataDir, 'activity-on'),
    backupDir: join(dataDir, 'backups'),
    config: join(dataDir, 'config.json'),
    cacheDir: join(dataDir, 'cache'),
  }
}

// Seconds between timed re-runs. A terminal resize is not one of Claude Code's status-line
// triggers, and the bar's padding is computed from COLUMNS and baked into the printed row: until
// the next run a narrowed terminal clips the right group and a widened one leaves it stranded
// mid-row. A timer is the only repair a status line has -- claude-hud, ccstatusline and
// claude-powerline all ship the same answer -- and 2 s keeps a wrong bar on screen no longer
// than the drag that caused it, for one ~55 ms process per tick.
export const REFRESH_INTERVAL_SECONDS = 2

/** The statusLine object to install. Forward slashes: Git Bash drops backslashes silently. */
export const statusLineFor = entry => ({
  type: 'command',
  command: `node "${entry.replaceAll('\\', '/')}"`,
  refreshInterval: REFRESH_INTERVAL_SECONDS,
})

/**
 * The subagentStatusLine object behind the activity row. A plugin may ship this key in its own
 * settings.json, but whether ${CLAUDE_PLUGIN_ROOT} is substituted there is not documented, and
 * a command that silently resolves to nothing is the failure this project exists to avoid. So it
 * is installed the way the status line is: an absolute path, written by setup, opt-in.
 */
export const agentFeedFor = entry => ({ type: 'command', command: `node "${entry.replaceAll('\\', '/')}"` })

export const pluginVersion = (root = pluginRoot()) => {
  try {
    return JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** A filename-safe instant, unique to the millisecond so two writes cannot collide. */
export const stamp = (now = new Date()) => now.toISOString().replaceAll(':', '-').replace('.', '-').replace('Z', '')

export const readTextOr = (file, fallback = '') => {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return fallback
  }
}

/**
 * Writes via a temporary file in the same directory and one rename, so a crash or a full disk
 * leaves the original file intact rather than half-written.
 */
export function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.clear-ui-${process.pid}.tmp`
  writeFileSync(temporary, text, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, file)
}

/** Copies the runtime into the stable path. Returns the version it wrote. */
export function installRuntime(root, runtimeDir, version) {
  for (const relative of RUNTIME_FILES) {
    const target = join(runtimeDir, relative)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(root, relative), target)
  }
  writeAtomic(join(runtimeDir, 'VERSION'), `${version}\n`)
  return version
}

export const runtimeIsCurrent = (paths_, version) =>
  existsSync(paths_.entry) && readTextOr(paths_.versionFile).trim() === version
