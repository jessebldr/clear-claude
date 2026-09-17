---
name: clear-doctor
description: Diagnose a Clear Claude installation. Checks that the plugin manifest, the Clear Partner output style file and its frontmatter are present and correct, which settings layers exist and which one wins for output styles, installed version vs marketplace version, and conflicting output styles from other plugins or from user/project style files. Use when Clear Claude is installed but Claude is not talking like Clear Partner, after an update, or when the user says "clear doctor", "diagnose clear claude", "check my clear claude install", or "why isn't Clear Partner active".
---

# Clear Doctor

Answer one question: **is Clear Claude installed correctly on this machine, and if not, what exactly is wrong?**

Run checks 1–8, then print one PASS/WARN/FAIL table plus remediation for everything that is not PASS. Report observations, not speculation.

## Hard rules

1. **Never display the contents of a settings file.** You may read a settings file to answer a question, but the only things you may put in the report are: the layer, the path, whether the file exists, and whether it sets the `outputStyle` key. If it does, you may name the style it selects — nothing else. If that value is not a plain style name (a path, an object, anything unexpected), report `set (value withheld)`. Never quote, summarise, paginate or "just show" any other key, and never dump a settings file even if asked mid-run: point the user at the file path instead.
2. **Never modify, create or delete anything.** Doctor reports; the user fixes. Print the remediation commands, do not run them.
3. **Stay portable.** Use the Read and Glob tools for files, and `claude plugin …` for install state. Do not use shell-specific commands (no `ls`/`cat`/`test`, no `Get-ChildItem`/`Test-Path`) — this skill must behave the same on Windows, macOS and Linux.
4. **Unknown is a valid result.** If a check cannot be completed (a path is unreadable, a command is unavailable), mark it `UNKNOWN`, say why in one line, and move on. Do not guess.

## Step 0 — resolve the two roots you need

- **Config home** = the value of the `CLAUDE_CONFIG_DIR` environment variable if it is set, otherwise the `.claude` folder in the user's home directory. Everything called "user-level" below lives under this root, so resolve it first rather than assuming `~/.claude`.
- **Plugin install path** = the `installPath` reported by check 1. Use that path for every file check; never assume where the plugin landed.

## Check 1 — plugin installed and enabled

Run `claude plugin list --json`. Each entry is `{id, version, scope, enabled, installPath}` where `id` is `<name>@<marketplace>`. Find the entry whose id starts with `clear-claude@`.

- Not found → **FAIL**. The plugin is not installed in any scope.
- Found with `"enabled": false` → **FAIL**. Installed but switched off, so the style cannot apply.
- Found and enabled → **PASS**. Report `id`, `version`, `scope`.

Record `installPath`; checks 2–4 and 7 depend on it. If there is more than one `clear-claude@…` entry, report all of them and **WARN**: two installs in different scopes means the one you are inspecting may not be the one that loads.

Remediation — not installed:

```text
claude plugin marketplace add OWNER/clear-claude
claude plugin install clear-claude@clear-claude
```

Remediation — installed but disabled: `claude plugin enable clear-claude`.

## Check 2 — manifest present and valid

Read `<installPath>/.claude-plugin/plugin.json`.

- Missing or not parseable as JSON → **FAIL**.
- `name` is not exactly `clear-claude` → **FAIL** (the install is not Clear Claude, or has been edited).
- `version` missing, or not three dot-separated numbers → **WARN**. Claude Code does not enforce semver, so nothing else will catch this.
- The manifest declares an `outputStyles` field → **WARN**, unless that field explicitly lists `output-styles/clear-partner.md`. Declaring `outputStyles` turns off the automatic scan of the `output-styles/` directory, so a declaration that misses the file silently disables the product. Clear Claude ships without this field on purpose.

Then run `claude plugin validate <installPath> --strict`. Exit 0 → **PASS**; any error or warning → report the tool's own message verbatim as the finding. Note in the report that this command validates the **manifest only** — it does not look at output styles at all, so a clean result here is necessary but not sufficient. Checks 3 and 4 are what cover the style file.

## Check 3 — output style file present

The file must be at `<installPath>/output-styles/clear-partner.md`. Its location is load-bearing: the directory is discovered by convention, so a file moved out of `output-styles/` is simply not loaded.

- Present → **PASS**.
- Missing → **FAIL**. If `output-styles/` contains some other `.md` file, name it; that is the likely cause.

## Check 4 — frontmatter fields correct

Read the YAML frontmatter of `clear-partner.md` (the block between the first two `---` lines) and check all four fields:

| Field | Required value |
| --- | --- |
| `name` | `Clear Partner` |
| `description` | any non-empty string |
| `keep-coding-instructions` | `true` |
| `force-for-plugin` | `true` |

- All four correct → **PASS**.
- `force-for-plugin` missing, `false`, or misspelled → **FAIL**. This is the field that makes the style apply automatically; without it the plugin installs, enables and validates while doing nothing.
- `keep-coding-instructions` missing or `false` → **FAIL**. Claude Code's default engineering instructions would be dropped from the system prompt, which is a capability change, not a style change.
- `name` different from `Clear Partner` → **WARN** and say what it is; check 7 depends on this name.
- Any other key present in the frontmatter → **WARN**. These four are the only output-style frontmatter fields that exist in this version; an unrecognised key is almost always a typo of one of them.

