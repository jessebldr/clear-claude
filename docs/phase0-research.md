# Phase 0 Research — Claude Code plugin surface

**Target:** Claude Code CLI **2.1.274** (`~/.npm-global/bin/claude` → compiled `bin/claude.exe`)
**Platform:** Linux. **Date:** 2026-09-17.

## How each fact was obtained (evidence tiers)

Every claim below is tagged with how it was verified. Nothing here is guessed.

| Tag | Meaning |
| --- | --- |
| `[HELP]` | Quoted verbatim from `claude ... --help` output on this machine. |
| `[VALIDATOR]` | Derived by probing `claude plugin validate --json`, which distinguishes three responses: `Unknown field 'X'. Claude Code ignores it at load time.` (field NOT in schema), `X: Invalid input` (field IS in schema, wrong value type), and silence (field in schema, value accepted). |
| `[EVAL-SCHEMA]` | Derived by probing `claude plugin eval` case loading, which surfaces Zod errors (`Required`, `Unrecognized key(s) in object`, `Invalid discriminator value`) before any agent run launches. |
| `[SCAFFOLD]` | Read from files written by `claude plugin init --with ...` / `claude plugin eval init --bare`. |
| `[BINARY]` | Read from literal strings embedded in the shipped binary (`strings claude.exe`). |
| `UNVERIFIED` | Not found in any local source. |

The user's brief asked for help text only. Help text does **not** contain either manifest schema, so `[VALIDATOR]`, `[SCAFFOLD]` and `[BINARY]` were used to fill those gaps. Treat `[HELP]` as strongest and `[BINARY]` as weakest.

---

## 1. `plugin.json` manifest schema

Location: `<plugin-root>/.claude-plugin/plugin.json`. `[SCAFFOLD]`
Scaffolds emit `"$schema": "https://anthropic.com/claude-code/plugin.schema.json"` — that URL was **not** fetched (no network verification). `[SCAFFOLD]`

### Recognized fields (complete, as far as probing reached)

| Field | Accepted type (verified) | Notes |
| --- | --- | --- |
| `$schema` | string | Emitted by `plugin init`. `[SCAFFOLD]` |
| `name` | string | **Required** — omitting gives `name: Invalid input`. Rejects spaces: `Plugin name cannot contain spaces. Use kebab-case (e.g., "my-plugin")`. `[VALIDATOR]` |
| `description` | string | Not required by the validator. `[VALIDATOR]` |
| `version` | string | Not required; **no semver enforcement** — `"notsemver"` validates clean. `[VALIDATOR]` |
| `author` | object (`{name, email, url}` all seen in the wild) | A bare string is rejected: `author: Invalid input`. Absent → warning `No author information provided. Consider adding author details for plugin attribution`. `[VALIDATOR]` |
| `homepage` | string (URL form) | Plain `"x"` → `Invalid input`; `"https://e.com"` accepted. `[VALIDATOR]` |
| `repository` | string | `[VALIDATOR]` |
| `license` | string | `[VALIDATOR]` |
| `keywords` | array of string | `[VALIDATOR]` |
| `displayName` | string | `[VALIDATOR]` |
| `category` | string | `[VALIDATOR]` |
| `tags` | string accepted | `[VALIDATOR]` |
| `metadata` | object (free-form; no unknown-key warnings) | `[VALIDATOR]` |
| `strict` | boolean | `[VALIDATOR]` |
| `commands` | string path **or** array of paths | `[VALIDATOR]` |
| `agents` | array of paths **only** (string rejected: `agents: Invalid input`) | `[VALIDATOR]` |
| `skills` | string path **or** array of paths | `[VALIDATOR]` |
| `hooks` | object (e.g. `{"PreToolUse": []}`) | A plain string path is rejected. `[VALIDATOR]` |
| `mcpServers` | object (e.g. `{"srv": {"command": "echo"}}`) | String and array both rejected. `[VALIDATOR]` |
| `outputStyles` | string dir **or** array of paths | `[VALIDATOR]` |
| `themes` | string dir **or** array of paths | `[VALIDATOR]` |
| `workflows` | string dir **or** array of paths | `[VALIDATOR]` |
| `channels` | array of `{server, displayName}` objects | Strict object — extra key gives `channels.0: Invalid input`. `displayName` optional. `[VALIDATOR]` `[SCAFFOLD]` |
| `dependencies` | **array** of strings or objects (`["other@mkt"]`, `[{"name":"o"}]`) | An object map `{"other":"1.0.0"}` is rejected. `[VALIDATOR]` |
| `settings` | object (e.g. `{"model": "x"}`) | String path rejected. `[VALIDATOR]` |
| `userConfig` | object map — see below | `[VALIDATOR]` |
| `experimental` | object; **only key recognized is `evals`** (string) | `experimental.sandbox`, `.mcp`, `.lsp`, `.channels`, `.network` all warn `Unknown field`. `[VALIDATOR]` |

