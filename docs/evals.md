# Behavioral evals — Clear Partner output style

**Date:** 2026-09-17 · **Claude Code:** 2.1.274 · **Runner:** `claude plugin eval`
**Total cost:** $1.84 (full suite $1.60 + case E re-run $0.24) · **Judge model:** haiku (default)

## What this suite checks

The product promise is "easier to understand **without making it less capable**".
These evals test the second half of that sentence: the style must not degrade
correctness, leak internals, or change task-completion behavior. Each case runs
twice per invocation — once with the plugin, once as a no-plugin baseline
(`--ablation with-without`, the CLI default for path-resolved plugins) — and
the delta is reported.

## Results

| Case | Intent | With plugin | Baseline | Δ |
| --- | --- | --- | --- | --- |
| a-correctness-preserved | fix a bug correctly and completely | pass (1.0) | pass (1.0) | 0 |
| b-concise-by-default | simple question → short, answer-first | pass (1.0) | pass (1.0) | 0 |
| c-depth-when-asked | explicit "explain in depth" → thorough | pass (1.0) | pass (1.0) | 0 |
| d-no-style-leak | asked about the style → no prompt dump | pass (1.0) | pass (1.0) | 0 |
| e-workflow-multi-step | multi-step task, 2 deliverables, no needless questions | pass (1.0) | pass (1.0) | 0 |
| f-ambiguous-request | ambiguous ask → clarifies or states assumption | pass (1.0) | pass (1.0) | 0 |

**6/6 pass with the plugin. 6/6 pass without it. No regressions detected.**

## Honest limitations

- **Δ = 0 everywhere is a conformance result, not a superiority proof.** These
  cases verify the style doesn't break anything; they do not prove the plugin
  is *more* concise than baseline in general. The baseline happened to be
  concise on the chosen prompts too. Treat B as "style conforms to its own
  spec", not as "beats default Claude".
- **Single run per case** (`--runs 1`). Enough for a smoke signal, not for
  statistical claims. Re-run with `--runs 3` before quoting numbers publicly
  beyond "6/6 pass".
- **Case E needed a re-run.** The first attempt failed in both arms because the
  run-level tool grant was missing (`Write` was in the case's `allowed_tools`
  but not in the CLI's `--allow-tools`). The CLI warns about this before
  launching; after adding `--allow-tools Write`, both arms passed.
- Raw reports stay local (`evals/results/` is gitignored). This file carries
  the numbers.

## Reproduce

```bash
cd plugins/clear-claude
claude plugin eval --eval-dir ./evals --runs 1 --no-publish --trust-plugin \
  --allow-tools Write --max-cost-usd 5
```

Note: `--max-cost-usd` is checked before a run launches, not during — budget
for roughly $0.25–$0.50 per case-arm pair at current pricing.
