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
(see [phase0-research.md](phase0-research.md) §6), and it is the **only**
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

## Recorded checksum of the shipped file

This is the authoritative record of what a correct
`plugins/clear-claude/output-styles/clear-partner.md` is. The `clear-audit` skill
compares the installed file against these values, so they are part of the product, not a
convenience note.

```text
SHA-256: 3584870b3fcb58774d669f935018ebb1a0d044c73d26494911115d0bc9504b1c
Size:    4620 bytes
Lines:   144, LF endings, final newline present
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