### `userConfig` shape `[VALIDATOR]`

```jsonc
"userConfig": {
  "<optionKey>": {
    "type": "string" | "boolean" | "number" | "file",   // exactly these four; integer/select/enum/secret/path/array/object all rejected
    "title": "<string>",        // REQUIRED
    "description": "<string>",  // REQUIRED
    "default": <any>,           // recognized
    "required": <non-string>,   // recognized (string value → "Invalid input", so likely boolean)
    "options": <non-string>,    // recognized (string value → "Invalid input", likely array)
    "min": <number>,            // recognized
    "max": <number>             // recognized
  }
}
```
Rejected (not in schema): `label`, `placeholder`, `enum`, `env`, `secret`, `pattern`. An array form (`[{key: ...}]`) is rejected.
Set from CLI at install time via `--config <key=value>`. `[HELP]`

### Fields explicitly NOT in `plugin.json` `[VALIDATOR]`

`lsp`, `outputStyle` (singular), `statusLine`/`statusline`, `sandbox`, `logo`, `icon`, `interface`, `permissions`, `channel` (singular), `plugins`, `owner`, `type`, `title`, `prompts`, `scripts`, `config`, `requirements`, `engines`, `minClaudeCodeVersion`, `private`, `funding`, `bugs`, `contributors`, `env`, `install`, `postInstall`, `main`, `files`, `readme`, `docs`, `disabled`, `enabled`, `autoUpdate`, `marketplaceUrl`.

`id` and `source` are recognized but produce a dedicated warning:
> `Field 'id' belongs in the marketplace entry (marketplace.json), not plugin.json. It's harmless here but unused — Claude Code ignores it at load time.`

### Component locations discovered by convention (no manifest entry needed) `[SCAFFOLD]`

`claude plugin init p0probe --with skills agents hooks mcp lsp output-style channel` produced:

```
.claude-plugin/plugin.json
SKILL.md                      # plugin root itself is a skill
skills/example/SKILL.md
agents/example.md
hooks/hooks.json              # { "hooks": { "SessionStart": [ { "hooks": [ {"type":"command","command":"bun ${CLAUDE_PLUGIN_ROOT}/..."} ] } ] } }
hooks-handlers/on-session-start.ts
.mcp.json                     # { "mcpServers": { ... } }   ← NOT a manifest field
.lsp.json                     # { "example": {"command":..., "args":[...], "extensionToLanguage":{...}} }
output-styles/<name>.md
package.json
server.ts
```

Note the asymmetry: LSP has **no** `plugin.json` field at all; it is configured only by the `.lsp.json` file. `${CLAUDE_PLUGIN_ROOT}` is the interpolation variable used in hook and MCP commands.

Only the manifest itself is validated — `claude plugin validate <dir>` on a plugin containing an output style with a bogus frontmatter key reported **`Validation passed`**. `[VALIDATOR]`

---

## 2. `marketplace.json` manifest schema

Location: `<marketplace-root>/.claude-plugin/marketplace.json`. `[VALIDATOR]`

### Top level `[VALIDATOR]`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | |
| `owner` | object: `name`, `email`, `url`, `github`, `avatar` all recognized | |
| `metadata` | object: only `description`, `version`, `pluginRoot` recognized. `metadata.owner`/`.homepage`/`.logo`/`.icon`/`.baseUrl` all warn `Unknown field`. | |
| `plugins` | array of plugin entries | |
| `description` | string | Recognized at top level too |
| `version` | string | Recognized at top level too |

Missing description → warning `No marketplace description provided. Adding a description helps users understand what this marketplace offers`.
Rejected top-level keys: `baseUrl`, `source`, `strict`, `displayName`, `homepage`, `repository`, `license`, `keywords`, `category`, `tags`, `logo`, `icon`, `headersHelper`, `command`, `commands`, `install`.

### Plugin entry (`plugins[]`) `[VALIDATOR]`

