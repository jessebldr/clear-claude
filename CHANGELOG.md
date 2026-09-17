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
- Plugin manifest (`plugins/clear-claude/.claude-plugin/plugin.json`) and marketplace
  manifest (`.claude-plugin/marketplace.json`). Both pass
  `claude plugin validate --strict` with no errors and no warnings against Claude Code
  2.1.274.
- README with install, update, verify, uninstall, disable, switch-away, and recovery
  instructions — one command set for Windows, macOS, and Linux.
- `docs/phase0-research.md`, the verified platform reference for Claude Code 2.1.274,
  with an evidence tier on every claim.
- MIT license.

### Notes

- Distribution is the native plugin system only. No install scripts, no dotfile
  copying, no absolute paths, no symlinks.
- Manifests were validated on Linux. Behaviour on Windows and macOS is expected to be
  identical because the package contains nothing platform-specific, but has not been
  verified on those platforms.
