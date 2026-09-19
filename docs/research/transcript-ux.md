# Transcript UX — how coding agents present a conversation

**Date:** 2026-09-20. The design input for Clear Transcript
([../clear-transcript.md](../clear-transcript.md)). It extends
[ux-distillation.md](ux-distillation.md) (2026-09-19), which covered tool rows and agent rows and
is cited here as `UXD#n`; this page adds the **assistant answer** and the transcript as one system.
What the platform allows is in [mods-research-2.1.278.md](mods-research-2.1.278.md).

**Method.** Source was read from shallow clones; nothing was installed or run except stock Claude
Code, which was recorded (`[OBS]`). Three independent sweeps — the three most-used terminal
agents, secondary references, and what users file and upvote — then a fourth pass that re-opened
33 of the cited `path:line` locations (none false, six needed a caveat, kept below) and 16 links.
Reaction counts were read from the GitHub API on 2026-09-19 and will drift. **Reddit and X could
not be read** (bot walls); anything from them is second-hand and is not used as evidence here.
Issue trackers over-represent the people a change hurt: a vendor's **revert** is treated as hard
evidence, a maintainer's "most users preferred it" as a claim.

Do not copy another product's look. What follows is the interaction principle, and why it matters.

## References inspected

| Tag | Source @ commit (2026-09) | Read for |
| --- | --- | --- |
| CC | stock Claude Code 2.1.278: docs, `CHANGELOG.md` @ `bf7d404e`, generated types, and recordings | what is already done, and what is flat |
| CX | `openai/codex` @ `132c2be239`, `codex-rs/tui/src/` | the most rigorous answer and streaming model |
| OC | `sst/opencode` (now `anomalyco/opencode`) @ `fee476bb90`, and `sst/opentui` @ `4954312d74` | parts by status, rhythm, reasoning as one line |
| OMP | `can1357/oh-my-pi` @ `71c5eec978`, `packages/tui/src/` | density by row budget, heading ladder, frozen prefix |
| T3 | `pingdotgg/t3code` @ `b44c1ce5d2` — a GUI: fold **logic** only | what folds, what never does |
| CR | `charmbracelet/crush` @ `8c541ead9a`, `internal/ui/` | a written, tested streaming-markdown cache; every limit a named constant |
| GM | `google-gemini/gemini-cli` @ `cfbcaa8df1` — Ink, the closest element model to ours | hand-rolled markdown, so every convention is a decision |
| TX / TD | `Textualize/textual` @ `06dbeef4bb`, `batrachianai/toad` @ `dd4f90e8b3` | "only the last block can change" |
| AI / GS | `Aider-AI/aider` @ `5dc9490bb3`, `block/goose` @ `ba8ba0cadb` | two other answers to streaming; the one product that truncates answer code |
| GL / RI | `charmbracelet/glamour` @ `49df6562f7`, `Textualize/rich` @ `9d8f9a372c` | the conventions readers already know |
| — | Amp, Kiro CLI | official docs only |

Skipped, with reason: qwen-code (a Gemini CLI fork), plandex (nothing beyond Aider), Cursor CLI,
Droid and Warp (closed; no public description at the needed level), Zed's agent panel (GUI).

## Links worth preserving

