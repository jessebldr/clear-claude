# Local marketplace test

**Date:** 2026-09-17 · **Claude Code:** 2.1.274 · **Platform:** Linux

This is the verification that Clear Claude actually installs from a marketplace and that
the Clear Partner style actually loads. It matters because
[architecture.md](../architecture.md) establishes that `claude plugin validate` **does not
check output styles at all** — a passing validation is compatible with a plugin that
installs, enables, and silently does nothing. Only a real install and a real session
close that gap.

## Isolation

Every install-path command ran against a throwaway config home:

```sh
export HOME=/tmp/fakehome
mkdir -p /tmp/fakehome
```

so Claude Code resolved its config to `/tmp/fakehome/.claude` and the machine's real
`~/.claude` was never written to. The directory was deleted afterwards.

The two live-session checks are the exception and are handled separately below, with
their own proof of non-interference.

---

## 1. Add the marketplace

```sh
claude plugin marketplace add /path/to/clear-claude --scope user
```

```text
Adding marketplace…✔ Successfully added marketplace: clear-claude (declared in user settings)
```

Exit `0`.

## 2. Install the plugin

```sh
claude plugin install clear-claude --scope user -y
```

```text
Installing plugin "clear-claude"...✔ Successfully installed plugin: clear-claude@clear-claude (scope: user)
```

Exit `0`. `-y` is required here because stdout is not a TTY.

## 3. `claude plugin list`

```text
Installed plugins:

  ❯ clear-claude@clear-claude
    Version: 0.1.0
    Scope: user
    Status: ✔ enabled
```

`claude plugin marketplace list`:

```text
Configured marketplaces:

  ❯ clear-claude
    Source: Directory (/path/to/clear-claude)
```

## 4. `claude plugin details clear-claude`

```text
Clear Claude (clear-claude) 0.1.0
  Description: Ships the Clear Partner output style: answer-first, plain English,
  concise by default, deep when asked. Keeps Claude Code's coding instructions
  intact. Includes the clear-doctor and clear-audit diagnostic skills.
  Source: clear-claude@clear-claude

Component inventory
  Skills (2)  clear-audit, clear-doctor
  Agents (0)
  Hooks (0)
  MCP servers (0)
  LSP servers (0)

Projected token cost
  Always-on:   ~286 tok   added to every session

Per-component (rounded)
  component     always-on  on-invoke
  clear-doctor       ~150      ~2.8k
  clear-audit        ~140      ~1.7k
```

Two things to read carefully here:

- **Both skills are listed, each exactly once.** This is the check
  [architecture.md](../architecture.md) called for when it chose to declare `skills` in the
  manifest *and* let the directory scan find them: double-registration does not happen,
  and the pair costs ~286 always-on tokens.
- **The output style does not appear.** This is expected, not a failure — output styles
  are absent from `plugin details` in 2.1.274
  ([phase0-research.md](phase0-research.md) §6). It is precisely why step 6 exists.

## 5. The style file landed intact

```sh
find /tmp/fakehome/.claude/plugins/cache/clear-claude/clear-claude/0.1.0 -type f
```

Install path: `$CONFIG_HOME/plugins/cache/{marketplace}/{plugin}/{version}/`.

The style is at the location the design depends on — `output-styles/clear-partner.md` —
and its frontmatter is unchanged:

```yaml
---
name: Clear Partner
description: Clear, conversational technical partner. Answer-first, plain English, concise by default, deep when needed.
keep-coding-instructions: true
force-for-plugin: true
---
```

`force-for-plugin: true` and `keep-coding-instructions: true` are both present. The
installed file is byte-identical to the one in the repo:

```text
3584870b3fcb58774d669f935018ebb1a0d044c73d26494911115d0bc9504b1c  …/0.1.0/output-styles/clear-partner.md
3584870b3fcb58774d669f935018ebb1a0d044c73d26494911115d0bc9504b1c  plugins/clear-claude/output-styles/clear-partner.md
```

### One observation worth recording

A **directory-source** install copies the working tree as it is on disk, `.gitignore`
notwithstanding. Locally generated `evals/results/` artifacts were therefore copied into
the installed package. This does not affect anyone installing from the published
repository, because those files are gitignored and never committed — but it is worth
knowing that `marketplace add <local path>` packages untracked files too.

## 6. The style actually loads in a live session

