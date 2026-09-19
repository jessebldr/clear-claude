# Clear Transcript

**Experimental.** How the conversation is drawn inside stock Claude Code, as a plugin on function
hooks ("Claude Mods"). It is not in the marketplace and cannot be installed: function hooks are
undocumented, off by default, and may change in any Claude Code release. Built and tested against
**2.1.278**.

Design, limits and the reasons behind every decision: [docs/clear-transcript.md](../../docs/clear-transcript.md).
What it looked like in real sessions: [docs/clear-transcript-dogfood.md](../../docs/clear-transcript-dogfood.md).

What it does, and all it does:

- **A settled tool group names its targets, and a failed call gets a line of its own** —
  `Read sum.mjs, format.mjs, parse.mjs` and `failed  node --test · Exit code 1`, where stock draws
  `Read 3 files, ran 2 shell commands` over the same calls.
- **Section titles in an answer (`#`, `##`) are underlined.** Stock draws every heading level as the
  same plain bold. Attributes only: every row stays where stock puts it.
- Every other row, and these two whenever there is doubt, is drawn by Claude Code. No word the
  model wrote is removed, reordered or added. **ctrl+o shows rows as Claude Code draws them** (for
  answers, with one stated edge: see the design page), and `/clear-transcript off` does the same in
  place, unconditionally.

## Load it

From the repository root. Set the gate for that one command: never export it, never write it to a
settings file.

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir experimental/clear-transcript
```

```powershell
$env:CLAUDE_CODE_ENABLE_FUNCTION_HOOKS = '1'; claude --plugin-dir experimental/clear-transcript; Remove-Item Env:CLAUDE_CODE_ENABLE_FUNCTION_HOOKS
```

`claude plugin validate experimental/clear-transcript --strict` needs no gate and prints every
event the module hooks and every `$` call it makes, read from its source.

## Test it

```sh
npm test                                                  # the pure core; Node >= 18, nothing to install
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test .  # the hooks, in the engine's own host
```

## Files

| Path | What it is |
| --- | --- |
| `hooks/register.js` | The hooks module: three `ui.render` hooks (terminal only), the `/clear-transcript` command. Turns plans into elements and decides nothing else. |
| `hooks/lib/blocks.mjs` | Pure. Cuts a reply's markdown at headings and fences in column 0, byte for byte reversible. |
| `hooks/lib/answer.mjs` | Pure. Which section titles are drawn, which markdown goes to the engine untouched, and when the whole reply does. |
| `hooks/lib/tools.mjs` | Pure. What a settled group says: names, `+N more`, a line per failure, untrusted text cleaned. |
| `test/unit/` | `node --test` suites for the three pure files. |
| `test/engine/` | `claude plugin test` suite: the plugin loaded by the engine, every tree through the terminal surface's validator. |
| `test/fixtures/replies/` | Ten real replies (`claude -p`, 2026-09-20), with and without Clear Partner, as the model wrote them. |

The pure files use no Node, engine or clock API, the same rule Clear UI's renderer follows, so
they run unchanged inside the hooks environment and under `node --test`. The plugin shares no
code with `clear-partner` or `clear-ui` ([ADR 0004](../../docs/adr/0004-one-plugin-per-layer.md)).