Recognized: `name`, `source` (**required**), `description`, `version`, `author`, `homepage`, `repository`, `license`, `keywords`, `category`, `tags`, `strict`, `displayName`, `commands`, `agents`, `skills`, `hooks`, `mcpServers`, `outputStyles`, `themes`, `workflows`, `channels`, `dependencies`, `userConfig`, `experimental`, `headersHelper`.

Rejected in a plugin entry: `id`, `icon`, `logo`, `command`, `install`, `requiresAuth`, `private`, `hidden`.

### `source` forms `[VALIDATOR]`

```jsonc
"source": "./relative/path"                              // string = relative path (a bare URL string is REJECTED)
"source": { "source": "github",  "repo": "owner/name" }  // repo required; ref/branch/tag/commit/path/subdir/sparse/owner/name also accepted
"source": { "source": "url",     "url": "https://…zip", "headersHelper": "…", "sha256": "…", "checksum": "…" }
"source": { "source": "npm",     "package": "x", "version": "…" }   // "registry" is recognized but typed differently
"source": { "source": "command", "command": "echo hi", "args": …, "cwd": …, "env": … }
```
Discriminator values **rejected**: `git`, `gitlab`, `local`, `file`, `directory`, `archive`, `zip`.

---

## 3. Exact command syntax `[HELP]`

```
claude plugin marketplace add <source>            # URL, path, or GitHub repo
      [--claudeai] [--scope <user|project|local>] [--sparse <paths...>]
claude plugin marketplace list [--json]
claude plugin marketplace remove|rm <name> [--scope <user|project|local>]   # omit --scope to remove from every scope
claude plugin marketplace update [name]                                     # all if name omitted

claude plugin install|i <plugin>            # or plugin@marketplace
      [-s|--scope <user|project|local>]     (default: "user")
      [--config <key=value>]                (repeatable)
      [--json] [-y|--yes] [--accept-command <sha256>]
claude plugin update <plugin>
      [-s|--scope <user|project|local|managed>]   (default: user — NOTE: managed only appears here)
      [--json] [-y|--yes] [--accept-command <sha256>]
claude plugin enable <plugin>   [-s|--scope <user|project|local>] [--json]
claude plugin disable [plugin]  [-a|--all] [-s|--scope <user|project|local>] [--json]
claude plugin uninstall|remove <plugin>
      [-s|--scope <user|project|local>] [--keep-data] [--prune] [-y|--yes] [--json]
claude plugin list [--json] [--available]    # --available requires --json
claude plugin prune|autoremove [-s|--scope <…>] [--dry-run] [-y|--yes]
claude plugin details <name>
claude plugin init|new <name>
      [--author <name>] [--author-email <email>] [--description <text>] [-f|--force]
      [--with skills agents hooks mcp lsp output-style channel]
claude plugin tag [path]
      [--dry-run] [-f|--force] [-m|--message <msg>] [--push] [--remote <name>]
```

Details worth carrying into design:
- `enable`/`disable` default scope is **auto-detect**; `install`/`uninstall`/`prune` default to **`user`**; `update` default is **`user`** and is the only command whose scope list includes **`managed`**. `[HELP]`
- `-y/--yes` is *required* whenever stdin or stdout is not a TTY and a marketplace-declared command must be confirmed. `[HELP]`
- `--accept-command <sha256>` pins the exact declared command: *"counts as -y for exactly that command, for that plugin and marketplace catalog, and nothing else. If either changed (a refresh that moved the catalog counts), the run refuses and reports the command again."* `[HELP]`
- `plugin update` says **"(restart required to apply)"**; `plugin init` says the new plugin *"will auto-load next session … Run `/reload-plugins` to load it now."* `[HELP]` `[SCAFFOLD]`
- `uninstall --keep-data` preserves `~/.claude/plugins/data/{id}/`. `[HELP]`
- `plugin tag` creates a `{name}--v{version}` git tag, "validating that plugin.json and any enclosing marketplace entry agree". `[HELP]`
- `plugin details <name>` prints a component inventory plus a **projected token cost** table (always-on vs on-invoke per component). Verified live. `[HELP]`

---

## 4. Validation command `[HELP]` `[VALIDATOR]`

```
claude plugin validate <path> [--json] [--strict]
```
> *"Validate a plugin or marketplace manifest, or the skills, agents, and commands in a directory."*
> `--strict`: *"Treat warnings as errors (exit 1). Use in CI to fail on unrecognized fields, missing metadata, and other issues that the runtime tolerates."*

