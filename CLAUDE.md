# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A Claude Code plugin marketplace that is also the host of its two plugins
(`.claude-plugin/marketplace.json` points at each with a relative `source`). The plugins are
independent on purpose: they share no code and no prompt, and installing one never touches the
other ([ADR 0004](docs/adr/0004-one-plugin-per-layer.md)).

- **`plugins/clear-claude`** — the product. One output style
  (`output-styles/clear-partner.md`), two read-only diagnostic skills, and the eval cases. No
  code, no hooks, no tests. It writes nothing outside itself.
- **`plugins/clear-ui`** — an optional status bar. Node >= 18, ES modules, zero dependencies,
  no build step. This is the only part of the repo with code and a test suite.

`source/clear-partner.md` is the original style before the port; it differs from the shipped
file by one frontmatter line (`force-for-plugin`). `experimental/` holds function-hook spikes
and is never listed in the marketplace. `demo/` holds the VHS tapes and scripts that record the
GIFs in `assets/` from real sessions.

## Commands

Validation, the same commands CI runs (from the repo root):

```sh
claude plugin validate .claude-plugin/marketplace.json --strict
claude plugin validate plugins/clear-claude --strict
claude plugin validate plugins/clear-claude/skills --strict
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

In PowerShell there is no `<` redirection: run the render through bash, or pipe with
`Get-Content test/fixtures/idle.json | node bin/statusline.mjs`.

Behavioural evals for Clear Partner cost real money and need a real credential, so they are
never in CI and should not be run without being asked:

```sh
cd plugins/clear-claude
claude plugin eval --eval-dir ./evals --runs 1 --no-publish --trust-plugin \
  --allow-tools Write,Edit,Read,Glob,Grep --max-cost-usd 10