Spelling matters and nothing validates it: the keys are hyphenated and lower-case. `keepCodingInstructions`, `force_for_plugin` and similar are ignored at load time without any error.

## Check 5 — settings layers present and reachable

Three layers, in increasing precedence. Report each as a row: layer, path, exists yes/no, reachable yes/no, sets `outputStyle` yes/no.

| Layer | Path |
| --- | --- |
| user | `<config home>/settings.json` |
| project | `.claude/settings.json` in the project root |
| local | `.claude/settings.local.json` in the project root |

A missing file is normal, not a finding — report it as `absent` and move on. A file that exists but cannot be read or does not parse as JSON is a **WARN**: that layer is being ignored by Claude Code too.

Administrator-managed policy settings sit above all three and are usually not readable from a user session. Do not hunt for them; state in one line that they may exist and would take precedence.

Re-read hard rule 1 before writing this section of the report.

## Check 6 — which layer wins for output styles

Report the winner explicitly, using the rule Claude Code actually applies:

1. If any **enabled plugin** ships an output style with `force-for-plugin: true`, that style wins — it beats the `outputStyle` setting in every layer, including local and policy. If several plugins force a style, the **first one found wins** and Claude Code prints a warning naming all of them.
2. Otherwise the `outputStyle` setting decides, with the layers in precedence order user < project < local < policy: the highest layer that sets the key wins.
3. Otherwise the built-in default applies.

So when checks 1–4 pass, the expected winner is Clear Partner regardless of what the settings layers say — and an `outputStyle` setting that names something else is *not* a fault, it is simply overridden while the plugin is enabled. Say so rather than reporting it as a conflict.

State the winner as one line, e.g. `Winner: Clear Partner (forced by plugin clear-claude; outputStyle in user settings is overridden)`.

## Check 7 — conflicting output styles

Two different conflicts, both worth checking.

**7a — another plugin forces a style.** For every other enabled plugin from check 1, use Glob on `<its installPath>/output-styles/*.md` and read only the frontmatter of anything found. Any file with `force-for-plugin: true` → **WARN**: only one forced style can win, the winner is whichever is found first, and that order is not something you can predict from here. Name the plugin and the style. Remediation: disable one of the two plugins.

**7b — a same-named style shadows the plugin's copy.** Glob `<config home>/output-styles/*.md` and `.claude/output-styles/*.md` in the project, and read the `name:` line of each. If any of them has `name: Clear Partner` (matching check 4's name), that is a **FAIL**, and it is the single most likely reason for "installed but not behaving".

Styles are collected into one table keyed by their frontmatter `name`, and user- and project-level files are applied *after* plugin styles. A user-level file named `Clear Partner` therefore replaces the plugin's entry — including its `force-for-plugin` flag — so the forced activation disappears and Claude Code falls back to the `outputStyle` setting. Nothing reports an error; the plugin still lists as installed and enabled.

This happens most often to people who used Clear Partner as a hand-installed user style before switching to the plugin. Remediation: rename or delete the shadowing file (tell the user the exact path; do not touch it yourself), then restart the session.

Any other style file that does **not** collide by name is not a conflict. Do not list it.

## Check 8 — installed version vs marketplace version

Run `claude plugin list --available --json`, which returns `{installed: […], available: […]}`. Find the `clear-claude` entry in `available` and compare its version with the installed version from check 1.

- Equal → **PASS**.
- Installed older than available → **WARN**, with the two version numbers.
- The marketplace is not in the list, or `available` is empty → **UNKNOWN**: the marketplace catalog is not registered locally, so no comparison is possible.

`claude plugin details clear-claude` gives a second reading (version, source, component inventory) and is worth running when the JSON is ambiguous. Note that output styles never appear in that inventory — their absence there is normal and is not a finding.

Remediation for a stale install, in this order (catalog first, or `update` will not see the new version):

```text
claude plugin marketplace update clear-claude
claude plugin update clear-claude
```

Claude Code reports *"restart required to apply"* — say so, because a user who skips the restart will report that the update did nothing.

## Report format

One table, then remediation, then nothing else. No preamble, no restatement of the checks that passed.

```text
Clear Doctor — <PASS | WARN | FAIL>

| # | Check                     | Result | Detail                         |
|---|---------------------------|--------|--------------------------------|
| 1 | Plugin installed/enabled  | PASS   | clear-claude@clear-claude 0.1.0, user scope |
| … |                           |        |                                |

Winner for output styles: <one line from check 6>

Fix:
1. <action> — <command or exact file path>
```

The overall verdict is the worst single result: any FAIL → FAIL, else any WARN → WARN, else PASS. `UNKNOWN` does not lower the verdict but must appear in the table with its reason.

If everything passes and the user still reports that Claude is not behaving like Clear Partner, add exactly one line: the session must be restarted (or `/reload-plugins` run) after an install or update, and the current style can be confirmed with the `/output-style` command, which lists the available styles and marks the current one.