Exit codes observed: `0` pass, `1` under `--strict` with warnings. `--json` emits `{success, strict, target, manifest:{file,type,errors[],warnings[],notes[]}, contents[]}`.

---

## 5. Plugin evals

### Command `[HELP]`

```
claude plugin eval [target]        # target = path | plugin name | plugin@marketplace
claude plugin eval init [name] [--bare] [--eval-dir <dir>] [-i|--interactive]
```
Eval dir resolution: `--eval-dir` → else manifest `experimental.evals` → else `evals/`. Cases are discovered at `<eval dir>/**/case.yaml` **or** `prompt.md + graders/*.md`. `[HELP]`

Full flag list, verbatim names: `--ablation <mode>` (`none | with-without`), `--allow-real-servers`, `--allow-tools <tools...>`, `--case <glob>`, `-j|--concurrency <n>` (1–8, default 1), `--eval-dir <dir>`, `--json [path]`, `--judge-model <model>` (default: haiku), `--keep-temp`, `--max-cost-usd <usd>`, `--mocks <mode>` (`record | off`, default `record`), `--model <model>`, `--no-publish`, `--no-scaffold`, `--output-dir <dir>`, `--publish-report`, `--report <path>`, `--runs <n>` (default `case.runs ?? 3`), `--scaffold`, `--tag <tag...>`, `--threshold <0..1>` (default 1.0), `--trust-plugin`, `--verbose`. `[HELP]`

Trust gate, verified live: running in an untrusted dir non-interactively fails with *"…is not a trusted plugin directory, and this run cannot stop to ask you about it (no interactive terminal, or --json / CI)."* `--trust-plugin` is the CI answer and *"Does not imply --scaffold, --allow-tools or --mocks off."* `[HELP]`

Results land in `<plugin>/<eval dir>/results/<timestamp>/` with `aggregate-result.json` and a self-contained `report.html`. Mocks live in `<eval dir>/mocks/`. `[HELP]` + verified live.

### `prompt.md` + `graders/*.md` form `[SCAFFOLD]`

`claude plugin eval init --bare demo` writes:

```
evals/demo/prompt.md               ---\nmax_turns: 10\nallowed_tools: [Read, Glob, Grep, Skill]\n---\n<task>
evals/demo/graders/criteria.md     ---\ntype: llm\nweight: 1\n---\n<success description>
```

`eval init` refuses to scaffold when `evals/` overlaps a declared component path: *"not scaffolding — evals/ overlaps the plugin's declared skills path "./"; the manifest declares the whole plugin as a component location; narrow that declaration."* Verified live.

### `case.yaml` schema `[EVAL-SCHEMA]`

Required top-level: `schema_version` (e.g. `"1.0"`), `name`, `execution`, `graders` (min 1 element).
Other recognized top-level keys: `description` (string), `tags` (array), `runs` (number, max 50).

**The top-level case object is permissive** — unknown keys are silently ignored, not rejected. Probed keys `scaffold_script`, `mocks`, `model`, `files`, `setup`, `fixtures`, `timeout_seconds`, `max_turns`, `ablation`, `cwd`, `env` and an outright bogus key all loaded without complaint and were absent from the parsed `--json` output. So `scaffold_script`'s location is **UNVERIFIED** (help confirms the feature exists via `--scaffold` / `--no-scaffold`, but not where the key lives).

`execution` (recognized keys, by type error):

| Key | Type |
| --- | --- |
| `prompt` | string |
| `max_turns` | number, ≤ 200 (default 10) |
| `timeout_seconds` | number, ≤ 3600 (default 300) |
| `allowed_tools` | array |
| `model` | string |
| `env` | object |
| `append_system_prompt` | string |

`execution` is also permissive; `prompt_file`, `disallowed_tools`, `cwd`, `permission_mode`, `scaffold_script`, `files`, `mcp_servers`, `system_prompt`, `mocks`, `agent`, `add_dir` produced no type error — UNVERIFIED either way.

`graders[]` is a **strict discriminated union on `type`** (unknown keys rejected):

```
type: 'regex' | 'tool_order' | 'tool_used' | 'file_exists' | 'llm' | 'baseline'
```

