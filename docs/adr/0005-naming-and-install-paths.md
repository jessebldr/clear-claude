# ADR 0005: One umbrella name, one plugin per layer name, no bundle plugin

**Status:** Accepted · **Date:** 2026-09-19 · Amends [ADR 0004](0004-one-plugin-per-layer.md)

## Context

The repository started as one plugin, so the product, the marketplace and the plugin were
all called `clear-claude`, and the install id was `clear-claude@clear-claude`. Then a second
plugin arrived (`clear-ui`) and a third is planned. At that point the name stopped
describing anything: `clear-claude` meant the product in the README, the marketplace in
`marketplace update clear-claude`, and the output-style plugin in
`plugin update clear-claude` — two commands, one word, two different objects. The skill
namespace `/clear-claude:clear-doctor` said "product" while diagnosing one layer of it, and a
reader could not tell from `clear-ui@clear-claude` whether `clear-claude` was a sibling or a
parent.

What the platform offers, verified on Claude Code 2.1.278 rather than assumed:

- A plugin's `name` is its identifier: it is the key in `enabledPlugins`, the namespace of
  its skills (`/name:skill`) and of its output style (`name:Style Name`). `displayName` is a
  label only, "not used for namespacing or lookup"
  ([plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)). Both
  plugins already set it; it does not fix an id.
- `marketplace.json` takes a top-level `renames` map, old plugin name → current name,
  documented for Claude Code 2.1.193 and later. At session start the loader follows it,
  loads the plugin under the new name, shows `Renamed to "…" in the "…" marketplace` once,
  and rewrites the key in `enabledPlugins` and `pluginConfigs` in the user, project and
  local settings. The notice and the `enabledPlugins` rewrite were measured at all three
  scopes, on three platforms; `pluginConfigs` is the documentation's word (neither plugin
  has any): [docs/migration.md](../migration.md#what-was-measured).
- The map is only consulted for a name that is *not* in `plugins[]` — the documentation
  calls it the path taken "instead of seeing a `plugin-not-found` error", and the 2.1.278
  loader returns early when the old name is still listed (read from the shipped code, not
  documented). So one name cannot be both renamed and kept.
- There is **no** rename mechanism for a marketplace. Its `name` is the key users
  registered it under; a different name is a different marketplace, and every install
  would be orphaned.
- `plugin.json` takes `dependencies`, which Claude Code auto-installs, so a bundle plugin
  is technically possible.

## Decision

1. **The vocabulary.** One umbrella, one name per layer, and the slug is always the
   lower-case, hyphenated form of the name:

   | Name | What it is | Slug | Install id |
   | --- | --- | --- | --- |
   | Clear Claude | the product, this repository, and the marketplace | `clear-claude` | — (`jessebldr/clear-claude` to add it) |
   | Clear Partner | the communication layer: one output style, two diagnostic skills | `clear-partner` | `clear-partner@clear-claude` |
   | Clear UI | the status layer: a status bar | `clear-ui` | `clear-ui@clear-claude` |
   | Clear Transcript | the future transcript layer, on function hooks ("Mods") | `clear-transcript` (reserved, not listed) | — |

   An id now reads as *layer@product*. "Clear Claude" is never again the name of a plugin.

2. **The plugin `clear-claude` is renamed `clear-partner`**, in its manifest, its
   marketplace entry and its directory (`plugins/clear-partner`), with
   `"renames": { "clear-claude": "clear-partner" }` in `marketplace.json`. The map is
   append-only history and is never edited.

3. **The marketplace keeps the name `clear-claude`.** It is the umbrella, so the name is
   right, and it cannot be migrated anyway.

4. **The output style keeps its name, `Clear Partner`, and the prompt keeps its bytes.**
   The rename changes no behaviour, so it needs no eval run and the recorded SHA-256
   stands. Skills keep their names too (`clear-doctor`, `clear-audit`); only their
   namespace moves, to `/clear-partner:…`.

5. **No bundle plugin.** "Full Clear Claude" is a documented path — two `install` lines and
   one setup sentence — not a third plugin that depends on the other two. A bundle would
   have to be called `clear-claude` again, bringing back the ambiguity this ADR removes;
   the rename could not then apply, because a name still present in `plugins[]` is not
   migrated; and one install command would pull in a plugin that asks to edit
   `settings.json`, which is exactly the boundary ADR 0004 draws. The cost is one extra
   line in the recommended path.

6. **The future layer is called Clear Transcript**, not "Clear Mods" as ADR 0004 had it.
   "Mods" is Anthropic's word for the mechanism; the layer is named for what the user
   gets. The rest of ADR 0004 stands: it stays under `experimental/`, unlisted, until
   function hooks are documented and on by default.

## Consequences

- **Good:** one word, one object. `marketplace update clear-claude` and
  `plugin update clear-partner` no longer look like the same command twice.
- **Good:** existing users' settings migrate by themselves on Claude Code 2.1.193 or later.
- **Bad:** for an install from GitHub the migration has a gap: after the marketplace
  update the settings have the new key but the plugin's files are not cached under the new
  name, and sessions do not fetch them — Clear Partner stays off until a `claude plugin`
  command runs (measured on Windows, macOS and Linux). One `install` line closes the gap,
  and the upgrade instructions lead with it. A disabled install is not migrated at all, and
  one enabled from managed settings stops loading until an administrator changes the key.
- **Bad:** skill invocations change from `/clear-claude:clear-doctor` to
  `/clear-partner:clear-doctor`, and the style's qualified name from
  `clear-claude:Clear Partner` to `clear-partner:Clear Partner`. Natural-language triggers
  ("clear doctor") are unaffected. Anyone who scripted the old strings has to change them.
- **Bad:** Claude Code older than 2.1.193 ignores `renames` and reports `plugin-not-found`
  for the old id. The style already required 2.1.274, so no supported install is affected,
  and the manual path is two commands ([docs/migration.md](../migration.md)).
- **Settled in 0.4.1:** the side-by-side GIFs were captioned "+ clear-claude plugin". The
  caption is a banner the edit step draws, not part of the recorded session, so the GIFs
  were cut again from the same stored frames with the new name. What is *inside* a frame
  is untouched, as always.
- **Accepted:** `clear-ui@clear-claude` is unchanged, so its data directory
  (`plugins/data/clear-ui-clear-claude`) and every existing Clear UI install are untouched.
