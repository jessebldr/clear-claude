# Coming from `clear-claude@clear-claude`

In marketplace 0.4.0 the plugin that ships Clear Partner was renamed from `clear-claude` to
**`clear-partner`**. "Clear Claude" is now only the product and the marketplace; each plugin
is named after its layer ([ADR 0005](adr/0005-naming-and-install-paths.md)). The output style
itself did not change by a byte.

If you only ever installed `clear-ui`, nothing changes for you and you can stop reading.

## What to do

```text
claude plugin marketplace update clear-claude
claude plugin install clear-partner@clear-claude
```

Then restart Claude Code. `claude plugin list` shows `clear-partner@clear-claude`, your
settings hold only the new key, and the first session already talks like Clear Partner.
Check it with `clear doctor`, or `/clear-partner:clear-doctor`.

### If you only update the marketplace

Your settings migrate, but **Clear Partner stays off until a `claude plugin` command has
run.** Claude Code 2.1.193 or later has a rename mechanism: the marketplace's `renames` map
says `clear-claude` is now `clear-partner`, so at the next start Claude Code shows this
once —

```text
Renamed to "clear-partner" in the "clear-claude" marketplace
```

— and rewrites `clear-claude@clear-claude` to `clear-partner@clear-claude` in
`enabledPlugins`, in user, project and local settings alike. What it does not have is the
plugin's files under the new name, and a session does not fetch them: three sessions in a row
ran without Clear Partner (`plugin-cache-miss` in the debug log), on Windows, macOS and
Linux. The first `claude plugin list` after that completed the install, and every session
from then on had the style. The `install` line above does the same thing on purpose, which
is why it is the recommended path and not a fallback.

### Things that look like errors and are not

- `claude plugin update clear-claude` — the second half of the old update instructions —
  now answers `Plugin "clear-claude" not found`. Expected: that name is gone. Run the
  `install` line instead.
- `claude plugin uninstall clear-claude@clear-claude` answers `not found in installed
  plugins` once the rename has been applied. Also expected: the install record moved to the
  new name, so there is nothing left to uninstall.
- `claude plugin install clear-claude@clear-claude` on a machine that never had it fails
  with `not found in marketplace`. `renames` migrates existing installs; it does not make
  the old name installable.

### Cases the automatic rename does not cover

- **You had the plugin disabled.** A disabled entry is left exactly as it was, old name
  included. Nothing is broken and nothing loads. `claude plugin install
  clear-partner@clear-claude` when you want it back.
- **The plugin is enabled from managed (administrator) settings.** Claude Code cannot rewrite
  that file, and measured, the plugin then **does not load at all**: every session reports
  `plugin-cache-miss`, `claude plugin list` repeats the rename notice under the old id, and
  the managed key stays as it was. (Claude Code's documentation says such a plugin keeps
  loading; on 2.1.278 it did not.) An administrator changes the key to
  `clear-partner@clear-claude`; until then, `claude plugin install
  clear-partner@clear-claude` on the machine brings the style back.
- **A team's checked-in `.claude/settings.json` names the old id.** It is rewritten on the
  first machine that opens the project with a current Claude Code — measured — so commit that
  change, or make the same one-line edit by hand, and everyone else gets it.
- **Claude Code older than 2.1.193** ignores `renames` and reports `plugin-not-found` for
  the old id. Run the `install` line; if the old id is still listed afterwards, uninstall
  it. Not measured, and not going to be: Clear Partner needs 2.1.274 or later anyway.

## What changes for you

- **Skill invocations by full name.** `/clear-claude:clear-doctor` and
  `/clear-claude:clear-audit` are now `/clear-partner:clear-doctor` and
  `/clear-partner:clear-audit`. Asking in words — "clear doctor", "clear audit" — works as
  before.
- **The style's qualified name** is `clear-partner:Clear Partner` instead of
  `clear-claude:Clear Partner`. Clear Partner forces itself while the plugin is enabled, so
  this only matters if you wrote the old string into an `outputStyle` setting or a script.
- **Commands that name the plugin** take the new name: `claude plugin update
  clear-partner@clear-claude`, and `disable`, `enable`, `uninstall` likewise. Commands that
  name the *marketplace* are unchanged: `claude plugin marketplace update clear-claude`.

## What does not change