| `type` | Required | Optional (verified) |
| --- | --- | --- |
| `regex` | `pattern` | `flags` (string) |
| `tool_order` | `before`, `after` | — |
| `tool_used` | `tool` | `min`, `max` |
| `file_exists` | `path` | — |
| `llm` | `criteria` | `focus`: `last_message` (default) \| `files` |
| `baseline` | `baseline_file`, `criteria` | — |

Common to all variants: `name` (**required**, string), `weight` (number, default 1), `arm` (`with-only` \| `both`). `arm: with-only` is the mechanism the help text calls *"graders marked with-only"* — the key is `arm`, **not** `with_only`. `[EVAL-SCHEMA]`

Ablation default, emitted live: *"Ablation: defaulting to with-without — a plugin resolved from this path, so each case also runs a no-plugin baseline arm (2× runs) and reports Δ; graders marked with-only (including `tool_used: Skill`) become a plugin-fired indicator rather than part of the score."*

`--json` result shape (verified live): `{schemaVersion, claudeVersion, startedAt, durationSeconds, costUsd, partial, partialReason, suite:{root,ablation,caseFilter,threshold,concurrency,plugins[]}, cases:[{name,dir,source,promptMarkdown,runsPerCase,timeoutSeconds,maxTurns,graders[],arms:{with:[…],without:[…]},aggregates}], aggregates}`. Grader run records carry `{name, passed, weight, explanation, withOnly, scored}`.

---

## 6. Output styles inside plugins

**Location:** `<plugin-root>/output-styles/<name>.md`. Optionally declared via `plugin.json` `outputStyles` (string dir or array of paths); the scaffold does **not** declare it, implying convention-based discovery. `[SCAFFOLD]` `[VALIDATOR]`

**Frontmatter fields — complete set, all four verified:** `[SCAFFOLD]` `[BINARY]`

| Field | Binary-embedded description |
| --- | --- |
| `name` | *"Style name used in the Output style picker in `/config` and in settings. Defaults to the filename."* |
| `description` | *"Shown in the Output style picker in `/config`."* |
| `keep-coding-instructions` | *"If true, the default coding instructions stay in the system prompt alongside this style."* |
| `force-for-plugin` | Scaffold comment: *"With `force-for-plugin: true`, the style applies automatically when this plugin is enabled."* |

`force-for-plugin` is now **VERIFIED** (the previous run listed it as unverified). The binary also carries the guard message:
> `" has force-for-plugin set, but this option only applies to plugin output styles. Ignoring."`

**Auto-activation:** `force-for-plugin` is the only auto-activation control found. No file-glob, model, or trigger-condition field exists for output styles. Contrast with skills, whose frontmatter *does* include a glob trigger (*"Glob patterns this skill applies to. The skill only loads when the model touches matching files."*) `[BINARY]`

Output styles are **not** covered by `claude plugin validate` (a bogus frontmatter key validated clean) and did **not** appear in `claude plugin details` component inventory. `[VALIDATOR]`

---

## 7. Hooks / "Mods" flags

**"Mods" does not exist in 2.1.274.** `strings` over the whole binary returns **zero** occurrences of the token `Mods`. It is also absent from all help text. `[BINARY]` `[HELP]`

> **Amendment (2026-09-17, same version).** The original wording here went further and said to *"treat any Mods/function-hook design assumption as unsupported on this version"*. That was too strong, and a later probe corrected it: **the name is absent, but a function-hooks mechanism is present** — `src/plugins/functionHooks/`, an env gate `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` whose rollout default is false, a `hooks.json` `modules` key (max one entry) naming a module that exports `register(on)`, and events `tool.call`, `prompt.submit`, `ui.render`, `session.start`. `[BINARY]`
>
> Verified live: a throwaway plugin declaring `"modules": ["./mod.ts"]` validates clean, and `claude plugin validate --json` **reads the module source**, reporting `./mod.ts hooks: tool.call` and `./mod.ts calls: nothing on $`. `[VALIDATOR]` The feature is nonetheless absent from every help page (`function hook` → 0 hits `[HELP]`), so it is an undocumented, off-by-default preview. Nothing stable should depend on it. Full record and re-check procedure: [../experimental/mods/README.md](../experimental/mods/README.md).

