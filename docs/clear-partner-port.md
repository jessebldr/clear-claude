# Clear Partner port record

How the output style shipped in the plugin relates to the behaviourally tested
original.

- **Original:** `source/clear-partner.md` (the canonical, already-tested style)
- **Shipped:** `plugins/clear-claude/output-styles/clear-partner.md`

## Verdict: modified — one added frontmatter line

**The prompt body is byte-for-byte identical.** Every instruction, heading, line break,
and wrapping point is unchanged. The only difference in the entire file is one line
added to the YAML frontmatter.

```diff
--- source/clear-partner.md
+++ plugins/clear-claude/output-styles/clear-partner.md
@@ -4,0 +5 @@
+force-for-plugin: true
```

`diff` reports exactly this one hunk and nothing else.

### Why the line was added

`force-for-plugin: true` is what makes the style apply automatically while the plugin
is enabled. It is a verified output-style frontmatter field in Claude Code 2.1.274
(see [phase0-research.md](research/phase0-research.md) §6), and it is the **only**
auto-activation mechanism that exists for plugin output styles — there is no
alternative field, and no way to achieve the behaviour from the manifest.

Without it the plugin would install successfully and do nothing until the user selected
the style by hand in `/config`, on every machine. The reasoning for choosing automatic
activation, and what it costs, is in [architecture.md](architecture.md).

The field is inert outside a plugin. Claude Code's own guard message for the misplaced
case is: *"has force-for-plugin set, but this option only applies to plugin output
styles. Ignoring."* So the added line has no effect on the original file's behaviour if
the two are ever compared or swapped.

### Why nothing else changed

The instruction body was left alone deliberately. It has been behaviourally tested, and
the tests were run against this exact wording — any edit, including one that looks
purely cosmetic, would invalidate that evidence and would need re-testing to be worth
anything. There is no concrete, documented reason to change a single line of it, so
none was changed.

Specifically preserved:

- `keep-coding-instructions: true`, so Claude Code's default engineering instructions
  stay in the system prompt alongside this style. Clear Partner changes communication,
  not capability.
- `name: Clear Partner` and the original `description`, so the entry in the `/config`
  output style picker reads exactly as it did before.
- The full instruction body: goal, core communication, adapt-to-task, depth,
  formatting, deliverables, interaction, uncertainty, and the final quality check.

## Revisions of the prompt

The relation above holds for every revision: the shipped file is `source/clear-partner.md`
plus the one frontmatter line. What changes is the text both carry.

| `clear-claude` | Date | Change | Evidence |
| --- | --- | --- | --- |
| 0.1.0 | 2026-09-17 | The original, as tested. 4620 bytes, SHA-256 `3584870b…04b1c`. | [evals.md](evals.md), first run |
| 0.1.1 | 2026-09-19 | New section **Explicit constraints**: a reply shape the user fixes ("one sentence", "just the command", "nothing else") outranks the style's defaults, except one short safety-critical warning. **Formatting**: a table only for a real comparison; a short set of commands is a list. | [evals.md](evals.md), cases g–l: each change was made only after a case failed on 0.1.0 |

## Recorded checksum of the shipped file

This is the authoritative record of what a correct
`plugins/clear-claude/output-styles/clear-partner.md` is. The `clear-audit` skill
compares the installed file against these values, so they are part of the product, not a
convenience note.

```text
SHA-256: a8eb2048bfff6e140a1bcc107a9dfcd340e5e8df1ab1c4f442bbf4c2a307f3e0
Size:    5294 bytes
Lines:   157, LF endings, final newline present
```

The same SHA-256 is written into
[`plugins/clear-claude/skills/clear-audit/SKILL.md`](../plugins/clear-claude/skills/clear-audit/SKILL.md),
because the installed plugin does not ship this `docs/` directory and the skill must
still work offline. `clear-audit` treats a disagreement between the two copies as its own
finding (**record drift**) rather than trusting either.

**Editing the style means updating both copies in the same commit**, alongside the
version bump and CHANGELOG entry that a prompt change already requires. Recompute with
whichever tool the machine provides — `sha256sum`, `shasum -a 256`,
`certutil -hashfile <file> SHA256`, or PowerShell `Get-FileHash -Algorithm SHA256`.

The hash covers the whole file, frontmatter included, so it changes when
`force-for-plugin` or the description changes and not only when the prompt body does.
A checkout that converts line endings to CRLF will also fail the comparison; `clear-audit`
detects that case and reports it as line-ending conversion rather than as an edit.

## Re-verifying this claim

From the repository root:

```bash
diff source/clear-partner.md plugins/clear-claude/output-styles/clear-partner.md
```

Expected output — one added line, nothing more:

```text
4a5
> force-for-plugin: true
```

Any other output means the port has drifted and this document is stale.

## Audit runs

`/clear-claude:clear-audit` run for real, against the plugin loaded with `--plugin-dir`.

| Date | Claude Code | Platform | Active | Conforming |
| --- | --- | --- | --- | --- |
| 2026-09-19 | 2.1.278 | Windows 11 | ACTIVE (derived) | YES, once line endings were normalised |

That run found a real defect. The repository stores the style with LF, and
`core.autocrlf=true` — the Windows default — checked it out with CRLF: 4764 bytes instead of
4620, and a different SHA-256, so a byte-for-byte audit on any Windows checkout would report a
modified prompt that nobody modified. A root `.gitattributes` now pins the style, its source
and the golden renders to LF. After a fresh checkout on Windows the file is 4620 bytes and
hashes to the recorded value above.
