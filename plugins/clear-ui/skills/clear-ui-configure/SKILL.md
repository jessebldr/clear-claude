---
name: clear-ui-configure
description: Choose what the Clear UI status line shows — pick a preset (essential, minimal, full), switch a single segment on or off, or select the ASCII glyphs. Runs a deterministic script that writes one small config file in the plugin data directory; it never touches settings.json. Use when the user says "configure clear ui", "clear ui preset", "hide the branch in clear ui", "show cost in the status line", "clear ui ascii", or asks how to change what the status line displays.
---

# Clear UI configure

**Run the script and relay what it prints.** Do not write `config.json` yourself: the script
validates the value, writes atomically, and refuses to rewrite a file it cannot parse.

Start by showing the current state. This writes nothing.

```text
node "${CLAUDE_PLUGIN_ROOT}/bin/configure.mjs" show
```

## Look

```text
node "${CLAUDE_PLUGIN_ROOT}/bin/configure.mjs" look <pills|text>
```

| Look | Draws |
| --- | --- |
| `pills` | The default. Identity is plain typography in explicit colours — the model brightest, the project and branch in the one accent, a dirty tree an orange dot. Only the metrics are chips: a dark tint of the level under text in that level's hue. The context chip is green when healthy, the quotas neutral. A quota turns amber at 80 % and red at 95 %; context at 70 % and 85 %, because Claude Code compacts on its own around 80 % of a 200k window. |
| `text` | No backgrounds: words, bold numbers and a thin bar, with `!` and `!!` for the levels. What is drawn anyway when colour is off (`NO_COLOR`, `TERM=dumb`). |

Chips need no special font. They use 24-bit colour where the terminal offers it and the
256-colour palette otherwise.

## Chip ends

```text
node "${CLAUDE_PLUGIN_ROOT}/bin/configure.mjs" caps <square|round|auto>
```

`square` is the default. `round` ends each chip in a half-circle; `auto` does so only where the
terminal draws the cap glyph itself — VS Code, Windows Terminal 1.20+, iTerm2, kitty, WezTerm,
Ghostty — and stays square elsewhere. The round end is a full half-circle; a smaller corner is not possible, because the
glyphs that would draw one do not survive Claude Code's status line. If the user sees an empty box or a question mark at both ends of every chip, their
terminal does not draw it: set `square`. A terminal cannot draw a real border or a small corner
radius; say so if asked.

## Presets

```text
node "${CLAUDE_PLUGIN_ROOT}/bin/configure.mjs" preset <essential|minimal|full>
```

| Preset | Draws |
| --- | --- |
| `essential` | The default, and what is drawn with no file at all: model, effort, project, branch · context, 5-hour and weekly usage. Session cost only where there is no quota to show (API key, Bedrock, Vertex). |
| `minimal` | The capacity row alone: context, 5-hour, weekly. |
| `full` | `essential` plus the output style, the session cost always, and lines added and removed. |

Choosing a preset drops any single-segment overrides made earlier; say so if `show` listed some.

## One segment

```text
node "${CLAUDE_PLUGIN_ROOT}/bin/configure.mjs" set <segment> <on|off>
```

Segments: `model`, `effort`, `project`, `git`, `context`, `fiveHour`, `sevenDay`, `cost`,
`lines`, `outputStyle`. `cost` also takes `auto`, `always` and `never`. Switching `git` off
also stops the `git status` call, which matters in a very large repository.

## Glyphs

```text
node "${CLAUDE_PLUGIN_ROOT}/bin/configure.mjs" charset <unicode|ascii>
```

Use `ascii` when the rule or the meter draws as boxes or question marks. The environment
variable `CLEAR_UI_CHARSET` outranks the file, because it is set per terminal.

## Back to the default

```text
node "${CLAUDE_PLUGIN_ROOT}/bin/configure.mjs" reset
```

Deletes the file. No restart is needed for any of this: the status line reads the file each
time it runs.

## If the script refuses

`config.json` exists but is not valid JSON. Give the user the path and the choice: fix it by
hand, or `reset`. Do not repair it for them.
