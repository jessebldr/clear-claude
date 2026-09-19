---
name: clear-ui-setup
description: Install, re-install or remove the Clear UI status line. Runs a deterministic script that edits settings.json — it backs the file up first, never overwrites another status line without asking, and can restore the previous one. Use when the user says "set up clear ui", "install the clear ui statusline", "clear ui setup", "remove clear ui", "uninstall the clear ui statusline", or asks why the status line is not showing after installing the plugin.
---

# Clear UI setup

Clear Claude cannot register a status line from a plugin manifest: Claude Code accepts only the
`agent` and `subagentStatusLine` keys from a plugin's own settings. So installing Clear UI means
editing the user's `settings.json`, and that edit is done by a script, not by you.

**Your whole job is to run that script and relay what it says.** Do not edit `settings.json`
yourself, with any tool, for any reason — not to fix JSON, not to "help", not if the user asks
you to do it directly. If they insist, point them at the file path and let them edit it.

## Step 1 — show what would change

Always start here, even when the user asked to install outright. This writes nothing.

```text
node "${CLAUDE_PLUGIN_ROOT}/bin/setup.mjs" plan
```

Relay the output as it is. The `verdict` line is the answer:

| Verdict | What it means | What to do |
| --- | --- | --- |
| `install` / `create` | No status line is set | Go to step 2. |
| `unchanged` | Already installed and current | Say so. Nothing to do. |
| `update` | Clear UI is installed, its command needs refreshing | Go to step 2. |
| `needs-choice` | **Another status line is already set** | Go to step 3. |
| `unparseable` | `settings.json` is not valid JSON | Stop. See step 4. |

## Step 2 — install

```text
node "${CLAUDE_PLUGIN_ROOT}/bin/setup.mjs" apply
```

Then tell the user to restart Claude Code or run `/reload-plugins`, and quote the two example
lines from the script's output so they know what to look for.

## Step 3 — a status line is already there

The script has already refused to touch it. Name what is there (the `current` line of the
output) and ask the user to choose, using AskUserQuestion with exactly these options:

- **Replace it with Clear UI** — the current command is saved to the plugin's data directory and
  `uninstall` puts it back; `settings.json` is backed up with a timestamp either way.
- **Keep what I have** — Clear UI is not installed.

Then run `apply --replace` or `apply --keep`. Never guess, and never run `--replace` because it
seemed like what they wanted.

## Step 4 — unparseable settings

The script refuses to write to a `settings.json` it cannot read, because rewriting it would
discard whatever is in it. Give the user the file path and the parse error, and say that
Claude Code is ignoring that file too, so this is worth fixing regardless of Clear UI. Do not
offer to repair the JSON for them.

## The activity row (opt-in)

Only when the user asks for it — "show running agents in the status line", "turn on the clear ui
activity row". It adds a third row while something runs, such as `2 agents · 6m  │  1 background`,
and it needs a second settings key, `subagentStatusLine`, used purely as a data feed: the handler
prints nothing, so the agent panel keeps Claude Code's own rows.

```text
node "${CLAUDE_PLUGIN_ROOT}/bin/setup.mjs" plan --activity
node "${CLAUDE_PLUGIN_ROOT}/bin/setup.mjs" apply --activity
node "${CLAUDE_PLUGIN_ROOT}/bin/setup.mjs" apply --no-activity     # switch it off again
```

The `activity` line of the output is its verdict. `needs-choice` means the user already has a
`subagentStatusLine` of their own: ask, exactly as in step 3, and pass `--replace` only if they
choose it. Their command is saved and `uninstall` or `--no-activity` puts it back.

## Removing it

```text
node "${CLAUDE_PLUGIN_ROOT}/bin/setup.mjs" uninstall
```

This restores the status line that was there before Clear UI, or removes the key if there was
none, then deletes the copied runtime. Backups stay. A verdict of `not-ours` means the current
status line belongs to something else and was left alone.

## What this never does

Touch any settings key other than `statusLine` and, only when asked, `subagentStatusLine`; reformat the rest of the file (it edits the text
in place, so unrelated lines stay byte for byte as they were); read or print the contents of
other settings; make a network request.
