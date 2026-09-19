# Headless `/usage` — Claude Code 2.1.278

**Target:** Claude Code **2.1.278** (native install, subscription auth). **Platform:** Windows 11,
Node 24.18. **Date:** 2026-09-19. One machine, one account, one afternoon: this is a record of
what was observed, not a specification.

**Question.** The usage screen shows a third window, a weekly limit scoped to one model. The
status-line payload does not carry it ([mods-research-2.1.277.md](mods-research-2.1.277.md),
[ui-architecture.md](../ui-architecture.md)). Does any Anthropic-shipped surface expose it as
data, without Clear UI reading a credential or calling an API itself?

**Answer.** Yes: `claude -p "/usage" --output-format stream-json`. It is **not documented**. A
documentation search found `--safe-mode` (whats-new 2026-w24) and nothing on `usage_report`,
`rate_limit_event`, or running `/usage` headlessly; the search was done by an agent and its
sources were not re-read. Treat the shape below as unversioned.

## Evidence tiers

| Tag | Meaning |
| --- | --- |
| `[RUNTIME]` | Observed in a real run on this machine. |
| `[DEBUG]` | A line in Claude Code's own `--debug-file` log. |
| `[CLI]` | `claude --help`. |

## The run

```text
claude -p /usage --safe-mode --output-format stream-json --verbose --no-session-persistence
```

Three events: `system:init`, one `assistant` whose `message.model` is `"<synthetic>"`, one
`result` with `local_command: "usage"`. `[RUNTIME]`

The data is `usage_report` on the **assistant** event only. `--output-format json` returns the
single result event, which carries the rendered text and no `usage_report`. `[RUNTIME]`

```json
"usage_report": {
  "session": { "total_cost_usd": 0, "total_api_duration_ms": 0, "model_usage": {} },
  "rate_limits": {
    "limits": [
      { "kind": "session", "group": "session", "percent": 25,
        "resets_at": "2026-09-19T16:20:00.092825+00:00",
        "scope": null, "severity": "normal", "is_active": false },
      { "kind": "weekly_all", "group": "weekly", "percent": 68,
        "resets_at": "2026-09-19T20:00:00.092843+00:00",
        "scope": null, "severity": "normal", "is_active": true },
      { "kind": "weekly_scoped", "group": "weekly", "percent": 64,
        "resets_at": "2026-09-19T19:59:59.092985+00:00",
        "scope": { "model": { "display_name": "Fable" }, "surface": null },
        "severity": "normal", "is_active": false }
    ],
    "extra_usage": { "is_enabled": false, "monthly_limit": null, "used_credits": null,
                     "utilization": null, "currency": null }
  }
}
```

- The scoped row names its model by `display_name` only; there is no model ID. The list was the
  same with `--model opus` and `--model haiku`: it follows the account, not the session. `[RUNTIME]`
- `percent` is an integer; `resets_at` is ISO-8601 UTC with microseconds. The scoped window
  resets one second before the all-models one. `[RUNTIME]`
- Not understood: what `is_active` and `severity` mean. Only `"normal"` was seen.

## No model turn

Every run of the command: `num_turns: 0`, `total_cost_usd: 0`, `duration_api_ms: 0`, every
token count `0`, `modelUsage: {}`. `[RUNTIME]`

`duration_api_ms` alone proves nothing: a run that did make a turn and was stopped by the budget
also reported `0`. `[RUNTIME]`

**The accident that a shell causes.** The first attempt was typed into Git Bash, which rewrites an
argument with a leading slash into a path under its install directory. Claude Code received
`C:/Program Files/Git/usage`, which is not a command but a prompt; the session's model answered
it: 501 output tokens, **$0.136**. `[RUNTIME]` `MSYS_NO_PATHCONV=1` prevents it; starting `claude`
with an argument vector and no shell makes it impossible.

**The budget flag.** A real prompt under `--max-budget-usd 0.0001 --model haiku --tools ""`: one
turn, then `result.subtype: "error_max_budget_usd"`, `is_error: true`, exit code 1, **$0.004**.
The flag stops the second turn, not the first; the cheap model and the empty tool list are what
bound the first. `/usage` itself runs normally under all three. `[RUNTIME]`

## `--safe-mode`

`[CLI]`: "all customizations (CLAUDE.md, skills, plugins, hooks, MCP servers, …) disabled".
Observed against a control run without the flag, both with `--include-hook-events`: `[RUNTIME]`

