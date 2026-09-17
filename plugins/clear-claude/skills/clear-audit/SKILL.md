---
name: clear-audit
description: Verify that the Clear Partner output style is genuinely active in this session and that the shipped style file is unmodified. Derives activation from the plugin's own resolution rules, and checks the style file's frontmatter and SHA-256 against the recorded expected values, reporting every deviation as a fact. Use after installing, updating or editing Clear Claude, before trusting an eval result, or when the user says "clear audit", "audit clear claude", "verify clear partner", or "is Clear Partner really active".
---

# Clear Audit

Doctor asks *is it installed correctly*. Audit asks two narrower questions and answers both with checkable facts:

1. **Is Clear Partner actually the active style in this session** — not merely installed?
2. **Is the shipped style file byte-identical to the version that was behaviourally tested?**

No judgement calls. Do not assess whether recent answers "feel" like Clear Partner — a model cannot reliably grade its own tone, and that is what the eval suite is for. Report only what you can check, and say `INDETERMINATE` when you cannot check it.

## Hard rules

1. **Read-only.** Never edit, create or delete a file, and never change a setting — not even to fix a deviation you find. Report it and stop.
2. **No settings dumps.** You may read a settings file to answer part A, but the report may only name the layer, its path, and whether it sets `outputStyle`. Nothing else from those files enters the report.
3. **Every claim gets its evidence** — a path, a command's output, a hash. A statement you cannot attach evidence to does not belong in the report.

## Part A — is the style active?

Claude Code resolves the active output style like this, and A1–A5 walk the same path in order:

> Collect every style. Apply plugin styles first, then user-level, then project-level, then policy-level, keyed by the frontmatter `name` — so a later source with the same name **replaces** an earlier one. Then: if any style from an **enabled plugin** has `force-for-plugin: true`, use it (first one wins, with a warning if there are several). Otherwise use the `outputStyle` setting. Otherwise use the default.

**A1 — plugin enabled.** `claude plugin list --json`; find the entry whose `id` starts with `clear-claude@` and confirm `"enabled": true`. Keep its `installPath` and `version`. Not installed or not enabled → **NOT ACTIVE**, stop here and say which.

**A2 — the style file carries the flag.** Read the frontmatter of `<installPath>/output-styles/clear-partner.md` and confirm all four fields:

| Field | Expected |
| --- | --- |
| `name` | `Clear Partner` |
| `description` | non-empty |
| `keep-coding-instructions` | `true` |
| `force-for-plugin` | `true` |

`force-for-plugin: true` missing or false → **NOT ACTIVE**: the style is installed but nothing activates it. Nothing in Claude Code validates this file, so a typo here produces no error anywhere else.

**A3 — nothing shadows the name.** Glob `<config home>/output-styles/*.md` (config home = `CLAUDE_CONFIG_DIR` if set, otherwise `.claude` in the home directory) and `.claude/output-styles/*.md` in the project, and read only the `name:` line of each. A file whose name is `Clear Partner` replaces the plugin's entry in the style table, taking the `force-for-plugin` flag with it → **NOT ACTIVE**, and name the exact path. This is the failure mode that leaves everything else looking healthy.

**A4 — no competing forced style.** For each other enabled plugin, Glob `<its installPath>/output-styles/*.md` and read the frontmatter. Another style with `force-for-plugin: true` → **INDETERMINATE**: one of the two wins by discovery order, which cannot be predicted from the filesystem. Name both. Claude Code prints `Multiple plugins have forced output styles: …` at session start when this happens — the user can read the winner there.

**A5 — this session loaded it.** Plugin changes apply to sessions started after them; an install or update in the current session is not live until a restart or `/reload-plugins`. You cannot observe the current session's loaded style from inside it. If A1–A4 all pass, report **ACTIVE (derived)** and add one line: the user can confirm directly with the `/output-style` command, which lists the styles and marks the current one.

Verdict for part A is one of **ACTIVE (derived)**, **NOT ACTIVE**, or **INDETERMINATE**, with the failing step named.

## Part B — conformance of the style file

The prompt *is* the product, so an edited file is a different product. These checks are exact.

**B1 — frontmatter is exactly the four fields above**, no more and no fewer, spelled in lower-case with hyphens. An extra or renamed key is a deviation even though nothing else will ever complain about it.

**B2 — SHA-256 of the whole file.**

```text
Expected SHA-256: 3584870b3fcb58774d669f935018ebb1a0d044c73d26494911115d0bc9504b1c
Expected size:    4620 bytes
```

Hash `<installPath>/output-styles/clear-partner.md` with whatever the machine provides — `sha256sum` (Linux), `shasum -a 256` (macOS), `certutil -hashfile <file> SHA256` (Windows), or `Get-FileHash -Algorithm SHA256 <file>` (PowerShell). Compare case-insensitively. If no hashing tool is available, fall back to the byte size and say explicitly in the report that the hash was **not** verified — a size match alone is weak evidence.

These expected values are recorded in `docs/clear-partner-port.md` in the Clear Claude repository. If a checkout of that repo is available, read the value there too: if the doc and the value above disagree, report **RECORD DRIFT** as its own deviation. One of the two was updated without the other, and until that is resolved neither is trustworthy.

**B3 — on mismatch, classify the deviation** before reporting it:

- File contains `\r\n` line endings → the mismatch is line-ending conversion, most likely a Git checkout with `core.autocrlf=true`. The text is probably intact; say so, and say the hash cannot be verified until the file is stored with LF endings.
- Size matches but hash differs → content edit of the same length.
- Size differs → content added or removed; report the delta in bytes.
- If `source/clear-partner.md` is available in a repo checkout, compare the two files and report which lines differ. The shipped file should differ from the source by exactly one added line, `force-for-plugin: true`.

Report the deviation and its classification. Do not restore, re-copy or "fix" the file — an unexplained edit is information the user needs, and overwriting it destroys that information.

**B4 — manifest agreement.** Read `<installPath>/.claude-plugin/plugin.json`: `name` must be `clear-claude`, and the manifest must not declare an `outputStyles` field unless that field lists `output-styles/clear-partner.md`. Declaring the field switches off the automatic scan of `output-styles/`, so a declaration that omits the file leaves the style unloaded.

## Report format

Two verdicts, then deviations, then nothing.

```text
Clear Audit
  Active:      <ACTIVE (derived) | NOT ACTIVE | INDETERMINATE>  — <the deciding fact>
  Conforming:  <YES | NO | UNVERIFIED>                          — <hash result>

Deviations:
- <what differs> — <evidence: path, expected vs observed>
```

No deviations → say `No deviations.` and stop. Do not pad the report with the checks that passed, and do not recommend an action unless a deviation calls for one.
