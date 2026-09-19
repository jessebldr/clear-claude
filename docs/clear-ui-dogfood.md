# Clear UI dogfood: real hooks, real payloads

Clear UI's two opt-in features — verification state and the activity row — were built and
tested against fixtures shaped from the documentation, because the session that built them
could not load its own plugin's hooks. This page records the first end-to-end run with real
hook payloads, on Windows, and gives the same run as a checklist for a Mac.

## Windows 11 — 2026-09-19 — pass, with two things worth knowing

Claude Code 2.1.278, Node 24, Git for Windows, `clear-ui` 0.1.1 from the working tree. Clear UI
installed with `setup.mjs apply --activity`; the plugin's hooks loaded with `--plugin-dir`; a
throwaway git project whose `.claude/clear-ui.json` lists `node check.mjs`. The session was
driven and recorded with VHS ([demo/dogfood-windows.tape](../demo/dogfood-windows.tape)), so
every row below was seen on screen in a real session as well as in the state file — except
the failing run, which came from a second, non-interactive session (`claude -p`, where no bar
is drawn) and was then rendered by the installed status line for that session's id.

| What | Real event | State file written | On the bar |
| --- | --- | --- | --- |
| A listed command passes | `PostToolUse`, tool `PowerShell` | `verify`: `failed: false`, `durationMs: 326` | `verified 21:20` |
| A file is edited afterwards | `PostToolUse`, tool `Edit` | `edit`: `{ at }` | `edited since`, in orange |
| A listed command fails (exit 1) | `PostToolUseFailure`, tool `PowerShell` | `verify`: `failed: true`, `durationMs: 277` | `verify failed 21:23` |
| A background command is running when Claude stops | `Stop`, `background_tasks[]` | `background`: `running: 1` | third row: `1 background` |
| Sub-agents are running | `subagentStatusLine` feed | `agents`: `type: local_agent`, `status`, `startTime` | third row: `1 agent  │  1 background` |

What is stored is what the design says and nothing more: a hash of the command, pass or fail,
a time and a duration. No command text, no output, no agent names.

**Two behaviours that are by design and easy to trip over:**

1. **A model often runs more than it was asked to.** Told to run `node check.mjs`, Claude ran
   `node check.mjs; "exit code: $LASTEXITCODE"`. A `;` sequence is never counted, because its
   exit status is not the listed command's own — so that failing run was, correctly, not
   recorded, and the bar went on showing the earlier state. The failure row above came from a
   second run where the command was given alone. If verification state seems to miss runs,
   look at the exact command in the transcript first.
2. **An edit made through the shell is not seen as an edit.** `Add-Content notes.txt …` changed
   a file, and the bar kept saying `verified`: only the edit tools (`Edit`, `Write`,
   `MultiEdit`, `NotebookEdit`) mark `edited since`. Inferring which shell commands write files
   would be a guess, and this feature shows observed facts only.

**Still never observed:** an agent `status` of `failed`. The row reads it and costs nothing if
it never arrives.

## Checklist for a Mac

About fifteen minutes. It settles three open questions at once: whether the features work
with real payloads on macOS, whether the macOS timing budget (40 / 60 ms) is real (#2), and
whether `git status` fits its 150 ms budget there.

Setup:

- [ ] `claude --version` is 2.1.278 or later; `node --version` is 18 or later.
- [ ] `git clone https://github.com/jessebldr/clear-claude && cd clear-claude/plugins/clear-ui`
- [ ] `node --test` → all tests pass. Note the count and the time.
- [ ] `node bin/setup.mjs plan`, then `node bin/setup.mjs apply --activity`. If another status
      line is installed it must stop and ask; note what it said.

Measure (paste the full output of both into issue #2):

- [ ] `node bench/bench.mjs` → median and p95 against the 40 / 60 ms budget. Run it three times;
      a laptop on battery or a Mac under load is not the number wanted.
- [ ] `node bench/git-latency.mjs . <a large repository you have>` → median, p95, share over
      150 ms.
- [ ] Record the machine: model, chip (Apple Silicon or Intel), macOS version, terminal app.

Look, in a real session (`claude` in any git repository):

- [ ] The bar is the bottom row: model, effort, project `on` branch on the left, chips flush
      right. Take a screenshot in Terminal.app and in iTerm2 or Ghostty if installed.
- [ ] Drag the window narrower than about 90 columns: within 2 s the bar becomes two rows.
      Drag it wide again: one row. No clipped or stranded text after either.
- [ ] Create an untracked file: within about 7 s an orange dot appears beside the branch.
      Delete it: the dot goes.
- [ ] The glyphs `│` `●` `·` draw as single-width characters, not boxes or double-width.

Verification state and activity, with real hooks:

- [ ] Make a throwaway project: `git init`, a `check.mjs` containing `process.exit(0)`, and
      `.claude/clear-ui.json` containing `{ "verify": ["node check.mjs"] }`. Commit.
- [ ] `claude --plugin-dir <path to clear-claude>/plugins/clear-ui` in that project.
- [ ] Ask: *Run exactly `node check.mjs`, nothing appended.* → the bar shows `verified HH:MM`.
- [ ] Ask Claude to edit any file with its edit tool → `edited since`.
- [ ] Change `check.mjs` to `process.exit(1)`, ask for the same run → `verify failed HH:MM`.
- [ ] Ask for a 90-second `sleep` as a background command plus two sub-agents in parallel →
      a third row with an agent count while they run, and `1 background` after Claude stops.
- [ ] `ls ~/.claude/plugins/data/clear-ui-clear-claude/state/` shows `verify`, `edit`,
      `background` and `agents` files for the session; none contains a command or a name.

Leave no trace:

- [ ] `node bin/setup.mjs uninstall` → the previous status line is back, or the key is gone.
      `git diff` on a copy of `settings.json` taken before setup shows no other change.

Record the result as a new dated section above this checklist, the way the Windows run is
recorded, including anything that did not match.

## After this is merged: install it the way a user does

Both runs above load the plugin from a working tree. The last step of dogfooding is the
marketplace path, which also exercises the `SessionStart` hook that re-copies the renderer
when the plugin version changes:

```text
claude plugin marketplace add jessebldr/clear-claude
claude plugin install clear-ui@clear-claude
```

Then start a session and run `clear ui doctor`: `Runtime files` should report 0.1.1.
