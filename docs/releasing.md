# Releasing

Clear Claude uses semantic versioning. Because the product *is* a prompt, an edit to
`clear-partner.md` is a behaviour change: it gets a version bump and its own CHANGELOG
entry, never a ride-along in an unrelated commit.

The marketplace holds two plugins, `clear-claude` and `clear-ui`, and **three version
numbers**: one per plugin, and the marketplace's own (`metadata.version`), which tracks
the newest change to either. Bump only the plugin that changed, and the marketplace
with it. The plan for the marketplace number is in
[roadmap-v2.md](roadmap-v2.md#versions).

## The steps

1. **If the prompt changed, run the evals first.** `claude plugin eval` costs real
   money and needs a real credential, so it is not in CI — see
   [evals.md](evals.md) for the suite and the last recorded run. Inspect the delta
   against the no-plugin baseline before you decide the change is shippable.

2. **Bump the version in both manifests of the plugin that changed.** They must agree;
   nothing enforces this for you, and `claude plugin tag` is the only thing that will
   complain.
   - `plugins/<plugin>/.claude-plugin/plugin.json` → `version`
   - `.claude-plugin/marketplace.json` → that plugin's entry under `plugins[]` → `version`
   - `.claude-plugin/marketplace.json` → `metadata.version`, the marketplace itself
   - for `clear-ui` only, `plugins/clear-ui/package.json` → `version`. Nothing reads it —
     the runtime takes its version from `plugin.json` — so keep it equal to avoid a
     second answer to "which version is this?"

3. **Update `CHANGELOG.md`.** Add a `## [x.y.z] - YYYY-MM-DD` section with
   Added / Changed / Fixed / Removed subsections. Say what a user will *notice*,
   not which files moved.

4. **Validate and test.** The same commands CI runs:

   ```sh
   claude plugin validate .claude-plugin/marketplace.json --strict
   claude plugin validate plugins/clear-claude --strict
   claude plugin validate plugins/clear-claude/skills --strict
   claude plugin validate plugins/clear-ui --strict
   claude plugin validate plugins/clear-ui/skills --strict
   cd plugins/clear-ui && node --test && node bench/bench.mjs
   ```

   Remember that a green run says nothing about the output style — Claude Code does
   not validate output styles at all. `/clear-claude:clear-audit` against a test
   install is the check that actually covers Clear Partner.

5. **Commit, then tag.** The `v` tag carries the marketplace version:

   ```sh
   git commit -m "release: v0.2.0"
   git tag v0.2.0
   ```

## A note on `claude plugin tag`

Claude Code ships its own tagger:

```sh
claude plugin tag [path] [--dry-run] [-m <msg>] [--push] [--remote <name>]
```

It creates a tag named `{name}--v{version}` — so `clear-claude--v0.1.0`, **not**
`v0.1.0` — and validates that `plugin.json` and the enclosing marketplace entry agree
on the version before it does. That cross-check is the useful part, and `--dry-run`
gets it for free without creating anything.

Use it as a pre-flight check rather than as the tagger, once per plugin:

```sh
claude plugin tag plugins/clear-claude --dry-run
claude plugin tag plugins/clear-ui --dry-run
```

Run it after committing: even as a dry run it refuses while files that affect the
release are uncommitted (observed on 2.1.278).

Version enforcement is our own job either way. Claude Code performs no semver
validation — the literal string `"notsemver"` passes `--strict` and would be baked
straight into a tag name (see [phase0-research.md](phase0-research.md), open question 5).

## Publishing

The repository is the marketplace: `github.com/jessebldr/clear-claude`. Users add it
with `claude plugin marketplace add jessebldr/clear-claude`, so a release is published
when it reaches `main` and the tag is pushed. See [install.md](install.md) and
[clear-ui-install.md](clear-ui-install.md).
