# Coming from `clear-claude@clear-claude`

In marketplace 0.4.0 the plugin that ships Clear Partner was renamed from `clear-claude` to
**`clear-partner`**. "Clear Claude" is now only the product and the marketplace; each plugin
is named after its layer ([ADR 0005](adr/0005-naming-and-install-paths.md)). The output style
itself did not change by a byte.

If you only ever installed `clear-ui`, nothing changes for you and you can stop reading.

## What to do

```text
claude plugin marketplace update clear-claude
```

Then restart Claude Code. On Claude Code **2.1.193 or later** that is all: at the next
session start it finds your old id in the marketplace's `renames` map, loads the plugin
under its new name, shows this once —

```text
Renamed to "clear-partner" in the "clear-claude" marketplace
```

— and rewrites `clear-claude@clear-claude` to `clear-partner@clear-claude` in the
`enabledPlugins` (and `pluginConfigs`) of your user, project and local settings. Whether it
was enabled or disabled carries over. `claude plugin list` then shows
`clear-partner@clear-claude`.

Check it with `clear doctor`, or `/clear-partner:clear-doctor`.

### If it does not migrate by itself

Two commands do the same thing by hand, on any version:

```text
claude plugin install clear-partner@clear-claude
claude plugin uninstall clear-claude@clear-claude
```

This is the path if:

- **Claude Code is older than 2.1.193.** It ignores `renames` and reports
  `plugin-not-found` for the old id. (Clear Partner needs 2.1.274 or later anyway.)
- **Claude Code reports `plugin-cache-miss`** for `clear-partner`. Its documentation
  describes this for renamed plugins with a remote source; run the `install` line once.
- **The plugin is enabled from managed (administrator) settings** or another read-only
  source. Claude Code cannot rewrite those: the plugin still loads, but the notice comes
  back every session until an administrator changes the key to
  `clear-partner@clear-claude`.
- **A team's checked-in `.claude/settings.json` names the old id.** It is rewritten on the
  first machine that opens the project with a current Claude Code; commit that change so
  everyone else gets it.

## What changes for you

- **Skill invocations by full name.** `/clear-claude:clear-doctor` and
  `/clear-claude:clear-audit` are now `/clear-partner:clear-doctor` and
  `/clear-partner:clear-audit`. Asking in words — "clear doctor", "clear audit" — works as
  before.
- **The style's qualified name** is `clear-partner:Clear Partner` instead of
  `clear-claude:Clear Partner`. Clear Partner forces itself while the plugin is enabled, so
  this only matters if you wrote the old string into an `outputStyle` setting or a script.
- **Commands that name the plugin.** `claude plugin update clear-partner@clear-claude`,
  `disable`, `enable`, `uninstall` likewise. Commands that name the *marketplace* are
  unchanged: `claude plugin marketplace update clear-claude`.

## What does not change

- The Clear Partner prompt: same bytes, same SHA-256
  ([clear-partner-port.md](clear-partner-port.md)), so the eval results still describe it.
- `clear-ui@clear-claude`, its settings key, and its data directory
  `plugins/data/clear-ui-clear-claude`.
- The marketplace: `jessebldr/clear-claude`, registered as `clear-claude`.

## What is left behind

The old version's files stay in Claude Code's plugin cache, at
`<config home>/plugins/cache/clear-claude/clear-claude/`. Nothing loads them. Delete the
folder if you want the space back (it is a few kilobytes); the manual `uninstall` line
above also clears it.

## What was measured

Claude Code 2.1.278, native Windows 11, 2026-09-19, in a throwaway `CLAUDE_CONFIG_DIR` so
no real setting was involved.

**Upgrade, from a local clone of the marketplace.** Registered a clone of `main` at the
published names, installed `clear-claude@clear-claude` 0.1.1 and `clear-ui@clear-claude`
0.2.0, then moved the clone to this release and ran `claude plugin marketplace update
clear-claude`.

- The next `claude plugin list` printed `Note: Renamed to "clear-partner" in the
  "clear-claude" marketplace` under the old id, and `settings.json` then held
  `"clear-partner@clear-claude": true` in place of the old key. `clear-ui@clear-claude`
  was untouched.
- Until a session had started, `claude plugin list` showed only `clear-ui`: the settings
  were migrated but no install was recorded under the new name yet.
- The first session start recorded it (`Added clear-partner@clear-claude with scope user`
  in the debug log), loaded both skills, and logged `Using forced plugin output style:
  clear-partner:Clear Partner`. After it, `claude plugin list` showed
  `clear-partner@clear-claude 0.2.0`, enabled, user scope. No command was typed for the
  plugin at any point.
- `plugins/cache/clear-claude/clear-claude/` was still there afterwards — the leftover
  described above.

**Upgrade and fresh install from GitHub** are recorded below.

<!-- github-measurement -->
