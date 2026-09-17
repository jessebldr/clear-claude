# Troubleshooting

Almost every Clear Claude problem is the same problem: **the plugin installs, enables,
and validates while the output style does nothing.** Claude Code does not validate
output styles at all, so this failure is completely silent — no error, no warning, and
`claude plugin list` reports everything as healthy.

Start here:

```text
/clear-claude:clear-doctor
```

It runs the checks below in order and prints a PASS/WARN/FAIL table with the exact fix.
If you would rather diagnose by hand, or want to understand what it found, the sections
below are the same checks written out.

## Symptom → section

| What you see | Go to |
| --- | --- |
| Installed and enabled, but Claude does not talk like Clear Partner | [1](#1-installed-but-the-style-is-not-applying) |
| It worked, then stopped after you added your own style | [3](#3-a-user-level-style-named-clear-partner-shadows-the-plugin) |
| Updated, but nothing changed | [5](#5-version-mismatch-after-an-update) |
| `plugin validate` passes but the style still does nothing | [2](#2-a-typo-in-the-frontmatter-fails-silently), [6](#6-the-style-file-is-in-the-wrong-place) |
| Warning at session start about multiple forced styles | [4](#4-two-plugins-both-force-a-style) |
| Cannot select a different output style | [7](#7-you-cannot-switch-to-another-output-style) |
| Plugin does not load at all, or errors on startup | [install.md → Recovery](install.md#recovery-if-the-plugin-fails-to-load) |

## 1. Installed but the style is not applying

Work through these in order; they are cheapest-first.

**Restart the session.** Installs and updates apply to the *next* session. Claude Code
says *"restart required to apply"* after an update and most people skip it.
`/reload-plugins` picks up changes without a full restart.

**Confirm what is actually active.** Run `/output-style` in a session — it lists the
available styles and marks the current one. `/config` shows the same picker. This is the
only direct observation available; everything else is inference.

**Confirm the plugin is enabled, not merely installed.**

```text
claude plugin list --json
```

Find the entry whose `id` starts with `clear-claude@` and check `"enabled": true`. If it
is `false`, run `claude plugin enable clear-claude`.

**Do not expect to see the style in `plugin details`.** Output styles never appear in
the component inventory in this version. `claude plugin details clear-claude` listing
two skills and no style is correct behaviour, not a finding.

If all of that is fine, the cause is one of sections 2, 3, or 6.

## 2. A typo in the frontmatter fails silently

**This is the highest-risk failure in the whole system, and nothing anywhere reports
it.** Output styles get no validation: not from the manifest, not from
`claude plugin validate`, not at load time. A misspelled key is ignored, and the plugin
installs, enables, and validates while doing nothing.

Open `<installPath>/output-styles/clear-partner.md` and compare the frontmatter
character by character. These four keys are the complete set that exists in 2.1.274 —
lower-case, hyphenated:

```yaml
---
name: Clear Partner
description: Clear, conversational technical partner. Answer-first, plain English, concise by default, deep when needed.
keep-coding-instructions: true
force-for-plugin: true
---
```

| Wrong | Right | What happens |
| --- | --- | --- |
| `force_for_plugin` | `force-for-plugin` | ignored — style never activates |
| `forceForPlugin` | `force-for-plugin` | ignored — style never activates |
| `force-for-plugins` | `force-for-plugin` | ignored — style never activates |
| `keepCodingInstructions` | `keep-coding-instructions` | ignored — coding instructions drop out |
| `force-for-plugin: "true"` | `force-for-plugin: true` | quoted string, not a boolean |

Any **fifth** key is also a warning sign. There are no other output-style frontmatter
fields in this version, so an unrecognised key is nearly always a typo of one of these
four.

Find `<installPath>` with `claude plugin list --json`. `clear-doctor` check 4 does this
comparison for you, and `clear-audit` part B additionally verifies the whole file by
SHA-256.

## 3. A user-level style named `Clear Partner` shadows the plugin

**The most common cause of "it was working and now it isn't", and the one that looks
healthiest from the outside.**

Claude Code collects every output style into a **single table keyed by the frontmatter
`name`**. Plugin styles are applied **first**, then user-level, then project-level. A
later source with the same name **replaces** the earlier entry outright.

So a file at `~/.claude/output-styles/anything.md` whose frontmatter says
`name: Clear Partner` replaces the plugin's entry — **and takes `force-for-plugin: true`
with it**, because that flag lives in the replaced entry. Auto-activation disappears,
Claude Code falls back to the `outputStyle` setting, and:

- `claude plugin list` still reports the plugin as installed and enabled.
- `claude plugin validate --strict` still passes.
- No error, no warning, nowhere.

The file name is irrelevant. Only the `name:` inside the frontmatter matters.

**This is the migration case.** It happens to everyone who ran Clear Partner as a
hand-installed user-level style *before* switching to the plugin — which includes this
project's own author. The old file is still sitting there, quietly winning.

### Detect

Look in both locations for a file whose frontmatter `name` is `Clear Partner`:

- user level: `~/.claude/output-styles/*.md` — or `$CLAUDE_CONFIG_DIR/output-styles/*.md`
  if you have set `CLAUDE_CONFIG_DIR`
- project level: `.claude/output-styles/*.md` in the project root

`clear-doctor` check 7b and `clear-audit` step A3 both do exactly this and report the
offending path.

### Fix

Rename or delete the shadowing file, then restart the session. Renaming the *file* is
not enough — change the `name:` in its frontmatter, or remove the file. If you want to
keep your customised version, give it a distinct name such as `Clear Partner (mine)`;
it will then coexist with the plugin's copy, though the plugin's forced style will still
win while the plugin is enabled.

Neither diagnostic skill will touch that file for you. An unexplained style file is
information you need, and deleting it automatically would destroy the evidence.

## 4. Two plugins both force a style

Only one forced style can win, and the winner is **whichever is discovered first** —
which is not something you can predict from the filesystem.

Claude Code prints a warning naming all of them at session start:
`Multiple plugins have forced output styles: …`. Read the winner there.

**Fix:** disable one of the two plugins. `clear-doctor` check 7a and `clear-audit` step
A4 detect this and report it as INDETERMINATE rather than guessing.

## 5. Version mismatch after an update

If `update` appears to have done nothing, it is one of these three:

**You skipped the catalog.** `claude plugin update` only sees versions the local catalog
knows about. Always run both, in this order:

```text
claude plugin marketplace update clear-claude
claude plugin update clear-claude
```

**You skipped the restart.** Claude Code prints *"restart required to apply"*. Restart
the session, or run `/reload-plugins`.

**You updated a different scope.** `update` defaults to `--scope user`. If you installed
with `--scope project`, pass `-s project`.

To see the two versions side by side:

```text
claude plugin list --available --json     # --available requires --json
```

Compare the installed entry's `version` against the `available` entry's. `clear-doctor`
check 8 does this and reports UNKNOWN if the marketplace is not registered locally,
which is itself the answer in some cases — a plugin installed from a path you have since
removed has nothing to compare against.

## 6. The style file is in the wrong place

The output style is discovered **by convention**: Claude Code scans
`<plugin-root>/output-styles/`. The location is load-bearing. A file moved, renamed into
a subdirectory, or left at the plugin root is simply never loaded, and nothing reports
it.

The file must be exactly at:

```text
<installPath>/output-styles/clear-partner.md
```

There is a second way to break this. If `plugin.json` declares an `outputStyles` field,
that declaration **replaces** the automatic directory scan — so a declaration that omits
the file disables the style. Clear Claude ships without the field on purpose. If you see
`outputStyles` in the manifest of your install, either remove it or make sure it lists
`output-styles/clear-partner.md`.

(Skills behave the opposite way: declared `skills` paths are loaded *in addition to* the
directory scan, which is why the manifest declares those.)

## 7. You cannot switch to another output style

This is designed behaviour, not a bug. While Clear Claude is enabled, `force-for-plugin`
makes Clear Partner win over the `outputStyle` setting in **every** layer — user,
project, local, and policy. The `/config` picker will appear to be overridden, because
it is.

```text
claude plugin disable clear-claude
```

Then pick your style. `claude plugin enable clear-claude` brings Clear Partner back.
There is no partial or per-project override; `force-for-plugin` is the only
auto-activation control this version provides, and it is all-or-nothing. The reasoning
is in [architecture.md](architecture.md); the philosophy behind accepting that tradeoff
is in [philosophy.md](philosophy.md).

A related non-problem: an `outputStyle` setting in your `settings.json` that names a
different style is **not** a conflict while the plugin is enabled. It is simply
overridden, and it will take effect again the moment you disable the plugin.
`clear-doctor` reports it as overridden rather than as a fault.

## 8. The style file has been modified

If Clear Partner is active but behaving differently than documented, the prompt itself
may have been edited — by you, by a merge, or by a line-ending conversion.

```text
/clear-claude:clear-audit
```

Part B hashes the installed file and compares it against the recorded SHA-256 in
[clear-partner-port.md](clear-partner-port.md), then classifies any mismatch:

- **CRLF line endings** — a Git checkout with `core.autocrlf=true`. The text is probably
  intact; the hash cannot be verified until the file is stored with LF endings.
- **Size matches, hash differs** — a content edit of the same length.
- **Size differs** — content added or removed, reported as a byte delta.
- **Record drift** — the checksum in the docs and the one inside the skill disagree.
  One was updated without the other, and until that is resolved neither is trustworthy.

Audit never restores or overwrites the file. If you edited it deliberately, that is
fine — but treat it as a product change: bump the version, update both checksum records,
and re-run the evals. An edited prompt is a different prompt, and the behavioural
evidence in [evals.md](evals.md) was gathered against the exact shipped wording.

## Running the diagnostics

Both skills ship with the plugin and are **strictly read-only**. They inspect, they
report, and they print the fixes for you to run — they never edit a file, change a
setting, or delete anything.

```text
/clear-claude:clear-doctor
/clear-claude:clear-audit
```

Plain language works too ("diagnose my Clear Claude install", "is Clear Partner really
active?"), since that is what each skill's description matches against.

| | `clear-doctor` | `clear-audit` |
| --- | --- | --- |
| Answers | Is it installed correctly? | Is it actually active, and unmodified? |
| Checks | plugin enabled and scope · manifest validity · style file present · all four frontmatter fields · settings layers and which one wins · installed vs marketplace version · conflicting styles | activation derived from Claude Code's own resolution rules · frontmatter exactness · SHA-256 and size of the style file · manifest agreement |
| Output | PASS/WARN/FAIL table plus remediation | two verdicts plus a classified deviation list |
| Run it | when something is wrong | after an install, update, or an edit to the prompt |

**Neither prints the contents of your settings files.** They may read a settings file to
work out precedence, but the report contains only the layer, the path, and whether that
file sets `outputStyle`. If that value is anything other than a plain style name, it is
reported as `set (value withheld)`.

Neither one judges whether recent answers *feel* like Clear Partner. A model grading its
own tone is not evidence — that is what the [behavioural evals](evals.md) are for.

## Still stuck

Collect these four things before opening an issue. Together they identify almost every
remaining case:

```text
claude --version
claude plugin list --json
claude plugin validate <installPath> --strict
```

plus the frontmatter block of your `output-styles/clear-partner.md` (the first five
lines), or the full `clear-doctor` table, which contains all of it.

Redact nothing from the diagnostic output except paths you consider private — it
contains no settings contents by design.