| | `--safe-mode` | without |
| --- | --- | --- |
| hook events in the stream | 0 | 3 `SessionStart` |
| `mcp_servers` | 0 | 54 |
| `skills` | 18 (built in) | 239 |
| plugin-namespaced commands | 0 | 257 |

`[DEBUG]`: `Skipping plugin hooks - safe mode disables plugins`, `0 plugin skills`,
`[claudeai-mcp] Disabled in safe mode`. Plugins are still *enumerated* — `init.plugins` lists
nine and `init.output_style` still names the configured style — but nothing of theirs runs. Print
mode has no status line at all.

## Latency and Claude Code's own cache

Five runs, wall clock: 1853, 1877, 1852, 1825, 1850 ms (median **1852**). The command's own
`duration_ms` is ~480; the rest is process start. `[RUNTIME]`

Claude Code caches the answer itself. `[DEBUG]`: `Usage read answered from a snapshot 31s old;
endpoint not asked`. The snapshot is shared between processes. The endpoint was asked again at a
snapshot age of 61 s and not at 35 s, so the lifetime is **about 60 s — inferred from three
observations**. A real fetch took 330 ms and did not change the wall time.

## Without a network

Simulated by pointing `HTTPS_PROXY` at a dead local port, not by removing the network. `[RUNTIME]`

| Snapshot | exit | `is_error` | `limits` | rendered text |
| --- | --- | --- | --- | --- |
| fresh (1 s) | 0 | false | full | current |
| stale (61 s) | 0 | false | **`null`** | **the old percentages, with no mark on them** |

`limits === null` is the only failure signal. The text cannot be told from an answer, which is
why nothing reads it.

`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` was tried as a way to drop the run's background
fetches (bootstrap, MCP registry, telemetry). It does drop them — and with a stale snapshot the
process exits in ~940 ms, before its own usage request returns: `limits: null`, **2 runs of 2**,
against a full answer from the same arguments without the variable seconds later. Not used.

## How fast the number moves

Seven samples over 24 minutes of one busy session (this one), UTC: `[RUNTIME]`

| Time | session | weekly, all models | weekly, scoped |
| --- | --- | --- | --- |
| 15:28:25 | 25 | 68 | 64 |
| 15:29:37 | 25 | 68 | 64 |
| 15:31:00 | 25 | 68 | 64 |
| 15:38:08 | 26 | 68 | 64 |
| 15:46:19 | 27 | 68 | 65 |
| 15:52:12 | 28 | 68 | 65 |

(The seventh, 15:45, read the same as 15:46.) The weekly rows are whole percents of a week: the
scoped row moved one point, the all-models row none. So the provider refreshes every **10
minutes** — a point behind at worst at this rate, two or three with several sessions burning at
once — rather than the five it started with, which bought nothing for twice the Claude Code
starts. The last good answer is drawn for **30 minutes**: three missed refreshes, and half of the
60 minutes Claude Code's own usage screen is reported to fall back on. One session on one account
is a thin basis; the interval is a constant in `src/usage.mjs`.

## What a run leaves behind

`~/.claude.json` is rewritten (twice per run). An empty project directory is created under
`~/.claude/projects/` for the working directory. No transcript, with `--no-session-persistence`.
Background requests to bootstrap, the MCP registry, Grove and telemetry. `[DEBUG]`

## What Clear UI does with this

An opt-in provider, off by default: [plugins/clear-ui/README.md](../../plugins/clear-ui/README.md),
"Usage provider". The measured live run: one status-line tick returned in 73 ms having started a
detached worker; the cache file appeared 3.8 s later; no window was shown.

Status-line cost, 25 fresh processes each, git cached, this machine:

| | median | p95 |
| --- | --- | --- |
| provider off (the default) | 63.4 ms | 74.6 ms |
| on, cache fresh — reads one file | 67.0 ms | 80.2 ms |
| on, cache stale, attempt recent — no spawn | 66.4 ms | 73.1 ms |
| on, cache stale — claims and starts the worker (once per interval) | 72.2 ms | 81.3 ms |
| provider off, measured again | 65.1 ms | 74.2 ms |

The two "off" rows differ by 1.7 ms, so the read path's cost is within a few milliseconds of
noise; the tick that starts the worker costs about 8 ms more.
