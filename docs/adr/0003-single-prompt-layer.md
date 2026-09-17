# ADR 0003: Communication style lives in exactly one layer

**Status:** Accepted · **Date:** 2026-09-17

## Context

Claude Code has distinct configuration layers with distinct jobs: output styles
govern *how Claude communicates*, CLAUDE.md carries *project knowledge*, skills
package *reusable workflows*, hooks provide *deterministic event automation*. A
common anti-pattern is pasting communication rules into CLAUDE.md (or every repo's
CLAUDE.md), duplicating them across layers "for reinforcement."

Duplicated instructions do not reinforce each other. They consume context on every
request, drift apart as one copy is edited and the others aren't, and produce
contradictions the model must resolve at runtime — the opposite of clarity.

## Decision

Clear Partner's rules exist in exactly one place: the output style prompt. The
plugin ships no CLAUDE.md, no hooks, no MCP servers, and no second copy of the
rules anywhere. Diagnostics (`clear-doctor`, `clear-audit`) are skills because
diagnosis is a reusable workflow; they contain zero communication-style
instruction.

## Consequences

- **Good:** one source of truth; the prompt body is byte-identical to the tested
  original, verifiable by hash (`docs/clear-partner-port.md`).
- **Bad:** users who want the style's rules inside a specific project's CLAUDE.md
  must copy them by hand.
- **Mitigation:** accepted — layering discipline is the point of the plugin.