- Will McGugan, [Efficient streaming of Markdown in the terminal](https://willmcgugan.github.io/streaming-markdown/) — "only the very last block can change".
- Codex, [why the viewport-owning TUI was removed](https://github.com/openai/codex/issues/8344#issuecomment-3782449267) (2026-01-22) — stable resize and better copy were real, "it still felt like a regression in core terminal behaviors".
- Peter Steinberger, [The Signature Flicker](https://steipete.me/posts/2025/signature-flicker) — "Select text like it's a terminal. Scrollback like it's a terminal. Search like it's a terminal."
- ["Claude Code is being dumbed down?"](https://news.ycombinator.com/item?id=46978710) (1,085 points, 2026-02-11) and [claude-code#21151](https://github.com/anthropics/claude-code/issues/21151) (186 👍; the "try it for a few days" reply drew 85 👎) — the bare count.
- [codex#39903](https://github.com/openai/codex/issues/39903) (82 👍) — "Ran N commands" collapsing, **reverted** in 0.153.0; [codex#41622](https://github.com/openai/codex/issues/41622) (83 👍) — automatic recaps, switch added within two weeks.
- [claude-code#81472](https://github.com/anthropics/claude-code/issues/81472) — an index of 42 open copy/paste issues: "the TUI renders for visual appearance, not for selection/copy fidelity."
- [claude-code#50894](https://github.com/anthropics/claude-code/issues/50894) — focus mode hid assistant text: "Claude replies 'I already answered that above.' I never saw the answer."
- A screen-reader user on collapsed rows, [HN 46982469](https://news.ycombinator.com/item?id=46982469): "There is no 'progressive disclosure.' The text is either spoken to me or it doesn't exist."
- [Codex CLI Has Responsive Terminal Tables](https://www.vincentschmalbach.com/codex-cli-responsive-terminal-tables/) (2026-08-03), and the opposite view of the same fallback from inside, [claude-code#82950](https://github.com/anthropics/claude-code/issues/82950).

Stills from this project's own recordings are in [../clear-transcript-dogfood.md](../clear-transcript-dogfood.md).

## What stock Claude Code already does, observed on 2.1.278 `[OBS]`

Tables as a bordered grid, and as stacked `Header: value` records when the grid does not fit (a
`Markdown` leaf inside a mod's tree inherits this); highlighted code with no frame, label or
numbers, at the prose indent; hanging list indents; inline code in an accent; thinking hidden
behind a stub; a dim end-of-turn line (`✻ Worked for 8s · done 1:23 AM`); live tool groups in the
present tense with the current file and command under them; edits as a highlighted diff;
`/focus`, a quiet per-turn view; ctrl+o, `[`, `v` and `/copy` for the original.

What it leaves flat: **`##` and `###` are drawn identically, as plain bold with the marker
stripped, and cannot be told from a bold lead-in on the same screen**; commentary and the final
answer are drawn alike (in every product read); and **a settled tool group is a bare count that
also hides failures** — `Read 3 files, ran 2 shell commands` stood for three reads and two
commands that had both failed.

## Patterns that repeatedly work

| # | Principle | Seen in | Why it matters here |
| --- | --- | --- | --- |
| P1 | **The source string is the only state; the drawing is a pure function of (source, width).** | CX stores raw markdown per cell ("Passing rendered lines here would make future resize reflow preserve stale wrapping", `history_cell/messages.rs:473-475`); CR drops its cache on a width change; CC re-draws hooked sites once a resize settles | A stateless transform cannot cause resize duplication or stale wraps, a very-high complaint class. A render hook already is this function. |
| P2 | **Only the last block may change; cut only where closure is provable.** | six implementations: CX newline gate, OMP frozen prefix, CR cached prefix, GM static split, TX last-block re-parse, GS construct buffer | The same boundary rule is what makes it safe to split one reply into parts at all: column 0, outside a fence. |
| P3 | **Do not interpret structure until it is unambiguous.** | CX holds a table from its header line on, and refuses to preview a line with `\|` or a leading space, `>` or fence | A wrong early guess is drawn, read, then redrawn in another shape. |
| P4 | **The work is truncated; the answer never is.** | GM caps tool rows but overrides the cap for model text (`MAX_GEMINI_MESSAGE_LINES = 65536`); CX, OC, OMP, CR draw answer code and prose in full while capping tool output. GS is the one exception and needs a temp file and three switches for it. A 12-row diff cap was reverted (codex#41522) | The model refers back to what it wrote ("as I said above"). A cut breaks the conversation, not just the view. |
| P5 | **A collapsed row keeps its identifier.** | HN 1,085 points; claude-code#21151; codex#39903 reverted; CC's own concessions (2.1.45 current file under the summary, 2.1.239 paths truncated in the middle *to stay on the line*); T3 `path +N more`; UXD#12 | "Read 3 files" gives the reader nothing to act on. A count is not a summary. **The best-evidenced finding of the study.** |
| P6 | **State is words and tense; colour is for failure.** | UXD#7, #11; CX `styles.md:14-34` ("default foreground most of the time", green and red semantic only); T3 `Running / Ran / Failed / Declined / Stopped`; denied ≠ failed (UXD#16) | Survives themes, `NO_COLOR` and a screen reader. Already Clear UI's rule. |
| P7 | **Reasoning is a title and a duration at constant height; the body is on demand.** | OC "a single line throughout, so the layout never shifts"; CX keeps the body out of the main view; CC stub | No render site exists for thinking, so this is a rule about what not to imitate; the constant-height idea transfers. |
| P8 | **Mark the end of the turn, not the answer; say nothing when there is nothing to say.** | CX one dim line, duration only above 60 s, "Absent metadata occupies no transcript rows"; OC footer on the final message only; T3 withholds metadata "until the turn settles"; CC `TurnDuration` | Needs no knowledge of which block is final at draw time — which a mod does not have. |
| P9 | **Heading hierarchy is a ladder of at most three steps, made of weight and underline.** | h1 = bold + underline in four unrelated renderers (CX, OMP, RI, OC); markers kept at depth in three lineages (CX all, pi-family from h3, glamour-family from h2); GM and RI strip markers and still ladder | A reader scanning a long answer navigates by headings. The two flat renderers are the two with complaints on file (OC; CC #26390). Demand is low; this is craft. |
| P10 | **Code gets the least ink of anything on screen.** | No terminal agent read boxes answer code: fence lines, a margin, one cell of padding, or nothing (CX, OC, CC). claude-code#18170 (294 👍), #15199 (105 👍); codex#9252 (90 👍: a two-space gutter breaks a heredoc); gemini-cli#4280 (line numbers in the clipboard) | In a terminal every glyph drawn is selectable text. Decoration next to code is delayed data corruption. |
| P11 | **Spacing encodes grouping.** | OC: a blank row above a one-line row only if the previous sibling is tall or prose; OMP: zero vertical padding "to avoid extra spacing before tool executions" | Rhythm is the one grouping device that costs no ink and no colour. |
| P12 | **When something is cut: say how much, name the way out, never hide one line.** | UXD#13; CR "showing it beats the hint"; GM shorter wording under 80 columns; CC hidden-line counts, 200-row table notice | — |
| P13 | **There is a lossless way back, and it is global.** | CX `/raw`, `alt+r`; GM Alt+M; OC `conceal`; CC ctrl+o, `[`, `v`, `/copy` (102 👍 to get it) | "The rendered view is for reading; the source is for reuse." |
| P14 | **Guard the subtraction.** | CX returns `None` rather than wrap at zero width; OMP falls back to raw markdown below one cell per column; CC fixed a RangeError on a very narrow window | Reserved columns can exceed the width; the degenerate output must be defined. |
| P15 | **Say each thing once.** | CR drops `Canceled` from the message when the tool rows say it; CX hides the status row while answer lines commit; UXD#3, #15 | — |
| P16 | **Reads fold; writes, diffs, approvals and failures do not.** | TD never auto-expands reads "as it can generate a lot of noise"; GM never compacts a tool awaiting confirmation; diff caps reverted | Extends UXD#12, #14. |
| P17 | **An error is set off from prose, and bounded.** | CR: a blank line, "or it reads as the end of the sentence the model was in the middle of"; OMP 8 wrapped rows + hint | — |

## Patterns that repeatedly fail

| # | Failure | Evidence |
| --- | --- | --- |
| F1 | **The bare count.** `Read 3 files`, `Ran N commands`. | Under P5: two vendors, one revert, an 85 👎 reply. Stock still does it at 2.1.278, and hides failures inside it `[OBS]`. |
| F2 | **Hiding or folding words the model addressed to the user.** | claude-code#50894 and duplicates; the VS Code Focus fix "folding away … settled answers" (2.1.225); codex#28058 (130 👍, auditability). T3 folds commentary, but with a persisted unfold in place. It fails wherever the unfold is not in place. Moderate evidence, high severity. |
| F3 | **Text in the transcript the model did not write.** | Codex auto-recaps: 83 👍 to disable ("it no longer looks the way it was when I left"). Metadata lines (`Worked for 3m`) are accepted; prose is not. |
| F4 | **Show-then-hide, or any change of height when a block settles.** | claude-code#8371 ("I'm reading something then it zips up the terminal window. Where was I?"); a scrollback jump when a collapsed group finished off-screen, fixed in 2.1.83; oh-my-pi#9780. |
| F5 | **Drawing half-built structure and reshaping it.** | opentui draws incomplete tables with empty cells; CC had to fix "a stale bordered render in terminal scrollback while streaming" (2.1.136). |
| F6 | **A layout switch the reader cannot predict or undo.** | CC's table → records fallback: "the trigger is the content, not the geometry … There is currently no setting" (#82950, re-filed four times). Codex's rule has the same trigger and is praised — from outside. Mixed: the form is fine, and right for a screen reader; the unpredictability and the missing switch fail. |
| F7 | **Decoration that lands in the clipboard.** | Under P10; box-drawing characters corrupting `/copy`, wrapped URLs breaking OAuth flows. |
| F8 | **Owning the viewport to make the transcript "nicer".** | Codex built and removed it; CC 2.1.89 scrollback issues (147 issues match "scrollback"); Amp breaks `find`. |
| F9 | **Motion without information.** | "Everything was dancing and bouncing around … telling me nothing" (HN 46985055); codex#44561 (63 👍). |
| F10 | **Dim, or colour alone, as the carrier of a distinction.** | crush#755 (34 👍, colour-blind); opencode#16470 (27 👍); Codex now "clears inherited dim" for secondary words; Clear UI's own measurement, faint = 2.6:1. |
| F11 | **Flat or merely coloured headings.** | OC (one colour, only h1 differs) and CC `[OBS]`; GM and CR spend an accent hue on headings. |
| F12 | **No opt-out.** | Every thread asks for a setting before it asks for a revert. |
| F13 | **A separate screen offered as the everyday path.** | "Toggling in and out of verbose mode … isn't a solution" (39 👍). ctrl+o is an audit path, never the reading path. |

Two conflicts between the sweeps, and how they were settled. *Fold the turn, or never hide the
model's words?* T3 and Crush fold everything before the final message; users punish hidden
mid-turn text. Both are right for their platforms: T3 has a per-turn unfold in place, and stock's
`/focus` already is this fold and owns its expansion. A mod has no keyboard focus inside a row, so
a fold it drew could not be opened where it is: **Clear Transcript folds no assistant text.**
*`Read 4 files · 2s`, or names?* UXD's Phase G example contradicts UXD#12 and everything under P5;
the pattern was right and the example wrong — corrected there with a dated note.

## Constraints of a terminal, and of a mod that does not own the render loop

- Cells, not pixels; one font size. Bold and underline are dependable; italic is not universal;
  **dim depends on someone else's theme**. Hierarchy has about three usable steps.
- Glyph width is not guaranteed: Clear UI measured `✓`, `⚠` and `━` as double width in Consolas and
  Lucida Console. Status icons used elsewhere (`✔ ✗ ⏸ ⌛ ▣`) are outside the measured set.
- Everything drawn is selectable text, and a hard wrap is a newline in the clipboard.
- A screen reader speaks every glyph and cannot glance.
- Width runs from about 40 to 250 columns and changes under the reader.
- The mod's input is one Markdown string per text block, with no phase, turn or streaming flag.
  Its output is a tree the engine may refuse whole. It owns no scrollback, scroll position,
  selection, spinner, streaming pace, input box, keybinding, or the margin between two rows.
- No keyboard focus inside a transcript row; a click needs the fullscreen layout *and* mouse
  capture. **So nothing can sit behind a control.**
- No render site for thinking, todos, the diff body, live agent progress or the permission dialog.

## Implications for Clear Transcript

Ranked by value × confidence ÷ risk. **E** = two or more independent sources above; **I** = our
inference.

**The contract.**

1. The model's words are inviolable: nothing removed, reordered, reworded, summarised, folded or
   capped, mid-turn text included. Weight and spacing only. **E** (P4, F2, F3)
2. Pass-through is the default outcome of every hook; any doubt is `next(e)`. **E** (P2, P3, P14)
3. One off-switch, and off is byte-identical to stock. **E** (F12; the contract Clear UI already
   keeps for its usage provider)

**Highest value.**

4. **Tool groups: put the names back and let failure out.** One line that names its targets;
   `+N more`, never a bare count; an errored call is never inside a collapsed line and gets its
   own row, the command, the error's first line and the error colour. **E** (P5, F1, P6, P16, P17)
5. Live, running and expanded rows are the engine's. **E** (UXD#14–16)

**The answer.**

6. Emphasise only structure the model wrote — its headings; quieten nothing inside the answer. It
   becomes findable because the settled rows around it are calm. **E** (P8, F3)
7. Headings: a ladder of weight and underline, **no colour, no glyph, no dim**, levels as written,
   cut only at ATX headings in column 0 outside a fence. **E** for the ladder (P9, F11 observed);
   keeping or dropping the `#` markers was decided by recorded variants, not taste —
   [../clear-transcript.md](../clear-transcript.md). Demand is low: rank it below 4. **I**
8. Never touch code, commands, paths, URLs, tables, lists, quotes, emphasis. No cap, fold, number,
   box or label on a code block. **E** (P10, F7, P4)
9. No lede treatment, no "final answer" badge: answer-first is Clear Partner's job, and a mod
   cannot know a block is final when it draws it. **I**, supported by P8
10. Tables at narrow width: build nothing; the engine's leaf already falls back. **E** (F6, F7)

**Not built, because stock or another layer has it:** a quiet per-turn fold (`/focus`); thinking
display; diffs; end-of-turn line; agent counts and verification state (Clear UI); copy and export;
answer-first and length (Clear Partner); a TL;DR under the answer (F3); a reader pane (F8).

**Temptations refused:** a fake GUI; boxes around anything; status icons and emoji; recolouring the
model's words; dimming to de-emphasise; hiding text; adding words; badging the final answer after
the fact; indenting body text under headings or full-width rules; a gutter or line numbers beside
code; animation; rebuilding what the engine renders — "two renders of one document never agree at
their seam" (CR `streaming_markdown.go:19-23`).

## Observed, inferred, not verified

**Observed:** every `[OBS]` statement, in recordings of 2.1.278 on Windows at 142 and 70 columns;
every cited source location re-opened in the fourth pass. **Inference:** the ranking, the recurrence
judgments, the reduction of F1 to "a row must keep its identifier". **Weak, and said so:** demand
for heading hierarchy (#26390 and #70425 have one 👍 each — the case rests on what seven renderer
authors do); demand against CC's stacked tables (low per issue, kept alive by re-filing, praised
from outside); "cap prose at 120 cells" has one source (Crush) and is not used. **Not verified:**
anything on Reddit or X; how many users silently prefer collapsed rows; how any of these products
looks when run — spacing, colour and motion were read from code, not seen, except stock Claude Code.
