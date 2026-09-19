# Changelog

All notable changes to Clear Claude are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because the product is a prompt, any edit to `clear-partner.md` is a behaviour change
and gets its own entry here and its own version bump.

## Unreleased

Carried by no marketplace release: `clear-transcript` lives outside the marketplace until Claude
Code documents function hooks and switches them on, and it has its own version, 0.1.0. Nothing
here changes `clear-partner` or `clear-ui`, and installing either still installs neither mod nor
gate.

### Added

- **Clear Transcript, the third layer, as an experimental plugin** you run from a clone:
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir experimental/clear-transcript`. It
  cannot be installed, on purpose ([docs/clear-transcript.md](docs/clear-transcript.md)). With it
  loaded, on Claude Code 2.1.278:
  - A finished group of tool calls **names its files and commands, and gives each failed call its
    own line** — `Read sum.mjs, format.mjs, parse.mjs`, `failed  node --test · Exit code 1` —
    where stock draws `Read 3 files, ran 2 shell commands`. In the recorded session that count
    stood for two commands that had both failed, with nothing on screen saying so.
  - **Section titles (`#`, `##`) in an answer are underlined.** Stock draws every heading level as
    the same plain bold. Nothing else in an answer is touched — code, tables, lists and
    sub-headings are Claude Code's own drawing — and an answer stays exactly as tall as before.
  - **ctrl+o shows every row as Claude Code draws it**, and `/clear-transcript off` does the same
    in place. No word the model wrote is removed, reordered or added; nothing is folded or hidden.
  - Two `/config` switches, one per behaviour. It hooks `ui.render` only: no tool calls, no
    prompts, no files, no network — `claude plugin validate experimental/clear-transcript` prints
    the list, without the gate.
- Research behind it, for anyone building on function hooks:
  [what the platform allows on 2.1.278](docs/research/mods-research-2.1.278.md), measured in
  recorded sessions and with `claude plugin test`, and
  [how twelve coding agents present a transcript](docs/research/transcript-ux.md), with what
  their users reward and punish. Recorded sessions:
  [docs/clear-transcript-dogfood.md](docs/clear-transcript-dogfood.md).

### Changed

- The roadmap's Phase G is rewritten as what was built rather than what was planned, and says
  which parts are proven, which depend on an experimental API, and what is blocked only by it
  ([docs/roadmap-v2.md](docs/roadmap-v2.md)). The earlier plan to *collapse* tool rows is gone:
  stock already collapses them, and the evidence is that the collapse is the problem.
- CI tests Clear Transcript's pure core on Linux, macOS and Windows, validates it, checks what its
  hooks may touch, and runs its hooks in Claude Code's own test host. `scripts/check-repo.mjs`
  fails if it is ever listed in the marketplace while it lives under `experimental/`.

## [0.4.1] - 2026-09-20

Marketplace 0.4.1: `clear-partner` 0.2.1 and `clear-ui` 0.2.1. A closing release for both
layers: one real diagnostic defect fixed, the evidence gaps of 0.4.0 measured instead of
assumed, and everything that had collected under "Unreleased" shipped. **No change to the
Clear Partner prompt** — same bytes, same SHA-256 — and no change to what the status bar draws.

### Fixed

- **`clear-doctor` and `clear-audit` no longer fail an install that is fine** (`clear-partner`
  0.2.1). Both reported FAIL / NOT ACTIVE when a style file named `Clear Partner` sat in
  `~/.claude/output-styles/` — the usual leftover of having used the style by hand before the
  plugin existed — on the reasoning that it silently replaces the plugin's copy. It does not,
  and never did on any version measured (2.1.273, 2.1.277, 2.1.278): a plugin's style is keyed
  `clear-partner:Clear Partner`, so a file with the bare name replaces nothing and the
  plugin's style stays forced. Only a file that takes that *qualified* name displaces it, and
  that is what the skills look for now. A plain `Clear Partner` file is named in the report as
  what it is: a separate style, harmless.
  [docs/research/style-shadowing.md](docs/research/style-shadowing.md) has the measurement; the
  README, `docs/troubleshooting.md` and `docs/architecture.md` said the same wrong thing and
  are corrected.
- **The skills now read the policy level too.** Their own description of style resolution
  named an administrator-level style directory that neither of them looked at. Its location
  was read from Claude Code and then measured on disposable Linux, macOS and Windows machines;
  a policy directory that cannot be read is a WARN in `clear-doctor` and INDETERMINATE in
  `clear-audit` — never a clean pass, and never a guess.
- `configure.mjs show` printed `weeklyScopedon` and `verificationon`: both names are exactly as
  wide as the column was, and `verification` had been since 0.1.0 — found when the second one
  turned up in a recording. Display only; the settings were always read and written correctly
  (`clear-ui` 0.2.1).

### Changed

