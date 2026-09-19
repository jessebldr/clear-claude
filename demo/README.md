# How the demo images are made

Every animated image in [`assets/`](../assets) is a recording of a real terminal running the
real Claude Code. Nothing inside a frame is drawn, mocked or retouched. This folder holds what
produced them, so anyone can check the claim or re-record.

The recorder is [VHS](https://github.com/charmbracelet/vhs): a `.tape` file lists keystrokes,
VHS types them into a real shell and captures what appears. The tapes here are the complete
list of keys that were pressed.

## The set

Primary — the three shown in the README, and the ones to post:

| Image | Length | Tape | What it shows |
| --- | --- | --- | --- |
| `assets/clear-ui-demo.gif` | 17 s | `clear-ui-wide.tape` | Clear UI as the bottom row of a real session. The context chip fills in after the first answer; the orange dot beside the branch appears when Claude creates a file and goes when Claude deletes it. |
| `assets/demo-chmod.gif` | 16 s | `chmod-before.tape`, `chmod-after.tape` | One question in two sessions that differ only by the `clear-claude` plugin: 216 → 110 words. |
| `assets/demo-port-3000.gif` | 17 s | `port-*.tape` | Same, second question: 136 → 78 words. |

Secondary — linked, not embedded:

| Image | Length | Tape | What it shows |
| --- | --- | --- | --- |
| `assets/demo-disk-space.gif` | 17 s | `disk-*.tape` | Same, third question: 155 → 96 words. The plugin arm answers with a list where 0.1.0 used a table. |
| `assets/clear-ui-narrow.gif` | 15 s | `clear-ui-narrow.tape` | The status bar in a 760 px terminal: two rows. |

Every GIF has a PNG of the same name beside it: its cover frame, for places an animation does
not play — a social card, a marketplace listing, an email.

One look across the set: primary assets are 1300 px wide, the narrow one 720; the same
caption banner, margins and terminal ground; before and after panes are the same size, font
and framing, recorded by the same generated tape.

## What is done to time, and what is never done to a frame

A raw recording is mostly waiting: 74 seconds for the status bar session, 37 for a
question. [`edit.mjs`](edit.mjs) turns the recorded frames into the published GIF, and it
edits **time only**:

1. It drops frames in which nothing on screen changes — waiting for the model, a blinking
   cursor. A stretch of stillness keeps under half a second.
2. If that is still longer than the target (20 s), it plays every second or third frame.
   The question pairs fit at natural speed; only the status bar session is sped up, 2x.
3. It holds the last frame for 2.6 s.
4. It opens on a **cover frame** for one second — a frame of the same recording, chosen so
   that a paused thumbnail shows the result instead of an empty terminal. For the question
   pairs it is the last frame; for the status bar it is the moment the dirty dot is lit.

It never touches what is inside a frame. Each one is the recording's text layer and cursor
layer on the terminal's ground colour, with 10 px of air added on the right (VHS pads a
terminal on the left only) and a caption banner above. The word counts on the banners are
not estimates: [`words.mjs`](words.mjs) reads the transcripts of the two sessions that were
recorded.

## Before / after: what is controlled

Both arms are stock Claude Code 2.1.278 on the same machine, same model, minutes apart:

```text
before:  claude --setting-sources project
after:   claude --setting-sources project --plugin-dir plugins/clear-claude
```

- `--setting-sources project` leaves the recording machine's user settings out: no output style,
  no status line, no other plugins, no hooks.
- `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` is exported in a hidden line of each tape, so no `CLAUDE.md`
  shapes either answer. The hidden line does that and changes directory, nothing else; it is in
  the tape for anyone to read.
- The only difference is `--plugin-dir plugins/clear-claude`: the plugin exactly as this
  repository ships it, `clear-claude` 0.1.1.

The published status bar recordings were made a few hours before 0.1.1 was what the
marketplace served, so for that one take a hidden alias loaded the working-tree copy of
`clear-claude` — the same text that was then released. The tapes as committed have no alias:
they record whatever `clear-claude` the machine has installed.

## No picking

A single run is an anecdote, and answer length varies from run to run. Two rules keep the
recordings honest:

