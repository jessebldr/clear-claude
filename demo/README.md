# How the demo images are made

Every animated image in [`assets/`](../assets) is a recording of a real terminal running the
real Claude Code. Nothing in the terminal area is drawn, mocked or edited after the fact.
This folder holds what produced them, so anyone can check the claim or re-record.

The recorder is [VHS](https://github.com/charmbracelet/vhs): a `.tape` file lists keystrokes,
VHS types them into a real shell and captures what appears. The tapes here are the complete
list of keys that were pressed.

## What each image is

| Image | Tape | What it shows |
| --- | --- | --- |
| `assets/clear-ui-demo.gif` | `clear-ui-wide.tape` | Clear UI at the bottom of a real Claude Code session, wide terminal, one row. The context chip fills in after the first answer; the orange dot beside the branch appears when Claude creates a file and goes when Claude deletes it. |
| `assets/clear-ui-narrow.gif` | `clear-ui-narrow.tape` | The same session in a 760 px terminal: the bar becomes two rows. |
| `assets/demo-chmod.gif` | `chmod-before.tape`, `chmod-after.tape` | One question asked in two sessions that differ only by the `clear-claude` plugin, side by side. |
| `assets/demo-port-3000.gif` | `port-*.tape` | Same, second question. |
| `assets/demo-disk-space.gif` | `disk-*.tape` | Same, third question. |

Three stills sit beside them for places an animation does not play — a social card, a
marketplace listing, an email: `assets/clear-ui.png`, `assets/clear-ui-narrow.png` and
`assets/demo-disk-space.png`. Each is the last frame of the recording of the same name, not a
separate drawing.

The Clear UI recordings use the recording machine's real account, so the plan name and the
usage percentages in them are real values from the day of recording, 2026-09-19.

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
  repository ships it.

The banner above each terminal is a caption added when the two recordings are joined. Its word
count is not an estimate: [`words.mjs`](words.mjs) reads the transcript of the session that was
just recorded. "Words" means whitespace-separated tokens of the raw Markdown, so a table's
`|` characters count; the rule is the same for both arms.

## No picking

A single run is an anecdote, and answer length varies from run to run. Two rules keep the
recordings honest:

1. **The published recording of each question is the first technically clean take.** Takes were
   discarded only for recording faults (a dropped keystroke, a script bug), never for their
   result. One discarded chmod take had the plugin arm *longer* than the stock arm, 178 words
   against 158 — it happens, and it is why rule 2 exists.
2. **The numbers quoted in the README come from repeated runs, not from the recordings.** Each
   question was run four times per arm with `claude -p` under the same flags. Every raw output is
   in [`runs/2026-09-19/`](runs/2026-09-19), unedited.

| Question | Stock, 4 runs | With clear-claude, 4 runs | Mean change |
| --- | --- | --- | --- |
| What does chmod 755 do? | 198, 184, 220, 217 | 141, 150, 133, 132 | 205 → 139 (−32 %) |
| How do I find which process is using port 3000 on Linux? | 151, 139, 166, 152 | 87, 82, 125, 108 | 152 → 101 (−34 %) |
| How do I check disk space on Linux? | 213, 142, 152, 162 | 153, 141, 118, 116 | 167 → 132 (−21 %) |
| All three | | | **524 → 372 (−29 %)** |

The recorded takes themselves read 219 → 178 (−19 %), 181 → 85 (−53 %) and 187 → 121 (−35 %).
The README shows the disk-space take inline because it is the one closest to the measured
average, not the most flattering one; the other two are linked beside it.

What this does and does not show: on these three short questions, with this model on this day,
the plugin's answers were shorter in every per-question mean, and the ranges overlap for one
question out of three. Shorter is not the claim on its own — whether the shorter answer kept
what mattered is what the behavioural evals in [docs/evals.md](../docs/evals.md) are for.

## Re-recording

Needs `vhs`, `ttyd`, `ffmpeg`, `node` and a logged-in `claude`. The scripts expect a clean clone
of this repository on `main` at `~/demo/clear-claude` that Claude Code already trusts (open it
once and accept the workspace prompt), and, for the Clear UI tapes, Clear UI installed.

```sh
demo/record.sh clear-ui-wide
demo/record.sh clear-ui-narrow
demo/record-pair.sh chmod "What does chmod 755 do?"
demo/record-pair.sh port  "How do I find which process is using port 3000 on Linux?"
demo/record-pair.sh disk  "How do I check disk space on Linux?"
```

Each writes `demo/<name>.gif`; copy it over the one in `assets/`. Every recording spends a
little of the account's usage: a few short prompts each.

Found the hard way on Windows:

- VHS's own GIF step fails silently with ffmpeg 9, so the tapes output raw frames and
  `record.sh` assembles them. ffmpeg's `drawtext` crashes without an explicit `fontfile`.
- VHS can drop the first keystroke of a tape. Each tape's first typed line starts with a space.
- Launch from Git Bash. From PowerShell, `bash` resolves to the WSL stub and VHS hangs.
- Launched from inside a Claude Code session, the recorded session inherits `CLAUDE_*`
  variables and says so on screen. `env.sh` unsets them.
- VHS cannot resize a terminal mid-tape, which is why wide and narrow are two tapes.
