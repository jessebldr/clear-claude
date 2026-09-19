# Architecture

Clear Claude is a marketplace of two independent plugins, one per layer
([ADR 0004](adr/0004-one-plugin-per-layer.md)):

- **`clear-claude`** — Clear Partner, one output style delivered through the native
  Claude Code plugin system, plus two diagnostic skills. It writes nothing outside
  itself and depends on nothing.
- **`clear-ui`** — an optional status bar. It is code: a Node renderer, a setup script
  that edits one key of the user's `settings.json`, and documented classic hooks. Its
  architecture is recorded separately, in [ui-architecture.md](ui-architecture.md).

Installing one never installs or changes the other, and they share no code and no
prompt. This document records the decisions behind the `clear-claude` plugin and the
repository they share, and what each one costs. Where a decision below says "the
plugin", it means `clear-claude`.

Every platform claim here traces back to [phase0-research.md](phase0-research.md),
which was verified against Claude Code **2.1.274** and tags each fact with how it was
obtained. Where this document depends on a researched fact, it names the section.

## The shape of the thing

```text
clear-claude/                          ← the repository is also the marketplace
├── .claude-plugin/marketplace.json    ← marketplace manifest
├── plugins/
│   ├── clear-claude/                  ← the communication layer
│   │   ├── .claude-plugin/plugin.json ← plugin manifest
│   │   ├── output-styles/
│   │   │   └── clear-partner.md       ← the entire product
│   │   ├── skills/
│   │   │   ├── clear-doctor/SKILL.md  ← install diagnostics
│   │   │   └── clear-audit/SKILL.md   ← activation + conformance checks
│   │   └── evals/                     ← behavioural eval cases (docs/evals.md)
│   └── clear-ui/                      ← the optional status bar (ui-architecture.md)
│       ├── .claude-plugin/plugin.json
│       ├── bin/  src/                 ← entry points and the renderer
│       ├── hooks/hooks.json           ← documented classic hooks
│       ├── skills/                    ← setup, configure, doctor
│       └── test/  bench/
├── experimental/                      ← mods research and function-hook spikes;
│                                        never listed in the marketplace
├── source/clear-partner.md            ← the original style, before the port
├── docs/
├── README.md
├── LICENSE
├── CHANGELOG.md
└── .gitignore
```

One repository serves as both marketplace and plugin host. Each marketplace entry
points at its plugin with a relative path (`"source": "./plugins/clear-claude"`), which
is a verified `source` form — a bare URL string is rejected (research §2).

The `plugins/` directory layer existed from the first commit so a second plugin could be
added without restructuring. It was the one piece of structure that anticipated the
future rather than serving the present; `clear-ui` is that second plugin, and adding it
moved nothing.

Directories are created when they hold something, never as placeholders: an empty
directory with a README teaches a reader nothing and makes the repository look larger
than it is. `evals/`, `experimental/` and `clear-ui`'s `test/` arrived that way.

## Decision: automatic activation via `force-for-plugin`

**Chosen: the plugin activates Clear Partner automatically while it is enabled.**

