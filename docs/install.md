# Install, update, and removal

Complete command reference for the whole lifecycle: install, update, verify, disable,
uninstall, switch away, and recover. The README covers the common path in four
commands; this document covers everything else, including scopes and the flags that
matter in CI.

This document covers the `clear-claude` plugin (Clear Partner). The marketplace's other
plugin, the optional `clear-ui` status bar, installs separately and has its own
lifecycle: see [clear-ui-install.md](clear-ui-install.md). Neither needs the other.

Every command here is quoted from `claude plugin --help` on Claude Code **2.1.274** and
is recorded with its evidence tier in
[phase0-research.md §3](phase0-research.md#3-exact-command-syntax-help).

## Before you start

- **Claude Code 2.1.274 or later.** Check with `claude --version`. Earlier versions are
  not tested; `force-for-plugin`, which Clear Claude depends on, is verified only on
  2.1.274.
- **No other prerequisites.** The `clear-claude` plugin is one Markdown file, two skills
  and a JSON manifest. There is no shell script, no Node dependency, no symlink, and no
  absolute path in the package. (Node 18+ is a requirement of `clear-ui` only.)
- **Two names, and they are identical here.** Commands take `<plugin>` or
  `<plugin>@<marketplace>`. This repository's marketplace is named `clear-claude` and
  this plugin is also named `clear-claude`, so the fully qualified id is
  `clear-claude@clear-claude`. Unambiguous short forms work too. The status bar is
  `clear-ui@clear-claude`.

### Terminal vs in-session

Every `claude plugin …` command below also works inside a running session as a slash
command, without the `claude` prefix — `claude plugin install X` becomes
`/plugin install X`. Use whichever you have open. The examples use the terminal form.

### Scopes

| Scope | Where it applies | Use it for |
| --- | --- | --- |
| `user` | your account on this machine | personal setup — the default |
| `project` | the current project, shared via the repo | a team that should all get the style |
| `local` | the current project, not shared | trying something out |

Defaults differ per command and are easy to get wrong:

- `install`, `uninstall`, `prune` default to **`user`**.
- `enable` and `disable` **auto-detect** the scope.
- `update` defaults to `user` and is the **only** command whose scope list also includes
  `managed`.

If you installed into a non-default scope, pass the same `-s` to every later command for
that plugin.

## Install

```text
claude plugin marketplace add OWNER/clear-claude
claude plugin install clear-claude@clear-claude
```

Replace `OWNER` with the GitHub owner once this repository is published. `marketplace
add` accepts a URL, a filesystem path, or a GitHub `owner/repo` shorthand.

Into a project instead of your user account:

```text
claude plugin marketplace add OWNER/clear-claude --scope project
claude plugin install clear-claude@clear-claude --scope project
```

Full flag set for the two commands:

```text
claude plugin marketplace add <source> [--claudeai] [--scope <user|project|local>]
                                      [--sparse <paths...>]
claude plugin install|i <plugin>  [-s|--scope <user|project|local>]
                                  [--config <key=value>] [--json]
                                  [-y|--yes] [--accept-command <sha256>]
```

Clear Claude declares no `userConfig` options, so `--config` has nothing to set here.

**There is no activation step.** Clear Partner declares `force-for-plugin: true`, so it
applies automatically while the plugin is enabled. The cost is that you cannot
conveniently select a different output style meanwhile — see
[Switching to a different style](#switching-to-a-different-output-style).

### Making it take effect

A newly installed plugin loads in the **next** session. To pick it up in the session you
already have open, run `/reload-plugins`.

### Install from a local checkout

For testing a change, or before publication:

```text
claude plugin marketplace add /path/to/clear-claude
claude plugin install clear-claude@clear-claude
```

Point `add` at the directory containing `.claude-plugin/marketplace.json` — this
repository root, not `plugins/clear-claude`. Use your platform's own path syntax.

### Load for one session only

Neither of these installs anything; both last until the session ends.

```text
claude --plugin-dir /path/to/clear-claude/plugins/clear-claude
claude --plugin-url https://example.com/clear-claude.zip
```

`--plugin-dir` takes a directory or a `.zip`, points at the **plugin** directory rather
than the marketplace root, and is repeatable; a folder of plugins loads each child.

### Non-interactive and CI

`-y|--yes` is **required** whenever stdin or stdout is not a TTY and a
marketplace-declared command needs confirmation. Clear Claude's marketplace declares no
commands, so this should not arise — but scripts that install several plugins will hit
it eventually.

`--accept-command <sha256>` pins one exact declared command: it *"counts as `-y` for
exactly that command, for that plugin and marketplace catalog, and nothing else. If
either changed (a refresh that moved the catalog counts), the run refuses and reports
the command again."* Prefer it over a blanket `-y` in automation.

## Update

Catalog first, then the plugin — in that order, or `update` will not see the new
version:

```text
claude plugin marketplace update clear-claude
claude plugin update clear-claude
```

```text
claude plugin marketplace update [name]     # all marketplaces if name is omitted
claude plugin update <plugin> [-s|--scope <user|project|local|managed>]
                              [--json] [-y|--yes] [--accept-command <sha256>]
```

Claude Code reports **"restart required to apply"**. Restart the session; an update that
appears to have done nothing is almost always a missing restart.

Clear Claude uses semantic versioning and treats any edit to the style prompt as a
behaviour change with its own CHANGELOG entry — read
[CHANGELOG.md](../CHANGELOG.md) before updating if you care what changed.

## Verify

```text
claude plugin list
claude plugin details clear-claude
```

`list` shows installed plugins with their scope and enabled state. `details` prints the
component inventory and a projected token cost.

**Output styles do not appear in `plugin details`.** That is normal in 2.1.274 and not a
sign of a broken install: you will see the two skills listed and no style. To confirm
the style itself, run `/output-style` in a session — it lists the available styles and
marks the current one. `/config` shows the same in its Output style picker.

Machine-readable forms:

```text
claude plugin list --json
claude plugin list --available --json     # --available requires --json
```

`--available` returns `{installed: […], available: […]}`, which is what you need to
compare the installed version against the marketplace version.

### Deep verification

The plugin ships two read-only diagnostic skills. Run them in a session:

```text
/clear-claude:clear-doctor      # is it installed correctly?
/clear-claude:clear-audit       # is it actually active, and unmodified?
```

Neither one changes a file or a setting; both print the fixes for you to run. See
[troubleshooting.md](troubleshooting.md) for what each reports.

### Validate a checkout

From a clone of this repository — this is what CI runs:

```text
claude plugin validate . --strict
claude plugin validate plugins/clear-claude --strict
claude plugin validate plugins/clear-claude/skills --strict
```

```text
claude plugin validate <path> [--json] [--strict]
```

`--strict` *"treats warnings as errors (exit 1)"*, so it is safe to gate CI on. Exit `0`
is a pass.

**Validation does not cover output styles.** It checks manifests, skills, agents, and
commands. A style file with a misspelled frontmatter key validates clean and then
silently fails to work at runtime. `clear-doctor` exists to close that gap.

## Disable and re-enable

Keeps the plugin installed and switches its behaviour off:

```text
claude plugin disable clear-claude
claude plugin enable clear-claude
```

```text
claude plugin enable <plugin>   [-s|--scope <user|project|local>] [--json]
claude plugin disable [plugin]  [-a|--all] [-s|--scope <user|project|local>] [--json]
```

Both auto-detect the scope. `disable --all` switches off every plugin, which is useful
when you are isolating which one is causing a problem.

Disabling Clear Claude removes Clear Partner's influence completely and restores normal
output-style selection immediately.

## Switching to a different output style

While Clear Claude is enabled, Clear Partner is forced and wins over the `outputStyle`
setting in every layer. To use another style, disable the plugin first:

```text
claude plugin disable clear-claude
```

Then pick your style in `/config` or with `/output-style`. Re-enable with `claude plugin
enable clear-claude` when you want Clear Partner back.

There is no per-project or per-glob override: `force-for-plugin` is the only
auto-activation control output styles have in this version, and it is all-or-nothing
while the plugin is enabled. The reasoning for accepting that is in
[architecture.md](architecture.md).

## Uninstall

```text
claude plugin uninstall clear-claude
claude plugin marketplace remove clear-claude
```

```text
claude plugin uninstall|remove <plugin> [-s|--scope <user|project|local>]
                                        [--keep-data] [--prune] [-y|--yes] [--json]
claude plugin marketplace remove|rm <name> [--scope <user|project|local>]
```

- `uninstall` defaults to `--scope user`; pass `-s project` or `-s local` if you
  installed there.
- Omitting `--scope` on `marketplace remove` removes the marketplace from **every**
  scope.
- `--keep-data` preserves `~/.claude/plugins/data/{id}/`.
- `claude plugin prune` (alias `autoremove`) cleans up orphaned installs; it supports
  `--dry-run`.

Clear Claude writes nothing outside its own plugin directory — in particular it never
touches your `settings.json` — so uninstalling leaves no residue to clean up by hand.

## Recovery if the plugin fails to load

Work down the list; each step is more aggressive than the last.

1. **Re-validate the manifests** in a checkout — `claude plugin validate . --strict`. A
   malformed `plugin.json` is the most common cause of a plugin that will not load.
2. **Reload without restarting** — `/reload-plugins` in the session.
3. **Disable just this plugin** — `claude plugin disable clear-claude`.
4. **Start a minimal session** —

   ```text
   claude --bare         # skips hooks, LSP, plugin --settings, --agents, --plugin-dir
   claude --safe-mode    # disables CLAUDE.md, skills, plugins, hooks, MCP servers,
                         # custom commands and agents, output styles, workflows,
                         # custom themes, keybindings, and more
   ```

   `--safe-mode` also has the environment equivalent `CLAUDE_CODE_SAFE_MODE=1`.
   Administrator-managed policy settings still apply in safe mode. Either flag gets you
   a working session from which to fix the configuration.
5. **Disable every plugin** — `claude plugin disable --all`.
6. **Remove it entirely** — the [Uninstall](#uninstall) commands above.

For symptoms where the plugin *does* load but Clear Partner is not in effect, go to
[troubleshooting.md](troubleshooting.md) instead — that is a different failure and step
1 will not find it.

## Platform notes

The package contains no OS-specific content, so the commands above are the complete
instruction set on every platform. There is no Windows section because there is nothing
different to say.

| Claim | Status |
| --- | --- |
| Commands and manifests behave as documented | **Verified on Linux**, Claude Code 2.1.274 |
| Package contains no platform-specific content, absolute paths, symlinks, or scripts | **Verified by inspection** |
| Same commands work on Windows | **Not verified** — expected identical because Claude Code abstracts the difference |
| Same commands work on macOS | **Not verified** — same reasoning |

Two places where the platform does show through, both outside the plugin itself:

- **Paths you type.** `marketplace add /path/to/clear-claude` takes your platform's own
  path syntax. Claude Code accepts a Windows path where it accepts a POSIX one.
- **Hashing a file by hand**, if you are checking the style file manually rather than
  letting `clear-audit` do it: `sha256sum` (Linux), `shasum -a 256` (macOS),
  `certutil -hashfile <file> SHA256` or PowerShell `Get-FileHash -Algorithm SHA256`
  (Windows). Untested on macOS and Windows by us; these are the standard tools on each.

One portability caveat worth knowing: if Git converts the style file to CRLF line
endings on checkout (`core.autocrlf=true`), its SHA-256 will not match the recorded
value. `clear-audit` detects this specific case and reports it as line-ending conversion
rather than as an edit.
