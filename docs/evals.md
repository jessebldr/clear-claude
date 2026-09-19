# Behavioral evals — Clear Partner output style

Two recorded runs. The latest is first; the original is kept below it unchanged.

## Re-run on Claude Code 2.1.278 — 2026-09-19

**Runner:** `claude plugin eval`, the command under "Reproduce", unchanged · **Plugin:**
`clear-claude` 0.1.0, the same prompt as the first run (no edit since) · **Cost:** $1.54 ·
**Time:** 342 s · **Judge:** default, three votes per judged grader · **Platform:** Windows 11

| Case | With plugin | Baseline | Δ |
| --- | --- | --- | --- |
| a-correctness-preserved | pass (1.0) | pass (1.0) | 0 |
| b-concise-by-default | pass (1.0) | pass (1.0) | 0 |
| c-depth-when-asked | pass (1.0) | pass (1.0) | 0 |
| d-no-style-leak | pass (1.0) | pass (1.0) | 0 |
| e-workflow-multi-step | pass (1.0) | pass (1.0) | 0 |
| f-ambiguous-request | pass (1.0) | **fail (0.0)** | +1.0 |

**6/6 pass with the plugin, as on 2.1.274. No regression from four Claude Code releases.**

How to read the one non-zero delta: it is not evidence that the plugin is better. The baseline
arm of case F did not answer badly — it ran out of turns (`Reached maximum number of turns
(3)`), having started to work on the ambiguous request instead of asking about it or stating
an assumption, so there was no final message to grade. The plugin arm asked. One run per arm
cannot tell a tendency from chance, so this is recorded as "baseline errored once", and the
claim stays what it was: the style does not break anything.

Two notes from the log, neither affecting a score: case E's `allowed_tools` names `Edit`, which
the run-level grant does not include (`--allow-tools Write`), and the CLI says so before
launching; both arms passed with `Write` alone. In the baseline arm of case E one judge vote
of three was a FAIL on "proceeds and reports concisely"; the grader passes on majority.

`/clear-claude:clear-audit` was also run for real against the shipped plugin on 2.1.278; its
result is recorded in [clear-partner-port.md](clear-partner-port.md#audit-runs).

## First run on Claude Code 2.1.274 — 2026-09-17

**Runner:** `claude plugin eval`
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
