# Changelog

All notable changes to Clear Claude are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because the product is a prompt, any edit to `clear-partner.md` is a behaviour change
and gets its own entry here and its own version bump.

## [0.1.0] - 2026-09-17

Initial release. Not yet published.

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
