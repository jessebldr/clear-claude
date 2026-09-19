# Roadmap v2 — Clear UI and Clear Mods

Design: [ui-architecture.md](ui-architecture.md). Evidence:
[mods-research-2.1.277.md](mods-research-2.1.277.md), [ui-research.md](ui-research.md).

## Scope

Clear Claude improves the experience **inside stock Claude Code, in the terminal**. Its
whole toolbox is what stock Claude Code exposes: output styles, skills, the statusline,
documented hooks, and — once stable — Mods. It is not a desktop app, not a web app, not a
wrapper or replacement harness around Claude Code, and it will not grow one. A feature
that needs a second window, a daemon or a fork of the agent loop is out of scope, however
good the idea.

Other products are worth studying for *how they present* work, never as things to rebuild.
See the UX distillation gate before Phases D and G.

## Versions

Each plugin carries its own version; the marketplace version tracks the newest change.

| Marketplace | Contents |
| --- | --- |
| 0.1.x | Harden `clear-claude`. No behaviour change to Clear Partner. |
| 0.2.0 | `clear-ui` 0.1.0 appears as a second, optional marketplace plugin (Phases A–C). Because Phases D and F were built on the same branch, it also carries the activity line and `verification-state` on **documented** classic hooks — both opt-in, off by default. |
| 0.2.x | Windows + macOS dogfooding; first green cross-platform CI run (Phase E); the opt-in features exercised against real hook payloads. |
| 0.3.0 | Unassigned. Was `verification-state` (Phase F), which shipped inside 0.2.0. |
| 0.4.0-exp | First function-hooks mod, outside the marketplace, `--plugin-dir` only (Phase G). |
| 1.0 | Only after function hooks are documented, on by default, and the layer boundaries have survived real use. |

Change from the earlier sketch: verification-state moves **ahead of** the first mod,
because documented `PostToolUse` / `PostToolUseFailure` hooks already carry everything the
mod would observe. Mods are reserved for what only they can do: the transcript renderer.

## Phases

### Phase A — core renderer (first PR)  ✔ done

- **Create:** `plugins/clear-ui/src/{render,layout,sanitize}.mjs`, `src/stdin.mjs`,
  `bin/statusline.mjs`, `test/fixtures/*.json`, `test/golden/*.txt`, `test/*.test.mjs`.
  No git, no config, no plugin manifest, no marketplace entry.
- **Dependencies:** none. Node ≥ 18, `node --test`.
- **Tests:** golden renders for every layout in the design doc; hostile-string
  sanitising; entry-point failure modes (empty, malformed, never-closing, oversized stdin).
- **Done when:** `node plugins/clear-ui/bin/statusline.mjs < test/fixtures/idle.json`
  prints the two documented lines; every failure case exits 0 with empty stderr; tests
  pass on Windows.
- **Risks:** width maths for CJK/emoji; the exact null shapes of `context_window`.

### Phase B — setup, uninstall, doctor  ✔ done

- **Create:** `bin/setup.mjs` (`plan`, `apply`, `uninstall`), `skills/{setup,doctor}`,
  `.claude-plugin/plugin.json`, marketplace entry, `SessionStart` re-copy hook, CI
  validation of the new plugin.
- **Tests:** unparseable settings refused; foreign statusLine Keep/Replace; idempotent
  re-run; uninstall restores previous value; unrelated keys byte-identical.
- **Done when:** install → setup → restart shows the status line on a machine that already
  had another statusline, and uninstall puts the old one back.
- **Risks:** `node` not on the PATH of the shell Claude Code spawns; stable-path copy
  going stale after a plugin update.
- **Found while building it:** a static `import` of a missing module crashes before any
  handler can exist, so the entry loads the render path with `await import` instead —
  otherwise a half-copied runtime writes a stack trace where the status line goes. Verified
  on the real install by deleting one file. `node` on Claude Code's own PATH and
  workspace trust remain unverifiable from inside the doctor; both are reported as such.

### Phase C — git and config  ✔ done

- **Create:** `src/git.mjs` (one call, timeout, TTL cache), `src/config.mjs`, `presets/`,
  `skills/configure`.
- **Tests:** no git, not a repo, dirty, ahead/behind, detached HEAD, timeout, malformed
  config, unknown keys.
- **Done when:** budgets in the design doc hold on Windows with a cache miss.
- **Risks:** slow `git status` in huge repos — must degrade to the cached branch name.
- **Built differently from the plan:** presets are a constant in `src/config.mjs`, not
  `presets/*.json` — three files to read on the render path bought nothing. The `configure`
  skill wraps a deterministic `bin/configure.mjs`, like setup. A repository too slow to answer
  keeps its last answer, and with none falls back to reading `.git/HEAD`, with the dirty mark
  unknown rather than clean.
- **Resize, found while dogfooding:** the padded bar goes stale when the terminal is resized,
  because resize is not a status-line trigger. Setup now installs `refreshInterval: 2`; see
  [ui-architecture.md](ui-architecture.md). This is also why git needed its cache before
  anything else: the command now runs every two seconds.
- **Measured on Windows 11, Node 24, 15 fresh processes:** git cached 62 ms median / 73 ms p95
  (budget 90); cache miss 89 / 98 (budget 130).

### UX distillation — gate before Phase D and Phase G  ✔ done

