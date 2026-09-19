# Experimental: "Mods" / function hooks — research note

**Status: nothing here ships. This directory contains no code and no configuration.**
It is a record of what was checked, what was found, and what would be worth building if
the platform surface stabilises. Everything labelled *hypothetical* below is a sketch,
not a plan and not a promise.

> **Superseded for 2.1.277 (2026-09-19).** Function hooks were re-researched and executed
> in isolated spikes: see [docs/research/mods-research-2.1.277.md](../../docs/research/mods-research-2.1.277.md)
> and [../spikes/function-hooks](../spikes/function-hooks/README.md). Several "not
> established" items below are now established — it runs, the product name is "Claude
> Mods", and a `session.compact` event exists. The standing rules below still apply.

**Verified against:** Claude Code **2.1.274**, Linux, 2026-09-17.
Evidence tiers follow [phase0-research.md](../../docs/research/phase0-research.md):
`[HELP]` = quoted from `--help`, `[VALIDATOR]` = observed from `claude plugin validate`,
`[BINARY]` = read from strings embedded in the shipped binary. `[BINARY]` is the weakest
tier — strings show that code exists, not that a feature is supported, documented, or
stable.

## The short version

Two findings, and they point in opposite directions:

1. **"Mods" does not exist under that name.** Zero occurrences of the token `Mods` in
   the shipped binary, and no mention anywhere in help output. `[BINARY]` `[HELP]`
2. **The capability does exist, under a different name.** Claude Code 2.1.274 ships a
   **function hooks** mechanism: a plugin can declare a module that registers handlers
   on events including `tool.call`, `prompt.submit`, `ui.render`, and `session.start`.
   It is off by default, gated behind an environment variable, and absent from every
   `--help` page. `[BINARY]` `[VALIDATOR]`

So the original framing — *"Mods are not stable core functionality yet"* — holds, but
for a sharper reason than "they do not exist". They exist, they are not announced, and
building on them today means building on an undocumented preview.

## What "Mods" was supposed to be

The concept, as this project's specification described it, was a runtime layer distinct
from the prompt layers: a place for **interception, state, and UI** rather than for
instructions. Where an output style tells the model how to communicate and a shell hook
runs a command on an event, a Mod would sit inside the session and be able to see a tool
call before it runs, transform its output afterwards, hold state across turns, and draw
something in the interface.

That maps closely onto what the function hooks surface appears to do. The name "Mods"
seems to have been either an earlier or an unofficial label; no evidence of it survives
in this release.

## Evidence

### The name is absent

| Check | Result |
| --- | --- |
| `strings <binary> \| grep -c 'Mods'` | `0` `[BINARY]` |
| Word-boundary `mod`/`mods` across `claude --help`, `claude plugin --help`, `claude plugin eval --help` | `0` matches `[HELP]` |

### The capability is present

| Observation | Tier |
| --- | --- |
| Internal module path `src/plugins/functionHooks/` and a `hooks-worker` entry point | `[BINARY]` |
| Environment variable `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`, appearing in the same list as other gated features, resolving through a rollout flag whose local default is **false** | `[BINARY]` |
| `hooks.json` accepts a `modules` key described as *"The hooks module: one path, relative to this hooks.json, of a module exporting `register(on)`. What it hooks and calls is read from its source before it loads; `claude plugin validate` shows the result."* Limited to one entry: *"a second entry is refused"* | `[BINARY]` |
| A user-invocable skill exists inside the binary, described as *"Write a plugin made of function hooks"*, referring to *"a hooks module exporting `register(on, options)`, hooks `($, e, next)` on events like `tool.call`, `prompt.submit`, `ui.render`, `session.start`"* | `[BINARY]` |
| Event name strings present: `tool.call`, `prompt.submit`, `ui.render`, `session.start` | `[BINARY]` |
| A throwaway plugin declaring `"modules": ["./mod.ts"]` in `hooks/hooks.json` validated clean, and the validator **read the module's source** and reported `./mod.ts hooks: tool.call` and `./mod.ts calls: nothing on $` | `[VALIDATOR]` |
| `function hook` appears **0 times** in `claude --help`, `claude plugin --help`, and `claude plugin validate --help` | `[HELP]` |

The last two rows are the important pair. The validator demonstrably understands the
feature, and the help text does not mention it. That is the signature of an unreleased
surface, not of a supported one.

### What is *not* established

Being explicit about the limits of the above, because `[BINARY]` invites overreading:

- **Not verified that it works.** No function-hook plugin was executed. Validation
  parsing a module is not the same as a runtime loading it.
- **The event list is not known to be complete.** Four names were found; the skill text
  says *"events like"*, which implies more.
- **The `register` / `($, e, next)` contract is quoted, not tested.** The `$` object's
  API is unknown; the validator's phrase *"calls: nothing on `$`"* implies it is a
  capability surface worth auditing, and nothing more is known about it.
- **No stability signal of any kind.** Undocumented, off by default, behind a rollout
  flag. It can change or disappear in any release without a deprecation notice.

## What this means for Clear Claude

**Stable Clear Claude does not depend on any of this, and will not until the surface is
documented.** The marketplace ships two plugins: `clear-partner`, one output style and
two read-only skills, and `clear-ui`, a status bar that uses only
documented classic hooks. Neither touches function hooks.

Three standing rules:

1. **Never set `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` globally**, and never suggest a user
   do so. A preview flag set machine-wide changes the behaviour of every plugin and
   every session, not only ours.
2. **Any experiment stays fully isolated and opt-in** — its own directory, its own
   plugin, never loaded by installing `clear-partner` or `clear-ui`. What graduates from here is
   the third layer, Clear Transcript ([ADR 0005](../../docs/adr/0005-naming-and-install-paths.md)).
