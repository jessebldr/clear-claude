# Clear UI

**Status: installable, and optional.** `clear-claude` does not depend on it, and installing
`clear-claude` never installs this. Design:
[docs/ui-architecture.md](../../docs/ui-architecture.md); plan:
[docs/roadmap-v2.md](../../docs/roadmap-v2.md).

A calm status bar for Claude Code, drawn from the JSON Claude Code already pipes to a statusline
command plus one `git status`. One row when it fits, two when it does not:

```text
Fable 5.1  high  │  clear-claude on main  ●             ctx 43%   5h 39% · 42m   7d 58% · 13h42m
```

Node >= 18, zero dependencies, no build step.

## Install

The status line has to be named in `settings.json`, because Claude Code accepts only the
`agent` and `subagentStatusLine` keys from a plugin's own settings. A script does that edit,
not the model, and it refuses to guess:

```text
node bin/setup.mjs plan                  # what would change; writes nothing
node bin/setup.mjs apply                 # install
node bin/setup.mjs apply --replace       # ... replacing another status line
node bin/setup.mjs apply --keep          # ... or keep the one you have
node bin/setup.mjs uninstall             # restore what was there before
node bin/doctor.mjs                      # why is it not showing?
node bin/configure.mjs show              # what is drawn; `preset`, `set`, `charset`, `reset`
```

Or ask Claude: the `clear-ui-setup`, `clear-ui-configure` and `clear-ui-doctor` skills run the
same scripts.

What `apply` does, and nothing else: copies the render path to
`<config home>/plugins/data/clear-ui-clear-claude/runtime` (a path that survives plugin
updates, unlike `${CLAUDE_PLUGIN_ROOT}`), records the status line that was there, writes a
timestamped backup of `settings.json`, and sets the `statusLine` key by editing the file's
text in place so every other byte stays as it was. `uninstall` puts the old one back and
removes the config, the git cache and the session state.

The installed `statusLine` carries `refreshInterval: 2`. The bar is padded to the terminal's
width, and Claude Code does not re-run a status line when the terminal is resized, so without
a timer a resized window shows a clipped or stranded bar until the next message. The cost is
one ~60 ms process every two seconds; `git status` sits behind a 5-second cache.

A `SessionStart` hook re-copies the runtime when the plugin version changes, so an update
needs no second setup. It does maintenance only: no prompt injection, no model call, no
network, no settings edit, no output.

## Looks

```text
node bin/configure.mjs look <pills|text>
```

