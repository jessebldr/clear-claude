# Platform research — Claude Mods and the transcript, Claude Code 2.1.278

**Target:** Claude Code **2.1.278** (native install, released 2026-09-19; nothing newer existed on
2026-09-20). **Platform:** Windows 11, Node 24.18, Git Bash. **Date:** 2026-09-20.
Successor to [mods-research-2.1.277.md](mods-research-2.1.277.md) for everything about function
hooks; that page stays as the record of 2.1.277 and still owns the statusline and classic-hooks
sections. What other products do with a transcript is in [transcript-ux.md](transcript-ux.md).
What was built from this is in [../clear-transcript.md](../clear-transcript.md).

The question this page answers: **how much of the conversation inside stock Claude Code can a
plugin redraw today, and how safely?**

## Evidence tiers

As before, plus two: `[DOCS]` official documentation · `[REPO]` `anthropics/claude-code`
(`mods/`, CHANGELOG, issue #91870) · `[TYPES]` `claude-code.d.ts` written by this build's own
`/plugin-types` · `[CLI]` command output on this machine · `[KIT]` **new:** `claude plugin test`,
which runs a plugin against the engine's own host and the terminal surface's real validator, with
no core beneath it · `[RUNTIME]` **recorded:** a real interactive session, driven by VHS, with a
disposable spike plugin writing key names, flags, lengths and timings to a file — never message
text · `[BINARY]` strings in the shipped binary, weakest, never treated as API · `[COMMUNITY]`
third parties.

## 1. State of Claude Mods on 2026-09-20

| Question | Answer | Tier |
| --- | --- | --- |
| Documented? | **No.** Zero hits for "function hook", "Claude Mods", "hooks module", `plugin-types`, `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`, `claude-code/testing`, `RenderComponent` across `llms.txt`, `llms-full.txt` (9.6 MB) and the docs map. | `[DOCS]` |
| Indirect trace in docs? | Yes, new since the last note: a "built-in `agents-md` plugin", configured under `pluginConfigs["agents-md@builtin"]`, switched off by `disableAllHooks` / `allowManagedHooksOnly`, and needing feature-flag fetching (`/en/memory`, `/en/settings-reference`, `/en/env-vars`). The docs describe a mod without the word. | `[DOCS]` |
| On by default? | **No**, for a plugin a person installs: `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`, else a rollout flag whose default is false. Built-in mods are gated separately, each by its own flag. | `[BINARY]` `[REPO]` |
| In the changelog? | Never, in any release. The API cannot be tracked from release notes; a diff of `/plugin-types` output is the only signal. | `[REPO]` |
| Changed since 2.1.277? | The plugin API part of the generated types is **byte-identical**; only the tables of built-in tool schemas differ, and those vary with the tools a session announces. | `[TYPES]` |
| Changed since 2.1.273? | A great deal, in two days: the published types grew from 10,772 to 12,990 lines; the `Markdown` and `Image` elements, `ToolProgress`, `onScreen`, `UserMessage.isExpanded` and the tree bounds all appeared at 2.1.277. **The element Clear Transcript's answer rendering rests on was four days old when this was written.** | `[REPO]` |
| First-party mods | Four, in `anthropics/claude-code/mods/`: `sec-default`, `diff`, `telemetry`, and since 2026-09-18 `agents-md`, the first to reach general users. 31 test files, 180 tests, all on `claude-code/testing`. The generated types are published there too (`mods/types/claude-code.d.ts`). None is in a marketplace: "the copies that matter are the ones already in your Claude Code". | `[REPO]` |
| Does any first-party mod redraw the transcript? | **No published one.** `diff` hooks `ui.render` only for `PromptHint` (reads the viewport, passes through) and its own `Pane`. `Markdown` is used in none. An unreleased `mermaid` mod in the binary hooks `AssistantMessage` on the terminal, **rewrites `props.text` and calls `next`**, caches on columns + text and makes no `$` call; it is off by default behind its own flag. If it ships, two mods will reshape one reply. | `[REPO]` `[BINARY]` |
| Timeline | Issue #91870 body, 2026-09-09: "We're now committed to shipping function hooks, on the scale of weeks in lieu of days or months." and, in full: "We're still rapidly iterating on the interface, design, etc. but much of the semantics are now set in place, and we don't anticipate as many breaking changes as our first week." No ship date, docs date, default-on date, distribution channel or stability promise exists anywhere. | `[REPO]` |
| Known defects that shape a design | #92533 (open): **any** `tool.call` hook on Bash, even a pass-through, makes sub-agents with worktree isolation refuse their Bash calls. #94313: `Code` infers no language from a Windows path. A hook that throws inside a sub-agent is skipped without a trace (#91870, 2026-09-19). | `[REPO]` `[COMMUNITY]` |
| Demand | #94600 (2026-09-15) asks for configurable visual separation of turns and proposes wrapping `next(e)` for `UserMessage` / `AssistantMessage`. A peer plugin "that offers a quieter transcript presentation" already exists (#91870, 2026-09-16). | `[COMMUNITY]` |

Both roadmap entry conditions for Clear Transcript — "function hooks appear in official docs" or
"the gate defaults on" — are **not met**.

`claude plugin validate <dir>` analyses a hooks module with the gate **unset** `[CLI]`, so CI can
validate a mod without enabling anything. `claude plugin test` exists only with the gate set, is
listed in no `--help`, and forces the gate in the children it starts `[CLI]` `[BINARY]`.

## 2. The highest-risk question

> Can `ui.render` reliably improve how an `AssistantMessage` is drawn without re-implementing
> Claude Code's Markdown renderer and without losing the original reply?

**Yes — GO**, with one thing the mod must do for itself (ctrl+o, below). Spikes:
[`assistant-message`](../../experimental/spikes/function-hooks/assistant-message/hooks/register.js)
and [`tool-surface`](../../experimental/spikes/function-hooks/tool-surface/hooks/register.js),
results in [the spikes README](../../experimental/spikes/function-hooks/README.md).

| Asked | Found | Tier |
| --- | --- | --- |
| Prop shape | `{ text: string, isFirstOfReply: boolean, onScreen?: { first, last, of } \| null }`. Nothing else: no phase, no "final", no streaming flag, no turn or agent id. | `[TYPES]` `[RUNTIME]` |
| Raw Markdown, parsed blocks, or opaque? | **One raw Markdown string per text block.** A reply that speaks, calls a tool and speaks again is two instances, and `isFirstOfReply` was `true` on both: it marks the block that draws the bullet, not the first block of a turn. | `[TYPES]` `[RUNTIME]` |
| Can parts be composed or replaced? | Yes, four ways, all drawn: pass through; rewrite `props.text` and `next` (keeps the engine's bullet and gutter); wrap the engine's drawing in a `Box` with siblings; return a whole tree. `next` may be called several times and the engine nodes stack, but a node drawn for a later part loses the two-cell gutter, so stacking is not usable as is. | `[RUNTIME]` |
| Can the native Markdown and code rendering be reused? | **Yes.** The surface's table has a `Markdown` leaf ("draws as it draws an assistant reply's text: its own renderer, links, tables, fences") and a `Code` leaf (the engine's highlighter, optional gutter, diff mode). A tree of bold `Text` headings + `Markdown` + `Code` drew a bordered table, bold spans, a bullet list and highlighted bash exactly as stock does. Nothing of Markdown has to be re-implemented to restyle the constructs around it. | `[TYPES]` `[RUNTIME]` |
| Streaming | In every recorded run (haiku and a 3,700-character sonnet reply; fullscreen and main screen) the **first** raise already carried the complete text with closed fences. Nothing was drawn before it: a **control session with no plugin and no gate** shows the same spinner-only wait and the same single-frame appearance of the whole answer, so a hook costs no live preview on this build — there is none to lose. The types promise none of this; a splitter must still treat an unclosed fence as "not mine". | `[RUNTIME]` |
| Flicker, duplicates, state loss | None seen in any recording, at 8–10 frames a second, in either layout. The row a tree replaces includes the engine's blank row above and its `●` gutter, so a tree must bring both, or the reply sits flush left under the prompt. | `[RUNTIME]` |
| How often is the hook raised? | Fullscreen: 2 to 16 times per message with identical text — once before `onScreen` exists, then on each change of it (scrolling), then on ctrl+o. Main screen: once, and `onScreen` never appears. Answers are cached per (props, viewport width), so a hook must be pure, cheap and must not assume `onScreen`. | `[TYPES]` `[RUNTIME]` |
| Width and resize | `viewport` is `{ columns, rows, isFullscreen }`; "a change of width re-draws every hooked site once the resize settles". At 70 columns a `Markdown` leaf inside a tree wraps, keeps hanging list indents and switches a wide table to stacked records, exactly as stock. Resizing a live session was not exercised (VHS cannot); separate sessions at 142 and 70 columns were. | `[TYPES]` `[RUNTIME]` |
| **Does the untouched reply stay reachable?** | The **stored** message is never touched: `/copy`, `v` (open in editor) and export read it. **The ctrl+o view is not automatically the original.** It re-uses the hook's cached answer, or raises the hook again when `onScreen` changed; with a tree that ignores it, ctrl+o showed the tree. `AssistantMessage` has no `isExpanded`, but `UserMessage` does, and a prompt is raised before the reply under it: a mod that remembers the last `isExpanded` it saw, calls `$.ui.invalidate('ui.render')` when it flips and returns `next(e)` while it is true gets the engine's own drawing in ctrl+o, in both layouts. Recorded; the flip arrived 1 ms before the reply's re-raise. | `[RUNTIME]` |
| A second way back | `$.command.register` + a `command.run` hook: `/spike-raw` flipped a flag, invalidated, and every reply on screen was redrawn by the engine at once. The engine prefixes a command's answer with the plugin's name. | `[RUNTIME]` |
| Knowing which block ends the turn | Only afterwards: `turn.complete`, then invalidate, redrew the last block with a label, on both layouts. Possible, but it changes a block the person has already started reading. | `[RUNTIME]` |

Limits, measured with the kit rather than read from comments `[KIT]`: a `Markdown`, `Code` or
`Text` string over **10,000** characters, or one holding a control character other than tab and
newline, refuses the tree; so do more than 20,000 nodes (string children count), nesting deeper
than 32, more than 100,000 characters of text, a `Box` prop outside the allowlist (`maxWidth`,
`borderLeft`), and an engine node inside a `Text`. A refusal is never a broken row: "the engine
drew its own". An unknown prop on `Markdown` is dropped silently, so refusal is not a typo
detector. A `next()` argument that changes `onScreen` skips the **whole** hook.

Text colours are "a theme key or a raw color" `[TYPES]`; the keys are not enumerated. Fourteen
read from the binary — `text`, `claude`, `permission`, `suggestion`, `ide`, `professionalBlue`,
`planMode`, `success`, `warning`, `error`, `inactive`, `subtle`, `remember`, `merged` — all
validated and drew `[BINARY]` `[RUNTIME]`. Clear Transcript uses one, `error`.

## 3. The tool and sub-agent surface

One recorded session: three reads, a failing test run, a failing command, an edit, a passing test
run, a backgrounded `Explore` agent, then ctrl+o `[RUNTIME]`.

| Row | How it is raised | What stock draws | Room to improve |
| --- | --- | --- | --- |
| Reads, searches **and shell commands** | One `ToolGroup` with `calls[]` of `{ tool_use_id, tool, input, isRunning, isErrored, isInterrupted, output }`, `isActive`, `isExpanded`. Re-raised on every state change of every call: 24 times for five calls. | Live: present tense, the current file and command under it. Settled: a dim count, `Read 3 files, ran 2 shell commands`. | **Live: none, stock is good.** **Settled: both failed commands were inside that count, with nothing on screen saying so, and no name of any file or command.** This is what Clear Transcript redraws. |
| An edit | Standalone `ToolUse` + `ToolResult`; `output` has `structuredPatch`. | `Update(path)`, `Added 1 line, removed 1 line`, a highlighted diff. | None. Diffs are what people want at full size. |
| A sub-agent | Standalone `ToolUse` + `ToolResult` for `Agent`; `output` has `isAsync`, `status`, `agentId`, `description`. Its inner tool calls have no render site. | `Explore(description)`, `Backgrounded agent (↓ to manage · ctrl+o to expand)`. | None from a render hook. The agent panel and Clear UI's activity row own "what is running". |
| A background task finishing | A `UserMessage` whose `origin` is a task notification. | One dim line. | Left alone. |
| Expanded view | `isExpanded: true` on every `UserMessage` and `ToolGroup`; each call of a group is then raised as its own `ToolUse`. | Every call in full. | A hook must return `next(e)`; `groupPlan` does. |
| Thinking, todos, the diff body, the permission dialog, live agent progress | **No render site.** | — | Cannot be restyled and must not be imitated. |

`ToolUse` did fire on its own here (edit, agent), unlike Spike C's single Bash call on 2.1.277,
which was a `ToolGroup`: a tool is grouped by kind, not by count.

## 4. What this means

1. **`AssistantMessage`: GO.** The text is raw Markdown, the engine's renderer is a leaf, a refused
   tree falls back to stock, and the original is reachable if the mod stands down in the expanded
   view. No parallel Markdown renderer is needed or built.
2. **`ToolGroup`: GO, and it is the better-supported half.** Stock already compresses; what it
   loses in doing so — names and failures — is exactly what a mod can put back.
3. **Hook `ui.render` only.** `tool.call` is observed by nothing in Clear Transcript (#92533);
   `turn.step` and `classic.MessageDisplay` rewrite content, not presentation.
4. **Interaction inside a transcript row is not available from the keyboard** (focus rings exist
   for `Pane` and `AbovePrompt` only; clicks need the fullscreen layout *and* mouse capture, which
   `CLAUDE_CODE_DISABLE_MOUSE=1` removes while `isFullscreen` stays `true`). So nothing may be folded
   behind a control. Every way back is ctrl+o, a slash command, or a `/config` row.
5. **Which layout is "the default" depends on the person** `[DOCS]`: fullscreen for anyone whose
   first use was on or after 2026-05-06, the main screen for `CLAUDE_CODE_NO_FLICKER=0`, tmux
   `-CC`, screen-reader mode, SSH to Windows and everyone older who never accepted the switch. A
   mod reads `viewport.isFullscreen` and assumes neither; Clear Transcript behaves the same in both.
6. **Everything here can change in any release without notice**, and did between 2.1.273 and
   2.1.277. That, not the code, is what keeps Clear Transcript out of the marketplace.

## Not verified

macOS and Linux (every recording is Windows); a live terminal resize; `--resume` of a session whose
rows a mod redrew; two render mods in one chain, including the unreleased `mermaid`; a light theme
and a screen reader, seen only in type comments and other people's reports; a sub-agent's own
transcript view; whether a failing call is always folded into stock's count line or only when the
model batches calls as it did here (one observation).

## Re-verification

`claude --version`; search the docs for "function hooks"; run `/plugin-types` with the gate set and
diff everything above `interface BuiltinToolInputs` against the previous file; then
`claude plugin test experimental/clear-transcript` and the two spikes, in both terminal layouts
(`CLAUDE_CODE_NO_FLICKER=0` selects the main screen).