Hooks surface that does exist:
- `plugin.json` `hooks` field — object, same shape as settings `hooks`. `[VALIDATOR]`
- `hooks/hooks.json` in the plugin root, `{"hooks": {"<Event>": [{"hooks": [{"type": "command", "command": "…${CLAUDE_PLUGIN_ROOT}…"}]}]}}`. `[SCAFFOLD]`
- Skill frontmatter `hooks`: *"Hooks registered while this skill is active. Same shape as settings.json `hooks`."*; agent frontmatter `hooks`: *"Hooks registered while this agent runs."* `[BINARY]`
- CLI: `-d|--debug [filter]` accepts a `hooks` category (`--debug "api,hooks"`); `--include-hook-events` — *"Include all hook lifecycle events in the output stream (only works with --output-format=stream-json)"*. `[HELP]`
- `--bare` — *"Minimal mode: skip hooks, LSP, plugin --settings, --agents, --plugin-dir."* `[HELP]`
- `--safe-mode` — disables *"CLAUDE.md, skills, plugins, hooks, MCP servers, custom commands and agents, output styles, workflows, custom themes, keybindings, and more"*; admin-managed policy settings still apply; env equivalent `CLAUDE_CODE_SAFE_MODE=1`. `[HELP]`
- `--plugin-dir <path>` — *"Load a plugin from a directory or .zip for this session only; a folder of plugins loads each child (repeatable)"*. `[HELP]`
- `--plugin-url <url>` — *"Fetch a plugin .zip from a URL for this session only (repeatable)"*. `[HELP]`
- `--restricted` — *"Restricted mode: removes the built-in …"* (truncated in help; full effect UNVERIFIED). `[HELP]`

---

## Open questions / risks

1. **Manifest schemas are undocumented in help.** Everything in §1–2 comes from probing a validator, not from a spec. The `$schema` URL `https://anthropic.com/claude-code/plugin.schema.json` was not fetched — fetching it is the single highest-value next step to confirm §1 and catch fields my probe list never guessed. My candidate lists were finite; **absence from this doc is not proof a field doesn't exist.**
2. **Unknown `case.yaml` keys are silently ignored.** A typo'd `timeout_seconds` at case top level (instead of inside `execution`) validates clean and is silently dropped — verified: the parsed output kept the 300s/10-turn defaults. Any eval authoring tool we build must validate against the real shape itself, because the CLI will not.
3. **`scaffold_script` location is UNVERIFIED.** `--scaffold`/`--no-scaffold` prove the feature; no probe located the key. Needs a working example from Anthropic's own plugins.
4. **Contradictory `id` guidance.** `plugin.json` warns that `id` *"belongs in the marketplace entry"*, but the marketplace validator flags `plugins[0].id` as an unknown field. One of the two messages is wrong; don't rely on `id` anywhere.
5. **No semver enforcement on `version`.** `"notsemver"` passes even under `--strict`, yet `plugin tag` builds a `{name}--v{version}` git tag from it. Enforce semver in our own CI.
6. **`managed` scope is only exposed on `plugin update`.** `install`, `uninstall`, `enable`, `disable`, `prune` and `marketplace add/remove` do not list it. Whether managed plugins can be installed via CLI at all is UNVERIFIED.
7. **Evals cost real money and run real code.** `claude plugin eval` spawns full `claude` child processes on the user's own credential. A single probe run with `--max-cost-usd 0.000001` still billed **$0.06** because the ceiling is checked *before* a run launches, not during. Budget accordingly; `--max-cost-usd` is a floor-plus-one-run, not a cap.
8. **`--allow-real-servers` and `--mocks off` start the plugin's real MCP servers "as you, outside the OS sandbox"** (help text). Any CI recipe we publish should default to `--mocks record` and never document `--allow-real-servers` without a warning.
9. **Output styles get no validation at all.** No manifest check, no frontmatter check, no appearance in `plugin details`. A typo in `force-for-plugin` fails silently at runtime. Worth a lint rule on our side.
10. **LSP has no manifest field** — only `.lsp.json`. If we document a plugin manifest reference, this asymmetry will surprise authors.
11. **Report publishing defaults to on.** Eval runs try to publish the HTML report to claude.ai unless `--no-publish`. Observed behavior: it stayed local because *"this run appears to have been started by a Claude Code session rather than a person."* A human-run eval would have published. Flag this for any repo that evals on private code.
12. **Cleanup owed:** this research scaffolded a throwaway plugin at `~/.claude/skills/p0probe/` (it registers a `p0probe` skill next session). `rm -rf` was denied by the permission layer — **please delete that directory manually**. Temp probe dirs under `/tmp/p0/` can also be removed.
