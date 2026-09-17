# Architecture

Clear Claude is one output style delivered through the native Claude Code plugin
system. This document records the decisions behind that, and what each one costs.

Every platform claim here traces back to [phase0-research.md](phase0-research.md),
which was verified against Claude Code **2.1.274** and tags each fact with how it was
obtained. Where this document depends on a researched fact, it names the section.

## The shape of the thing

```text
clear-claude/                          ← the repository is also the marketplace
├── .claude-plugin/marketplace.json    ← marketplace manifest
├── plugins/
│   └── clear-claude/                  ← the plugin
│       ├── .claude-plugin/plugin.json ← plugin manifest
│       └── output-styles/
│           └── clear-partner.md       ← the entire product
├── docs/
├── README.md
├── LICENSE
├── CHANGELOG.md
└── .gitignore
```

One repository serves as both marketplace and plugin host. The marketplace entry
points at the plugin with a relative path (`"source": "./plugins/clear-claude"`), which
is a verified `source` form — a bare URL string is rejected (research §2).

The `plugins/` directory layer exists so a second plugin can be added later without
restructuring. It is the one piece of structure here that anticipates the future rather
than serving the present, and it costs one directory.

Directories the original plan called for but that do not exist yet — `skills/`,
`evals/`, `tests/`, `experimental/` — are omitted on purpose. An empty directory with a
placeholder README teaches a reader nothing and makes the repository look larger than
it is. They will be created when they hold something.

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
something required. It can do everything required.

## Versioning

Semantic versioning, starting at `0.1.0`, set identically in `plugin.json` and in the
marketplace entry.

Research §1 records that Claude Code performs **no semver enforcement** — the string
`"notsemver"` validates clean even under `--strict` — while `claude plugin tag` builds a
`{name}--v{version}` git tag out of whatever is there. Nothing will catch a malformed
version for us, so the discipline has to be ours.

Because the product *is* a prompt, an edit to `clear-partner.md` is a behaviour change
and gets a version bump and a CHANGELOG entry, the same as a code change would. Prompt
edits do not ride along inside unrelated commits.
