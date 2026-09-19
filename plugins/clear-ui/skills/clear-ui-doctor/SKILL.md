---
name: clear-ui-doctor
description: Diagnose the Clear UI status line when it is not showing, shows the wrong thing, or looks stale after a plugin update. Read-only — checks the Node version, whether settings.json points at Clear UI, whether the copied runtime matches the installed plugin version, settings that silently disable status lines, and whether the renderer actually draws. Use when the user says "clear ui doctor", "my statusline is blank", "clear ui isn't showing", or "check clear ui".
---

# Clear UI doctor

Answer one question: **is the Clear UI status line installed, current, and able to draw on this
machine — and if not, what exactly is wrong?**

```text
node "${CLAUDE_PLUGIN_ROOT}/bin/doctor.mjs"
```

Relay the table as it is, then add remediation for anything that is not PASS. Do not re-derive
the checks by hand, and do not read `settings.json` yourself to "confirm" a result — the script
reports which keys are set and deliberately never their contents.

## Reading the result

| Row | FAIL or WARN means | Fix |
| --- | --- | --- |
| Node runtime | Node is older than 18 | Install Node 18 or newer. |
| Settings file | missing, or not valid JSON | Missing is normal before setup. Invalid JSON means Claude Code is ignoring that file entirely — give the path and the error, and let the user fix it. |
| statusLine | not set, or set to another product | `clear-ui-setup`. If another product is named, the user has to choose between them. |
| Runtime files | missing, or a version behind the plugin | Restart the session: the `SessionStart` hook re-copies it. If it persists, run setup `apply` again. |
| Silent gates | `disableAllHooks` or `allowManagedHooksOnly` is set | Status lines do not run under those settings and Claude Code says nothing about it. Clear UI cannot work around it. |
| Usage provider | on, but no `claude` executable, no good answer yet, or the last good answer is too old to draw | `off (the default)` is a PASS and needs nothing. On Windows only the native `claude.exe` can be started; an npm install's `claude.cmd` cannot. Otherwise `node "${CLAUDE_PLUGIN_ROOT}/bin/usage-refresh.mjs" "<cache directory>" --report` (the cache directory is `plugins/data/clear-ui-clear-claude/cache` under the Claude config home, next to the `runtime` directory the table names) runs one refresh and prints why it was not believed (`no-limits` means Claude Code could not reach its usage endpoint). The doctor itself never starts a refresh. |
| Dry render | the renderer exited non-zero or drew nothing | A bug worth reporting: include the exit code and the timing from the row. |

Two things the script cannot check, so do not claim them:

- **Workspace trust.** A status line only runs in a folder the user has trusted. The row is
  always `UNKNOWN`; if everything else passes and the line is still blank, this is the first
  thing to suspect.
- **`node` on Claude Code's own PATH.** The dry render proves Node works *here*. On Windows the
  status line is run through Git Bash, or PowerShell when Git Bash is absent, and that shell
  may resolve `node` differently — especially with a version manager such as nvm or Volta.

## If every row passes and the line is still blank

In order: the session needs a restart after an install; the folder may not be trusted; and a
custom status line hides most of the footer hints, so a blank line is visually similar to no
status line at all. Say which of these you checked and which you could not.