- **The upgrade notes for the 0.4.0 rename said "a session or two"; that was wrong.** After a
  marketplace-only update, sessions never bring Clear Partner back by themselves — three in a
  row ran without it, on Windows, macOS and Linux. A `claude plugin` command does, which is
  what had happened between the sessions of the earlier runs. The advice is unchanged and now
  better founded: `claude plugin marketplace update clear-claude`, then
  `claude plugin install clear-partner@clear-claude`. Also measured now rather than quoted:
  project and local settings are rewritten like user settings; a plugin enabled from
  **managed** settings is not rewritten and, contrary to Claude Code's documentation, stops
  loading until the new name is installed or an administrator changes the key
  ([docs/migration.md](docs/migration.md#what-was-measured)).
- The macOS timing budget is no longer a guess. On a real Mac (M4 Mac mini) the status line
  takes 38 ms with git cached and 46 ms on a cache miss, median of three runs, so the 40 / 60 ms
  budget stands — with about 2 ms to spare on the first number. An Intel Mac has not been
  measured and is recorded as a limit, not as open work. The opt-in features were also run
  against real hook payloads on macOS ([docs/clear-ui-dogfood.md](docs/clear-ui-dogfood.md)).
  No change to what the bar draws (#2, closed).
- `bench/bench.mjs` no longer says `over budget` in a CI log: on a shared runner the budgets are
  printed as `not judged`, because the same runner swings by half between runs. The 250 ms
  ceiling still fails a build, and `--strict` still judges the budgets anywhere.
- The three side-by-side recordings say "+ Clear Partner plugin". The banner is drawn by the
  edit step, not recorded, so they were cut again from the same stored frames: same frame
  counts, same lengths, nothing inside a frame differs.
- The README's roadmap says what is finished, what is tracked (#18, #19) and what is not
  planned, instead of a list of unticked boxes; `docs/roadmap-v2.md` opens with the same
  accounting. "Same commands work on macOS: not verified" is gone from `docs/install.md`.

### Added

- `scripts/measure-plugin-loading.sh` and a manual `Measure plugin loading` workflow: how the
  installed Claude Code treats a renamed plugin and a style file that takes the plugin's key,
  in throwaway config directories, with no credential and nothing billed. It is how the two
  corrections above were found, and how to take the numbers again after a Claude Code release.
- `scripts/check-repo.mjs` also fails if the diagnostic skills stop naming the style's
  qualified key — it is built from the plugin's name, so a rename would silently break them.
- A recording of the usage provider, `assets/clear-ui-scoped-usage.gif`, with its tape and a
  note on what in it is real ([demo/README.md](demo/README.md)).

## [0.4.0] - 2026-09-20

Marketplace 0.4.0: `clear-partner` 0.2.0 (the plugin formerly named `clear-claude`).
`clear-ui` stays at 0.2.0. **No change to the Clear Partner prompt** — same bytes, same
SHA-256 — and no change to Clear UI's code.

### Changed

- **The plugin `clear-claude` is now `clear-partner`.** "Clear Claude" had come to mean the
  product, the marketplace and one of its plugins at once, and the install id was
  `clear-claude@clear-claude`. Now Clear Claude is the product and the marketplace, and each
  plugin is named after its layer: `clear-partner@clear-claude`, `clear-ui@clear-claude`
  ([ADR 0005](docs/adr/0005-naming-and-install-paths.md)).
  - **If you have it installed:** `claude plugin marketplace update clear-claude`, then
    `claude plugin install clear-partner@clear-claude`, then restart. Claude Code (2.1.193
    or later) shows `Renamed to "clear-partner" in the "clear-claude" marketplace` once and
    rewrites the key in your settings by itself. Skip the `install` line and it still
    works, but the next session or two run without Clear Partner until Claude Code has
    fetched it under the new name. The old `claude plugin update clear-claude` now
    answers "not found"; that is expected. All of it measured on 2.1.278:
    [docs/migration.md](docs/migration.md).
  - **What you will notice:** the skills' full names are `/clear-partner:clear-doctor` and
    `/clear-partner:clear-audit` (asking for "clear doctor" works as before), and the style's
    qualified name is `clear-partner:Clear Partner`. Commands that name the plugin take the
    new name; commands that name the marketplace are unchanged.
  - `clear-ui@clear-claude` is not renamed; its settings key and data directory are untouched.
- **One install story.** The README opens with the full Clear Claude in three lines plus
  `set up clear ui`, with Partner-only and UI-only as "run fewer lines", then what changes on
  your machine, and how to check, update and remove it. The lifecycle detail stays in
  `docs/install.md` and `docs/clear-ui-install.md`. The pre-publication `OWNER/clear-claude`
  placeholder is gone from the docs and from `clear-doctor`'s remediation, and the platform
  table no longer calls Windows unverified when the repository records a Windows install.
- `clear-doctor` and `clear-audit` look for `clear-partner@…`, and recognise an install
  still listed under the former id instead of reporting "not installed".
- The third, future layer is called **Clear Transcript** (it was "Clear Mods"). Still
  unlisted and under `experimental/`.

### Added

- `docs/migration.md`, and a "Renaming or removing a plugin" section in `docs/releasing.md`.
- `AGENTS.md` is the repository's instructions for coding agents; `CLAUDE.md` imports it, and
  `llms.txt` is a link index. No fact is stated in more than one of them.
- `scripts/check-repo.mjs`, run in CI: plugin versions agree across manifests, the recorded
  SHA-256 of the prompt is current, the former plugin id appears only where history is
  recorded, and every relative Markdown link and anchor resolves.
## [0.3.0] - 2026-09-19

Published as tag `v0.3.0`. Marketplace 0.3.0: `clear-ui` 0.2.0. `clear-claude` stays at 0.1.1, with no change to Clear
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
