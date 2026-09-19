# Changelog

All notable changes to Clear Claude are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because the product is a prompt, any edit to `clear-partner.md` is a behaviour change
and gets its own entry here and its own version bump.

## [Unreleased]

No change to either plugin.

### Changed

- Every demo image is now a recording of a real Claude Code session, made with VHS, in place
  of the drawn cards and the status-bar mock-up. The tapes, the assembly scripts and the method
  are in `demo/`. The before/after recordings run two stock sessions that differ only by
  `--plugin-dir plugins/clear-claude`.
- The README's word-count claim is re-measured and no longer rests on one run: four runs per
  arm of three questions average 524 → 372 words (−29 %), replacing 612 → 408 (−33 %) from a
  single run each. Raw outputs are in `demo/runs/2026-09-19/`.

## [0.2.0] - 2026-09-19

Not yet published. Marketplace 0.2.0: `clear-ui` debuts at 0.1.0. `clear-claude` stays at
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
- Research and design records: `docs/mods-research-2.1.277.md`, `docs/ui-research.md`,
  `docs/ux-distillation.md`, `docs/roadmap-v2.md`, ADR 0004, and disposable function-hook
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
- `docs/phase0-research.md`, the verified platform reference for Claude Code 2.1.274,
  with an evidence tier on every claim.

### Changed

- `docs/phase0-research.md` §7 amended. The original claim that Mods/function hooks were
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
