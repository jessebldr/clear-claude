# Clear UI — architecture and v0.1 design

**Status: Phases A–D and F are implemented in `plugins/clear-ui` and installed by its setup script; the activity row is opt-in. Mods are not started.** Platform facts come from
[mods-research-2.1.277.md](research/mods-research-2.1.277.md); ecosystem lessons from
[ui-research.md](research/ui-research.md).

## The problem

Not "Claude Code needs more information on screen." Claude Code already exposes useful
state, scattered across the footer, the spinner, `/usage`, `/context`, `/tasks` and the
shell. The user has to reconstruct the situation: how much room is left, when quota
resets, whether the repo is dirty. Clear UI turns that into one calm bar — a single row when
the terminal is wide enough, two when it is not.

## Layers

```text
Clear Partner  → how Claude communicates          (prompt; plugins/clear-claude)
Clear UI       → what the user sees at a glance   (statusline; plugins/clear-ui)
Clear Mods     → how Claude Code behaves/renders  (function hooks; experimental/)
```

Scope: all three layers live inside stock Claude Code in a terminal. No desktop or web
app, no replacement harness — see the Scope section of [roadmap-v2.md](roadmap-v2.md).

Rules: prompts for judgment, deterministic mechanisms for mechanics; **never solve the
same problem in two layers**; installing one layer never installs another.

## Package structure

```text
clear-claude/
├── .claude-plugin/marketplace.json   ← lists clear-claude and clear-ui only
├── plugins/
│   ├── clear-claude/                 ← unchanged, stable
│   └── clear-ui/
│       ├── .claude-plugin/plugin.json
│       ├── src/
│       │   ├── render.mjs            ← PURE: (state, options) → string[]; no I/O, no Node API
│       │   ├── state.mjs             ← pure: statusline stdin JSON → render state
│       │   ├── sanitize.mjs          ← pure
│       │   ├── layout.mjs            ← pure: breakpoints, drop-by-priority
│       │   ├── stdin.mjs             ← Node: bounded, timeout, parse-when-complete
│       │   ├── git.mjs               ← Node: one call, timeout, TTL cache
│       │   ├── config.mjs            ← presets, validation (pure) and the one file read
│       │   ├── verify.mjs            ← pure: which commands count, what the records mean
│       │   ├── session-state.mjs     ← Node: per-session records, one writer per file
│       │   ├── usage.mjs             ← pure: opt-in usage provider — arguments, validation, record
│       │   └── usage-cache.mjs       ← Node: its cache file, single-flight claim, the `claude` run
│       ├── bin/
│       │   ├── statusline.mjs        ← entry: read → gather → render → print → exit(0)
│       │   └── setup.mjs             ← plan / apply / uninstall, deterministic
│       ├── skills/{setup,configure,doctor}/SKILL.md
│       └── test/{fixtures,golden,*.test.mjs}
├── experimental/
│   ├── mods/                         ← research notes
│   └── spikes/function-hooks/        ← disposable spikes (exist today)
└── docs/
```

Decisions, with the alternative each one rejects:

- **`clear-ui` is its own plugin.** A user can run `clear-claude` alone forever. Folding
  the statusline into `clear-claude` would make an output-style install touch
  `settings.json`, which [architecture.md](architecture.md) already rejects.
- **`clear-mods` stays outside the marketplace** until function hooks are documented and
  on by default. A marketplace plugin that needs an undocumented env gate is exactly the
  "installs, enables, does nothing" failure this project was built to eliminate. It loads
  only via `--plugin-dir`. When the API is documented it becomes `plugins/clear-mods`.
- **`clear-ui` and `clear-mods` stay separate even then.** They have different stability
  guarantees and different blast radius (one prints two lines; the other intercepts tool
  calls). They communicate through one small state file, never through code.
- **`render.mjs` is pure and Node-free.** A hooks module has no Node and imports only its
  own relative files. Keeping the renderer pure means the same function can later be
  driven by `session.measure` + `$.ui.status` inside a mod — no process spawn, no Node
  requirement, no settings edit — without a rewrite.
- **Zero runtime dependencies, no build step.** Plain `.mjs`, Node ≥ 18. Tests use
  `node --test`.

## Clear UI v0.1 — what is on screen

