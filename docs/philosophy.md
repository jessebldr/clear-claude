# Philosophy

Clear Claude ships one prompt. This document explains what that prompt is trying to do
and why each rule in it is there. Every principle below is taken from
[`source/clear-partner.md`](../source/clear-partner.md) — the behaviourally tested
original — not invented for this document. Where a principle is quoted, the quote is the
style's own wording.

The one-line thesis:

> Make Claude Code easier to understand without making it less capable.

## The rule everything else follows from

> Do all the investigation, reasoning, coding, and verification the task requires.
> Be economical only in what you make the user read, never in the quality of the work.

Two budgets, and they are not the same budget. The work budget is set by the task: if a
bug needs three files read and a test run to be understood, it gets three files read and
a test run. The reading budget is set by what the user needs in order to understand the
result and decide what happens next.

Most "concise assistant" prompts fail by collapsing these into one. Told to be brief,
a model stops investigating as well as stops explaining — it guesses instead of
checking, because guessing is shorter. Clear Partner separates them explicitly so that
brevity applies to the output and never to the process.

`keep-coding-instructions: true` is the same commitment expressed in frontmatter: Claude
Code's default engineering instructions stay in the system prompt. Clear Partner changes
how Claude talks, not what it is capable of.

## Why answer-first

> Lead with the actual answer, result, or recommendation.
>
> Do not start with filler, acknowledgements, summaries of the question, or narration
> about what you are going to do.

The reader's most valuable moment is the first sentence. Spending it on "Great question!
Let me look into that" or on a restatement of what they just typed pushes the actual
answer below the point where they had to start scanning for it.

Answer-first is also a correctness discipline, not only a formatting one. A response
that cannot begin with its conclusion usually does not have one yet. The style's final
quality check makes this explicit: *"The first useful sentence contains the main answer
or outcome."*

The same principle covers deliverables. When the user asks for code, a command, a commit
message, or a configuration, the artifact is the answer — so it goes where the answer
goes, not underneath a paragraph of commentary about it.

And it is why the style forbids hiding behind *"it depends"* when the available context
supports a choice. Declining to recommend is a way of not answering first.

## Why concise-by-default

Concise here has a precise definition:

> Prefer the least amount of text that fully communicates what matters.

Not the shortest possible response. *Least text that fully communicates* — a ceiling
derived from the content, not a target length. The style immediately puts a floor under
it:

> Concise does not mean incomplete.
> Never remove a warning, constraint, assumption, exact number, scope condition, or
> important tradeoff merely to make the response shorter.

That list is the safety rail. Those six things are exactly what a compression algorithm
drops first, because each one reads as a qualifier rather than as the answer — and each
one is the reason a correct-looking answer turns out to be wrong in someone's actual
situation. Brevity is allowed to remove repetition, narration, and preamble. It is not
allowed to remove the conditions under which the answer holds.

Three further rules serve the same ceiling from different directions:

- **No repeated conclusions.** *"Do not repeat the same conclusion in different words."*
  The restated-summary-at-the-end habit doubles the reading cost and adds nothing.
- **No process narration.** For implementation work, *"do the work rather than narrating
  routine steps"* — progress updates exist to report discoveries, blockers, changed
  assumptions, and decisions, not tool calls.
- **No template.** *"Do not mechanically force every response into the same template."*
  Headings, bullets, numbered steps, and tables each have a condition attached in the
  style: bullets when items are genuinely separate, numbers when sequence matters, a
  table when comparison is easier in rows and columns. Structure applied by reflex is
  its own kind of padding.

### Depth is not an exception to this

> If the user asks "why", "explain", "walk me through it", "go deep", "research this",
> or otherwise asks for understanding, depth takes priority over brevity.

This is the same rule, not a suspension of it. When the request *is* understanding, the
text that fully communicates is long, and *"do not respond to a request for depth with a
shallow summary"* is simply what the ceiling implies in that case. Default concise, deep
on demand, one rule underneath both.

## Honesty about what is known

> Separate what is known from what is inferred. State meaningful uncertainty plainly.
> Never present an assumption as an observed fact.

Concision creates a specific temptation: hedges are long, so dropping them is an easy
way to shorten a response — and the result reads as more authoritative than the evidence
supports. This rule and the "never remove an assumption for brevity" rule above are the
same guard seen from two sides.

The same instinct applies to the user's own premises: *"If the user's proposed approach
has a flaw, say so clearly and explain why."* Agreeing is shorter than disagreeing, and
worse.

## Prompts for judgment, deterministic mechanisms for mechanics

> Use prompts for judgment. Use deterministic mechanisms for mechanics.

This is the architectural half of the philosophy, and it is what keeps the project
small. Each thing Clear Claude could do belongs to exactly one of two categories.

**Judgment** — how much to say, whether a tradeoff is material, whether a premise is
wrong, whether the user is asking for depth. These cannot be expressed as a rule that a
machine checks. They go in the prompt, and their correctness is established by
behavioural evaluation ([docs/evals.md](evals.md)), because that is the only way to test
a judgment.

**Mechanics** — is the plugin installed, is the file in the directory that gets scanned,
is `force-for-plugin` spelled correctly, is the shipped prompt byte-identical to the
tested one. These have exact answers. They go in the diagnostic skills, which check
files, command output, and a SHA-256 — and never ask the model how it feels the
responses have been going.

Two consequences fall directly out of the split:

- **`clear-doctor` and `clear-audit` contain no taste.** They are check procedures with
  fixed decision rules, and every finding names a path, a command's output, or a hash.
  A model grading its own tone is not evidence.
- **The prompt contains no mechanics.** Clear Partner never tells Claude to verify its
  own installation or to describe its own rules.

The corollary is what the project refuses to build. Claude Code offers CLAUDE.md, hooks,
MCP servers, agents, and more, and communication style could be pushed through any of
them. Duplicated instructions do not reinforce each other: they consume context, drift
apart as one copy is edited and not the others, and produce contradictions the model has
to resolve at runtime. Communication style is a judgment concern, so it lives in exactly
one prompt layer — the output style — and nowhere else.

```text
Output Style   → how Claude communicates
CLAUDE.md      → what Claude knows about a project
Skills         → reusable workflows
Hooks          → deterministic event automation
```

That separation is also why Clear Claude is not a giant CLAUDE.md. CLAUDE.md is project
knowledge; putting communication rules there means re-pasting them into every repository
and making them compete for attention with facts about the actual code.

## What this costs

Being honest about the trade, since the style itself demands it:

- **The style is a prompt, so it is probabilistic.** Nothing enforces answer-first the
  way a linter enforces formatting. The evals measure conformance; they do not guarantee
  it on any single response.
- **Concise-by-default can misjudge a request.** The mitigation is in the style — depth
  takes priority the moment the user asks for it — but the user may have to ask.
- **One prompt layer means one point of failure.** If the style does not load, there is
  no second copy of these rules anywhere to fall back on. That is the deliberate price
  of not duplicating them, and it is precisely why the diagnostics exist.

## Changing the prompt

Because the product *is* a prompt, an edit to `clear-partner.md` is a behaviour change.
It gets a version bump, a CHANGELOG entry, an updated checksum record, and an eval run —
the same treatment a code change would get. Prompt edits do not ride along inside
unrelated commits. See [architecture.md](architecture.md) for the mechanics.
