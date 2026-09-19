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

It still works, a session or two later. Claude Code 2.1.193 or later has a rename mechanism: the
marketplace's `renames` map says `clear-claude` is now `clear-partner`, so at the next start
Claude Code shows this once —

```text
Renamed to "clear-partner" in the "clear-claude" marketplace
```

— and rewrites `clear-claude@clear-claude` to `clear-partner@clear-claude` in the
`enabledPlugins` (and `pluginConfigs`) of your user, project and local settings. What it does
not have yet is the plugin's files under the new name, so **the next session runs without
Clear Partner** (`plugin-cache-miss` in the debug log) until Claude Code has fetched them by
itself. In two measured runs that took one session and two. The `install` line above is what
skips that gap, which is why it is the recommended path and not a fallback.

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
- **Claude Code older than 2.1.193** ignores `renames` and reports `plugin-not-found` for
  the old id. Run the `install` line; if the old id is still listed afterwards, uninstall
  it. (Not measured: Clear Partner needs 2.1.274 or later anyway.)
- **The plugin is enabled from managed (administrator) settings** or another read-only
  source. Claude Code cannot rewrite those: per its documentation the plugin still loads,
  but the notice comes back every session until an administrator changes the key to
  `clear-partner@clear-claude`. (Not measured here.)
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

Claude Code 2.1.278, native Windows 11, 2026-09-20. Every run used a throwaway
`CLAUDE_CONFIG_DIR`, so no real setting was involved, and none had a credential: a session
there stops at "Not logged in", after the plugins have loaded, which is the part under test.
What a session loaded is read from its `--debug-file` log. "The published names" means
`jessebldr/clear-claude` at `main` before this release: `clear-claude@clear-claude` 0.1.1
and `clear-ui@clear-claude` 0.2.0. Because this was measured before the release reached
`main`, "the marketplace moves" was done by pointing the registered marketplace at the
release branch (`ref` in `known_marketplaces.json` and `settings.json`) and running
`claude plugin marketplace update clear-claude` — the same fetch a user's update performs.

**Fresh install from GitHub.** `marketplace add`, then both `install` lines: listed as
`clear-partner@clear-claude` 0.2.0 and `clear-ui@clear-claude` 0.2.0, enabled, user scope.

**Upgrade from GitHub, the two commands above.** Published names installed; marketplace
moved; `claude plugin install clear-partner@clear-claude`. `enabledPlugins` was then exactly
`{"clear-partner@clear-claude": true}` — the old key was gone — and the first session logged
`Using forced plugin output style: clear-partner:Clear Partner` with no cache miss.

**Upgrade from GitHub, marketplace update only.** Published names installed, both plugins;
marketplace moved.

- The next `claude plugin list` printed `Note: Renamed to "clear-partner" in the
  "clear-claude" marketplace` under the old id, and `enabledPlugins` became
  `{"clear-ui@clear-claude": true, "clear-partner@clear-claude": true}`.
- First session: `plugin-cache-miss` for `clear-partner@clear-claude`, no forced style, and
  `Added clear-partner@clear-claude with scope user`; afterwards
  `plugins/cache/clear-claude/clear-partner/` existed and `claude plugin list` showed
  `clear-partner@clear-claude` 0.2.0. Claude Code's documentation says the user must run
  `/plugin install` after a cache miss; on 2.1.278 it fetched the plugin by itself.
- Second session: two skills loaded from `clear-partner`, and `Using forced plugin output
  style: clear-partner:Clear Partner`.
- **Run again from scratch, the gap was longer:** sessions one *and* two logged
  `plugin-cache-miss` and no forced style; sessions three and four forced the style. The
  sessions here are `claude -p` runs that end at once for want of a credential, so a fetch
  started by one may simply not have finished before the next; an interactive session
  that stays open was not measured. Either way the number of sessions is not something to
  promise.
- `clear-ui@clear-claude` stayed listed at 0.2.0, enabled, with its key unchanged, in
  every run.

**Upgrade from a local clone** (a `directory` marketplace, as used when testing a checkout):
the same notice and the same settings rewrite, and no gap — the first session loaded the
plugin and forced the style, because the files are read in place and there is nothing to
fetch.

**The old commands after the rename.** `claude plugin update clear-claude` →
`Plugin "clear-claude" not found`. `claude plugin uninstall clear-claude@clear-claude`, after
the rename was applied → `not found in installed plugins`. `claude plugin install
clear-claude@clear-claude` in a fresh config → `not found in marketplace "clear-claude"`.

**A disabled install.** Installed under the published name, disabled, marketplace moved,
one session: still listed as `clear-claude@clear-claude`, disabled, and `enabledPlugins`
still `{"clear-claude@clear-claude": false}`.

Not measured: macOS and Linux, Claude Code older than 2.1.278, managed settings, and the
project and local scopes (user scope only).
