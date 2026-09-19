# Can a style file outside the plugin displace Clear Partner?

**Date:** 2026-09-20 · **Claude Code:** 2.1.273, 2.1.277, 2.1.278 · **Platform:** native
Windows 11 (the three versions) · Linux and macOS: see [the last section](#other-platforms)

This project said, from its first release until marketplace 0.4.1, that a user-level output
style named `Clear Partner` silently replaces the plugin's copy, force flag included. It was
in the README, in `docs/troubleshooting.md` and `docs/architecture.md`, and it was check 7b of
`clear-doctor` and step A3 of `clear-audit`, where it produced a FAIL / NOT ACTIVE.

**It was never true on any version measured here.** It was reasoned from the loader's merge
rule — "one table, later source replaces earlier" — without the detail that decides it: the
two kinds of style do not share a key. This page records the measurement, the mechanism, and
the narrower thing that *is* true.

## What is true

| A file outside the plugin whose frontmatter says | Effect on the plugin's forced style |
| --- | --- |
| `name: Clear Partner` — the bare style name | **None.** The plugin's style stays forced. The file is a second, separate style. |
| `name: clear-partner:Clear Partner` — the plugin's qualified name | **Replaces it.** No style is forced; Claude Code falls back to the `outputStyle` setting. No error or warning anywhere. |

The same at user level (`<config home>/output-styles/`) and at project level
(`.claude/output-styles/`). The second row is what the diagnostic skills now look for. Nobody
writes that name by accident, so as a cause of "installed but not behaving" it is rare; it is
kept because it is the one case where everything else looks healthy.

## The measurement

`scripts/measure-plugin-loading.sh shadowing` — a throwaway `CLAUDE_CONFIG_DIR`, the plugin
installed from a checkout, no credential. Each row is one `claude -p hi` session, which stops
at "Not logged in" after the styles have been resolved; the result is the line
`Using forced plugin output style: …` in its `--debug-file` log, present or absent.

```text
claude: 2.1.278 (Claude Code) · MINGW64_NT-10.0-26200 x86_64
  no other style file:                          Using forced plugin output style: clear-partner:Clear Partner
  user file, name: Clear Partner:               Using forced plugin output style: clear-partner:Clear Partner
  user file, name: clear-partner:Clear Partner: no forced style
  project file, name: Clear Partner:            Using forced plugin output style: clear-partner:Clear Partner
  project file, name: clear-partner:Clear Partner: no forced style
  files removed again:                          Using forced plugin output style: clear-partner:Clear Partner
```

The user-level rows were repeated with the 2.1.273 and 2.1.277 executables that were still on
the machine (`CLAUDE=<path> bash scripts/measure-plugin-loading.sh shadowing`): the same three
results on each. 2.1.274, the version the original claim was written against, was not
available; it sits between two versions that agree.

## The mechanism

Read from the shipped 2.1.278 code, not documented by Anthropic, and consistent with every row
above:

- A plugin's style is registered under `` `${pluginName}:${styleName}` `` — the plugin's
  `name` from its manifest and the `name` from the style's frontmatter (the file name if
  there is none). This is the qualified name the debug log prints.
- User, project and policy styles are registered under their bare frontmatter `name`.
- All of them go into one object, in the order plugin → user → project → policy, each
  assignment overwriting an earlier entry with the same key. The replacement entry carries the
  new file's fields, and `force-for-plugin` is not one of them outside a plugin: a user-level
  file that sets it is logged as `has force-for-plugin set, but this option only applies to
  plugin output styles. Ignoring.`
- The forced style is then the first entry with `source: "plugin"` and the flag set. If the
  plugin's entry was overwritten there is none, and the `outputStyle` setting decides.

Two consequences the skills rely on: the key depends on the **plugin's name**, so it changed
with the rename in marketplace 0.4.0 (`clear-claude:Clear Partner` before), and
`scripts/check-repo.mjs` fails if the skills stop naming the current one.

## Policy level

The same loader reads a third directory, with `source: "policySettings"`, applied last:

| Platform | Directory |
| --- | --- |
| Windows | `C:\Program Files\ClaudeCode\.claude\output-styles\` |
| macOS | `/Library/Application Support/ClaudeCode/.claude/output-styles/` |
| Linux | `/etc/claude-code/.claude/output-styles/` |

**Read from the 2.1.278 code; not measured.** Writing there needs an administrator, and this
was not done. Because policy styles go through the same keyed assignment as user and project
styles, the same rule is expected to hold — a file there displaces the plugin only under the
qualified name — and the skills check that directory on that basis. They report a policy
directory they cannot read as UNKNOWN / INDETERMINATE rather than guess.

This closes the gap a review of marketplace 0.4.0 found: the skills' own description of style
resolution named a policy level that neither skill looked at.

## What this corrects in the record

Two dated run reports in [clear-ui-dogfood.md](../clear-ui-dogfood.md) say a hand-installed
`Clear Partner` style "shadows the plugin's copy". They are left as written, with a note: on
both machines the file was named with the bare style name, so by this measurement the plugin's
style was the active one in those sessions.

## Other platforms

The shadowing rows above were also taken on GitHub's Linux and macOS runners by the
`Measure plugin loading` workflow; see the run linked from
[migration.md](../migration.md#what-was-measured), which records the same script's rename
measurements.