Two lines, drawn as one full-width bar when both fit. Setup installs
**`refreshInterval: 2`**. The first design had no timer, on the grounds that nothing is
time-animated; dogfooding showed why that fails. The bar's padding is computed from `COLUMNS`
and baked into the printed row, and a terminal resize is not one of the documented status-line
triggers, so after a drag the old row stays: clipped by the terminal when it got narrower,
with the right group stranded mid-row when it got wider, until the next message. Nothing in
the renderer can fix a row that is not being re-rendered. claude-hud, ccstatusline and
claude-powerline all reach for the same timer (5 s, 10 s and 10 s); ours is 2 s because the
defect being repaired is visual, and the measured cost is one ~55 ms process per tick. The
timer also keeps the 5-hour countdown honest between messages.

| Field | Source | If missing |
| --- | --- | --- |
| Model | `model.display_name` | hidden |
| Effort | `effort.level` | hidden (model without effort) |
| Project | basename of `workspace.project_dir`, else `cwd` | hidden |
| Branch + dirty `*` + ahead/behind | one `git status --porcelain=v2 --branch`, 5 s TTL cache | hidden (no git, not a repo, timeout) |
| Context % + bar | `context_window.used_percentage`; if null, computed from `current_usage` / `context_window_size`; else hidden | `ctx —` only at session start |
| 5h usage + reset | `rate_limits.five_hour` | segment hidden |
| Weekly usage + reset | `rate_limits.seven_day` | segment hidden |
| Weekly usage scoped to a model (opt-in) | the usage provider's cache, under the label Claude Code gave the row | segment hidden: provider off, no answer, answer over 30 min old, or window reset |
| Session cost | `cost.total_cost_usd` — **shown only when no usage window is available and the cost is above zero** (API-key, Bedrock, Vertex) | hidden |

**The per-model weekly limit is not available.** The usage page shows a third window, a separate
weekly limit for the current top model ("Fable this week"). The status-line payload was captured
live on 2.1.277 in both a Fable 5.1 and an Opus 5 session: `rate_limits` carries `five_hour` and
`seven_day` and nothing else, identical in both. Clear UI making a network call with the user's
credentials is ruled out, so by default it is not shown; if Claude Code starts sending it, it is
one more `usage()` segment.

Since 2.1.278 there is one other source: Claude Code's own headless `claude -p /usage` prints the
scoped window as structured data, with no model turn. It is undocumented, takes 1.9 s and reaches
the network, so it is an **opt-in provider** behind a cache, never part of the default and never
on the render path: a detached worker refreshes a file at most every ten minutes and the status
line only reads it. Measurements and failure behaviour:
[research/headless-usage.md](research/headless-usage.md). The status-line contract itself still
does not expose scoped usage.

Deliberately excluded from v0.1: tools, agents, background commands, todos,
verification, session clock, cache stats, PR/CI, tokens per bucket, burn rate, themes,
powerline glyphs, custom widgets, any network call, any transcript parsing. Several
return later as opt-in; none belongs in a default.

### Warnings

Deterministic thresholds, split by what the number means. **A quota is a budget: warning at
80 %, critical at 95 %. Context is not a budget that runs to 100: warning at 70 %, critical at
85 %.** Claude Code compacts on its own well before a window is full — around 80 % of a 200k
window; ccstatusline hard-codes 0.8 as the usable share, and claude-hud, which models the
auto-compact buffer, warns at 75 and 90. With context at 80 / 95, as it first was, the warning
arrived as the compaction did and "critical" was never reached at all. There is no published
standard for these numbers; 70 / 85 is chosen to leave time to `/compact` or `/clear` on one's own
terms, and because answer quality drifts down well before a window is full. In the text look
and with colour off a level is a `!` or `!!` suffix (colour is never the only signal). No "compaction
near" text — the auto-compact threshold is not in the native data, so we do not claim it.

### Layouts

Two levels of separation carry the structure: two spaces inside a group, one vertical rule
between groups. Wide (≥ 80 columns), idle:

```text
Fable 5.1  high  clear-claude  main* ↑2
ctx 31% ▄▄▄▄▄▄▄▄▄▄  │  5h 9% · 2h10m  │  7d 51% · Sat
```

High context, near the 5-hour limit:

```text
Fable 5.1  high  clear-claude  main*
ctx 84%! ▄▄▄▄▄▄▄▄▄▄  │  5h 96%!! · 42m  │  7d 51% · Sat
```

