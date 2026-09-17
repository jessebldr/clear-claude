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
