# Clear Transcript — design, limits and how to load it

**Status: experimental, implemented, outside the marketplace.** `clear-transcript` 0.1.0 lives in
[`experimental/clear-transcript`](../experimental/clear-transcript/README.md), loads only with
`--plugin-dir`, and depends on Claude Code's function hooks ("Claude Mods"), which on 2026-09-20
are undocumented, off by default and free to change in any release. It is finished work waiting
for Anthropic to stabilise an API, not a preview of unfinished work.

```text
Clear Partner    → how Claude communicates        (prompt; plugins/clear-partner)
Clear UI         → what the user sees at a glance (statusline; plugins/clear-ui)
Clear Transcript → how the conversation is drawn  (function hooks; experimental/clear-transcript)
```

Evidence for every platform statement here: [research/mods-research-2.1.278.md](research/mods-research-2.1.278.md).
Evidence for every design rule: [research/transcript-ux.md](research/transcript-ux.md).
What it looked like in real sessions: [clear-transcript-dogfood.md](clear-transcript-dogfood.md).

## How much of the conversation can be improved today

Measured on Claude Code 2.1.278. "Render site" means the engine raises `ui.render` for the row,
which is the only way a plugin can draw it.

| Part of the conversation | Render site | Clear Transcript | Why |
| --- | --- | --- | --- |
| Assistant answer | `AssistantMessage`, one raw Markdown string per text block | **Section titles are underlined**; everything else is the engine's `Markdown` | Stock draws `#`, `##` and `###` identically, as plain bold. |
| Settled group of reads, searches, shell commands | `ToolGroup` | **Names its targets; a failed call gets its own line** | Stock draws a count, and in the fullscreen layout the count hides failed commands. |
| Live or running group | `ToolGroup`, `isActive` | engine | Stock already shows the present tense, the current file and the command. |
| File edit | `ToolUse` + `ToolResult` | engine | A highlighted diff, which is what people want at full size. |
| Sub-agent row, background notice | `ToolUse` / `UserMessage` | engine | The agent panel and Clear UI's activity row own "what is running". |
| Code, tables, lists, quotes, links inside an answer | inside the `Markdown` leaf | engine, untouched | Every glyph beside code is text someone will paste; the engine's narrow-width table fallback is inherited. |
| Commentary vs the final answer | none: a block carries no phase | nothing | Knowable only at `turn.complete`, which would redraw text already being read; stock marks the turn's end (`✻ Worked for …`) and that is the pattern that works. |
| Streaming text | none | nothing | The hook sees completed blocks only. |
| Thinking, todos, the diff body, live agent progress, the permission dialog | **none** | cannot | No render site. Must not be imitated either. |
| Anything in the expanded view (ctrl+o, `--verbose`) | all of the above | engine, always | It is the audit path. |

So: two rows, redrawn conservatively, and a rule for everything else. That is the honest size of
"today". The platform could carry more — folds, labels, a reader pane, a final-answer badge, accent
colours — and each was refused on evidence, below.

## Interaction model

One sentence: **the normal view is Clear Transcript's; ctrl+o is always Claude Code's; any doubt is
Claude Code's.**

- **Nothing sits behind a control.** A transcript row has no keyboard focus, and a click needs the
  fullscreen layout *and* mouse capture. So nothing is folded, capped or hidden: the way back is
  never needed to *read*, only to *audit*.
- **ctrl+o (and `--verbose`) shows every row as the engine draws it.** A `ToolGroup` says
  `isExpanded` and the hook passes. An `AssistantMessage` has no such prop, and the engine reuses a
  hook's cached answer in that view, so the mod does this itself: it watches `UserMessage.isExpanded`
  (a prompt is raised before the reply under it), invalidates when it flips, and passes while it is
  true. Recorded in both terminal layouts.
- **`/clear-transcript off`** does the same for the normal view, at once and for every row on
  screen, until `/clear-transcript on` or the end of the session. It answers with text only and no
  `context`, so the model never hears of it.
- **`/config` has one row per behaviour** — *Heading hierarchy in answers*, *Named tool groups* —
  from the manifest's `userConfig`. Off means the hook returns `next(e)` for that row: not similar
  to stock, stock.
- **The stored message is never touched.** `/copy`, `v`, `[` and export read what the model wrote.
- **A refused tree is the stock row.** The engine validates every tree and draws its own on any
  refusal; a hook that throws is skipped. There is no broken-row state to design for.

## What it draws

Both pairs are one real session each, the same transcript drawn twice (2.1.278, fullscreen).

