# Function-hooks spikes

**Status: disposable. Nothing here ships, nothing here is in the marketplace, and the
stable `clear-claude` plugin does not know this directory exists.**

Four tiny plugins, each answering one question about Claude Code's early-access
function-hooks ("Mods") runtime. Run against Claude Code **2.1.277**, native Windows 11,
2026-09-19. Full findings: [docs/research/mods-research-2.1.277.md](../../../docs/research/mods-research-2.1.277.md).

## Rules these spikes follow

- The feature gate is set **per command only** (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude …`).
  It is never exported, never written to a settings file.
- Plugins are loaded with `--plugin-dir` for one process. They are never installed.
- Hooks observe and return `next(e)` unchanged. The two exceptions are in `ui-render`,
  are purely visual, and are labelled `[spike]` on screen.
- Output goes to `$CLEAR_SPIKE_OUT` (or `./.spike-out`), outside the repository. Records
  hold event names, key names, counts and timings — not prompt text or tool output.
  `tool-observer` does record the command string; it was only ever run on the three
  harmless commands below. Production code must not persist commands.
- `state-compact` writes one key to `$.store`, which lands in
  `<config home>/plugins/store/spike-state-compact_inline-<hash>.json`. Delete it after a run.

## How to run

```text
# validate (reads the module source, reports hooks and $ calls, loads nothing)
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin validate hello-runtime

# headless, from a scratch directory
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude -p "Reply with exactly: ok" \
  --model haiku --plugin-dir <abs path>/hello-runtime
```

`ui-render` and `state-compact` need an interactive terminal (`ui.render` is raised by
the TUI; `/compact` is a TUI command). PowerShell equivalent of the env prefix:
`$env:CLAUDE_CODE_ENABLE_FUNCTION_HOOKS='1'; claude …; Remove-Item Env:CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`.

## Results

| Spike | Question | Answer (2.1.277) |
| --- | --- | --- |
| A `hello-runtime` | Does a hooks module load and receive an event? | **Yes.** Gate off: module never runs (control). Gate on, headless: `session.start → prompt.submit → turn.start → session.measure → turn.complete → session.end`. `session.measure` carried `context {tokens, window, percent}` and `rateLimits [{kind: five_hour\|seven_day, percentUsed, resetsAt}]`. |
| B `tool-observer` | Can we see tool, input, result, error status, timing — without altering anything? | **Yes.** Bash ok → `isError` absent, `text: "42"`. `process.exit(3)` → `isError: true`, `text: "Exit code 3"`. Write and Agent calls seen with wall time. A subagent's Bash call arrives with `agentId` set. **There is no numeric exit-code field** — only `isError` plus the `Exit code N` first line of `text`. |
| C `ui-render` | Which components render, and does a rewrite / replacement draw? | **Yes.** Terminal raised `AbovePrompt, SessionMode, PromptHint, UserMessage, Spinner, ToolGroup, AssistantMessage, TurnDuration`. A lone Bash call is a `ToolGroup` (`calls[]` of `{tool_use_id, tool, input, isRunning, isErrored, isInterrupted, output}`); `ToolUse` never fired on its own. Spinner `message` rewrite drew. Replacing a finished, non-expanded `ToolGroup` with a one-line tree drew, and **ctrl+o still showed the engine's full row** (`● Bash (…) ⎿ 12345`). No "does not validate" / "hook was skipped" lines. |
| D `state-compact` | Does state survive? | Module-level state persisted across two turns in one process (1 → 2). `$.store` persisted to disk under the config home. `$.ui.status` pinned a line under the prompt, prefixed with the plugin name. |
| E `state-compact` | Is there a usable compaction event? | **Yes.** `/compact` raised `session.compact` with `trigger: "manual"`, 9 messages in (`{role, text, toolUses, handle}`), result `{messages (3), tokensBefore, tokensAfter}`. Pass-through left compaction working. Rewriting `instructions`/`messages` is typed as allowed; **not exercised**. |

## Not tested

Auto-compaction trigger, `tool.call` result rewriting, hook failure/budget behaviour,
hot reload, macOS and Linux, and any surface other than `terminal`.