`pills` is the default. Its rules are the design-spec table in
[docs/ui-architecture.md](../../docs/ui-architecture.md#the-design-spec), and a recording of it in
a real session is [assets/clear-ui-demo.gif](../../assets/clear-ui-demo.gif):

```text
Fable 5.1  high  │  clear-claude on main  ●             ctx 43%   5h 39% · 42m   7d 58% · 13h42m
```

Identity is typography with no backgrounds, in two units — who is working, and where. The model
is bold primary, its effort muted, the project and its branch share the one accent, and a dirty
tree is an orange dot. Only a metric is a chip, and a chip is a dark tint of its level under
text in that level's hue: the context chip green when healthy, the quotas neutral, any of them
amber and then red as it fills. Never a saturated block, never a bar.

Chip ends are square. A terminal cannot draw a border or a 4 px radius; the one other end it can
draw is a round cap, a half-circle the full height of the row, which is opt-in:
`node bin/configure.mjs caps <square|round|auto>`. `auto` rounds only where the terminal draws that
glyph itself — VS Code, Windows Terminal 1.20+, iTerm2, kitty, WezTerm, Ghostty — because elsewhere
it would be an empty box; no font is required either way. There is no smaller corner: the glyphs
that would make one are outside the BMP, and Claude Code mangles those.

A quota chip turns amber at 80 % and red at 95 %; the context chip at 70 % and 85 %, because
Claude Code compacts on its own around 80 % of a 200k window and a warning that arrives with the
compaction is no warning.

`text` has no backgrounds at all and is what is drawn whenever colour is off (`NO_COLOR`,
`TERM=dumb`); there a level is marked `!` or `!!`. `CLEAR_UI_LOOK` in the environment outranks
the file.

Why explicit colours everywhere: Claude Code repaints every status-line span that has no explicit
foreground in its own grey (#999999 on a dark theme; bold adds no brightness, faint drops to
2.6:1). The palette is held to 4.5:1 on the spec's base, VS Code, Windows Terminal, macOS
Terminal and light grounds by `test/palette.test.mjs`, and spacing and baseline are measured in
pixels with real fonts by `node bench/optical.mjs`.

## Configure

The default needs no file. `configure.mjs` writes one small `config.json` next to the runtime:

| Preset | Draws |
| --- | --- |
| `essential` | model, effort, project, branch · context, 5-hour and weekly usage; session cost only where there is no quota (API key, Bedrock, Vertex) |
| `minimal` | the capacity group alone |
| `full` | `essential` plus output style, session cost always, lines added and removed |

`set <segment> <on|off>` overrides one segment. A file that does not parse draws the default
and is reported by the doctor; it is never rewritten.

## Verification state (opt-in, per project)

List the commands that count as verification in the project's `.claude/clear-ui.json`:

```json
{ "verify": ["npm test", "uv run pytest"] }
```

A `PostToolUse` / `PostToolUseFailure` hook then records when one of them finishes, and the
bar shows `verified 10:42`, `verify failed 10:42`, or `edited since` once a file is edited
after a passing run. Without that file the hook exits at once and records nothing.

Only observed facts are shown. A listed command counts only where the tool call's exit status
is its own: `npm test | tail` and `npm test; echo done` hide a failure, so they are not
counted at all. Whether an edit is *covered* by the command is never inferred. What is stored
is a hash of the command, pass or fail, a time and a duration — never the command or its
output.

## Activity row (opt-in)

```text
node bin/setup.mjs apply --activity      # and --no-activity to switch it off
```

Adds a third row **only while something is running**: `2 agents · 6m  │  1 background`. Counts
only — the agent panel and the spinner already name what is running, and names are text a
model wrote. Agents come from a `subagentStatusLine` command used purely as a data feed (it
prints nothing, so the panel keeps Claude Code's own rows); the elapsed value is the
longest-running agent, in whole minutes. Background commands come from the `Stop` hook and are
a snapshot of the last time Claude stopped, because nothing fires when a shell ends.
Reasoning: [docs/research/ux-distillation.md](../../docs/research/ux-distillation.md).

## Try it without installing

```text
node bin/statusline.mjs < test/fixtures/idle.json
COLUMNS=120 node bin/statusline.mjs < test/fixtures/warning.json
```

`COLUMNS` is the width to fit: the richest detail that fits is drawn, as one row when both
groups fit side by side and as two when they do not.
`NO_COLOR` or `TERM=dumb` turns colour off.

## Layout

| File | Role |
| --- | --- |
| `src/render.mjs` | Pure: `(state, options) → string[]`. No I/O, clock or environment. |
| `src/state.mjs` | Pure: statusline stdin JSON → render state. Distrusts every field. |
| `src/layout.mjs` | Pure: breakpoints, bar, reset text, fit-to-width by priority. |
| `src/sanitize.mjs` | Pure: strips escape sequences, control and bidi characters; width-aware cut. |
| `src/stdin.mjs` | Node: bounded stdin read that never waits for EOF. |
| `src/jsonedit.mjs` | Pure: surgical edit of one top-level key in raw JSON text. |
| `src/install.mjs` | Pure: what an install or uninstall would do, as a plan. |
| `src/paths.mjs` | Node: where things live; atomic write; runtime copy. |
| `src/git.mjs` | Node: one `git status`, 150 ms timeout (`CLEAR_UI_GIT_TIMEOUT_MS` for a slow machine), 5 s cache, last value when slow or cut short. |
| `src/config.mjs` | Presets and validation (pure), and the one file read. |
| `src/verify.mjs` | Pure: which commands count as verification, and what the records mean. |
| `src/session-state.mjs` | Node: per-session records, one writer per file, atomic. |
| `src/activity.mjs` | Pure: what is running, as counts, and when a record stops being believed. |
| `bin/statusline.mjs` | Entry. Always exits 0, never writes stderr, prints nothing when unsure. |
| `bin/setup.mjs` | `plan` / `apply` / `uninstall`. The only thing here that writes to settings. |
| `bin/doctor.mjs` | Read-only diagnosis. Reports which keys are set, never their contents. |
| `bin/sync.mjs` | `SessionStart` maintenance. Silent, always exits 0. |
| `bin/configure.mjs` | `show` / `preset` / `set` / `charset` / `reset`. Writes `config.json` only. |
| `bin/observe.mjs` | The hook behind verification state and the background count. Records, never renders, prints nothing. |
| `bin/agents.mjs` | The `subagentStatusLine` data feed. Prints nothing; stores type, status and start time only. |
| `bench/bench.mjs` | Fresh-process timing against the budgets; fails only past 250 ms. |
| `bench/git-latency.mjs` | How long `git status` takes here, run the way the status line runs it, against the 150 ms budget. |
| `bench/optical.mjs` | Pixel measurements of the real output with real fonts: baseline of every mark, air around rules and inside pills. Windows only. |

The pure files use no Node API on purpose, so a function-hooks module can host the same
renderer later.

## Tests

```text
npm test                                  # or: node --test
UPDATE_GOLDEN=1 node --test test/render.test.mjs   # after an intended visual change
node bench/bench.mjs                      # median and p95, git cached and cache miss
```

Golden files in `test/golden/` hold every layout of every fixture; ESC is stored as `␛`.
Review the diff of a regenerated golden before keeping it.

## Not here yet

The transcript renderer, which needs function hooks and waits for them to be documented. See
[docs/roadmap-v2.md](../../docs/roadmap-v2.md).