Medium (50–79): meter and ahead/behind dropped.

```text
Fable 5.1  high  clear-claude  main*
ctx 31%  │  5h 9% · 2h10m  │  7d 51%
```

Narrow (< 50) or `COLUMNS` unknown: one item per concept, resets dropped.

```text
Fable 5.1  main*
ctx 31%  │  5h 9%  │  7d 51%
```

No git repository: `Fable 5.1  high  scratch`. API-key user:

```text
Sonnet 5  medium  api-server  main
ctx 31% ▄▄▄▄▄▄▄▄▄▄  │  $0.42
```

Session start (no API response yet): `ctx —`, usage segments hidden.

`CLEAR_UI_CHARSET=ascii` selects the ASCII glyphs. There is no auto-detection: nothing
available to a status-line process reliably distinguishes a terminal that can draw U+2502 from
one that cannot, and a wrong guess is worse than the default, which was measured to work.

Styling degrades in two steps, not one. `TERM=dumb` removes every escape. `NO_COLOR` removes
the hues and **keeps dim**, because [no-color.org](https://no-color.org)'s own FAQ answers
*"Should the presence of NO_COLOR disable other styling such as bold, underline, and italic?"*
with *"No."* — and dropping dim as well would flatten the label/value hierarchy that makes the
line readable. Severity survives both, because `!` and `!!` are text.

ASCII fallback (`CLEAR_UI_CHARSET=ascii`):
`ctx 31% ###-------  |  5h 31%  4h19m`. No Nerd Font is ever required.

### The glyphs, and how they were chosen

Every candidate was measured against the cell advance of **Cascadia Mono, Consolas and
Lucida Console**, and anything that was not exactly one cell in all three was rejected:

| Kept | Rejected, and why |
| --- | --- |
| `│` U+2502 group rule | `↻` U+21BB reset symbol — 1.10–1.33 cells; not a monospace glyph in any of the three, so it arrives from a fallback font with the wrong baseline |
| `·` U+00B7 value/reset join | `⚠` U+26A0 warning — double width in all three |
| `▄` U+2584 meter, fill and groove alike; `█` U+2588 on `─` where styling is off (U+25AC was tried first: elegant in an 18 px mock, indistinguishable from its own track at 15 px) | `✓` U+2713 check — double width in Consolas and Lucida Console |
| `─` U+2500 meter track | `━` U+2501 heavy line — double width in Lucida Console |
| `↑ ↓ … —` | `▂▃▆▇` eighth blocks — not monospace in Consolas or Lucida Console |

Only 100% fills the meter and any value above zero keeps one cell, because a plain round drew
95%, 96%, 99% and 100% as the same completely full bar — identical in the one range where the
difference is worth seeing.

A half-step cell (U+258C, which would double the meter's resolution) was considered and
rejected: the rounding rule above fixes the defect it was proposed for, at no glyph risk.

### The visual pass, and what a screenshot measured

The first dogfooded bar was correct and ugly, and sampling the pixels of a real screenshot
(VS Code terminal, dark, Cascadia Mono 12 px, 7 × 17 px cells) said why:

- **Claude Code paints status-line text in its own muted grey**, #999999 on #191A1B. Plain text
  is already quiet; **bold adds weight and no brightness** (bold and plain sampled the same
  colour); and **faint halves that grey to #59595A — 2.6:1 against the background**. Labels and
  reset times were in faint, so the words a person reads most were the ones below any
  legibility threshold, while the numbers beside them did not actually stand out.
- **The meter was a full block on a hairline**: a 28 × 17 px slab of saturated green welded to
  a 1 px rule. The heaviest object on the row carried the least information — the number
  beside it already says 38 %.

Two attempts to fix that inside a text-only bar were shipped, screenshotted and measured:

- **SGR 39 does not escape the grey.** Bold on the "default foreground" came back #999999.
  Claude Code repaints every span that has no *explicit* foreground; only named or RGB colours
  pass through (the green of the meter always did).
- **A half-block bar hangs off the baseline.** `▄` U+2584 for fill and groove drew at pixel rows
  14–21 beside digits at rows 8–17: four pixels below the text, which reads as a bug.

Both point the same way, and it is what ccstatusline's powerline mode gets right: **a segment
that sets both its foreground and its background owns its contrast** — on any terminal theme,
and whatever Claude Code does to unstyled text. So the default look is now **pills**:

```text
Fable 5.1  high  │  clear-claude on main  ●             ctx 43%   5h 39% · 42m   7d 58% · 13h42m
```

### The design spec

The look was drawn to a design spec: a sheet covering palette, identity hierarchy, metric
chips, do / don't and responsive behaviour, and a mock-up of the same in a VS Code terminal.
Both were reference drawings, not recordings — they showed borders and a small corner radius a
terminal cannot draw — so they are no longer kept in the tree (they remain in git history
under `docs/design/`). What the bar really looks like is the recording in
[assets/clear-ui-demo.gif](../assets/clear-ui-demo.gif). The table below is the part of the
spec that still binds: each rule, and what implements it. Where the two drawings disagreed
the sheet won: the mock-up filled a warning chip with solid amber, and the sheet listed
exactly that under "don't".

| Spec | Implementation |
| --- | --- |
| Palette: primary `#E6EDF3`, secondary `#94A3B8`, accent `#60A5FA`, healthy `#22C55E`, warning `#F59E0B`, critical `#EF4444`, dirty dot `#F97316` | `PALETTES.dark`, to the digit, asserted by `test/palette.test.mjs` |
| Identity: model, effort, a subtle separator, project "on" branch, dirty dot | model bold primary; effort secondary, two cells away; a faint `│`; project in the accent; "on" secondary; branch in the accent, bold; `●` in its own orange, two cells away |
| Healthy: the context chip is green, the quota chips neutral | `ctx` on a dark green tint with a green label; `5h` and `7d` on the slate chip with secondary labels; every number bold primary; times secondary |
| Warning / critical: the chip takes the state's colour | any chip at 80 % or 95 % takes that level's dark tint, its label and number take the hue, its time stays secondary. No `!` marks while colour is on: the chip says it |
| "Don't use heavy full-block bars", "don't use aggressive styles" | no bar and no fill inside a chip; a chip is one tint, held by test to under 1.6:1 against every terminal ground — a tint, never a block |
| Times: `42m`, `2h14m`, `1d6h` | one countdown form for every window; the weekday form is gone |
| Responsive: keep the essentials as the row narrows | the existing fit engine: richest detail that fits, one row or two, and a wider terminal never shows less |

Two places it departs from the spec, both on purpose. The spec's narrow row keeps the effort and
drops the project; here the effort goes first, because the width-monotonicity guard found that
keeping it lets a wider terminal show *less*. And a terminal has cells, not pixels: it cannot
draw the spec's one-pixel chip outline or its 4 px corner radius. What it can do is end a chip in
a **cap** — Powerline's U+E0B6 and U+E0B4, a half-ellipse in the chip's own colour on no
background — in the cell the pad would have used, so a rounded chip is exactly as wide as a
square one and nothing reflows. No font is asked to supply the glyph, which would break the
rule that no patched font is ever required: caps are used only where the terminal draws them
itself, cell-exact, the way it draws box characters — VS Code (`customGlyphs`, on by default),
Windows Terminal 1.20+, iTerm2, kitty, WezTerm, Ghostty. Anywhere else (macOS Terminal, a plain
xterm) they would be an empty box at both ends of every chip, so the ends stay square.
That cap is a half-ellipse the full height of the row, which is rounder than the spec's corner,
and **there is nothing smaller**. The only glyphs that cut just a cell's outer corners are the
sextants (U+1FB2B, U+1FB1B; about 3.5 × 5.7 px on a 7 × 17 px cell), and VS Code's renderer does
draw them — but they are outside the Basic Multilingual Plane, and Claude Code does not carry an
astral character through its status line intact: shipped, and photographed in a real session,
they arrived as grey crosses at both ends of every chip, colour and shape both lost. So the
choice is round or square, everything the renderer draws is BMP, and a test holds it to that.
**Square is the default**: dogfooding judged the half-circle too round for the spec's 4 px corner,
and square is the nearer of the two. `configure.mjs caps <square|round|auto>` or `CLEAR_UI_CAPS`
opts in; `auto` is the detection described above. Because the
caps are private-use characters, `sanitize` now strips that whole class from every untrusted
name: a branch can neither draw a patched font's icons nor fake the end of a chip.

How the grouping and the colour roles were arrived at before the spec, and why they match it:

| Source | What it does | What was taken |
| --- | --- | --- |
| Pure | one hue, for the path; branch, host and user in grey 242; `*` as a small state mark | one hue on the row, for *where* |
| Starship | `directory on branch [status]`: connective words in the default colour | "on" joins project and branch into one unit, instead of a box around each |
| Oh My Posh | `background_templates`: a git segment turns orange when the tree is dirty, red on a failed exit code | state owns the colour; identity never does |
| ccstatusline | every segment sets foreground and background | kept for the chips, the only things with a surface |

- **What joins two identity segments is worked out from the pair** each time one is dropped, so
  "on" can never be left pointing at a project that is no longer there.
- **The dirty mark is `●`, not `*`.** Measured in Cascadia Mono and Consolas, the star's ink
  rides 1.5–2.5 px above the centre of the lowercase beside it and reads as a stray
  superscript; U+25CF sits within 1 px. ASCII keeps `*`.
- **The palette is a set of roles per Claude Code theme**, because identity text sits on a
  ground this code does not choose. `test/palette.test.mjs` holds every word to 4.5:1 on the
  spec's own base, VS Code Dark Modern and Dark+, Windows Terminal Campbell, macOS Terminal Pro,
  white and Solarized Light (the spec's red measures 4.43 on Dark+ and is held to 4.4), and every
  word on a chip to 4.5:1 on that chip. Each role also has an xterm-256 index: macOS Terminal
  has no 24-bit colour, and the cube has no dark tints, so there every chip is one grey and the
  text carries the level.
- **Spacing and baseline are measured in pixels, not cells.** `bench/optical.mjs` rasterises the
  real output with the fonts installed (Cascadia Mono and Code, Consolas, Lucida Console at 12,
  14 and 16 px) and checks that every font-drawn mark is centred on the text beside it, that a
  rule has the same air on both sides, and that a chip has the same air inside on both sides.
  Its two controls are the defects that shipped — the star and the half-block bar — and it must
  catch both.
- `text` is the bar without backgrounds, and what is drawn whenever colour is off; its numbers
  are bright (`97`, or `30` on a light theme) only when `settings.json` says which theme Claude
  Code is set to, its bar is `▬` U+25AC, centred on the digits, levels are marked `!` and `!!`,
  and faint is for structure only — never for a word, which a test enforces.
- Pad cells are no-break spaces, because an ordinary space at the edge of a row is trimmed.
  24-bit colour where the terminal offers it (`COLORTERM`, VS Code, Windows Terminal), the
  256-colour palette otherwise.

A countdown under an hour reads `42m`, not `0h42m`.

Mocks are drawn at the measured geometry with ClearType, with block and box glyphs drawn as
rectangles the way the terminal draws them, and always beside Claude Code's own coloured row.
An 18 px mock is what once made U+25AC look right.

### The activity row (opt-in)

`setup.mjs apply --activity` adds a third row that exists **only while something is running**:

```text
2 agents · 6m  │  1 background
3 agents · 1 failed! · 6m  │  1 background
2 agents  │  1 bg                              narrow: elapsed goes first, then the long word
```

Counts only, as [ux-distillation.md](research/ux-distillation.md) concludes from Codex CLI and Oh My Pi,
which both had richer rows and removed them: the agent panel already lists names, and a name
here would solve the same problem in two layers with text a model wrote. The one elapsed value
is the longest-running agent in whole minutes, hidden under one; it answers "is something
stuck" and nothing finer. Failure is the only coloured item and the last thing dropped.

Two producers, one file each. Agents come from a `subagentStatusLine` command used purely as a
data feed — it prints nothing, so every panel row keeps Claude Code's own rendering — measured
at one call every 5 s while the panel has rows; the row counts `status: running` and stops
believing a record older than 15 s, because the feed is not known to be called once more when
the panel empties. Background commands come from the `Stop` hook's `background_tasks[]`: a
snapshot of the last time Claude stopped, reset at session start, because no event fires when
a shell ends. It is the weakest claim on the bar, which is why it carries no name and no time.

Tool-by-tool activity is *not* planned for the statusline: Claude Code's own spinner
already says what is running, and the transcript renderer (a Mod) is the right place to
calm that down.

### Corrections from Phase A

Implementing the renderer changed four details of this design:

- **`state.mjs` was added.** The renderer takes a small state object, not the raw stdin
  payload, so a second host (a mod fed by `session.measure`) only has to build that state.
- **Cost needs "> 0", not just "no `rate_limits`".** A subscriber's session also has no
  `rate_limits` before its first API response, so the original rule would flash `$0.00`
  at every session start. A resumed subscriber session can still show its cost for the
  moment before the first response; accepted.
- **A usage window whose `resets_at` has passed is hidden**, percentage included — it
  describes a quota that no longer exists.
- **The layout was reworked after the first dogfood.** The number now comes before the meter,
  identity and capacity use different separators, and the reset symbol is gone. Details and
  the measurements behind them are in the glyph table above.
- **Lines are fitted to `COLUMNS − 4`.** The reserve is borrowed from claude-hud, not
  documented by Anthropic; Phase E should measure it. Names are capped at 32 cells, 20 on
  a narrow terminal, so a long directory name is shortened rather than dropped.

The layout examples above use `↻Sat`; the weekday is whatever day the window resets, in
the machine's time zone.

## Configuration

One small JSON file next to the installed renderer, in the plugin data directory
(`<config home>/plugins/data/clear-ui-clear-claude/config.json`). Survives plugin
updates; removed on uninstall. **The default preset needs no file at all** — that is the
multi-machine story: install two plugins, run setup, done.

```json
{ "version": 1, "preset": "essential", "charset": "unicode", "show": { "cost": "auto" } }
```

Presets: `essential` (default, above), `minimal` (line 2 only), `full` (adds session
cost, lines changed, output style). `custom` = preset plus `show` overrides. Unknown keys
are ignored; an unparseable file renders the default and makes `doctor` report it — never
a crash, never an overwrite. No CLAUDE.md, no `userConfig` in v0.1 (the statusline process
does not receive `CLAUDE_PLUGIN_OPTION_*`). Export/import is copying one file; a command
for it is not justified yet.

## Setup

A plugin cannot register `statusLine`, so something must edit the user's settings. That
edit is done by a **deterministic Node script**, not by the model improvising JSON edits.
The skills are thin wrappers that run it and relay its output.

- `/clear-ui:setup` → `setup.mjs plan` prints exactly what would change; `apply` does it.
  1. Refuse if `settings.json` does not parse. Never "repair".
  2. Detect an existing `statusLine`. Offer **Keep / Replace / Cancel**; name known
     products (claude-hud, ccstatusline, powerline) when recognised. Never print the
     existing command's arguments unredacted.
  3. Timestamped backup; store the previous `statusLine` object in the data dir.
  4. Copy the renderer to the data dir (stable path across updates) and write
     `statusLine.command = node "<data dir>/statusline.mjs"` with forward slashes.
  5. Atomic write (temp + rename). Touch no other key.
- `setup.mjs uninstall` restores the stored previous `statusLine`, or removes the key.
- `/clear-ui:configure` → preset picker, writes `config.json`.
- `/clear-ui:doctor` → read-only: Node present and version, command path exists, renderer
  copy matches the installed plugin version, config parses, gates that silently disable
  statuslines (`disableAllHooks`, workspace trust), and a timed dry render.
- A `SessionStart` command hook re-copies the renderer when the plugin version changed,
  so updates need no re-setup.

## Statusline ↔ Mods boundary

| Information / behaviour | Statusline | Mod | Reason |
| --- | --- | --- | --- |
| model, effort, project | renders | — | native stdin |
| context %, 5h, weekly, cost | renders | — | native stdin; `session.measure` would duplicate it |
| git branch / dirty | renders | — | local deterministic data |
| active agents | renders | — | native `subagentStatusLine` feed; no mod needed |
| background command count | renders | — | documented `Stop` hook `background_tasks[]` |
| verification state | **renders** | — (classic hooks **observe**) | one producer writes the record, one consumer draws it |
| collapse / calm tool rows | — | **owns** | main transcript; `ui.render` only |
| spinner wording | — | owns | `ui.render` Spinner |
| strip ANSI / dedupe tool output | — | owns (if ever) | `tool.call` result; high risk |
| compact hand-off | — | owns (if ever) | `session.compact` |
| tone, length, explanation | — | — | Clear Partner, nowhere else |

Shared state is one file, `<data dir>/state/<session_id>.json`, written atomically by
observers and read by the renderer if fresh. Producers never render; the renderer never
observes. If native stdin already carries a figure, nobody recomputes it.

## Cross-platform

Works the same on native Windows, macOS and Linux because: the renderer is one Node file
with no dependencies; the command is `node "<abs path>"`, which is valid in Git Bash,
PowerShell, bash and zsh alike; paths are written with forward slashes (Git Bash eats
backslashes); `git` is invoked by `execFile` with no shell; width comes from `COLUMNS`,
which Claude Code sets on every OS; no `stty`, `tput`, `ps`, `chcp`, `fcntl`.

Verified on macOS on 2026-09-20 (Apple Silicon: the whole suite, the install, the doctor and
real hook payloads — [clear-ui-dogfood.md](clear-ui-dogfood.md)); Linux only on CI runners.
Unverified: an Intel Mac; a developer's Linux machine; behaviour when
Git Bash is absent and PowerShell runs the command; whether `node` is on the PATH of the
shell Claude Code spawns for users who installed Claude Code natively and Node through a
version manager (nvm, Volta — ccstatusline #420 is a hang with Volta shims).

## Security model

The statusline sees model name, paths, branch names and usage. Later layers see commands
and tool output. Rules:

- **Branch names, directory names, agent names and any future transcript-derived text are
  untrusted.** One sanitising pass at the render boundary strips CSI/OSC/C0/C1/DEL and
  bidi overrides and caps length. Not per call site.
- No network. No credential files. No environment values printed. The one exception is opt-in
  and indirect: the usage provider starts `claude -p /usage`, and Claude Code reaches the network
  with its own credentials. It is started with an argument vector and never through a shell, under
  `--safe-mode`, with no tools, the cheapest model and the smallest budget, and its output is
  believed only when it proves no model turn was made.
- State and cache live only in the plugin data dir; bounded size, TTL, atomic writes;
  `session_id` filtered to `[A-Za-z0-9_-]` before it becomes a file name.
- Verification records store a command **classification and hash**, never the command
  string or its output.
- `git` via `execFile` with a resolved absolute path, `GIT_OPTIONAL_LOCKS=0`,
  `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=Never`, `windowsHide`.
- Failure prints nothing and exits 0. No error text on the status line, no stderr.
- No telemetry, ever, without an explicit future opt-in decision.

## Performance budget

Measured on this machine (Windows 11, fresh process per sample, median of 9):

| Step | Median |
| --- | --- |
| `node` start + parse stdin + exit | 40 ms |
| `git status --porcelain=v2 --branch` | 23 ms |
| Git Bash `bash -c true` (the wrapper Claude Code uses) | 29 ms |
| `powershell -NoProfile` empty | 104 ms |

So "< 20 ms warm" is not achievable with Node on Windows: the floor is ≈ 70 ms before our
code runs. Targets:

| | Windows | macOS / Linux |
| --- | --- | --- |
| Our own code (read → render → print), git cached | ≤ 10 ms | ≤ 10 ms |
| End to end, git cached | ≤ 90 ms | ≤ 40 ms |
| End to end, git cache miss | ≤ 130 ms | ≤ 60 ms |
| Hard ceiling (then print without git) | 250 ms | 250 ms |

**The macOS column, measured on a real Mac (2026-09-20, #2).** The 40 / 60 ms target was set
before Clear UI had ever run on a Mac. On a Mac mini (Mac16,10, Apple M4, 16 GB, macOS 26.6.2,
Node 26.7.0 arm64, Homebrew git 2.55.0, on mains power, load average about 4 on 10 cores from
ordinary desktop use), `bench/bench.mjs` — 15 fresh processes per row — read:

| Run | git cached, median / p95 | cache miss, median / p95 |
| --- | --- | --- |
| 1 | 38 / 40 ms | 46 / 47 ms |
| 2 | 38 / 65 ms | 45 / 47 ms |
| 3 | 38 / 39 ms | 46 / 58 ms |

Three more runs later the same night read medians of 37–39 and 45–47 ms, so the medians hold to
within 2 ms; the p95 does not (one of those runs read 77 and 139 ms), because with 15 samples
the p95 is the slowest sample and one busy moment on the machine sets it. **The target stays at
40 / 60, and it is met** — but the cached row has about 2 ms of room, not a margin: a bare
`node -e 0` costs 21 ms of it on this machine (28 ms p95), so everything past a bare
Node start — loading the modules, reading stdin, rendering, printing — is about 17 ms. The budget is judged on the
median for that reason. What this does not cover: an Intel Mac has not been measured, and the
`macos-latest` runner's 82–101 ms says nothing about either.

`git status` on the same Mac (`bench/git-latency.mjs`, 40 fresh processes each): 6 ms median
and 8 ms max in this repository; 56 ms median, 79 ms p95, 150 ms max in a 16,000-file working
repository, none over the 150 ms budget; and 131 ms median, 162 ms p95, 3 of 40 over budget in
a 3,800-file repository whose working tree holds 125,000 files in 4.2 GB — there
`GIT_TRACE_PERFORMANCE` puts 126 ms of it in git's index refresh, so it is that tree's state
and not its size or the platform. That is the case the doctor's `Git speed` line and
`CLEAR_UI_GIT_TIMEOUT_MS` exist for.

**The git budget, measured (2026-09-19, `bench/git-latency.mjs`, 40 fresh processes each).** On
the development machine `git status` takes 24–29 ms median (max 36) in three working
repositories of 400–1,300 files, and 89 ms median, 102 ms p95, 154 ms max in a 52,000-file
clone of nodejs/node: one sample in forty over the 150 ms budget. So the budget holds with room
on a developer machine even in a very large repository. Shared CI runners, idle, agree: 4 ms
on Linux, 13 ms on macOS, 43 ms median and 60 ms max on `windows-latest`. What breaks the
budget is load, not the platform: in the first CI run a `git status` on the Windows runner
missed 150 ms once, while the test runner had a dozen files spawning processes in parallel, and
the bar drew the branch without a dirty mark — by design, and silently. A machine under a
virus scanner or sustained load would see that often. Raising the default would break the
250 ms ceiling above for everyone to help the few, so the default stays, the doctor's
`Git speed` line reports a machine that is over budget, and `CLEAR_UI_GIT_TIMEOUT_MS` (50–2000)
lets that machine choose a slower tick. CI prints the same measurement for each runner.

A listing that is cut short is never an answer. The timer is the renderer's own, not
`execFile`'s — whose handler cuts stdout off before it kills, and reports success with whatever
was read if git had already exited 0 — and a listing with no branch header is treated as slow
however git exited: the last real answer stands, or the branch from HEAD, and nothing is cached
as if git had said "nothing here".

No network and no transcript read on the render path; the opt-in usage provider adds one file
read to it, and about 8 ms to the one tick in ten minutes that starts its worker. Git: one call, 150 ms timeout,
5 s TTL, last-known value on timeout. Explicit `process.exit(0)` so no process can
linger. Measurement: `bench/bench.mjs` spawns the real entry with a fixture on stdin,
fresh process per sample, median and p95 of 15, run in CI on `windows-latest`,
`macos-latest` and `ubuntu-latest`. There the numbers are printed and only the 250 ms ceiling
is judged: the same shared runner swings by half between runs, so a looser "CI budget" would
be one more guess, and `bench.mjs` marks the budget rows `not judged` when `CI` is set. The
Windows and macOS targets are held by measurements on real machines; the Linux target has
only been seen on runners (40–58 ms cached) and is still a hypothesis.

## Test strategy

Pure renderer → golden files, byte-exact, same expected output on all three OSes:
idle, session start (nulls), high context, near limit, API-key (no `rate_limits`), one
window missing, no git, dirty + ahead, each width breakpoint, `COLUMNS` unset, ASCII
charset, `NO_COLOR`, CJK/emoji project name, unknown future fields, hostile branch name
(ANSI, OSC 8, bidi, newline), Windows and POSIX paths.

Entry point → empty stdin, malformed stdin, stdin that never closes (must exit by
timeout), oversized stdin, missing config, malformed config, git absent, git timeout.
Each asserts exit code 0 and no stderr.

Setup → no settings file, unparseable settings (must refuse), existing foreign
statusLine (Keep/Replace), re-run idempotence, uninstall restores the previous value,
unrelated keys byte-identical after apply.

Mods (when they start) → `claude plugin test` with the gate set in CI only: event order,
pass-through equality, behaviour with the gate off (plugin must be inert, not broken),
state cleanup at `session.end`, raw output still reachable after a collapse.
