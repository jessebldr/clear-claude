![clear-claude](assets/hero.png)

# Clear Claude

**Make Claude Code easier to understand without making it less capable.**

My Claude Code talked like it was paid per word. So I fixed the communication layer —
one output style, two diagnostic skills, zero config surgery — and proved with real
evals that the fix doesn't make Claude dumber.

---

## Install (30-second setup)

Two commands, identical on Windows, macOS, and Linux:

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

| Component | Type | What it does |
| --- | --- | --- |
| Clear Partner | Output style | Answer-first, concise-by-default communication. Auto-activates on install. |
| `clear-doctor` | Skill (model-invoked) | Diagnoses the install end to end, prints PASS/WARN/FAIL with remediation. |
| `clear-audit` | Skill (model-invoked) | Verifies the style is active and the file is unmodified. No tone grading. |

Deliberately tiny: one text file, two JSON manifests, two skills. No hooks, no MCP
servers, no CLAUDE.md, no personality injected through three layers at once.

> Use prompts for judgment. Use deterministic mechanisms for mechanics.

Communication style is a judgment concern, so it lives in exactly one prompt layer —
the output style — and nowhere else. The full reasoning is in
[docs/philosophy.md](docs/philosophy.md), and the key decisions are recorded as
[ADRs](docs/adr/).

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

**6/6 both ways. $1.84 total. Delta: zero.**

The claim was never "this makes Claude smarter." It's "it doesn't make it dumber."
One run per case is smoke-test evidence, not a benchmark — the suite, the raw
results, and the honest limits are in [docs/evals.md](docs/evals.md).

---

## Roadmap

- [ ] Submit to the official Claude Code marketplace so install is one command
- [ ] Re-run evals against new Claude Code versions (the suite is cheap: ~$2)
- [ ] `clear-doctor` auto-fix mode (currently read-only by design)
- [ ] Claude Mods: Anthropic is shipping function hooks ("Claude Mods",
  [anthropics/claude-code#91870](https://github.com/anthropics/claude-code/issues/91870)).
  When the API is stable, build the `experimental/mods` ideas
  (`verification-state`, `context-hygiene`) as real mods. Clear Partner itself
  will never depend on them.

---

## Docs

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
- [docs/marketplace-test.md](docs/marketplace-test.md) — recorded isolated install
  test: every command, its output, proof the style activates
- [docs/releasing.md](docs/releasing.md) — how to cut a release; a prompt edit is a
  version bump
- [docs/clear-partner-port.md](docs/clear-partner-port.md) — exactly how the shipped
  style differs from the original (one line)
- [docs/phase0-research.md](docs/phase0-research.md) — verified platform behaviour
  for Claude Code 2.1.274

## License

MIT — see [LICENSE](LICENSE).
