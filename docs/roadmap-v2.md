# Roadmap v2 — Clear UI and Clear Transcript

Design: [ui-architecture.md](ui-architecture.md), [clear-transcript.md](clear-transcript.md). Evidence:
[mods-research-2.1.277.md](research/mods-research-2.1.277.md),
[mods-research-2.1.278.md](research/mods-research-2.1.278.md), [ui-research.md](research/ui-research.md),
[transcript-ux.md](research/transcript-ux.md).

## Status at closure — 2026-09-20, marketplace 0.4.1

Phases A–F are done and released; Clear Partner and Clear UI are finished layers. Everything
below this section is the record of how they were built. What is *not* done is listed here
once, with where it went, so that nothing further down reads as pending work:

| Left over | Where it went |
| --- | --- |
| How the bar looks on a Mac's screen; the third row seen on screen there | [#18](https://github.com/jessebldr/clear-claude/issues/18) — needs a person, not code; non-blocking |
| An Intel Mac timing | Documented limit: the macOS budget was measured on Apple Silicon only ([ui-architecture.md](ui-architecture.md), "Performance budget"). No hardware, no issue. |
| "Two weeks of daily use" as the exit of Phase E | Dropped as a gate. It is elapsed time, not work; settings damage, if it ever happens, is a bug report. |
| An agent `status` of `failed`, never observed | Documented limit: the row reads it and costs nothing if it never arrives. |
| Official marketplace listing | [#19](https://github.com/jessebldr/clear-claude/issues/19) — depends on Anthropic's process |
| Phase G, Clear Transcript | **Built, 2026-09-20**, as the experimental plugin `clear-transcript` 0.1.0 — see [Phase G](#phase-g--clear-transcript---built-waits-on-anthropic). What is left is not work: it waits for Anthropic to document function hooks and switch them on. |

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
| 0.1.x | Harden `clear-claude` (the plugin now named `clear-partner`). No behaviour change to Clear Partner. |
| 0.2.0 | `clear-ui` 0.1.0 appears as a second, optional marketplace plugin (Phases A–C). Because Phases D and F were built on the same branch, it also carries the activity line and `verification-state` on **documented** classic hooks — both opt-in, off by default. |
| 0.2.1 | `clear-ui` 0.1.1. First green cross-platform CI run (Phase E) and the two fixes it led to; the opt-in features exercised end to end against real hook payloads on Windows; real recordings replace drawn images. |
| 0.2.2 | `clear-claude` 0.1.1: explicit response-shape constraints outrank the style's defaults, and a short set of commands is a list, not a table — each change made only after an eval case failed. Demo set cut to 15–17 s and re-recorded. |
| 0.2.x–0.4.x | macOS dogfooding on real hardware, which also settles the macOS timing budget — measured on Apple Silicon on 2026-09-20, the 40 / 60 ms budget stands (#2, closed). At closure the on-screen checks moved to #18 and "two weeks of daily use" was dropped as a gate. |
| 0.3.0 | `clear-ui` 0.2.0: the opt-in usage provider — the weekly limit scoped to one model, from Claude Code's own headless `/usage`, behind a cache; off by default, and the default bar unchanged. (The slot was once `verification-state`, Phase F, which shipped inside 0.2.0.) |
| 0.4.0 | One name per layer: the plugin `clear-claude` becomes `clear-partner` 0.2.0, migrated for existing installs by `renames`; one install story across README, skills and docs; `AGENTS.md` and a repository check in CI ([ADR 0005](adr/0005-naming-and-install-paths.md)). `clear-ui` stays at 0.2.0. No change to the Clear Partner prompt. |
| 0.4.1 | Closure. `clear-partner` 0.2.1: the diagnostic skills stop failing a harmless style file and read the policy level, after measuring what actually displaces a plugin's style. `clear-ui` 0.2.1: the `configure.mjs show` alignment fix and a bench that does not judge shared runners. Migration measured on three platforms and at every scope; #2 closed. |
| exp | `clear-transcript` 0.1.0, the first function-hooks mod (Phase G): outside the marketplace, `--plugin-dir` only. It carries its own version and no marketplace version — the slot once pencilled in as "0.4.0-exp" went to the release above — so it moves no number here until it is promoted. |
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

A short, time-boxed study. Delivered as [ux-distillation.md](research/ux-distillation.md), from the
source of Codex CLI, Oh My Pi, OpenCode and T3 Code; `anything-to-html` could not be found.

- **Look at:** Oh My Pi, anything-to-html, the Codex app, T3Code / OpenCode, and whatever
  comparable agent UI is strongest at the time.
- **Look for:** information hierarchy; progressive disclosure; how activity, tool calls
  and agents are presented; what is shown while work runs versus after it ends; what they
  chose to hide.
- **Do not look for:** features. Layouts that need a GUI, a canvas, a side window or a
  custom harness are noted and dropped.
- **Deliver:** one page, `docs/research/ux-distillation.md` — each pattern worth keeping, mapped to
  the terminal mechanism that can carry it (statusline line, `subagentStatusLine` row,
  `ui.render` component, `$.ui.status`), or marked "not expressible in a terminal".
- **Gate:** Phase D's activity line and Phase G's transcript renderer are designed only
  after this page exists. Their current sketches in
  [ui-architecture.md](ui-architecture.md) are placeholders.

### Phase D — activity line  ✔ built, opt-in, dogfooded on Windows

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
- **Dogfooded with real payloads, Windows, 2026-09-19:** a real `Stop` hook's
  `background_tasks[]` wrote `running: 1` and the bar drew `1 background`; with sub-agents
  running it drew `1 agent  │  1 background`. See [clear-ui-dogfood.md](clear-ui-dogfood.md).
- **Not verified:** a `failed` status has never been observed (the row reads it, and costs
  nothing if it never arrives); ids shared between the two feeds are handled by type, not by
  id; on macOS the hooks and state files are verified (2026-09-20) but the third row has not
  been seen on screen there.

### Phase E — cross-platform dogfood

- **Create:** CI matrix (`windows-latest`, `macos-latest`, `ubuntu-latest`) running tests
  and `bench/bench.mjs`; `docs/clear-ui-install.md`; recorded results.
- **State:** the matrix runs and is green on all five jobs (Linux on Node 18 and 22, macOS,
  Windows, strict validation) since 2026-09-19. The bench lives outside `test/` because
  `node --test` runs every file under a test directory and a timing is not a test; it fails a
  build only past the 250 ms ceiling.
- **What the first run found:** two tests raced a real git against a real clock (Windows:
  under the test runner's parallel load one `git status` missed 150 ms, though the same runner
  idle measures 43 ms; Node 18 on Linux: git beat a 1 ms timer), and the
  demo-render step used `<`, which PowerShell lacks. All fixed in tests and CI. It also
  exposed two product edges, both fixed in `clear-ui` 0.1.1: a truncated git listing taken for
  an answer (#4), and a dirty mark that goes missing silently on a slow machine (#3).
- **Bench on shared runners:** first run Linux 40 / 53 ms (budget 40 / 60), Windows 73 / 123
  (90 / 130), macOS 101 / 164 (40 / 60, **over**); a later run read Linux 58 / 64, Windows
  106 / 154, macOS 82 / 88 — every platform over. The same runner swings by 50 % between runs,
  so these numbers cannot gate or set a budget, and a looser budget for runners would be a
  second guess: on CI `bench.mjs` now prints the budget rows as `not judged` and only the
  250 ms ceiling can fail a build.
- **The macOS budget, settled on a real Mac (2026-09-20, #2):** an M4 Mac mini reads 38 / 46 ms
  median over three runs against 40 / 60, so the guess was right and stays — with about 2 ms
  of room on the cached row. Numbers and limits in
  [ui-architecture.md](ui-architecture.md), "Performance budget"; the run itself in
  [clear-ui-dogfood.md](clear-ui-dogfood.md).
- **Closed 2026-09-20.** Byte-identical goldens on all three platforms, and the budget met
  on real hardware on Windows and macOS. The on-screen half of the Mac checklist moved to
  #18; an Intel Mac is a documented limit; "two weeks of daily use" was dropped as a gate —
  see [Status at closure](#status-at-closure--2026-09-20-marketplace-041).

### Phase F — verification-state on documented hooks  ✔ built, dogfooded on Windows

- **Create:** `PostToolUse` / `PostToolUseFailure` / edit-tool hooks (exec form,
  `async`) appending to the session state file: classification, command hash, failed or
  not, finished-at, duration; "edited after" flag. Renderer segment:
  `✓ verified 10:42` / `⚠ edited since` / nothing.
- **Rule:** a command counts as verification **only if the project lists it** in config.
  Observed facts are shown; file coverage is never inferred.
- **Dogfooded with real payloads, Windows, 2026-09-19:** a real `PostToolUse` recorded a pass
  (`verified 21:20` on the bar), an `Edit` turned it to `edited since`, and a real
  `PostToolUseFailure` recorded a failure (`verify failed 21:23`). Two by-design behaviours are
  easy to trip over: a model that appends `; echo $?` to the command makes the run uncounted,
  and an edit made through the shell is not seen as an edit. Both are written up in
  [clear-ui-dogfood.md](clear-ui-dogfood.md).
- **Risks:** a Node spawn per tool call (~70 ms on Windows, asynchronous).
- **Built differently from the plan:** the segment is words — `verified 10:42`,
  `verify failed 10:42`, `edited since` — because `✓` and `⚠` are double-width in the measured
  fonts. The project lists its commands in `.claude/clear-ui.json`; without that file the hook
  exits at once. A listed command counts only where the call's exit status is its own:
  `npm test | tail` and `npm test; echo done` would record a failing run as a pass, so they
  are not counted at all. Two files per session, one writer each, instead of one shared file
  that concurrent hooks would have to read, modify and write back.

### Phase G — Clear Transcript  ✔ built, waits on Anthropic

Clear Transcript is the part of the experience the status bar cannot reach: what the
conversation itself looks like in the stock Claude Code terminal. Design, limits and how to load
it: [clear-transcript.md](clear-transcript.md). The four things this phase has to keep apart:

| | State on 2026-09-20, Claude Code 2.1.278 |
| --- | --- |
| **Proven platform behaviour** | `ui.render` raises `AssistantMessage` with one raw Markdown string per text block, and only once the block is complete; the engine's own `Markdown` and `Code` renderers are leaves a plugin can draw with; a refused tree falls back to the stock row; `ToolGroup` carries every call with its input, error flag and output; the expanded view is reachable if the mod stands down in it. Measured in recorded sessions and with `claude plugin test` — [research/mods-research-2.1.278.md](research/mods-research-2.1.278.md). |
| **Experimental API dependency** | All of the above. Function hooks are in no official document and no changelog, off by default behind `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`, and changed heavily between 2.1.273 and 2.1.277 (the `Markdown` leaf did not exist before). Anthropic's only statement of intent is "on the scale of weeks", from 2026-09-09. |
| **Implemented** | `experimental/clear-transcript` 0.1.0: a settled tool group names its files and commands and gives each failed call its own line; section titles in an answer are underlined; ctrl+o and `/clear-transcript off` return every row to Claude Code's drawing; two `/config` switches. 45 unit tests and 11 engine tests at 0.1.0, and real sessions recorded in both terminal layouts ([clear-transcript-dogfood.md](clear-transcript-dogfood.md)). |
| **Blocked only by platform maturity** | A marketplace entry and an install command. Nothing else: when function hooks are documented and on by default, promotion is a folder move, a manifest entry and a re-run of the checks in [clear-transcript.md](clear-transcript.md#what-is-production-ready-and-what-would-promotion-take). |

- **Prerequisite:** the UX distillation above, extended for the assistant answer in
  [research/transcript-ux.md](research/transcript-ux.md).
- **Entry conditions, as first written:** function hooks appear in official docs, or the gate
  defaults on; until then no mod is built. **Neither is met, and the mod was built anyway**, on the
  owner's decision to finish the layer now and let it wait finished rather than unstarted. The
  condition still binds where it matters: nothing here is listed in the marketplace, installed by
  either stable plugin, or able to run without a person setting the gate for one command.
  `scripts/check-repo.mjs` fails if `clear-transcript` is ever listed while it lives under
  `experimental/`.
- **G1, tools and sub-agents — built differently from the plan.** The plan was to collapse
  finished groups to one line such as `Read 4 files · 2s`. Stock already collapses them, and the
  research showed that the bare count is the most-punished pattern in the field (one vendor
  reverted it) and that on 2.1.278 it hides failed commands. So the mod does the opposite of
  collapsing: it puts the names back and lets failures out. Durations were dropped: they need a
  `tool.call` hook, and any `tool.call` hook on Bash breaks sub-agents with worktree isolation
  (claude-code#92533). Edits, sub-agent rows and live groups are left to stock, which draws them well.
- **G2, the assistant answer — GO, and deliberately small.** All five questions of the spike were
  answered: raw Markdown per block; parts can be composed; blocks arrive complete; the native
  renderer is reusable as a leaf; the original stays reachable, with the one condition above. What
  was built on it is one attribute on section titles. Folds, a final-answer badge, accent colours,
  framed code and tighter heading spacing were each tried or weighed and refused on evidence; the
  reasons are in [clear-transcript.md](clear-transcript.md#decisions-and-the-variants-behind-them).
- **Not verified:** macOS and Linux sessions (tests run there in CI; no recording does); a live
  resize; `--resume`; a light theme; a screen reader; a second render mod in the chain.
- **Next, and only when a release changes the API:** re-run the re-verification steps at the end of
  [research/mods-research-2.1.278.md](research/mods-research-2.1.278.md).

## Not planned

`context-hygiene` (a filter that drops the one line that mattered fails invisibly) and
`compact-handoff` (rewriting what the summariser sees) are feasible on the current API
and stay unbuilt until someone shows a measured problem they fix.
