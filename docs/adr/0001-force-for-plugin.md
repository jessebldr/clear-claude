# ADR 0001: Auto-activate Clear Partner via `force-for-plugin`

**Status:** Accepted · **Date:** 2026-09-17

## Context

Claude Code 2.1.274 offers exactly four documented output-style frontmatter fields.
Only one of them affects activation: `force-for-plugin: true`. There is no
per-session default, no priority ordering, and no other native mechanism that makes
a plugin's style apply without the user picking it by hand every session.

The alternative — shipping the style inert and documenting "go pick Clear Partner
in `/config`" — was verified to work, but it makes install a two-step process where
the second step is silently skippable, and nothing tells the user the plugin is doing
nothing.

## Decision

Set `force-for-plugin: true` on `clear-partner.md`. Installing and enabling the
plugin is the entire setup, on every machine.

## Consequences

- **Good:** zero-config install; the plugin cannot be installed-but-inert.
- **Bad:** while the plugin is enabled, the user cannot conveniently select a
  different output style. This is a platform limitation, not our invention.
- **Mitigation:** `claude plugin disable clear-partner` (the plugin was named `clear-claude` when this was
  written; see [ADR 0005](0005-naming-and-install-paths.md)) reversibly restores the
  default style in one command, and the plugin never touches `settings.json`, so
  disable/uninstall leaves no residue. The tradeoff is stated up front in the
  README and in `docs/architecture.md`.
