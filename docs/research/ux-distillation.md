# UX distillation — how other agent UIs present work

**Date:** 2026-09-19. Gate for Phase D and Phase G in [roadmap-v2.md](../roadmap-v2.md).
Mechanisms and platform facts: [mods-research-2.1.277.md](mods-research-2.1.277.md).
Source was read from shallow clones; **nothing was installed, executed or screenshotted**.
This page is about presentation only. Features were ignored.

## Studied

| Tag | Repo @ commit (date) | Root used for paths below | Weight |
| --- | --- | --- | --- |
| CX | `openai/codex` @ `78245b47af` (09-19) | `codex-rs/tui/src/` | high |
| OMP | `can1357/oh-my-pi` @ `78b753124d` (09-18) | `packages/tui/src/` | high |
| OC | `sst/opencode` @ `4e1c49630a` (09-19) | `packages/tui/src/routes/session/` | high |
| T3 | `pingdotgg/t3code` @ `803f94e787` (09-18) | `apps/web/src/components/chat/` | fold logic only |
| HUD | `jarrodwatts/claude-hud` @ `939eb66485` (08-28) | `src/` | agent line only |
| PDS | `sting8k/pi-droid-styling` @ `746c4c2f03` (09-16) | repo root | tool rows only |

Skipped: **anything-to-html** — no repository found under that name (`gh search repos`);
not pursued. **T3 Code** is a web/desktop/mobile GUI; only its pure fold-rule module was
read. `badlogic/pi-mono` was not needed because Oh My Pi exists.

## Patterns worth keeping

| # | Pattern | Evidence | Mechanism |
| --- | --- | --- | --- |
| 1 | Persistent chrome carries a **count only**; names and detail live in the transcript or a list command. OMP removed a richer hint: *"The status line now intentionally shows only the active count"* and left the old setter as a no-op. CX holds every background command string but prints only `N background terminal(s) running` plus where to look. | OMP `status-line/component.ts:730-734`, `status-line/segments.ts:513-521`; CX `bottom_pane/unified_exec_footer.rs:17-19,45-55` | statusline line |
| 2 | The segment, and its row, **do not exist at zero**. No `0 agents`. | OMP `segments.ts:516-518`; CX `unified_exec_footer.rs:46-48,92-93` | statusline line |
| 3 | **No double surfacing, no extra row**: CX appends the background summary to the live status row when one exists and draws a separate dim row only when idle. | CX `bottom_pane/mod.rs:1575-1584,2039-2046` | statusline line; `$.ui.status` |
| 4 | **Agents and background jobs are counted separately and de-duplicated**: a background job that is an agent stops counting as a job once it appears as an agent. | OMP `status-line/component.ts:2554-2570` | statusline line |
| 5 | Fixed positions: the important part (elapsed, interrupt) stays put; optional context is appended after it and truncated first. Source comment warns that verbose text there "can … hide the more important" part. | CX `status_indicator_widget.rs:142-147,246-262` | statusline line |
| 6 | Coarse elapsed time in chrome: seconds, then whole minutes, then hours — the number changes rarely. | OMP `status-line/segments.ts:190-195`; CX `status_indicator_widget.rs:75-86` | statusline line |
| 7 | **Failure is the only state given colour**; done, running and pending are dim. In a folded summary the failed and aborted counts are error-coloured and named in words. | OMP `tools/task.ts:1204-1229`; CX `multi_agents.rs:633-660` | statusline line; `ui.render` component |
| 8 | Agent row fields, in order: status icon, name, description *only if it fits the width*, role badge, then a dim stat run (tool count, context %, cost) and duration. Running rows show a spinner; stats only for running or completed. | OMP `tools/agent-tree.ts:26-42,73-77,112-126`; HUD `render/agents-line.ts:120-135` | `subagentStatusLine` row |
| 9 | Parallel agents are a **flat list capped at 4 rows**; the rest fold to `N more agents (x done · y running · z failed)` with an expand hint. Failed rows claim visible slots first. Finished rows sort by runtime, unfinished stay at the bottom, so rows never reshuffle on completion. | OMP `tools/task.ts:487-491,1180-1193,1231-1249` | `ui.render` component; `subagentStatusLine` row (ordering cannot be changed, only content) |
| 10 | Running agent in the transcript takes **two rows**: title, then the child's current tool. Finished: the same title with a check mark, then `N toolcalls · duration`. Token count appears only after navigating into the child. | OC `index.tsx:2262-2286,2293,2313-2328`; `subagent-footer.tsx:78-94` | `ui.render` component |
| 11 | **Tense is the state signal**: `Exploring` becomes `Explored`, `Running` becomes `Ran`; the bullet turns green or red. No separate status word. | CX `exec_cell/render.rs:242-246,371-385` | `ui.render` component (ToolUse, Spinner) |
| 12 | Merge only **adjacent, read-only, successful** calls into one line (`Read a, b, c`, names de-duplicated). A non-zero exit ends the group and prints `(exit N)` in red; a search exiting 1 is dimmed, not red. | CX `exec_cell/render.rs:259-292,323-344` | `ui.render` component (ToolGroup) |
| 13 | Finished output is a **fixed small preview** and the omission is stated with the way out: `… +N lines (ctrl + t to view transcript)`. Budgets seen: 3 screen rows (CX), last 5 lines (PDS), 10 lines (OC). Wrap first, then truncate, so long lines cannot flood the view. | CX `tool_output.rs:1-2,15`, `exec_cell/render.rs:225-227,476-478`; PDS `tool-tags/bash.ts:12,203-206`; OC `index.tsx:2053-2059` | `ui.render` component (ToolResult) |
| 14 | A global "hide tool details" toggle hides a tool row **only when its status is completed**; pending, running and errored rows always render. | OC `index.tsx:263,1713-1718` | `ui.render` component |
| 15 | A settled turn folds behind one `Worked for …` row. Never folded: a turn still streaming, error rows, sub-agent batches, user question/answer rows. A fold that would hide nothing is not drawn. | T3 `MessagesTimeline.logic.ts:318-327,622-626,700-702,737-761` | `ui.render` component |
| 16 | Denied is not failed: a permission refusal is struck through and muted, a real failure is error-coloured. | OC `index.tsx:1864-1881` | `ui.render` component |
| 17 | Row budget decides density: 3+ rows full renderer, 2 rows folded card, 1 row label line, 0 rows hidden. | OMP `docs/tui-runtime-internals.md:57-66` | `ui.render` component (event carries `viewport`), partly |
| 18 | Per-tool metrics on the finished row are just `elapsed · output size`. | PDS `tool-tags/elapsed.ts:27-40` | `ui.render` component |
| 19 | Background completion is announced once in the transcript, one row per job with type, id and duration — not in chrome. | OMP `chat/transcript-render-helpers.ts:26-70`; CX `history_cell/exec.rs:30` | not needed: stock Claude Code already reports this |

