# ADR 0004: One plugin per layer; experimental mods stay outside the marketplace

**Status:** Proposed · **Date:** 2026-09-19

## Context

Clear Claude is growing from one layer (Clear Partner, how Claude communicates) to
three: Clear UI (a statusline) and Clear Mods (function hooks). The layers differ in what
they touch. Clear Partner writes nothing outside its plugin. A statusline cannot be
registered by a plugin at all — Claude Code honours only `agent` and `subagentStatusLine`
in a plugin's `settings.json` — so Clear UI must edit the user's `settings.json`.
Function hooks are undocumented, off by default behind
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`, and can intercept tool calls and rewrite what is
drawn (verified on 2.1.277, see `docs/mods-research-2.1.277.md`).

## Decision

1. Each layer is its own plugin. `clear-claude` stays exactly as it is and depends on
   nothing. `clear-ui` is a second, optional entry in the same marketplace.
2. Mods are **not** listed in the marketplace while function hooks are undocumented. They
   live under `experimental/` and load only with `--plugin-dir`. They move to
   `plugins/clear-mods` when the API is documented and enabled by default.
3. Layers share data only through one small state file in the plugin data directory —
   one producer per fact, one renderer. Never through shared code or shared prompts.
4. Nothing in this repository sets the function-hooks gate globally or tells a user to.

## Consequences

- **Good:** installing Clear Partner can never silently edit settings or load runtime
  hooks. Each layer can be disabled alone. A breaking change in the early-access API
  cannot reach a stable user.
- **Good:** no marketplace plugin can "install, enable and do nothing" because it needs a
  hidden gate — the failure mode `clear-doctor` exists to catch.
- **Bad:** two install commands instead of one for the full experience, plus a setup step
  for Clear UI.
- **Bad:** trying a mod requires cloning the repository. Accepted while the API is early
  access.
