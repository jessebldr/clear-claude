# Installing Clear UI

Clear UI is the status bar of Clear Claude: the plugin `clear-ui` in the marketplace
`clear-claude`. It is independent of Clear Partner — neither needs the other, and installing
one never installs the other. The [README](../README.md#install) has the quick path for both. It needs **Node 18 or newer** on the PATH of the shell Claude Code
runs status lines with — Git Bash on Windows when it is installed, PowerShell otherwise.

## Install

```text
claude plugin marketplace add jessebldr/clear-claude
claude plugin install clear-ui@clear-claude
```

Installing the plugin does not show anything yet. A plugin cannot register a status line —
Claude Code accepts only the `agent` and `subagentStatusLine` keys from a plugin's own settings —
so one more step names it in your `settings.json`. In a session, ask for it:

```text
set up clear ui
```

The `clear-ui-setup` skill runs a script that first prints what it would change and writes
nothing, then installs. It backs `settings.json` up, edits only the `statusLine` key, and leaves
every other byte as it was. **If you already have a status line** (claude-hud, ccstatusline,
your own script), it stops and asks: keep yours, or replace it. A replaced status line is
recorded and comes back on uninstall.

Restart Claude Code, or run `/reload-plugins`.

## What gets written, and where

| Path | What |
| --- | --- |
| `~/.claude/settings.json` | The `statusLine` key: `node "<runtime>/bin/statusline.mjs"`, with `refreshInterval: 2`. With the activity row on, also `subagentStatusLine`. Nothing else. |
| `~/.claude/plugins/data/clear-ui-clear-claude/runtime/` | A copy of the renderer at a path that survives plugin updates. Re-copied by a `SessionStart` hook when the plugin version changes. |
| `…/clear-ui-clear-claude/backups/` | Timestamped copies of `settings.json` from before each change; the newest ten are kept. |
| `…/clear-ui-clear-claude/config.json` | Only if you change the defaults. |
| `…/clear-ui-clear-claude/cache/`, `state/` | The 5-second `git status` cache, and per-session verification records. |

With `CLAUDE_CONFIG_DIR` set, all of it lives under that directory instead of `~/.claude`.

The refresh timer exists because Claude Code does not re-run a status line when the terminal is
resized, and the bar is padded to the terminal's width: without it a resized window shows a
clipped or stranded bar until the next message. It costs one ~60 ms process every two seconds.

## Change what it shows

```text
configure clear ui
```

Presets are `essential` (the default), `minimal` and `full`; single segments can be switched on
or off; `ascii` glyphs are there for a font that cannot draw the rule or the meter. No restart
is needed.

## Verification state (optional, per project)

Add `.claude/clear-ui.json` to a project, listing the commands that count as verification there:

```json
{ "verify": ["npm test", "uv run pytest"] }
```

The bar then shows `verified 10:42`, `verify failed 10:42`, or `edited since`. A command is
counted only where its own exit status is what the tool call reports, so run it plainly or
after `&&` — `npm test | tail` hides a failure and is not counted.

## Activity row (optional)

```text
turn on the clear ui activity row
```

A third row appears only while something is running — `2 agents · 6m  │  1 background` — and
shows counts, never names. It installs one more settings key, `subagentStatusLine`, as a data
feed that prints nothing, so the agent panel itself is unchanged. If you already have a
`subagentStatusLine`, setup stops and asks, as it does for the status line.

## It is not showing

```text
clear ui doctor
```

Read-only. It checks Node, whether `settings.json` points at Clear UI, the refresh timer, the
runtime copy, the config file, settings that silently disable status lines, and does a timed
dry render. Two things it cannot check: whether the folder is trusted (a status line only runs
in a trusted folder), and whether `node` resolves in the shell Claude Code itself spawns —
worth suspecting with a version manager such as nvm or Volta.

**The branch shows but the orange dot never does.** The bar gives `git status` 150 ms and then
draws the branch without a dirty mark rather than wait. On a developer machine git answers in
25–100 ms; where every process start is slow (a virus scanner, a shared or throttled machine)
it may not. Run the doctor from inside the repository: its `Git speed` line times git there
and says so if it is over budget. The way out is an environment variable for that machine,
`CLEAR_UI_GIT_TIMEOUT_MS` (50–2000), for example in the `env` block of `settings.json`:

```json
{ "env": { "CLEAR_UI_GIT_TIMEOUT_MS": "400" } }
```

The cost is a slower refresh once per 5-second cache period, and only when git is that slow.

## Uninstall

```text
remove clear ui
```

Restores the status line that was there before, or removes the key, and deletes the runtime,
config, cache and state. The backups stay. Then `claude plugin uninstall clear-ui@clear-claude`.

## Platform status

Developed and used daily on native Windows 11. CI is set up to run the test suite and the
benchmark on Windows, macOS and Linux; macOS and Linux have not yet had daily use.