Noted and dropped — **not expressible in a terminal under our constraints**: OC click to expand
an error and click to enter a child session (mouse; `index.tsx:1900-1906`); OC sidebar; CX
`ctrl+t` transcript pager and `/subagents` picker (own harness); OMP per-frame row
re-allocation (owns the render loop); T3 minimap, agents panel, tasks popover (GUI).

## Implications for Phase D (activity line)

1. **A count is right; keep it.** Patterns 1 and 3. The agent panel already lists names,
   and the Phase D handler leaves those rows untouched, so names on line 3 would solve the
   same problem in two layers. Agent names and descriptions are also untrusted text.
2. **The bare count lacks one thing: failure.** Pattern 7. Add `N failed!` when the
   `tasks[].status` feed reports it, using the existing `!` plus colour convention. It is the
   only coloured item on the line and the last one dropped.
3. **One coarse elapsed value is justified, not one per agent**: the age of the
   longest-running agent from `startTime`, in whole minutes, hidden under 1 minute
   (pattern 6). It answers "is something stuck" and changes once a minute.
4. **No elapsed and no names for background tasks.** `background_tasks[]` is a snapshot
   taken at `Stop`, and no event fires when a shell ends. A count is the most that can be
   claimed honestly; count only entries whose `status` is running and replace the snapshot
   at every `Stop` and at session start.
5. **De-duplicate** (pattern 4): an entry present in both feeds counts as an agent.
6. Zero segments vanish; at zero total the row is not printed (pattern 2). Order is fixed:
   agents, then background. Singular and plural are spelled correctly.
7. Layouts, glyphs from the measured set only:

```text
wide    2 agents · 6m  │  1 background
wide    3 agents · 1 failed! · 6m  │  1 background
medium  2 agents  │  1 background          (elapsed dropped first)
narrow  2 agents  │  1 bg                  (failed! is never dropped)
```

8. **Must not be shown:** the running tool or any per-agent activity (the spinner and the
   panel own it); agent names, descriptions, models; token counts; background command
   strings; finished or "done" counts and any retention of completed agents (HUD keeps
   them 60 s, `render/agents-line.ts:6-8`, and ships that line off by default,
   `config.ts:340-346`); any spinner or animated glyph; any command hint such as CX's
   `/ps to view` — static text that costs width on every render.

## Implications for Phase G (transcript renderer)

1. Collapse only rows that are **finished, successful and not expanded**. Return `next(e)`
   for anything running, pending, errored, denied or expanded (patterns 14, 15, 16).
2. **Error rows are never collapsed and never merged**; a failure also ends the group it
   sits in (patterns 12, 15). Keep the exit code or error text on the row.
3. Merge only adjacent read-only calls of the same kind; de-duplicate targets (pattern 12).
4. The collapsed line is past-tense verb, target or count, then duration:
   `Read 4 files · 2s`, `Ran npm test · 38s` (patterns 10, 11, 18).
5. When output is cut, say how much and how to see it (pattern 13). Raw output must stay
   reachable; this is already a test requirement in ui-architecture.md.
6. Sub-agent rows and user question/answer rows stay visible after the turn settles
   (pattern 15). An agent row collapses to its own line, never into a generic group.
7. Do not draw a fold that hides nothing. Do not reorder rows on completion (9, 15).
8. Spinner wording: present tense while running, nothing added (pattern 11).

## Separate evidence from inference

**Observed in source** (file and line given above): every row of the patterns table; the
HUD retention and default-off facts; OMP's written statement that the count-only badge is
intentional. No project states *why* in prose except CX (status row comment, pattern 5)
and OMP (patterns 1, 9, 17); all other rationale below is ours.

**Inference:** that names on line 3 duplicate the agent panel (Phase D item 1); that one
longest-running elapsed value is the right reduction of per-agent durations (item 3);
the drop order and the `bg` abbreviation (item 7); omitting a command hint (item 8);
that failed agents should show only while the line is otherwise visible — no product
studied has this exact constraint; the Phase G one-line wording (item 4).

**Not verified:** the value set of `tasks[].status` — whether a failed or errored state
ever reaches the `subagentStatusLine` feed, which item 2 depends on; whether ids in
`tasks[]` and `background_tasks[]` match for the same background agent (item 5); whether
`background_tasks[]` carries a start time; how these UIs look when run — spacing, colour
and motion were read from code, not seen. The CX and T3 clones needed `core.longpaths`
on Windows to check out; files read were complete.
