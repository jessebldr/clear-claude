# ADR 0002: Evals prove no-regression, not superiority

**Status:** Accepted · **Date:** 2026-09-17

## Context

Behavioural evals for a communication style are easy to oversell. A suite that runs
only with the style enabled can "prove" anything, because there is no baseline. And
a single run per case is smoke-test evidence, not a benchmark — variance across
runs is real and unmeasured here.

The temptation is to claim "Clear Partner makes Claude better." The evals we ran
cannot support that claim: they were designed to check that the style's promises
(concise by default, deep when asked, no prompt leakage) hold without degrading
correctness.

## Decision

Every eval case runs twice — plugin ON and plugin OFF — and we report both scores
plus the delta. The documented claim is exactly what the data supports: **the style
does not make Claude dumber** (6/6 both ways, delta zero, $1.84 total). What the
suite does *not* prove (superiority over default, statistical significance) is
stated in `docs/evals.md`, not buried.

## Consequences

- **Good:** honest differentiation. Most prompt repos ship vibes; we ship receipts
  with their limits printed on them.
- **Bad:** the headline is less exciting than "10x better Claude."
- **Mitigation:** none needed — the honesty *is* the positioning.
