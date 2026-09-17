# Releasing

Clear Claude uses semantic versioning. Because the product *is* a prompt, an edit to
`clear-partner.md` is a behaviour change: it gets a version bump and its own CHANGELOG
entry, never a ride-along in an unrelated commit.

## The steps

1. **If the prompt changed, run the evals first.** `claude plugin eval` costs real
   money and needs a real credential, so it is not in CI — see
   [evals.md](evals.md) for the suite and the last recorded run. Inspect the delta
   against the no-plugin baseline before you decide the change is shippable.

2. **Bump the version in both manifests.** They must agree; nothing enforces this for
   you, and `claude plugin tag` is the only thing that will complain.
   - `plugins/clear-claude/.claude-plugin/plugin.json` → `version`
   - `.claude-plugin/marketplace.json` → `plugins[0].version`
     (the top-level `metadata.version` tracks the marketplace itself)

3. **Update `CHANGELOG.md`.** Add a `## [x.y.z] - YYYY-MM-DD` section with
   Added / Changed / Fixed / Removed subsections. Say what a user will *notice*,
   not which files moved.

4. **Validate.** The same three commands CI runs:

   ```sh
   claude plugin validate .claude-plugin/marketplace.json --strict
   claude plugin validate plugins/clear-claude --strict
   claude plugin validate plugins/clear-claude/skills --strict
   ```

   Remember that a green run says nothing about the output style — Claude Code does
   not validate output styles at all. `/clear-claude:clear-audit` against a test
   install is the check that actually covers the product.

5. **Commit, then tag.**

   ```sh
   git commit -m "release: v0.1.0"
   git tag v0.1.0
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

Use it as a pre-flight check rather than as the tagger:

```sh
claude plugin tag plugins/clear-claude --dry-run
```

Version enforcement is our own job either way. Claude Code performs no semver
validation — the literal string `"notsemver"` passes `--strict` and would be baked
straight into a tag name (see [phase0-research.md](phase0-research.md), open question 5).

## Publishing

Not yet applicable. There is no remote and nothing has been published. Once a GitHub
repo exists, users install by adding this repository as a marketplace; see
[install.md](install.md).