```

Results land in `evals/results/`, which is gitignored; the numbers are recorded by hand in
`docs/evals.md`.

## The prompt is the product

`plugins/clear-claude/output-styles/clear-partner.md` is treated like shipped code:

- **An edit is a behaviour change.** It gets a version bump and its own CHANGELOG entry, never
  a ride-along in an unrelated commit. Run the evals first and edit the prompt only where a
  case fails ([docs/releasing.md](docs/releasing.md), [ADR 0002](docs/adr/0002-eval-honesty.md)).
- **Its SHA-256 and byte size are recorded** in `skills/clear-audit/SKILL.md` and
  `docs/clear-partner-port.md` (and quoted in `CHANGELOG.md`). Any edit must update them, and
  `source/clear-partner.md` must keep carrying the same body.
- **Its bytes are pinned to LF** by `.gitattributes`, because a CRLF checkout hashes
  differently and `clear-audit` would report a modified prompt. The same applies to
  `plugins/clear-ui/test/golden/*.txt`, `*.sh` and `*.tape`.
- **Its location is load-bearing.** The style is discovered by convention from
  `output-styles/`; `plugin.json` deliberately does not declare `outputStyles`, because that
  field replaces the scan. Moving the file silently disables the product.
- **Frontmatter is a fixed list of four keys**: `name`, `description`,
  `keep-coding-instructions`, `force-for-plugin`. Claude Code does not validate output styles
  at all, so a typo validates clean and fails silently at runtime. A green
  `validate --strict` is necessary, not sufficient; `/clear-claude:clear-audit` against a test
  install is the check that covers the style.
- **Communication rules live only in the output style** ([ADR 0003](docs/adr/0003-single-prompt-layer.md)).
  Do not add a CLAUDE.md, hooks or an MCP server inside `plugins/clear-claude`, and do not
  copy style rules into skills or docs. This root file is repository guidance, not part of
  the plugin.

Both diagnostic skills are deterministic check procedures and strictly read-only. They report
paths, command output and hashes — never a judgment of tone, and never the contents of a
settings file (only the layer, the path, and whether `outputStyle` is set).

## Clear UI architecture

The design record, with the measurement behind each decision, is
[docs/ui-architecture.md](docs/ui-architecture.md); the per-file table is in
[plugins/clear-ui/README.md](plugins/clear-ui/README.md). The shape:

- **Pure core, thin Node shell.** `src/render.mjs`, `state.mjs`, `layout.mjs`, `sanitize.mjs`,
  `jsonedit.mjs`, `install.mjs`, `verify.mjs`, `activity.mjs` and `usage.mjs` use no Node API,
  clock or environment, so a function-hooks module can host the same renderer later. Keep I/O in
  `src/stdin.mjs`, `paths.mjs`, `git.mjs`, `session-state.mjs`, `usage-cache.mjs` and the `bin/`
  entry points.
- **Data flow:** statusline stdin JSON → `state.mjs` (distrusts every field) → `layout.mjs`
  (fit to `COLUMNS` by priority, one row or two) → `render.mjs` → stdout. By default the only
  other input is one `git status` with a 150 ms timeout behind a 5 s cache: no network, no
  credentials, no transcript parsing.
- **The usage provider is the one opt-in exception, and it stays off the render path.**
  `configure.mjs usage on` lets the status line read `cache/usage.json` and, at most every ten
  minutes, start a detached `bin/usage-refresh.mjs`, which runs Claude Code's own
  `claude -p /usage` and reads its structured `usage_report` (undocumented; measured in
  [docs/research/headless-usage.md](docs/research/headless-usage.md)). Rules that must survive
  any edit: `claude` is spawned with an argument vector and `shell: false`, never through a
  shell (Git Bash turns `/usage` into a path, and a path is a paid prompt); a run is believed
  only when it proves no model turn was made; only `usage_report` is parsed, never the text; a
  failure never overwrites the last good cache; no model name appears in the code. Describe it
  as Claude Code's own command run in the background, never as an API integration. With it off,
  the output must stay byte-identical — the goldens are the check.
- **`bin/statusline.mjs` always exits 0, never writes stderr, and prints nothing when
  unsure.** Hooks (`bin/sync.mjs`, `observe.mjs`, `agents.mjs`) are silent and record only;
  the opt-in ones exit at once until the user opts in.
- **`bin/setup.mjs` is the only thing that writes to the user's `settings.json`**: plan, back
  up, edit one key by surgical text edit (`jsonedit.mjs`, every other byte preserved), restore
  on uninstall. A plugin cannot register a status line itself, which is why this script exists.
- **The runtime is copied** to `<config home>/plugins/data/clear-ui-clear-claude/runtime`,
  a path that survives plugin updates; the `SessionStart` hook re-copies it when the version
  changes.
- **Golden files** in `test/golden/` hold every layout of every fixture, byte-compared on
  Linux, macOS and Windows, with ESC stored as `␛`. Review the diff of a regenerated golden
  before keeping it.
- All text drawn is sanitized (escape sequences, control and bidi characters), and every span
  carries an explicit foreground because Claude Code repaints unstyled spans grey. The palette
  is held to 4.5:1 contrast by `test/palette.test.mjs`.

## Versions and releases

There are three version numbers: one per plugin, and the marketplace's `metadata.version`,
which tracks the newest change to either. Bump only the plugin that changed, in both
`plugins/<plugin>/.claude-plugin/plugin.json` and its entry in `marketplace.json`, plus
`metadata.version`; for `clear-ui` also keep `package.json` equal. Nothing enforces agreement
or semver — `claude plugin tag plugins/<plugin> --dry-run` (after committing) is the only
cross-check. The `v` git tag carries the marketplace version. A release is published when it
reaches `main` and the tag is pushed. Full steps: [docs/releasing.md](docs/releasing.md).

## Writing in this repo

- Claims are tied to evidence: platform facts trace to `docs/research/` with the Claude Code
  version they were verified on, and eval or demo numbers are reported with their limits,
  including runs that went the wrong way. Do not round a smoke test up into a benchmark.
- CHANGELOG entries say what a user will notice, not which files moved.
- Directories are created when they hold something, never as placeholders.