3. **Anything built here is a mechanic, not a judgment.** The project's dividing line
   (*use prompts for judgment, deterministic mechanisms for mechanics* — see
   [philosophy.md](../../docs/philosophy.md)) is what makes these modules interesting in
   the first place: each one replaces a model claim with an observation.

## Hypothetical modules

**All three are sketches.** None has been designed against a real API, none has been
prototyped, and each assumes capabilities that are not verified to exist. They are here
to record *why* this surface matters to this project, so that a future contributor
evaluating a stabilised API knows what to evaluate it against.

### 1. `verification-state` (hypothetical)

*The one that best fits this project's thesis.*

> **Update, 2026-09-19:** no longer hypothetical, and no longer a mod. Documented
> `PostToolUse` / `PostToolUseFailure` hooks carry everything this sketch needed, so it
> shipped as an opt-in feature of `clear-ui` 0.1.0 — per project, only for the commands
> the project lists, and file coverage is never inferred. See
> [roadmap-v2.md](../../docs/roadmap-v2.md), Phase F. The sketch below is kept as the
> record of the original reasoning.

**Problem.** Clear Partner instructs the model to state how a change was verified. That
statement is a model claim. A model claim about whether tests passed is exactly the kind
of assertion that should be machine-observed instead — and the style's own rule
(*never present an assumption as an observed fact*) is currently enforced only by the
model's own discipline.

**Sketch.** Observe tool calls as they happen. When a test, typecheck, or lint command
completes, record what ran, its exit code, and when. When a file is edited afterwards,
mark any prior verification covering that file as stale. Surface the current state:

```text
✓ Verified              tests + typecheck passed, no edits since
⚠ Changes after verification
○ Not verified
```

**Depends on:** observing tool calls and their results (`tool.call` looks plausible),
state that survives across turns, and somewhere to display a status.
**Open question:** mapping a command to the files it actually covers is a hard problem
and probably needs per-project configuration — which is the point at which this stops
being a deterministic mechanic and starts being a guess.

### 2. `context-hygiene` (hypothetical)

**Problem.** Noisy tool output consumes model attention before the model can decide what
matters: ANSI escape codes, progress bars redrawing a hundred times, the same stack
frame repeated across a dozen failures.

**Sketch.** Conservative, reversible transformations on tool output: strip ANSI control
sequences, collapse repeated progress lines, collapse duplicate stack frames behind a
count. **Never touch** failures, warnings, exact exit codes, or `file:line` references,
and keep the raw output recoverable.

**The risk is the whole design.** A filter that removes the one line that explained the
bug is worse than no filter, and the failure is invisible — the model cannot miss what
it never saw. Any real version needs a way to prove, from the raw output, that nothing
load-bearing was dropped. Without that proof this should not be built.

### 3. `compact-handoff` (hypothetical)

**Problem.** Context compaction preserves the conversation and loses the working state:
the decisions already made, the constraints agreed, the approaches already tried and
rejected, the acceptance criteria, and what has been verified.

**Sketch.** Maintain a small structured record across the session — decisions,
constraints, assumptions, failed attempts, acceptance criteria, verification state — and
make sure it survives compaction intact rather than being summarised along with
everything else. The failed-attempts list is the highest-value item: without it, a
compacted session reliably re-tries something that already did not work.

**Depends on:** a compaction-related event, which is **not** among the four event names
found. This one may not be expressible on this surface at all.

*(A fourth idea from the original specification, `agent-brief-quality` — enforcing that
subagent briefs carry task, scope, constraints, expected output, and acceptance criteria
— is recorded here for completeness but is deliberately not sketched. It is about
judgment quality, which belongs in a prompt, not in a runtime mechanism.)*

## How to re-verify this note

Everything above is a snapshot of one version. Re-check it on any new Claude Code
release before acting on it. The sequence takes a few minutes and requires no plugin
install.

**1. Record the version.** Any finding without a version attached is worthless.

```text
claude --version
```

**2. Check the documented surface first.** If function hooks have shipped, they will
appear here, and the rest of this procedure becomes unnecessary.

```text
claude --help
claude plugin --help
claude plugin validate --help
```

Search that output for `function hook`, `module`, and `mod`. As of 2.1.274 all three
return nothing relevant.

**3. Check whether the name "Mods" has appeared.** Resolve the binary — the npm install
puts it at `bin/claude.exe` inside the `@anthropic-ai/claude-code` package directory;
`readlink -f "$(command -v claude)"` finds it on Linux and macOS — then search its
strings for the token `Mods` and for `function hook`.

**4. Probe the validator, which is the strongest signal available before release.**
Create a throwaway plugin directory containing a minimal `.claude-plugin/plugin.json`
and a `hooks/hooks.json` declaring `"modules": ["./mod.ts"]`, alongside a trivial module
that registers one handler. Then run:

```text
claude plugin validate <dir> --json
```

On 2.1.274 this returns `"success": true` with notes naming the events the module hooks
and what it calls. If a future version **rejects** `modules`, the surface has been
withdrawn; if it reports richer information, it has moved forward. Delete the throwaway
directory afterwards.

**5. Check the gate.** Look for `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` in the binary's
strings and for any indication that its default has flipped to on. A feature that is on
by default and documented in help is a feature worth building against. Until both are
true, it is not.

**6. Update this file with what you found**, including the version and the tier of each
observation, whether the answer changed or not. A re-check that confirms no change is
still worth recording — it is the difference between "still true" and "nobody has looked
since 2.1.274".