1. **The published recording of each question is the first technically clean take of the
   current style.** Takes are discarded only for recording faults (a dropped keystroke, a
   script bug), never for their result, and re-recorded when the product changes: the set was
   recorded for 0.1.0 and again for 0.1.1. One discarded 0.1.0 chmod take had the plugin arm
   *longer* than the stock arm, 178 words against 158 — it happens, and it is why rule 2
   exists.
2. **The numbers quoted in the README come from repeated runs, not from the recordings.** Each
   question was run four times per arm with `claude -p` under the same flags. Every raw output
   is in [`runs/`](runs), unedited.

`clear-claude` 0.1.1, [`runs/2026-09-19-style-0.1.1/`](runs/2026-09-19-style-0.1.1):

| Question | Stock, 4 runs | With clear-claude, 4 runs | Mean change |
| --- | --- | --- | --- |
| What does chmod 755 do? | 216, 197, 232, 185 | 114, 103, 110, 103 | 208 → 108 (−48 %) |
| How do I find which process is using port 3000 on Linux? | 131, 132, 121, 157 | 65, 68, 64, 83 | 135 → 70 (−48 %) |
| How do I check disk space on Linux? | 180, 153, 163, 229 | 72, 105, 83, 62 | 181 → 81 (−56 %) |
| All three | | | **524 → 258 (−51 %)** |

No plugin answer was as long as the shortest stock answer to the same question. "Words" are
whitespace-separated tokens of the raw Markdown. Counting only tokens that contain a letter
or a digit, so that table rules and pipes do not count, gives 461 → 232 (−50 %): the drop is
not a counting artefact.

For comparison, `clear-claude` 0.1.0 measured 524 → 372 (−29 %) the same way
([`runs/2026-09-19/`](runs/2026-09-19)); by the stricter count, 463 → 311 (−33 %). Two things
changed in 0.1.1, both because an eval case failed first ([docs/evals.md](../docs/evals.md)):
a reply shape the user asks for now outranks the style's defaults, and a short set of
commands is a list rather than a table — 0.1.0 used a table in 8 of its 12 answers, 0.1.1 in
none.

What this does and does not show: on these three short questions, with this model on this
day, the plugin's answers were about half as long. Shorter is not the claim on its own —
whether the shorter answer kept what mattered is what the behavioural evals are for, and
cases a–f passed 6/6 on 0.1.1. The README embeds the two pairs with the largest difference
in the recorded takes and links the third. The takes read −49 %, −43 % and −38 %: a little
less flattering than the measured means above, which are the numbers to quote.

## Re-recording

Needs `vhs`, `ttyd`, `ffmpeg`, `node` and a logged-in `claude`. The scripts expect a clean clone
of this repository on `main` at `~/demo/clear-claude` that Claude Code already trusts (open it
once and accept the workspace prompt), and, for the status bar tapes, Clear UI installed.

```sh
demo/record.sh clear-ui-wide
demo/record.sh clear-ui-narrow
demo/record-pair.sh chmod "What does chmod 755 do?"
demo/record-pair.sh port  "How do I find which process is using port 3000 on Linux?"
demo/record-pair.sh disk  "How do I check disk space on Linux?"
node demo/edit.mjs            # frames -> assets/*.gif and their cover PNGs
```

The recorders write raw frames under `demo/` (ignored by git); `edit.mjs` reads them and
writes straight into `assets/`. Every recording spends a little of the account's usage: a
few short prompts each.

Found the hard way on Windows:

- VHS's own GIF step fails silently with ffmpeg 9, so the tapes output raw frames. ffmpeg's
  `drawtext` crashes without an explicit `fontfile`; set `FONTFILE` on other platforms.
- VHS can drop the first keystroke of a tape. Each tape's first typed line starts with a space.
- Launch from Git Bash. From PowerShell, `bash` resolves to the WSL stub and VHS hangs.
- Launched from inside a Claude Code session, the recorded session inherits `CLAUDE_*`
  variables and says so on screen. `env.sh` unsets them.
- VHS cannot resize a terminal mid-tape, which is why wide and narrow are two tapes.
- The status bar session is real: it shows the recording account's plan name and usage
  percentages as they were on the day.