`--plugin-dir` loads a plugin *for one session only* and writes no plugin
configuration (`claude --help`: "Load a plugin from a directory or .zip for this session
only"). These two runs needed a real credential, which lives in the machine's real
config home, so they ran with the real `HOME` rather than the throwaway one.

**Trivial load check** — does the plugin load without errors at all?

```sh
claude --plugin-dir …/plugins/clear-claude -p 'reply with just the word PONG'
```

```text
PONG
```

Clean run, no warnings, no load errors.

**Activation check** — did `force-for-plugin` actually take effect?

```sh
claude --plugin-dir …/plugins/clear-claude \
  -p 'What is the name of your currently active output style? Answer with just the style name, nothing else.'
```

```text
Clear Partner
```

**Control** — the same prompt with no `--plugin-dir`:

```text
Default
```

The control is what makes this evidence rather than a coincidence: the style is active
only when the plugin is loaded, so it came from the plugin and from nothing else already
present on the machine. This is the single most important result on the page, because it
is the one thing no validator checks.

### Proof the real config was not touched

A SHA-256 fingerprint of the real config home's settings, plugin, skill and
output-style files was taken before the two session runs and again afterwards. The two
were identical — no differences. `claude plugin list` against the real home still shows
no `clear-claude` install; only pre-existing claude.ai-synced plugins.

## 7. Disable, enable, uninstall

```sh
claude plugin disable clear-claude   # → ✘ disabled
claude plugin enable  clear-claude   # → ✔ enabled
```

Both round-tripped correctly. One quirk observed: each printed `(scope: project)` even
though the plugin is installed at user scope, while the change in fact landed in
`/tmp/fakehome/.claude/settings.json` under `enabledPlugins`. The working directory was
the throwaway home itself, so "project" and "user" resolved to the same file here and
the mislabel had no effect. Pass `--scope user` explicitly if the distinction matters.

```sh
claude plugin uninstall clear-claude --scope user -y
claude plugin marketplace remove clear-claude
```

```text
✔ Successfully uninstalled plugin: clear-claude (scope: user)
No plugins installed. Use `claude plugin install` to install a plugin.
✔ Successfully removed marketplace: clear-claude
```

Settings afterwards:

```json
{
  "enabledPlugins": {},
  "extraKnownMarketplaces": {}
}
```

Nothing left behind. This is the concrete confirmation of the architecture decision not
to write an `outputStyle` into the user's `settings.json`: uninstalling removes the
product completely, and the user's own output-style preference is untouched because it
was never overwritten.

## 8. Release pre-flight

```sh
claude plugin tag plugins/clear-claude --dry-run
```

```text
Plugin:  clear-claude
Version: 0.1.0 (from plugin.json)
Marketplace entry: plugins[0] in …/.claude-plugin/marketplace.json (version: 0.1.0)
Tag:     clear-claude--v0.1.0

✔ Dry run — would create tag clear-claude--v0.1.0 at HEAD
```

The two manifests agree on `0.1.0`. No tag was created. See
[releasing.md](../releasing.md).

---

## Summary

| # | Check | Result |
| --- | --- | --- |
| 1 | Marketplace manifest validates (`--strict`) | ✔ pass |
| 2 | Plugin manifest validates (`--strict`) | ✔ pass |
| 3 | Skills validate (`--strict`) | ✔ pass |
| 4 | Installs from a local marketplace | ✔ pass |
| 5 | Appears installed and enabled | ✔ pass |
| 6 | Both skills registered, each once | ✔ pass |
| 7 | Style file lands at the required path, byte-identical | ✔ pass |
| 8 | `force-for-plugin` / `keep-coding-instructions` intact after install | ✔ pass |
| 9 | Plugin loads in a live session without errors | ✔ pass |
| 10 | Clear Partner is the active style when loaded — and not when it isn't | ✔ pass |
| 11 | Disable / enable / uninstall round-trip cleanly, nothing left behind | ✔ pass |
| 12 | Real machine configuration unchanged throughout | ✔ verified by hash |

### Scope of these claims

Verified on Linux with Claude Code 2.1.274. The install mechanism is Claude Code's own,
and the package is three JSON/Markdown files with no scripts, no symlinks and no path
resolution of our own — so **macOS and Windows are expected to behave identically by
design**, but they were not tested here and this document does not claim they were.

## Cleanup

`/tmp/fakehome` was deleted after the run.