```text
stock                                    Clear Transcript

  Read 3 files, ran 2 shell commands       Read sum.mjs, format.mjs, parse.mjs · ran node --test 2>&1 | tail -40
                                           failed  node missing-file.js · Exit code 1

  Ran 1 shell command                      Ran node --test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```

The first stock line stood for three reads and two commands, **one of which had failed**, with
nothing on screen saying so; in another take of the same prompt both had. Rules, all in
[`hooks/lib/tools.mjs`](../experimental/clear-transcript/hooks/lib/tools.mjs):

- One dim line, past tense, names instead of counts: file base names, search patterns in quotes,
  the first line of a command, a host for a fetch, `server tool` for an MCP call. Adjacent calls of
  one kind merge, a name appears once, kinds keep the order they ran in.
- What does not fit is `+N more`: a count of what is left, never a count instead of names. The row
  is given out in the order the kinds ran, each kind keeping a minimum, and a name alone in its
  phrase may use the row, so a long command is cut late. From 60 columns the line fits the row;
  under that the engine cuts its end.
- A call with `isErrored` is never inside the line. It gets its own row: `failed` in the theme's
  error colour — the only colour Clear Transcript uses — the command at full strength, the first
  line of the error dim. An interrupted call reads `interrupted`, uncoloured: the person did that.
- The engine keeps the row while the group is live, while any call runs, and in the expanded view.
- Paths, commands and error text were written by a model or a tool. Escape sequences, control and
  bidi characters are removed before anything is drawn; the terminal surface refuses a control
  character in a `Text` as well, which a test uses as the proof.

On the **main-screen layout** stock draws each shell command as its own row with an output
preview, failures in red; only reads are folded there, and only that line changes.

```text
stock                                          Clear Transcript

● DNS resolution is the process of …           ● DNS resolution is the process of …

  How DNS Resolution Works                       How DNS Resolution Works        ← bold, underlined
                                                 ────────────────────────

  The Query Process                              The Query Process               ← bold, the engine's

  When you type a URL into your browser …        When you type a URL into your browser …
```

(The rule under the title stands for the underline attribute; no character is added.) Rules, in
[`hooks/lib/answer.mjs`](../experimental/clear-transcript/hooks/lib/answer.mjs) and
[`blocks.mjs`](../experimental/clear-transcript/hooks/lib/blocks.mjs):

- Only **section titles** — ATX `#` and `##`, starting in column 0, outside a fence, with a title of
  plain words — are taken out of the text and drawn, bold and underlined. `###` and deeper already
  look right in stock and stay in the markdown.
- **Attributes only, never rows.** A title keeps its one row and the blank rows stock gives it, so
  a reply is exactly as tall as stock's.
- Everything between two titles goes to the engine's `Markdown` leaf verbatim: code, fences,
  tables, lists, quotes, links, sub-headings, setext headings, HTML.
- Anything uncertain is the engine's, whole: no section title (most replies), a title holding
  inline markdown, a fence that never closes, an indented heading or fence (it may belong to a list
  or a quote), a run over the leaf's 10,000 characters that cannot be cut at a blank line in column
  0, a reply over 60,000 characters.
- A test holds the invariant for ten recorded replies: **no character lost, added or moved.**

## Decisions, and the variants behind them

Variants were drawn in a real terminal from recorded replies, by a throwaway plugin that prints a
fixture through the same code path; stills and the procedure are in
[clear-transcript-dogfood.md](clear-transcript-dogfood.md).

| Question | Variants tried | Chosen | Why |
| --- | --- | --- | --- |
| Colour on headings? | none; the theme's `suggestion`; `professionalBlue` | **none** | `suggestion` is the engine's inline-code colour, so a title read as code; `professionalBlue` does not adapt to a light theme (3:1 on white). And the rule this project already keeps: one hue is for identity, state owns colour, the answer is neither. Four unrelated renderers ladder by weight and underline (P9); the two that spend a hue on headings are listed under what fails (F11). |
| Keep the `##` markers, dim? | kept; stripped | **stripped** | Kept markers are lossless, copy back as markdown and speak correctly in a screen reader, and three renderer lineages do it. But `##` and `###` are hard to tell apart while scrolling, and the dim marker is dim (F10). An underline separates two levels at a glance and adds no character. Close call; recorded so it can be reopened. |
| Bind a sub-heading to its paragraph (no blank row under it)? | tight; as stock | **as stock** | Tight read better in every still. It also makes a reply shorter than stock draws it, and the engine hands a row to a mod's tree only when the block completes. A live text preview could not be produced in the recording environment (with or without a plugin), so it could not be shown that the swap moves nothing. Text that moves under a reader is the most-punished failure in the study (F4), so: attributes only. |
| Mark the final answer? | a label via `turn.complete` + invalidate (works, both layouts) | **no** | It redraws a block already being read; it adds words the model did not write (F3); every product marks the *end of the turn* instead, and stock already does (P8). |
| Fold long code or long answers? | — | **no** | No product truncates the answer (P4); a fold here could not be opened from the keyboard. |
| Frame, label or number code blocks? | — | **no** | P10, F7: it lands in the clipboard. |
| A failure's output under its line? | first line only (built); a three-line preview (weighed, not built) | **first line** | The engine's expanded row has the rest, one key away, and a preview cannot know which three lines matter in a test log. |
| Hook `tool.call` for durations (`Ran npm test · 38s`)? | — | **no** | claude-code#92533: any `tool.call` hook on Bash breaks sub-agents that use worktree isolation. Clear Transcript hooks `ui.render` and nothing the engine acts on. |
| Spinner wording | — | **not touched** | Stock has settings for it; a second way to do the same thing in another layer is what this project refuses. |

