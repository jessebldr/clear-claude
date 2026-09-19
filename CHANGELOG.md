# Changelog

All notable changes to Clear Claude are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because the product is a prompt, any edit to `clear-partner.md` is a behaviour change
and gets its own entry here and its own version bump.

## [0.3.0] - 2026-09-19

Marketplace 0.3.0: `clear-ui` 0.2.0. `clear-claude` stays at 0.1.1, with no change to Clear
Partner. **Nothing changes unless you opt in:** by default the status line draws what it drew
before, byte for byte, and reaches no network.

### Added

- **Usage provider (opt-in): the weekly limit scoped to one model, on the bar.** Claude Code's
  usage screen shows a third window — a weekly limit for one model — that the status-line data
  does not carry. `node bin/configure.mjs usage on` (or ask for it: "show my model's weekly
  limit in the status line") adds it as one more chip after the weekly one, under the name
  Claude Code gives it: `7d 68% · 4h07m  │  Fable 65%`. Same warning (80 %) and critical (95 %)
  levels as the other quotas. No model is named in the code; whatever label arrives is drawn.
  - **Where the number comes from.** A background worker runs Claude Code's own
    `claude -p /usage`, at most every ten minutes across all your sessions, and reads the
    structured report in its output. Claude Code reaches the network for that with its own
    sign-in, as it does for its `/usage` screen. Clear UI reads no credential and calls no API.
    The run makes no model call and costs nothing.
  - **That surface is not documented by Anthropic.** It was measured on Claude Code 2.1.278
    ([docs/research/headless-usage.md](docs/research/headless-usage.md)). A run is believed only
    when it proves it was the built-in command — no turn, no cost, no token, no model — and only
    its structured report is read, never the text. Anything else is a silent failure: the chip
    disappears rather than showing a wrong number. A failure never overwrites the last good
    answer, which is drawn for 30 minutes and then not at all.
  - **What it costs.** The status line only reads a small file: a few milliseconds, within
    measurement noise. The one tick in ten minutes that starts the worker costs about 8 ms. The
    worker is a full Claude Code start (~1.9 s, hidden, in the background), which rewrites
    `~/.claude.json` and makes Claude Code's usual start-up requests.
  - **It never goes through a shell.** `claude` is started with an argument vector: through Git
    Bash, `/usage` becomes a path, and a path is a prompt a model answers for money — that
    happened once while this was being measured ($0.136), and a test now holds the door shut.
    As a second line, the run uses the cheapest model, no tools and the smallest budget.
    `--max-budget-usd` does not prevent a first accidental model call, only a second; measured,
    that first call costs $0.004 under these flags.
  - **Responsive.** The chip is the first thing dropped when the row is short, and while it is
    healthy it is never what turns a bar that fitted on one row into two.
    `configure.mjs set weeklyScoped off` hides it and leaves the provider running.
  - **Windows:** needs the native `claude.exe`. An npm install's `claude.cmd` cannot be started
    without a shell, so there the provider stays silent.
- **Doctor: a `Usage provider` row** — off or on, whether a `claude` executable was found, how
  old the last good answer is, when the last attempt was. The doctor reads what is on disk and
  never starts a refresh, its dry render included. `node bin/usage-refresh.mjs <cache
  directory> --report` runs one refresh by hand and says why it was or was not believed.

### Changed

- The plugin and marketplace descriptions, and both READMEs, no longer say "no network" without
  qualification: the default is still network-free, and the opt-in provider is described as
  what it is — Claude Code's own command, run in the background.
- `configure.mjs show` lists `usage` and the new `weeklyScoped` segment.

## [0.2.2] - 2026-09-19

Published as tag `v0.2.2`. Marketplace 0.2.2: `clear-claude` 0.1.1 — **a prompt change, so a behaviour
change** — and `clear-ui` unchanged at 0.1.1.

### Changed

- **Clear Partner 0.1.1.** Two edits to the prompt, each made only after an eval case failed on
  0.1.0 (`docs/evals.md`):
  - New section **Explicit constraints**: when the user fixes the shape of the reply — "one
    sentence", "just the command", "nothing else", a word limit — that outranks every default
    in the style, including the completion report after implementation work. The one exception
    is a safety-critical warning, kept to a single short line with nothing else added. On 0.1.0,
    "in one sentence" after tool use came back as two or three sentences in 4 runs of 4.
  - **Formatting**: a table only for a real comparison; a short set of commands, options or
    steps is a list. 0.1.0 answered a plain "how do I check disk space" with a table 4 times in
    4, where stock Claude Code never did, and in a terminal pane its cells wrapped.
  - Recorded checksum updated in `docs/clear-partner-port.md` and in the `clear-audit` skill:
    5294 bytes, SHA-256 `a8eb2048…07f3e0`. `source/clear-partner.md` carries the same text.
- Measured effect, four runs per arm of three questions: 524 → 258 words (−51 %); 0.1.0 measured
  524 → 372 (−29 %). Cases a–f still pass 6/6 on 0.1.1.
- Demo set polished and re-recorded for 0.1.1: every GIF is 15–17 s (was 37–77 s) with waiting
  cut out and nothing inside a frame touched; one width, banner and framing across the set;
  a cover frame and a PNG of it for each; three primary demos in the README, two secondary.
  `demo/edit.mjs` does the cutting and documents exactly what it does to time.

### Added

- Six regression eval cases, g–l, for explicit response-shape constraints and for tables in
  simple terminal answers.

## [0.2.1] - 2026-09-19

Published as tag `v0.2.1`. Marketplace 0.2.1: `clear-ui` 0.1.1. `clear-claude` stays at 0.1.0, with no
change to Clear Partner. No new features: two fixes found by the first cross-platform CI run,
the first end-to-end use of the opt-in features with real hook payloads, and real recordings
in place of drawn images.

### Fixed

- `clear-ui`: a `git status` listing that is cut short is never taken for an answer. The
  timer is now the renderer's own instead of `execFile`'s, whose handler could report success
  with a truncated listing, and a listing with no branch header is treated as slow however git
  exited. Before, the git segment could vanish for one 5-second cache period. (#4)
- `clear-ui`: the missing dirty mark on a slow machine is no longer silent. The 150 ms git
  budget is unchanged — measured at 24–29 ms in ordinary repositories and 89 ms in a
  52,000-file one on a developer machine — but where a process start alone costs more than
  that, `clear-ui-doctor` now reports it on a `Git speed` line, and
  `CLEAR_UI_GIT_TIMEOUT_MS` (50–2000) lets that machine choose a slower tick. (#3)
- Tests no longer race a real git against a real clock, which failed the first CI run on
  `windows-latest` and on Node 18; the CI demo-render step runs under bash on every runner.

### Added

- `bench/git-latency.mjs`: how long `git status` takes on this machine, run the way the status
  line runs it. CI prints it for every runner.
- `docs/clear-ui-dogfood.md`: what the first end-to-end run of verification state and the
  activity row with real hook payloads showed on Windows, and the same checklist for a Mac.
- Behavioural evals and `clear-audit` re-run on Claude Code 2.1.278: 6/6 with the plugin, as
  on 2.1.274. See `docs/evals.md`.

### Changed

- Every demo image is now a recording of a real Claude Code session, made with VHS, in place
  of the drawn cards and the status-bar mock-up. The tapes, the assembly scripts and the method
  are in `demo/`. The before/after recordings run two stock sessions that differ only by
  `--plugin-dir plugins/clear-claude`.
- The README's word-count claim is re-measured and no longer rests on one run: four runs per
  arm of three questions average 524 → 372 words (−29 %), replacing 612 → 408 (−33 %) from a
  single run each. Raw outputs are in `demo/runs/2026-09-19/`.
- Research logs moved to `docs/research/` (`phase0-research`, `mods-research-2.1.277`,
  `ui-research`, `ux-distillation`, `marketplace-test`), so `docs/` reads as user and
  maintainer documentation. Every link was rewritten and checked.

### Removed

- `docs/design/`: two reference mock-ups (3.4 MB) the status bar was first drawn from. They
  showed borders and a corner radius a terminal cannot draw; the rules that still bind are the
  design-spec table in `docs/ui-architecture.md`, and the real look is the recording.

## [0.2.0] - 2026-09-19

Published as tag `v0.2.0`. Marketplace 0.2.0: `clear-ui` debuts at 0.1.0. `clear-claude` stays at
0.1.0, with no change to Clear Partner.

### Added

- **`clear-ui` 0.1.0**, a second, optional marketplace plugin: a status bar for Claude Code.
  `Fable 5.1  high  │  clear-claude on main  ●` on the left; context, 5-hour and weekly usage
  as tinted chips on the right, drawn to the design spec in `docs/design/`. Installing it never
  installs `clear-claude`, and the reverse. See
  [docs/clear-ui-install.md](docs/clear-ui-install.md) and
  [docs/ui-architecture.md](docs/ui-architecture.md).
  - A deterministic setup script is the only thing that edits `settings.json`: it plans before
    it writes, backs up, never replaces another status line without being told to, and restores
    the previous one on uninstall. Installs `refreshInterval: 2`, because a terminal resize does
    not re-run a status line and the bar is padded to the terminal's width.
  - Git branch and dirty state from one cached `git status`; presets and looks through
    `clear-ui-configure`; read-only diagnosis through `clear-ui-doctor`.
  - Opt-in: verification state from documented `PostToolUse` hooks (per project, only for the
    commands the project lists), and an activity row counting running agents and background
    commands.
  - Context turns amber at 70 % and red at 85 %; quotas at 80 % and 95 %.
- CI: `clear-ui` tests and a timing bench on Windows, macOS and Linux.
- Research and design records: `docs/research/mods-research-2.1.277.md`, `docs/research/ui-research.md`,
  `docs/research/ux-distillation.md`, `docs/roadmap-v2.md`, ADR 0004, and disposable function-hook
  spikes under `experimental/spikes/`.

### Changed

- Marketplace version 0.1.0 → 0.2.0. Each plugin carries its own version; the marketplace
  version tracks the newest change (`docs/roadmap-v2.md`, "Versions").
- README, `docs/architecture.md`, `docs/install.md` and `docs/releasing.md` now describe a
  marketplace of two independent plugins rather than a single one.

## [0.1.0] - 2026-09-17

Initial release.

### Added

- **Clear Partner output style** (`plugins/clear-claude/output-styles/clear-partner.md`)
  — answer-first, plain English, concise by default, deep when depth is asked for.
  Ported unmodified from the behaviourally tested original, apart from one added
  frontmatter line; see [docs/clear-partner-port.md](docs/clear-partner-port.md).
- `keep-coding-instructions: true`, preserving Claude Code's default engineering
  instructions. The style changes communication, not capability.
- `force-for-plugin: true`, so the style applies automatically while the plugin is
  enabled and stops applying when it is disabled. Tradeoff documented in
  [docs/architecture.md](docs/architecture.md).
- **`clear-doctor` skill** — read-only install diagnostics. Checks the manifest, the
  style file and its four frontmatter fields, which settings layers exist and which one
  wins for output styles, installed vs marketplace version, and conflicting output
  styles. Emits a PASS/WARN/FAIL table with remediation. Reports the existence and
  precedence of settings files only; never their contents.
- **`clear-audit` skill** — read-only activation and conformance checks. Derives whether
  Clear Partner is the *active* style from Claude Code's own resolution rules, and
  compares the style file's SHA-256 against the value recorded in
  [docs/clear-partner-port.md](docs/clear-partner-port.md). Deviations are classified,
  never repaired.
- Recorded checksum for `clear-partner.md` in `docs/clear-partner-port.md`. Editing the
  style now requires updating that record and the copy inside the `clear-audit` skill in
  the same commit.
- Plugin manifest (`plugins/clear-claude/.claude-plugin/plugin.json`) and marketplace
  manifest (`.claude-plugin/marketplace.json`). Both pass
  `claude plugin validate --strict` with no errors and no warnings against Claude Code
  2.1.274, as do both `SKILL.md` files
  (`claude plugin validate plugins/clear-claude/skills --strict`).
- README with install, update, verify, uninstall, disable, switch-away, and recovery
  instructions — one command set for Windows, macOS, and Linux.
- `docs/philosophy.md` — why answer-first, what "concise" means here, and the
  prompts-for-judgment / mechanisms-for-mechanics split, grounded line by line in the
  style prompt itself.
- `docs/install.md` — the full lifecycle with exact command syntax, scopes, CI flags,
  session-only loading, recovery, and a platform-confidence table.
- `docs/troubleshooting.md` — symptom-first fixes for the failures nothing validates,
  chiefly a misspelled `force-for-plugin` and a user-level style named `Clear Partner`
  that shadows the plugin's copy.
- `experimental/mods/README.md` — research note on "Mods" / function hooks. No code, no
  dependency from the stable plugin, and a re-check procedure for future versions.
- `docs/research/phase0-research.md`, the verified platform reference for Claude Code 2.1.274,
  with an evidence tier on every claim.

### Changed

- `docs/research/phase0-research.md` §7 amended. The original claim that Mods/function hooks were
  unsupported on 2.1.274 was too strong: the name "Mods" is absent, but a function-hooks
  mechanism is present — env-gated, off by default, absent from all help text, and
  recognised by `claude plugin validate`. Evidence and re-check steps are in
  `experimental/mods/README.md`. Nothing in the stable plugin depends on it.
- MIT license.

### Notes

- Distribution is the native plugin system only. No install scripts, no dotfile
  copying, no absolute paths, no symlinks.
- Manifests were validated on Linux. Behaviour on Windows and macOS is expected to be
  identical because the package contains nothing platform-specific, but has not been
  verified on those platforms.
