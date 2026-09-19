# Function-hooks spikes

**Status: disposable. Nothing here ships, nothing here is in the marketplace, and the
stable plugins (`clear-partner`, `clear-ui`) do not know this directory exists.**

Six tiny plugins, each answering one question about Claude Code's early-access
function-hooks ("Mods") runtime. Spikes A–E ran against Claude Code **2.1.277** on 2026-09-19
([docs/research/mods-research-2.1.277.md](../../../docs/research/mods-research-2.1.277.md)); F and
G against **2.1.278** on 2026-09-20
([docs/research/mods-research-2.1.278.md](../../../docs/research/mods-research-2.1.278.md)). Native
Windows 11 throughout. What was built from them,
[experimental/clear-transcript](../../clear-transcript/README.md), is not a spike.

## Rules these spikes follow

- The feature gate is set **per command only** (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude …`).
  It is never exported, never written to a settings file.
- Plugins are loaded with `--plugin-dir` for one process. They are never installed.
- Hooks observe and return `next(e)` unchanged. The exceptions are in `ui-render` and in the
  drawing modes of `assistant-message`, are purely visual, and say `[spike]` on screen.
- `tool-observer` and `tool-surface` hook `tool.call` as observers. Do not copy that into
  anything that ships: on 2.1.272–2.1.278 any `tool.call` hook on Bash, even a pass-through,
  makes sub-agents with worktree isolation refuse their Bash calls (claude-code#92533).
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

### 2.1.278 — the transcript

Both need an interactive terminal; they were driven with VHS, one real session per question, in
the fullscreen layout and again with `CLAUDE_CODE_NO_FLICKER=0` (the main screen). Records hold
key names, flags, lengths and timings, never message text.
`assistant-message` takes `CLEAR_SPIKE_MODE`: `observe` (default), `rewrite`, `wrap`, `split`,
`multi`, `final`. A validator rule met while writing it: **a function that is handed `$` must
have a name no other function in the file has**, nested ones included.

| Spike | Question | Answer (2.1.278) |
| --- | --- | --- |
| F `assistant-message` | Can an answer be redrawn without re-implementing Markdown or losing the original? | **Yes.** Props are `text` (one raw Markdown string per text block), `isFirstOfReply` (true on every block that draws a bullet, not only the first of a turn), `onScreen`. The **first raise already carries the whole text**; a control session with no plugin and no gate shows the same spinner-only wait, so the hook costs no live preview here. Raised 2–16 times per message in fullscreen (each `onScreen` change), once on the main screen. `rewrite` keeps the engine's bullet and gutter; a returned tree (`wrap`, `split`) replaces them and must bring its own blank row and two-cell gutter. A tree of `Text` + `Markdown` + `Code` leaves drew tables, lists and highlighted code as stock does, and at 70 columns inherited stock's stacked-table fallback. `multi`: `next()` may be called per part and the engine nodes stack, but later nodes lose the gutter. `final`: `turn.complete` + `$.ui.invalidate('ui.render')` redrew the turn's last block, in both layouts. |
| F, ctrl+o | Is the original still reachable? | **Only if the mod stands down.** The ctrl+o view reuses the hook's cached answer (or re-raises the hook when `onScreen` changed): with a tree that ignored it, ctrl+o showed the tree. `UserMessage.isExpanded` flips to `true` there and is raised before the reply under it (1 ms before, in the record); remembering it, invalidating on a flip and returning `next(e)` while it is true gave the engine's drawing in ctrl+o and the tree again after Esc. A registered `/spike-raw` command did the same for the normal view. The stored message is never touched either way. |
| G `tool-surface` | What is raised around tools and sub-agents, and what does stock hide? | One `ToolGroup` held three reads **and two failed shell commands**; settled, stock drew it as `Read 3 files, ran 2 shell commands`, with no sign of either failure (fullscreen; on the main screen each shell command is its own row with an output preview). The group was re-raised 24 times while live. An edit and an `Agent` call are standalone `ToolUse` + `ToolResult`; a sub-agent's inner calls have no render site; a finished background task is a `UserMessage`. In ctrl+o every `UserMessage` and `ToolGroup` carries `isExpanded: true` and each call of a group is raised as its own `ToolUse`. |

## Not tested

Auto-compaction trigger, `tool.call` result rewriting, hook failure/budget behaviour,
hot reload, macOS and Linux, a live terminal resize, `--resume`, a second render mod in the
chain, and any surface other than `terminal`.