A short, time-boxed study. Delivered as [ux-distillation.md](ux-distillation.md), from the
source of Codex CLI, Oh My Pi, OpenCode and T3 Code; `anything-to-html` could not be found.

- **Look at:** Oh My Pi, anything-to-html, the Codex app, T3Code / OpenCode, and whatever
  comparable agent UI is strongest at the time.
- **Look for:** information hierarchy; progressive disclosure; how activity, tool calls
  and agents are presented; what is shown while work runs versus after it ends; what they
  chose to hide.
- **Do not look for:** features. Layouts that need a GUI, a canvas, a side window or a
  custom harness are noted and dropped.
- **Deliver:** one page, `docs/ux-distillation.md` — each pattern worth keeping, mapped to
  the terminal mechanism that can carry it (statusline line, `subagentStatusLine` row,
  `ui.render` component, `$.ui.status`), or marked "not expressible in a terminal".
- **Gate:** Phase D's activity line and Phase G's transcript renderer are designed only
  after this page exists. Their current sketches in
  [ui-architecture.md](ui-architecture.md) are placeholders.

### Phase D — activity line  ✔ built, opt-in, agents half dogfooded

- **Prerequisite:** the UX distillation above.

- **Create:** plugin `settings.json` with `subagentStatusLine` → a handler that prints
  nothing (default rows stay) and atomically writes `state/<session>.json`; `Stop` hook
  recording `background_tasks[]` counts; third line in the renderer, shown only when
  non-zero. Opt-in until dogfooded.
- **Tests:** stale state ignored, hostile agent names, handler never alters the panel.
- **Risks:** the feed is only sent while the agent panel refreshes; idle sessions may
  need `refreshInterval`, which costs a process per tick.
- **Built differently from the plan:** the feed is installed by `setup.mjs apply --activity`
  into the user's settings, not shipped in a plugin `settings.json`. Whether
  `${CLAUDE_PLUGIN_ROOT}` is substituted in that file is not documented, and a command that
  silently resolves to nothing is the failure this project exists to avoid. A marker file
  written by setup is what lets the plugin's `Stop` hook know the row was asked for.
- **Measured on 2.1.277, this machine:** the feed runs every 5 s while the panel has rows;
  `type` is `local_agent`; `status` was seen as `running` and `completed`; `startTime` is
  epoch milliseconds; a completed task stays in `tasks[]` for a few ticks and then leaves.
  The row therefore counts `running` only and stops believing a record older than 15 s.
- **Not verified:** a `failed` status has never been observed (the row reads it, and costs
  nothing if it never arrives); the `Stop` payload's `background_tasks[]` has only been
  exercised with fixtures, because the plugin's hooks are not loaded in the session that
  built it; ids shared between the two feeds are handled by type, not by id.

### Phase E — cross-platform dogfood

- **Create:** CI matrix (`windows-latest`, `macos-latest`, `ubuntu-latest`) running tests
  and `bench/bench.mjs`; `docs/clear-ui-install.md`; recorded results.
- **State:** the matrix and the bench step exist. The bench lives outside `test/` because
  `node --test` runs every file under a test directory and a timing is not a test; it fails a
  build only past the 250 ms ceiling. **Not done, and cannot be done from one machine:** a
  green run on macOS and Linux (CI triggers on pull requests and on `main`, so it first runs
  when the pull request opens), and the two weeks of daily use.
- **Done when:** byte-identical goldens and budgets met on all three; two weeks of daily
  use on Windows and macOS with no settings damage.

### Phase F — verification-state on documented hooks  ✔ built, not yet dogfooded

- **Create:** `PostToolUse` / `PostToolUseFailure` / edit-tool hooks (exec form,
  `async`) appending to the session state file: classification, command hash, failed or
  not, finished-at, duration; "edited after" flag. Renderer segment:
  `✓ verified 10:42` / `⚠ edited since` / nothing.
- **Rule:** a command counts as verification **only if the project lists it** in config.
  Observed facts are shown; file coverage is never inferred.
- **Risks:** a Node spawn per tool call (~70 ms on Windows, asynchronous).
- **Built differently from the plan:** the segment is words — `verified 10:42`,
  `verify failed 10:42`, `edited since` — because `✓` and `⚠` are double-width in the measured
  fonts. The project lists its commands in `.claude/clear-ui.json`; without that file the hook
  exits at once. A listed command counts only where the call's exit status is its own:
  `npm test | tail` and `npm test; echo done` would record a failing run as a pass, so they
  are not counted at all. Two files per session, one writer each, instead of one shared file
  that concurrent hooks would have to read, modify and write back.

### Phase G — first experimental mod

- **Prerequisite:** the UX distillation above.
- **Create:** `experimental/mods/activity-renderer/` — collapses finished, non-expanded
  `ToolGroup` rows to one line; returns `next(e)` whenever `isExpanded`. Tests via
  `claude plugin test`.
- **Entry conditions:** function hooks appear in official docs, or the gate defaults on.
  Until then this phase does not start.
- **Risks:** API churn between releases; hiding something that mattered — error rows are
  never collapsed.

## Not planned

`context-hygiene` (a filter that drops the one line that mattered fails invisibly) and
`compact-handoff` (rewriting what the summariser sees) are feasible on the current API
and stay unbuilt until someone shows a measured problem they fix.
