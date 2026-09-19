# AGENTS.md

Guidance for coding agents (and people) working in this repository. This file is the
canonical one; `CLAUDE.md` only imports it. Keep it short: it is loaded into every session.
State a rule and point at the document that owns the detail — do not copy the detail here.

## What this repository is

**Clear Claude** is a product made of independent Claude Code plugins, and this repository
is both its marketplace (`.claude-plugin/marketplace.json`, named `clear-claude`) and the
host of the plugins. One plugin per layer; they share no code and no prompt, and installing
one never touches another ([ADR 0004](docs/adr/0004-one-plugin-per-layer.md)).

| Name | Slug / install id | Where | What it is |
| --- | --- | --- | --- |
| Clear Claude | `clear-claude` (marketplace) | repo root | The umbrella. Never the name of a plugin. |
| Clear Partner | `clear-partner@clear-claude` | `plugins/clear-partner` | The product's core: one output style (`output-styles/clear-partner.md`), two read-only diagnostic skills, the eval cases. No code, no hooks, no tests. Writes nothing outside itself. |
| Clear UI | `clear-ui@clear-claude` | `plugins/clear-ui` | A status bar. Node >= 18, ES modules, zero dependencies, no build step. The only part with code and a test suite. |
| Clear Transcript | `clear-transcript` (reserved) | `experimental/` | Future layer on function hooks. Spikes only; never listed in the marketplace. |

Use exactly these names. The plugin `clear-partner` was called `clear-claude` before
marketplace 0.4.0; `renames` in `marketplace.json` migrates old installs and is append-only
([ADR 0005](docs/adr/0005-naming-and-install-paths.md), [docs/migration.md](docs/migration.md)).
The old id belongs only in records of the time (CHANGELOG, ADRs, `docs/research/`,
`docs/clear-ui-dogfood.md`, `demo/runs/`), in `docs/migration.md`, and as one pointer to that
page in README and `llms.txt`. The list CI enforces is `LEGACY_ALLOWED` in
`scripts/check-repo.mjs`.

Also here: `source/clear-partner.md` (the style before the port; differs from the shipped
file by one frontmatter line), `demo/` (VHS tapes and scripts behind the GIFs in `assets/`,
all recorded from real sessions), `scripts/` (repository checks).

## Commands

From the repo root — the same commands CI runs:

```sh
node scripts/check-repo.mjs      # versions, recorded hash, canonical names, links
claude plugin validate .claude-plugin/marketplace.json --strict
claude plugin validate plugins/clear-partner --strict
claude plugin validate plugins/clear-partner/skills --strict
claude plugin validate plugins/clear-ui --strict
claude plugin validate plugins/clear-ui/skills --strict
```

Clear UI, from `plugins/clear-ui` (nothing to install first):

```sh
node --test                                         # whole suite; `npm test` is the same
node --test test/layout.test.mjs                    # one file
node --test --test-name-pattern="<regex>" test/layout.test.mjs   # one test
UPDATE_GOLDEN=1 node --test test/render.test.mjs    # regenerate goldens after an intended visual change
node bench/bench.mjs                                # timing; fails only past the 250 ms ceiling
node bin/statusline.mjs < test/fixtures/idle.json   # render without installing; COLUMNS=120 sets the width
```

PowerShell has no `<` redirection: run the render through bash, or
`Get-Content test/fixtures/idle.json | node bin/statusline.mjs`.

**Do not run the behavioural evals unless asked.** `claude plugin eval` bills real money
against a real credential and is never in CI. The command, the suite and the recorded runs
are in [docs/evals.md](docs/evals.md).

## The prompt is the product

`plugins/clear-partner/output-styles/clear-partner.md` is treated like shipped code:

- **An edit is a behaviour change**: its own version bump and CHANGELOG entry, never a
  ride-along. Run the evals first and edit only where a case fails
  ([docs/releasing.md](docs/releasing.md), [ADR 0002](docs/adr/0002-eval-honesty.md)).
- **Its SHA-256 and byte size are recorded** in `skills/clear-audit/SKILL.md` and
  `docs/clear-partner-port.md`; an edit updates both, and `source/clear-partner.md` keeps
  the same body. `scripts/check-repo.mjs` fails when they disagree.
- **Its bytes are pinned to LF** by `.gitattributes` (a CRLF checkout hashes differently).
  So are `plugins/clear-ui/test/golden/*.txt`, `*.sh` and `*.tape`.