- The Clear Partner prompt: same bytes, same SHA-256
  ([clear-partner-port.md](clear-partner-port.md)), so the eval results still describe it.
- `clear-ui@clear-claude`, its settings key, and its data directory
  `plugins/data/clear-ui-clear-claude`. Update it the usual way:
  `claude plugin update clear-ui@clear-claude`.
- The marketplace: `jessebldr/clear-claude`, registered as `clear-claude`.

## What is left behind

The old version's files stay in Claude Code's plugin cache, at
`<config home>/plugins/cache/clear-claude/clear-claude/`. Nothing loads them. Delete the
folder if you want the few kilobytes back.

## What was measured

Claude Code **2.1.278** on **Windows, macOS (arm64) and Linux**, 2026-09-20, by
[`scripts/measure-plugin-loading.sh`](../scripts/measure-plugin-loading.sh): throwaway
`CLAUDE_CONFIG_DIR`s, so no real setting is involved, and no credential — a session there
(`claude -p hi`) stops at "Not logged in", after the plugins have loaded, which is the part
under test. What a session loaded is read from its `--debug-file` log. The former name is
installed from this repository at tag `v0.3.0`; "the marketplace moves" is the registered
marketplace being pointed at `main` and `claude plugin marketplace update clear-claude` —
the same fetch a user's update performs.

The three platforms were GitHub's runners, in the `Measure plugin loading` workflow
([run 35459152005](https://github.com/jessebldr/clear-claude/actions/runs/35459152005); its
log expires, which is why the results are copied here), and the same script on a Windows 11
machine. **Every row below read the same on all of them.**

| Case | Result |
| --- | --- |
| Marketplace update, then `install clear-partner@clear-claude` | First session forces `clear-partner:Clear Partner`; `enabledPlugins` is exactly `{"clear-partner@clear-claude": true}`. |
| Marketplace update only, user scope | Key rewritten to the new id. Sessions 1, 2 and 3: `plugin-cache-miss`, no forced style. After one `claude plugin list`: sessions 4 and 5 force the style. |
| Marketplace update only, **project** scope | `.claude/settings.json` rewritten from the old id to the new; user settings untouched. Sessions 1–3: `plugin-cache-miss`. |
| Marketplace update only, **local** scope | `.claude/settings.local.json` rewritten likewise. Sessions 1–3: `plugin-cache-miss`. |
| The old install was **disabled** | Not migrated: still listed as `clear-claude@clear-claude`, disabled; `enabledPlugins` still `{"clear-claude@clear-claude": false}`. |
| Enabled only from **managed settings** | Before the move: forced style `clear-claude:Clear Partner`. After: `managed-settings.json` unchanged; every session `plugin-cache-miss`, also after `claude plugin list`, which shows the rename note under the old id. After `install clear-partner@clear-claude`: the style is forced again. |

The managed row needs an administrator, so it was taken on the runners only, which are
thrown away after the job.

Taken by hand on the Windows machine during the rename itself, same version:

- **Fresh install from GitHub:** `marketplace add`, then both `install` lines → listed as
  `clear-partner@clear-claude` 0.2.0 and `clear-ui@clear-claude` 0.2.0, enabled, user scope;
  the first session forces the style.
- **A `directory` marketplace** (a local clone, as used when testing a checkout): the same
  notice and the same settings rewrite, and no gap — the files are read in place, so there
  is nothing to fetch.
- **The old commands after the rename:** `claude plugin update clear-claude` →
  `Plugin "clear-claude" not found`. `claude plugin uninstall clear-claude@clear-claude`,
  once the rename was applied → `not found in installed plugins`. `claude plugin install
  clear-claude@clear-claude` in a fresh config → `not found in marketplace "clear-claude"`.
- **A real install:** the maintainer's own machine went from `clear-claude@clear-claude`
  0.1.1 to `clear-partner@clear-claude` 0.2.0 by the two commands at the top; the old key
  was gone from `settings.json` and the next session forced the style with no cache miss.
  `clear-ui@clear-claude` and its status line were untouched.

An earlier version of this page said the plugin came back "a session or two later". Those
two runs each had a `claude plugin` command between their sessions; with nothing in between,
it did not come back.

**Not measured, and not planned:** Claude Code older than 2.1.278; an interactive session
left open after a marketplace-only update (whether `/plugin` inside it completes the
install the way the CLI does). Neither changes the advice: run the `install` line.
