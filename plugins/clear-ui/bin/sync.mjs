#!/usr/bin/env node
// SessionStart maintenance, and nothing else.
//
// ${CLAUDE_PLUGIN_ROOT} moves to a new directory on every plugin update, but the command in
// settings.json is a fixed string, so the runtime lives at a stable path and this re-copies it
// when the plugin version changes. That keeps an update from needing a second setup run.
//
// Hard limits, by decision: no prompt injection, no model call, no network, no settings edit.
// It prints nothing — a SessionStart hook that writes output costs a full prompt-cache miss —
// and always exits 0, because a maintenance step must never be able to break a session.
import { installRuntime, paths, pluginRoot, pluginVersion, runtimeIsCurrent } from '../src/paths.mjs'
import { existsSync } from 'node:fs'

try {
  const place = paths()
  const version = pluginVersion()
  // Only act on a Clear UI that someone installed: no settings file of ours, nothing to sync.
  if (existsSync(place.dataDir) && !runtimeIsCurrent(place, version)) {
    installRuntime(pluginRoot(), place.runtimeDir, version)
  }
} catch {
  // Deliberately silent.
}
process.exit(0)
