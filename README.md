![clear-claude](assets/hero.png)

# Clear Claude

[![Latest release](https://img.shields.io/github/v/release/jessebldr/clear-claude)](https://github.com/jessebldr/clear-claude/releases/latest)
[![License: MIT](https://img.shields.io/github/license/jessebldr/clear-claude)](LICENSE)
[![Build in public](https://img.shields.io/badge/X-%40JesseBldr-black?logo=x&logoColor=white)](https://x.com/JesseBldr)

**Make Claude Code easier to understand without making it less capable.**

My Claude Code talked like it was paid per word. So I fixed the communication layer —
Clear Partner, an output style with two diagnostic skills and zero config surgery — and
proved with real evals that the fix doesn't make Claude dumber.

This repository is a marketplace with two independent plugins:

| Plugin | What it is | Touches your settings? |
| --- | --- | --- |
| `clear-claude` | **Clear Partner** — the output style, plus `clear-doctor` and `clear-audit`. The product. | No. Nothing is written outside the plugin. |
| `clear-ui` | **Clear UI** — an optional status bar: model, project and git on the left; context, 5-hour and weekly usage on the right. | Yes: the `statusLine` key (and `subagentStatusLine` if you switch the activity row on), through a setup script you run on purpose. Uninstall restores what was there. |

Installing one never installs, requires, or changes the other.

---

## Install (30-second setup)

Clear Partner is two commands, identical on Windows, macOS, and Linux:

```text
claude plugin marketplace add jessebldr/clear-claude
claude plugin install clear-claude@clear-claude
```

Or from inside a session: `/plugin marketplace add`, then `/plugin install`.

That's the whole setup. **There is no activation step** — Clear Partner declares
`force-for-plugin: true`, so it applies automatically whenever the plugin is enabled.
New plugins load on the next session; run `/reload-plugins` to pick it up immediately.

Scopes, updates, session-only loading, and the full command reference live in
[docs/install.md](docs/install.md).

### Optional: Clear UI

![A real Claude Code session with the Clear UI status bar at the bottom: the context chip fills in after the first answer, and an orange dot beside the branch follows the working tree](assets/clear-ui-demo.gif)

*A recording of a real session, not a mock-up, cut to 17 seconds: the bar is the bottom row.
Watch the context chip fill in, and the orange dot beside `main` appear when Claude creates a
file and go when it is deleted. In a narrow terminal the same bar
[becomes two rows](assets/clear-ui-narrow.gif). How it was recorded and cut:
[demo/README.md](demo/README.md).*

```text
claude plugin install clear-ui@clear-claude
```

Then, in a session, say `set up clear ui`. A plugin cannot register a status line, so a
setup script names it in your `settings.json`: it prints its plan before it writes, backs
the file up, edits only that key, and asks before replacing a status line you already
have. It needs Node 18 or newer. Everything it writes, and how to remove it, is in
[docs/clear-ui-install.md](docs/clear-ui-install.md).

---

## Why Clear Claude exists

Three failure modes I kept hitting with stock Claude Code. Each one is fixed by a
specific component of this plugin — not by vibes, and not by a 400-line CLAUDE.md.

### #1: The agent buries the answer

**The problem.** You ask a direct question, you get three paragraphs of throat-clearing
before the answer shows up — if it shows up. Long responses aren't the problem;
*unstructured* responses are.

**The fix** is [Clear Partner](plugins/clear-claude/output-styles/clear-partner.md):
answer first, plain English, concise by default. The least text that fully
communicates the answer — never the shortest possible answer.

![Two real Claude Code sessions answering "What does chmod 755 do?" side by side: stock on the left, with the clear-claude plugin on the right](assets/demo-chmod.gif)

![Two real Claude Code sessions answering "How do I find which process is using port 3000 on Linux?" side by side: stock on the left, with the clear-claude plugin on the right](assets/demo-port-3000.gif)

*Real sessions, recorded, not mocked: same question, same model, minutes apart. The only
difference is `--plugin-dir plugins/clear-claude`. It stops when the question is answered.
The waiting is cut out; nothing inside a frame is touched. A third pair,
[disk space](assets/demo-disk-space.gif), is recorded the same way.*

One recording is an anecdote, so the number comes from repeated runs instead: four runs
per arm of three everyday questions averaged **524 → 258 words (−51 %)**, and no plugin
answer was as long as the shortest stock answer to the same question. The raw outputs, the
exact flags, and an earlier take where the plugin's answer came out *longer* are all in
[demo/README.md](demo/README.md).

### #2: "Concise" quietly became "shallow"

**The problem.** Most brevity prompts teach the model to drop things: the warning, the
exact number, the assumption, the tradeoff. You get a shorter answer and a worse one.

**The fix** is a rule Clear Partner states explicitly: *be economical only in what the
user has to read, never in the quality of the work.* Do all the thinking,
investigation, coding, testing, and verification the task requires. Depth is the
default when you ask for it — concision governs the telling, not the doing.

### #3: Nobody can tell if their setup actually works

**The problem.** Claude Code doesn't validate output styles at all. A typo in a
frontmatter field fails silently; a same-named user style shadows the plugin's copy
without a word. `claude plugin validate --strict` passes green on a plugin that
installs, enables, and does nothing.

**The fix** is two read-only diagnostic skills that answer with facts, not impressions:

- `/clear-claude:clear-doctor` — is it installed correctly? Prints a PASS/WARN/FAIL
  table: install state, manifest validity, style frontmatter, settings-layer
  precedence, version match, conflicting styles. Never prints your settings contents.
- `/clear-claude:clear-audit` — is it *actually working*? Walks Claude Code's own
  style-resolution rules to confirm Clear Partner is the active style, and compares
  the style file's SHA-256 against the recorded value so you know the prompt is
  unmodified.

---

## What's inside

**`clear-claude`** — the communication layer:

| Component | Type | What it does |
| --- | --- | --- |
| Clear Partner | Output style | Answer-first, concise-by-default communication. Auto-activates on install. |
| `clear-doctor` | Skill (model-invoked) | Diagnoses the install end to end, prints PASS/WARN/FAIL with remediation. |
| `clear-audit` | Skill (model-invoked) | Verifies the style is active and the file is unmodified. No tone grading. |

This plugin is deliberately tiny: one text file, one manifest, two skills. No hooks, no
MCP servers, no CLAUDE.md, no personality injected through three layers at once.

**`clear-ui`** — the optional status bar:

| Component | Type | What it does |
| --- | --- | --- |
| Status bar | Node script, zero dependencies | Draws only from the JSON Claude Code already pipes to a status line, plus one cached `git status`. No network, no credentials, no transcript parsing. |
| `clear-ui-setup` | Skill over a deterministic script | Plans, backs up, edits one settings key, restores on uninstall. |
| `clear-ui-configure` | Skill over a deterministic script | Presets, single segments, looks. |
| `clear-ui-doctor` | Skill over a deterministic script | Read-only: why is it not showing? |
| Hooks | Documented classic hooks | `SessionStart` re-copies the renderer after a plugin update. The `PostToolUse`, `PostToolUseFailure` and `Stop` hooks behind verification state and the activity row exit at once and record nothing until you opt in. |

Clear UI is code, so unlike Clear Partner it has hooks and a test suite; it injects no
prompt and makes no model call. Details: [plugins/clear-ui/README.md](plugins/clear-ui/README.md).

> Use prompts for judgment. Use deterministic mechanisms for mechanics.

Communication style is a judgment concern, so it lives in exactly one prompt layer —
the output style — and nowhere else. A status bar is mechanics, so it is a script. Each
layer is its own plugin ([ADR 0004](docs/adr/0004-one-plugin-per-layer.md)). The full
reasoning is in [docs/philosophy.md](docs/philosophy.md), and the key decisions are
recorded as [ADRs](docs/adr/).

---

## Evals: what we claim, and what we don't

Six behavioural cases, each run with the plugin **on** and **off** (`claude plugin
eval`, judge: Haiku):

| Case | With style | Without |
| --- | --- | --- |
| correctness-preserved | ✓ 1.0 | ✓ 1.0 |
| concise-by-default | ✓ 1.0 | ✓ 1.0 |
| depth-when-asked | ✓ 1.0 | ✓ 1.0 |
| no-style-leak | ✓ 1.0 | ✓ 1.0 |
| workflow-multi-step | ✓ 1.0 | ✓ 1.0 |
| ambiguous-request | ✓ 1.0 | ✓ 1.0 |

**6/6 both ways. $1.84 total. Delta: zero.** (Claude Code 2.1.274.)

Re-run on Claude Code 2.1.278, same prompt, $1.54: **6/6 with the style again.** The
baseline arm went 5/6 — on the ambiguous request it ran out of turns working instead of
asking, so there was nothing to grade. That is one errored run, not proof the style is
better, and it is recorded that way.

Six more cases, g–l, pin what the demo recordings exposed: when you fix the shape of the
reply — "one sentence", "just the command", "nothing else" — that outranks the style's own
habits, except for one short safety-critical warning. On 0.1.0 "in one sentence" after tool
use came back as two or three sentences, 4 runs in 4; 0.1.1 passes 4 in 4, and the original
six still pass 6/6. The prompt was edited only where a case failed first.

The claim was never "this makes Claude smarter." It's "it doesn't make it dumber."
One run per case is smoke-test evidence, not a benchmark — the suite, the raw
results, and the honest limits are in [docs/evals.md](docs/evals.md).

---

## Roadmap

- [ ] Submit to the official Claude Code marketplace so install is one command
- [x] Re-run evals against a new Claude Code version: 6/6 again on 2.1.278. Repeat per
  release; the suite is cheap (~$2)
- [ ] `clear-doctor` auto-fix mode (currently read-only by design)
- [x] Clear UI: an optional status bar as a second plugin (`clear-ui`, now 0.1.1)
- [x] Clear UI: CI green on Linux, macOS and Windows; its opt-in features (verification
  state, activity row) exercised end to end against real hook payloads on Windows
  ([what that showed](docs/clear-ui-dogfood.md))
- [ ] Clear UI: the same run on a real Mac, which also settles the macOS timing budget
  ([checklist](docs/clear-ui-dogfood.md#checklist-for-a-mac))
- [ ] Claude Mods: Anthropic is shipping function hooks ("Claude Mods",
  [anthropics/claude-code#91870](https://github.com/anthropics/claude-code/issues/91870)).
  When the API is documented and on by default, build the transcript renderer as a
  real mod. `verification-state` no longer waits for it — it shipped inside Clear UI on
  documented classic hooks. Clear Partner itself will never depend on mods.

The phase-by-phase plan is [docs/roadmap-v2.md](docs/roadmap-v2.md).

---

## Docs

Clear Partner (`clear-claude`):

- [docs/install.md](docs/install.md) — full lifecycle: install, update, verify,
  disable, uninstall, recovery
- [docs/troubleshooting.md](docs/troubleshooting.md) — symptom-first fixes, including
  the silent failures no validation catches
- [docs/philosophy.md](docs/philosophy.md) — why answer-first, what "concise" means
  here, prompts-for-judgment vs mechanisms-for-mechanics
- [docs/architecture.md](docs/architecture.md) — design decisions and the
  `force-for-plugin` tradeoff
- [docs/adr/](docs/adr/) — architecture decision records
- [docs/evals.md](docs/evals.md) — the behavioural eval suite, what it proves and
  what it does not
- [docs/research/marketplace-test.md](docs/research/marketplace-test.md) — recorded isolated install
  test: every command, its output, proof the style activates
- [docs/releasing.md](docs/releasing.md) — how to cut a release; a prompt edit is a
  version bump
- [docs/clear-partner-port.md](docs/clear-partner-port.md) — exactly how the shipped
  style differs from the original (one line)
- [docs/research/phase0-research.md](docs/research/phase0-research.md) — verified platform behaviour
  for Claude Code 2.1.274

Clear UI (`clear-ui`):

- [docs/clear-ui-install.md](docs/clear-ui-install.md) — install, what gets written
  and where, configure, uninstall
- [docs/clear-ui-dogfood.md](docs/clear-ui-dogfood.md) — the first end-to-end run with
  real hook payloads, and the same run as a checklist for a Mac
- [plugins/clear-ui/README.md](plugins/clear-ui/README.md) — scripts, looks, file
  layout, tests
- [docs/ui-architecture.md](docs/ui-architecture.md) — every design decision, with the
  measurement behind it
- [docs/roadmap-v2.md](docs/roadmap-v2.md) — phases, what was built differently from
  plan, what is still unverified
- [docs/research/ui-research.md](docs/research/ui-research.md),
  [docs/research/ux-distillation.md](docs/research/ux-distillation.md),
  [docs/research/mods-research-2.1.277.md](docs/research/mods-research-2.1.277.md) — the evidence

Both:

- [demo/README.md](demo/README.md) — how every animated image here was recorded from
  real sessions, what is controlled, the repeated-run numbers and the raw outputs

## License

MIT — see [LICENSE](LICENSE).