## Loading it

There is no install. Function hooks are gated, and a marketplace plugin that needs an undocumented
environment variable is the "installs, enables, does nothing" failure this project exists to
avoid. From a clone of this repository:

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir experimental/clear-transcript
```

```powershell
$env:CLAUDE_CODE_ENABLE_FUNCTION_HOOKS = '1'; claude --plugin-dir experimental/clear-transcript; Remove-Item Env:CLAUDE_CODE_ENABLE_FUNCTION_HOOKS
```

**Set the variable for that one command. Never export it, and never put it in a settings file**: it
changes what every plugin in every session may do, not only this one. Without it the plugin loads
and is inert: a headless run with the plugin and no gate exits 0 with no error (2.1.278), and with
the gate off a hooks module never runs at all (Spike A's control), so the transcript is stock.

To check what it would do before running it, with no gate at all:

```sh
claude plugin validate experimental/clear-transcript --strict
```

The engine reads the module's source and reports every event it hooks and every `$` call it makes.
For 0.1.0 that is `session.start`, one `command.run`, three `ui.render` matchers, and
`$.command.register`, `$.ui.invalidate`, `$.ui.resolve` — no file, network, process or environment
access, and no `tool.call`.

## Tests

```sh
cd experimental/clear-transcript
npm test                                                             # the pure core: Node >= 18, no Claude Code needed
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test .             # the hooks, in the engine's own host
```

The unit tests cover the block cutter, the answer plan and the group plan, including the
byte-for-byte invariant over the recorded replies and hostile text. The engine tests load the
plugin the way a session does and put every tree through the terminal surface's real validator:
what is drawn, that every word is still on screen, that the expanded view, a live group, another
surface and `/clear-transcript off` all reach the engine, and that a sub-heading-only reply is
never touched. They cannot see paint — wrapping, colour as drawn, row counts — which is what the
recordings are for. CI runs both, and sets the gate for the second command only.

## Limits

- **Windows only, so far.** Every recording is Windows 11; the tests run on the three CI platforms.
- **The expanded-view rule is an observation, not a contract**: that a prompt is raised before the
  reply under it. If that order ever changes, ctrl+o shows Clear Transcript's drawing until the next
  prompt is drawn; `/clear-transcript off` does not depend on it.
- **On the main screen, a row that has scrolled into the terminal's own scrollback stays as it was
  drawn**; the off-switch and ctrl+o reach the rows the engine still owns.
- **Row parity with stock is by construction and by eye**, not by a test: the kit cannot count rows.
- **Not seen:** a live resize, `--resume`, a light theme, a screen reader, a second render mod in
  the chain (an unreleased first-party `mermaid` mod also rewrites `AssistantMessage`), a
  sub-agent's own transcript view.
- **A title with inline markdown is not underlined**, so one reply can mix underlined and plain
  bold section titles. Chosen over reading inline markdown in a second place.

## What is production-ready, and what would promotion take

The pure core and its tests are ordinary code and would ship as they are. What is experimental is
everything they stand on: the gate, the `ui.render` contract, the `Markdown` leaf (four days old
when this was written), the test kit, the theme key `error`, and the order in which rows are raised.

Promotion to `plugins/clear-transcript` and a marketplace entry is mechanical **once function hooks
are documented and on by default**: move the folder, list it, add it to `check-repo.mjs` and the CI
validation, give it a marketplace version. Before that, on the release that documents the API:
diff `/plugin-types` against 2.1.278, re-run both test suites and the recordings in both layouts,
and re-check the two things this design took from observation rather than from a contract — that
the hook sees completed blocks only, and the order behind the expanded-view rule.