- **Its location is load-bearing.** It is discovered by convention from `output-styles/`;
  `plugin.json` deliberately does not declare `outputStyles`, because that field replaces
  the scan. Moving the file silently disables the product.
- **Frontmatter is exactly four keys**: `name`, `description`, `keep-coding-instructions`,
  `force-for-plugin`. Claude Code does not validate output styles, so a typo validates clean
  and fails silently. A green `validate --strict` is necessary, not sufficient;
  `/clear-partner:clear-audit` against a test install is the check that covers the style.
- **Communication rules live only in the output style**
  ([ADR 0003](docs/adr/0003-single-prompt-layer.md)). No CLAUDE.md, AGENTS.md, hooks or MCP
  server inside `plugins/clear-partner`, and no style rules copied into skills or docs.

Both diagnostic skills are deterministic, strictly read-only check procedures. They report
paths, command output and hashes — never a judgment of tone, never the contents of a
settings file.

## Clear UI: rules that must survive any edit

Design record: [docs/ui-architecture.md](docs/ui-architecture.md). Per-file table:
[plugins/clear-ui/README.md](plugins/clear-ui/README.md).

- **Pure core, thin Node shell.** `src/render.mjs`, `state.mjs`, `layout.mjs`,
  `sanitize.mjs`, `jsonedit.mjs`, `install.mjs`, `verify.mjs`, `activity.mjs` and
  `usage.mjs` use no Node API, clock or environment. I/O stays in `src/stdin.mjs`,
  `paths.mjs`, `git.mjs`, `session-state.mjs`, `usage-cache.mjs` and `bin/`.
- **Data flow:** stdin JSON → `state.mjs` (distrusts every field) → `layout.mjs` (fit to
  `COLUMNS`) → `render.mjs` → stdout. By default the only other input is one `git status`
  (150 ms timeout, 5 s cache): no network, no credentials, no transcript parsing.
- **`bin/statusline.mjs` always exits 0, never writes stderr, prints nothing when unsure.**
  Hooks are silent and record only; the opt-in ones exit at once until the user opts in.
- **`bin/setup.mjs` is the only writer of the user's `settings.json`**: plan, back up, edit
  one key by surgical text edit, restore on uninstall.
- **The usage provider is the one opt-in exception and stays off the render path.**
  `claude` is spawned with an argument vector and `shell: false`, never through a shell
  (Git Bash turns `/usage` into a path, and a path is a paid prompt); a run is believed only
  when it proves no model turn was made; only `usage_report` is parsed; a failure never
  overwrites the last good cache; no model name appears in the code. Describe it as Claude
  Code's own command run in the background, never as an API integration. With it off, the
  output stays byte-identical — the goldens are the check
  ([docs/research/headless-usage.md](docs/research/headless-usage.md)).
- **Goldens** in `test/golden/` are byte-compared on Linux, macOS and Windows. Review the
  diff of a regenerated golden before keeping it. All drawn text is sanitized, every span
  carries an explicit foreground, and the palette is held to 4.5:1 by a test.
- The plugin data id `clear-ui-clear-claude` (`src/paths.mjs`) is derived from
  `clear-ui@clear-claude`. Renaming the plugin or the marketplace orphans every install.

## Versions and releases

Three version numbers: one per plugin, plus the marketplace's `metadata.version`, which
tracks the newest change to either. Bump only the plugin that changed, in
`plugins/<plugin>/.claude-plugin/plugin.json` **and** its `marketplace.json` entry, plus
`metadata.version`; for `clear-ui` keep `package.json` equal. `scripts/check-repo.mjs`
enforces the agreement. The `v` git tag carries the marketplace version; a release is
published when it reaches `main` and the tag is pushed. Steps:
[docs/releasing.md](docs/releasing.md).

## Writing in this repo

- **One home per fact.** Install commands: README "Install" is the quick path,
  `docs/install.md` and `docs/clear-ui-install.md` the lifecycle. Names: ADR 0005. What is
  written to a user's machine: `docs/clear-ui-install.md`. Link to the home; do not restate it.
- Claims are tied to evidence: platform facts trace to `docs/research/` with the Claude
  Code version they were verified on; eval and demo numbers carry their limits, including
  runs that went the wrong way. Do not round a smoke test up into a benchmark.
- `docs/research/`, `demo/runs/`, ADRs and released CHANGELOG entries are records. Do not
  rewrite them to match new names; add a dated note if a reader would be misled.
- CHANGELOG entries say what a user will notice, not which files moved.
- Directories are created when they hold something, never as placeholders.
