# Clear Claude

**Make Claude Code easier to understand without making it less capable.**

Clear Claude is a small Claude Code plugin. It ships one thing: the **Clear Partner**
output style, which changes *how Claude talks to you* — answer first, plain English,
concise by default, deep when you ask for depth — while leaving Claude Code's
engineering behaviour fully intact.

> Do all the thinking, investigation, coding, testing, and verification the task
> requires. Be economical only in what the user has to read, never in the quality
> of the work.

Not published yet. Replace `OWNER` below with the GitHub owner once this repo is
pushed. Until then, use the local-path form shown under [Install from a local
checkout](#install-from-a-local-checkout).

---

## Install

Two commands, identical on Windows, macOS, and Linux:

```text
claude plugin marketplace add OWNER/clear-claude
claude plugin install clear-claude@clear-claude
```

Inside a running Claude Code session, the same two steps are `/plugin marketplace add`
and `/plugin install`.

`install` defaults to `--scope user`, which is what you want for a personal machine.
For a shared repo, use `--scope project` so the plugin travels with the project.

That is the whole setup. **There is no activation step** — Clear Partner declares
`force-for-plugin: true`, so it applies automatically whenever the plugin is enabled.
See [the tradeoff](#what-force-for-plugin-costs-you) below.

New plugins load on the next session. To pick it up immediately in the current
session, run `/reload-plugins`.

Scopes, CI flags, session-only loading, and the full command reference are in
[docs/install.md](docs/install.md).

### Install from a local checkout

Useful before publication, or for testing a change:

```text
claude plugin marketplace add /path/to/clear-claude
claude plugin install clear-claude@clear-claude
```

Point `add` at the directory containing `.claude-plugin/marketplace.json` — this
repository root. Use your platform's own path syntax; Claude Code accepts a Windows
path here just as it accepts a POSIX one.

## Update

```text
claude plugin marketplace update clear-claude
claude plugin update clear-claude
```

Update the marketplace catalog first, then the plugin — otherwise `update` will not
see the new version. Claude Code reports **"restart required to apply"**; restart the
session to pick up the new style.

## Verify

```text
claude plugin list
claude plugin details clear-claude
```

`list` shows whether the plugin is installed and enabled. `details` prints the
component inventory and a projected token cost.

To confirm Clear Partner itself is active, run `/output-style` in a session — it lists
the available styles and marks the current one. `/config` shows the same thing in its
Output style picker.

For a full check, the plugin ships two diagnostic skills — see
[Diagnostics](#diagnostics) below. If something is wrong, go straight to
[docs/troubleshooting.md](docs/troubleshooting.md).

To check the manifests in a checkout of this repo (this is what CI runs):

```text
claude plugin validate . --strict
claude plugin validate plugins/clear-claude --strict
```

`--strict` treats warnings as errors and exits 1, so it is safe to gate on.

## Uninstall

```text
claude plugin uninstall clear-claude
claude plugin marketplace remove clear-claude
```

`uninstall` defaults to `--scope user`; pass `-s project` or `-s local` if you
installed it there. Omitting `--scope` on `marketplace remove` removes it from every
scope. Add `--keep-data` to `uninstall` if you want `~/.claude/plugins/data/{id}/`
preserved.

---

## Diagnostics

Two skills ship with the plugin. Both are **read-only**: they inspect, they report, and
they never edit a file or change a setting — the fixes are printed for you to run.

Invoke either by name in a session:

```text
/clear-claude:clear-doctor
/clear-claude:clear-audit
```

Asking in plain language works too ("diagnose my Clear Claude install", "is Clear
Partner really active?"), since that is what each skill's description matches against.

### `clear-doctor` — is it installed correctly?

Checks the install end to end and prints a PASS/WARN/FAIL table with remediation:

- plugin installed, enabled, and in which scope
- `plugin.json` present and valid, including a `claude plugin validate --strict` run
- `output-styles/clear-partner.md` present, and its four frontmatter fields correct —
  the thing nothing else in Claude Code validates
- which settings layers (user, project, local) exist and are reachable, and which layer
  wins for output styles
- installed version vs marketplace version
- conflicting output styles: another plugin forcing its own style, or a user/project
  style file that shares the name `Clear Partner` and silently shadows the plugin's copy

It reports the **existence and precedence** of your settings files. It never prints
their contents — the report names the layer, the path, and whether that file sets
`outputStyle`, and nothing else.

### `clear-audit` — is it actually working?

Doctor asks whether the install is correct. Audit asks two sharper questions and answers
both with facts rather than impressions:

1. **Is Clear Partner the active style**, not merely installed? Derived by walking
   Claude Code's own resolution rules — plugin enabled, `force-for-plugin: true`
   present, no same-named style shadowing it, no competing forced style from another
   plugin.
2. **Is the style file unmodified?** The prompt is the product, so the file's SHA-256 is
   compared against the value recorded in
   [docs/clear-partner-port.md](docs/clear-partner-port.md), and every deviation is
   reported and classified (content edit, CRLF conversion, record drift).

There is deliberately no judgement of whether recent answers *feel* like Clear Partner.
A model grading its own tone is not evidence; that is what behavioural evals are for.

---

## Turning it off without uninstalling

```text
claude plugin disable clear-claude
claude plugin enable clear-claude
```

`disable` and `enable` auto-detect the scope. Disabling removes Clear Partner's
influence completely — Claude Code returns to its default communication style.

## Switching to a different output style

While Clear Claude is **enabled**, Clear Partner is forced. To use another output
style, disable the plugin first:

```text
claude plugin disable clear-claude
```

Then pick your style in `/config`. Re-enable with `claude plugin enable clear-claude`
when you want Clear Partner back. This is the deliberate tradeoff of the
auto-activation design — see [docs/architecture.md](docs/architecture.md).

## Recovery if the plugin fails to load

Work down this list; each step is more aggressive than the last.

1. **Re-validate the manifests** — `claude plugin validate . --strict` in a checkout.
   A malformed `plugin.json` is the most common cause.
2. **Reload without restarting** — `/reload-plugins` in the session.
3. **Disable just this plugin** — `claude plugin disable clear-claude`.
4. **Start a session with all plugins off** — `claude --safe-mode` disables CLAUDE.md,
   skills, plugins, hooks, MCP servers, custom commands and agents, output styles,
   workflows, custom themes, and keybindings. `claude --bare` is the lighter version:
   it skips hooks, LSP, and plugin settings. Either gets you a working session from
   which to fix the config.
5. **Disable every plugin** — `claude plugin disable --all`.
6. **Remove it entirely** — the [Uninstall](#uninstall) commands above.

Nothing in Clear Claude writes to your settings, so uninstalling leaves no residue
to clean up by hand.

If the plugin loads but Clear Partner is not in effect, that is a different failure —
see [docs/troubleshooting.md](docs/troubleshooting.md). The most common cause is a
user-level output style that shares the name `Clear Partner` and silently shadows the
plugin's copy.

---

## Cross-machine use

Clear Claude is one text file plus two JSON manifests. It contains no absolute paths,
no symlinks, no shell scripts, no Node dependencies, and no OS-specific logic — so
the Windows, macOS, and Linux install is *the same two commands*, not three
documented variants.

The commands above are the complete instruction set for every platform. There is no
Windows section in this README because there is nothing different to say.

| Claim | Status |
| --- | --- |
| Manifests validate against Claude Code 2.1.274 | Verified on Linux |
| Package contains no platform-specific content | Verified by inspection |
| Install flow behaves identically on Windows | Not yet verified |
| Install flow behaves identically on macOS | Not yet verified |

## What `force-for-plugin` costs you

Clear Partner sets `force-for-plugin: true`, the only auto-activation mechanism Claude
Code 2.1.274 provides for plugin output styles. The benefit is that installing the
plugin is the entire setup, on every machine. The cost is that you cannot conveniently
select a different output style while the plugin is enabled.

That tradeoff is reversible in one command (`claude plugin disable clear-claude`) and
is the reason the plugin does not touch your `settings.json`. The full reasoning is in
[docs/architecture.md](docs/architecture.md).

---

## How Clear Claude is built

The plugin is deliberately tiny:

```text
plugins/clear-claude/
├── .claude-plugin/plugin.json
├── output-styles/clear-partner.md
└── skills/
    ├── clear-doctor/SKILL.md
    └── clear-audit/SKILL.md
```

One output style, plus two read-only diagnostic skills that exist only to check that
the output style is installed and working. No CLAUDE.md, no hooks, no MCP servers, no
personality prompt injected through three layers at once.

That is a design position, not an accident. Claude Code has distinct layers and each
one has a job:

```text
Output Style   → how Claude communicates
CLAUDE.md      → what Claude knows about a project
Skills         → reusable workflows
Hooks          → deterministic event automation
```

> Use prompts for judgment. Use deterministic mechanisms for mechanics.

Communication style is a judgment concern, so it belongs in exactly one prompt layer —
the output style — and nowhere else.

**Why not a giant CLAUDE.md?** Because CLAUDE.md is project knowledge. Putting
communication rules there means re-pasting them into every repo you work in, and they
compete for attention with facts about the actual codebase.

**Why not repeat the rules in several layers?** Because duplicated instructions do not
reinforce each other. They consume context, drift apart as you edit one copy and not
the others, and produce contradictions the model has to resolve at runtime.

**What "concise" means here.** The least text that fully communicates the answer — not
the shortest possible answer. Clear Partner explicitly forbids dropping a warning,
constraint, assumption, exact number, scope condition, or tradeoff in order to make a
response shorter. Brevity applies to what you read, never to the work.

The full reasoning, rule by rule, is in [docs/philosophy.md](docs/philosophy.md).

## Documentation

- [docs/philosophy.md](docs/philosophy.md) — why answer-first, what "concise" means
  here, and the prompts-for-judgment / mechanisms-for-mechanics split.
- [docs/install.md](docs/install.md) — the full lifecycle: install, update, verify,
  disable, uninstall, switch away, recover, with scopes and CI flags.
- [docs/troubleshooting.md](docs/troubleshooting.md) — symptom-first fixes, including
  the silent failures that no validation catches.
- [docs/architecture.md](docs/architecture.md) — design decisions, including the
  `force-for-plugin` choice and its tradeoff.
- [docs/evals.md](docs/evals.md) — the behavioural eval suite, what it proves, and what
  it does not.
- [docs/clear-partner-port.md](docs/clear-partner-port.md) — exactly how the shipped
  output style differs from the behaviourally tested original.
- [docs/phase0-research.md](docs/phase0-research.md) — verified platform behaviour for
  Claude Code 2.1.274, with an evidence tier on every claim.
- [experimental/mods/README.md](experimental/mods/README.md) — research note on "Mods" /
  function hooks. Nothing ships from there; the stable plugin depends on none of it.

## License

MIT — see [LICENSE](LICENSE).