`clear-partner.md` carries `force-for-plugin: true` in its frontmatter. Research §6
confirms this field, its meaning (*"the style applies automatically when this plugin is
enabled"*), and — importantly — that it is the **only** auto-activation control that
exists for output styles in 2.1.274. There is no glob trigger, no model condition, no
per-project rule. The choice was therefore binary: use this field, or require every
user to select the style by hand on every machine.

### Why

The problem Clear Claude solves is *the same setup on several computers*. An activation
step that must be repeated per machine reintroduces exactly the manual work the plugin
exists to remove. `force-for-plugin` makes `install` the complete setup.

It is also the honest mechanism. The alternative way to get automatic activation would
be to write an `outputStyle` entry into the user's `settings.json` — which is not
something a plugin should do. It survives uninstall, it is invisible to
`claude plugin list`, and it silently overwrites a preference the user may have set
deliberately. `force-for-plugin` is scoped to the plugin's own lifetime by design.

### The tradeoff

**While Clear Claude is enabled, the user cannot conveniently use a different output
style.** The forced style wins. Someone who switches between several styles will find
the picker in `/config` effectively overridden.

The mitigations are that the cost is visible, reversible, and cheap:

- Reversible in one command: `claude plugin disable clear-claude` restores normal
  output-style selection immediately.
- Fully removed by uninstalling — no leftover setting, because nothing was written
  outside the plugin.
- Documented at the top of the README rather than buried here, so a user meets the
  constraint before installing rather than after being confused by it.

This is the right side of the trade for a plugin whose entire content *is* an output
style. A plugin that shipped a style as one component among many should reach the
opposite conclusion.

### What was rejected

**Option B — ship the style, let the user select it once.** Less invasive, and better
for someone who rotates between styles. Rejected because it adds a manual step per
machine to a project whose stated purpose is removing manual steps per machine, and
because the step is easy to forget: the plugin would appear installed and enabled while
doing nothing at all.

**Editing the user's `settings.json`** — rejected outright, for the reasons above.

## Decision: the output style is discovered by convention, not declared

`plugin.json` has an `outputStyles` field that accepts a directory or a list of paths
(research §1). Clear Claude does **not** use it.

`claude plugin init --with output-style` — Claude Code's own scaffolder — writes
`output-styles/<name>.md` and does not add a manifest entry (research §1, §6). Since
convention-based discovery is the path the first-party tooling produces, it is the path
with the most evidence behind it. Declaring the directory as well would be redundant at
best and is untested in this version.

The practical consequence: **the file's location is load-bearing.** Moving
`clear-partner.md` out of `output-styles/` silently disables the product.

## The validation gap, and what it means for us

Research §6 and open question 9 establish something worth designing around: output
styles get **no validation at all**. `claude plugin validate` checks the manifest only —
a bogus frontmatter key in an output style validates clean, and output styles do not
appear in `claude plugin details` either.

So a typo in `force-for-plugin` would fail *silently at runtime*: the plugin would
install, enable, validate, and simply not do its job.

Two consequences for this repo:

1. `claude plugin validate --strict` passing is necessary but **not sufficient**
   evidence that Clear Claude works. Behavioural testing is the only real check.
2. The four frontmatter keys in `clear-partner.md` are spelled exactly as research §6
   verified them, and should be treated as a fixed list: `name`, `description`,
   `keep-coding-instructions`, `force-for-plugin`. No others are known to exist.

## Decision: two skills, and why they are deterministic

The validation gap above is the reason `clear-doctor` and `clear-audit` exist. Claude
Code will happily install, enable and validate a plugin whose output style is never
loaded. Something has to close that gap, and the only honest way to close it is to check
files and command output rather than to ask the model how it feels the responses are
going.

So both skills are written as check procedures with fixed decision rules. Every finding
names a path, a command's output, or a hash. Neither skill contains a "judge whether the
tone is clear" instruction — that belongs to behavioural evals, where a response is
graded against a rubric, not to a diagnostic that a user runs when something is already
broken.

The split between them is the split between two different questions:

| | `clear-doctor` | `clear-audit` |
| --- | --- | --- |
| Question | Is it installed correctly? | Is it actually working, and unmodified? |
| Output | PASS/WARN/FAIL table with remediation | Two verdicts plus a deviation list |
| Typical trigger | "it isn't working" | after an install, update, or an edit to the prompt |

Both are strictly read-only. A diagnostic that repairs things is a diagnostic you cannot
trust the second time you run it, and "fixing" a modified `clear-partner.md` by
overwriting it would destroy the only evidence that someone changed the product.

The privacy rule in `clear-doctor` is deliberately stricter than it needs to be: it may
read a settings file to work out precedence, but the report may only contain the layer,
the path, and whether that file sets `outputStyle`. A diagnostic tool that prints
`settings.json` into a terminal — or into a transcript — is a small data leak with no
diagnostic benefit, because the answer the user needs is *which layer wins*, not *what
else is in the file*.

### The failure mode worth naming

The highest-value check in either skill is the one for a **user-level output style
named `Clear Partner`**. Styles are collected into a single table keyed by their
frontmatter `name`, and plugin styles are applied *before* user- and project-level ones,
so a same-named file at user level replaces the plugin's entry along with its
`force-for-plugin` flag. The plugin then lists as installed and enabled while doing
nothing, and nothing anywhere reports an error.

This is not hypothetical: it is exactly what happens to someone who ran Clear Partner as
a hand-installed user style before switching to the plugin — which is the migration path
this project's own author took.

## Decision: the skills are declared in the manifest

`plugin.json` lists both skill directories explicitly:

```jsonc
"skills": ["./skills/clear-doctor", "./skills/clear-audit"]
```

This is the opposite of the choice made for `outputStyles` above, so it deserves a
reason. The two fields do not behave the same way. `outputStyles`, when set, *replaces*
the automatic scan of `output-styles/` — a declaration that misses a file silently
disables it. Declared `skills` paths are loaded *in addition to* the `skills/` scan, so
declaring them adds information without taking any away.

The benefit is that the manifest states the plugin's contents instead of leaving them
implicit in a directory listing. The risk worth checking was double-registration, since
both skills are also found by the automatic scan. Verified against an isolated install:
`claude plugin details clear-claude` reports `Skills (2) clear-audit, clear-doctor` —
each skill once, ~286 tokens always-on for the pair.

## Decision: `keep-coding-instructions: true`

Preserved from the original style, unchanged. Clear Partner changes how Claude
communicates, not what it is capable of. Dropping the default coding instructions would
make it a different product — a cheaper, worse one — and would contradict the project's
one-line thesis.

## Decision: plugin-first distribution, no install scripts

Distribution is the native plugin system and nothing else. No dotfile copying, no
`install.sh`, no `install.ps1`.

This is what makes the cross-platform story trivially true rather than laboriously
tested. The package is one Markdown file and two JSON files; there is no shell to
depend on, no home directory to resolve, no symlink to create, and no Node path to
guess. Claude Code itself absorbs every platform difference, so Windows, macOS, and
Linux share not just the same package but the same commands.

A shell installer would be justified only if the native mechanism could not do
something required. For `clear-claude` it can do everything required.

`clear-ui` is the case where it cannot, and the rule was applied rather than bent. A
plugin cannot register a status line — Claude Code honours only `agent` and
`subagentStatusLine` from a plugin's own settings — so something has to name it in the
user's `settings.json`. That something is one deterministic Node script
(`bin/setup.mjs`: plan, back up, edit one key, restore on uninstall), still delivered
through the plugin system and still one file for all three platforms; there is no
`install.sh` and no `install.ps1` there either. The cost is confined to the plugin that
needs it, which is one reason the layers are separate plugins: installing Clear Partner
can never edit settings. See [ADR 0004](adr/0004-one-plugin-per-layer.md) and
[ui-architecture.md](ui-architecture.md).

## Versioning

Semantic versioning. Each plugin carries its own version, set identically in its
`plugin.json` and in its marketplace entry; both plugins started at `0.1.0`. The
marketplace's own `metadata.version` tracks the newest change to either plugin, so
`clear-ui` 0.1.0 debuts in marketplace 0.2.0 while `clear-claude` stays at 0.1.0. The
plan is in [roadmap-v2.md](roadmap-v2.md#versions); the mechanics are in
[releasing.md](releasing.md).

Research §1 records that Claude Code performs **no semver enforcement** — the string
`"notsemver"` validates clean even under `--strict` — while `claude plugin tag` builds a
`{name}--v{version}` git tag out of whatever is there. Nothing will catch a malformed
version for us, so the discipline has to be ours.

Because the product *is* a prompt, an edit to `clear-partner.md` is a behaviour change
and gets a version bump and a CHANGELOG entry, the same as a code change would. Prompt
edits do not ride along inside unrelated commits.
