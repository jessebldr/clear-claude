# Clear UI — ecosystem research

**Date:** 2026-09-19. Source code of each project was read from a shallow clone; nothing
was installed or executed. Project-health numbers come from `gh` on that date.
Performance figures quoted from a project's own issues or docs are marked *(their
measurement)*; ours are in [ui-architecture.md](../ui-architecture.md#performance-budget).

We are not choosing a dependency. The question is which ideas survived real usage.

## Summary

| Project | Stars | Verdict |
| --- | --- | --- |
| `jarrodwatts/claude-hud` | 28.0k | **Steal the ideas**: native-only data contract, stdin reader, sanitiser, conflict UX. Avoid the LLM-driven setup and the Windows git worker. |
| `sirmalloc/ccstatusline` | 12.9k | **Steal the config lifecycle** and its community's measurements. Avoid the OAuth/Keychain usage path, `npx @latest` distribution, the settings-overwriting installer. |
| `Owloops/claude-powerline` | 1.2k | **Steal the layout engine concept** (declarative areas, breakpoints, empty-cell culling). Avoid its data layer. |
| `axlaser/claude-statusline` | 4 | **Steal the most per line of code**: `subagentStatusLine` feed, silent-degradation contract, temp-file trust model, benchmark method. Avoid three hand-synced script sets. |
| `slima4/claude-tui` | 43 | **Steal the tiering** (light statusline, heavy monitor on demand). Avoid everything else; it cannot import on native Windows. |
| `ryoppippi/ccusage` statusline | 18.6k | Steal "print last good output on failure". Its 5-hour block math is obsolete now that `rate_limits` is native. |

None is a dependency candidate.

## Convergent findings

1. **Native `rate_limits` won.** claude-hud, claude-powerline, axlaser and claude-tui's
   statusline all read 5h/weekly from stdin. claude-hud *removed* its OAuth polling path
   and its changelog records why: 429s with several windows open, token refresh, proxies,
   multi-profile Keychain. Only ccstatusline (for extra-usage fields) and claude-tui's
   monitor still read `~/.claude/.credentials.json` / macOS Keychain and call
   `api.anthropic.com/api/oauth/usage`. claude-tui also spoofs Claude Code's User-Agent.
2. **`COLUMNS` is the width source.** Process-tree walking with `ps`/`stty` is fragile
   (claude-tui #7) and nobody detects width on Windows that way. ccstatusline simply
   returns `null` on win32 and never reads `COLUMNS`, so its flex layout is inert there.
3. **Everyone rescans the whole transcript.** It is the largest per-refresh cost in
   claude-hud, ccstatusline and claude-powerline, and the official docs call the format
   internal and unstable. ccstatusline #549 reports tokens over-counted 1.84× from it.
4. **On Windows the interpreter floor dominates**, and process leaks are real:
   claude-hud #747 (open) reports 125–164 orphaned node processes; ccstatusline #485
   (open) piles up processes because `readStdin` waits for EOF with no timeout.
5. **Only claude-hud and axlaser sanitise untrusted strings**, and claude-hud misses two
   call sites (todo content, tool target) because it sanitises per call site rather than
   once at the render boundary.
6. **Installers are the weakest part of every project.** claude-hud's is a 771-line
   prompt an LLM executes — the source of most of its Windows issues — with no uninstall.
   ccstatusline overwrites an unparseable `settings.json` with `{statusLine}`, keeps
   un-timestamped backups, has no "keep mine" option (#565), and its uninstall does not
   restore the previous statusline.

## Per project

### jarrodwatts/claude-hud

A real Claude Code plugin, zero runtime dependencies, `tsc` output committed.

- **Does well:** native-only usage and context; `readStdin` that parses as soon as the
  JSON is complete (250 ms first-byte timeout, 256 KB cap) instead of waiting for EOF;
  a thorough sanitiser (CSI, OSC, C0/C1, bidi overrides); grapheme-aware width; setup that
  backs up with a timestamp, stores the previous command, redacts secrets in the preview
  and offers Replace / Keep / Cancel; `CLAUDE_HUD_DISABLE=1` kill switch; a written
  "scope bar" of features it refuses.
- **Learn:** `used_percentage` when > 0, else compute from `current_usage`, else hide.
  Agent display budget: running first, finished kept 60 s, max 3. Git env:
  `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=Never`, `windowsHide`.
  On Windows a `.mjs` launcher beats any PowerShell wrapper.
- **Do not copy:** LLM-executed setup; full transcript rescan with an uncleaned cache
  directory; 4–7 sequential git spawns with no cache, plus a second Node process as a git
  worker on Windows; no `process.exit`; printing errors onto the status line.
- **Conflicts with us:** non-deterministic install, ~70 config keys, regex guessing of
  internal state.
- **Hypothesis check:** *partly true.* Best plugin distribution and conflict UX, best
  tools/agents/todos extraction — but those three are **off by default**, and
  "plugin-native" ends at `/plugin install`.

### sirmalloc/ccstatusline

Not a plugin. `npx -y ccstatusline@latest` TUI writes `settings.json`.

- **Does well:** clean `Widget` interface with `getHideableStates`; zod schema with
  versioned migrations; atomic config writes; **never overwrites a corrupt config, renders
  defaults plus a warning badge**; import with a preview of changed keys; disk git cache
  with TTL; usage lock honouring `Retry-After`.
- **Learn:** the config lifecycle above. From issue #571 *(their measurement)*: on Windows
  ~90 % of a git command's cost is the spawn, so one `status --porcelain=v2 --branch`
  beats ten small commands; `chcp.com` costs 35–104 ms per render; barrel imports cost
  55–140 ms per redraw.
- **Do not copy:** credential reading and the undocumented usage endpoint
  (`security dump-keychain` included); unpinned `@latest` on every refresh and every hook;
  the installer; writing hooks into user settings; `execFileSync` git; EOF-waiting stdin.
- **Conflicts with us:** ~88 widgets, powerline themes, network calls from a status line.
- **Hypothesis check:** widget architecture, customisation and import/export — *true*.
  "Mature cross-platform handling" — **false**: no width on Windows, `~/.config` path on
  Windows, open hang and leak issues.

### Owloops/claude-powerline

- **Does well:** a CSS-grid-like layout (`areas` strings, `minWidth` breakpoints, `fr`
  columns, culling of empty cells and rows, progress bars resolved late against real cell
  width); renderer separated from I/O; native-only 5h/weekly; immutable per-day cache.
- **Learn:** declarative breakpoints; segments with no data vanish; reserve width for
  Claude Code's own right-hand UI; prefix each line with a reset because leading
  whitespace is trimmed.
- **Do not copy:** `npx @latest` per refresh (file-lock breakage with several windows on
  Windows, #35); full transcript parse; uncached git through a shell; `.length` width
  maths; no sanitising; `exit(1)` on error.
- **Hypothesis check:** *true* for layout. Its data layer is not worth studying.

### axlaser/claude-statusline

Tiny audience, unusually disciplined. Three script sets (Bash ×2, PowerShell) are being
replaced by one Rust binary because behaviour drifted between platforms.

- **Does well:** 100 % native data, no network on the render path; **uses
  `subagentStatusLine` as a data feed** (handler prints nothing, atomically writes the
  payload to a per-session file the statusline reads if fresh); strips control characters
  from every untrusted string; verifies owner and no-reparse-point on temp files; filters
  `session_id` to `[A-Za-z0-9_-]`; "always exit 0, never write stderr"; byte-exact golden
  fixtures on three OSes; a benchmark method (fresh process per sample, median of ≥ 7).
- **Learn:** all of the above, plus the **pace indicator** — expected % from elapsed
  window time versus actual %, computed purely from `resets_at`.
- **Their measurement:** `powershell -NoProfile` floor ≈ 124 ms; script warm path 312 ms
  on Windows vs 22 ms for the native binary.
- **Do not copy:** parallel per-OS implementations; regex JSONL parsing; `irm | iex`
  installer that also writes hooks; fixed-width box; toast/sound notifications.

### slima4/claude-tui

- **Hypothesis check:** *true, more strongly than expected.* `claude_tui_core/network.py`
  imports `fcntl` at module top and the statusline imports from it, so even the statusline
  fails on native Windows. README requires WSL 2.
- **Learn:** deep analysis belongs in an on-demand command, not on the refresh path;
  drop trailing parts by priority when the line overflows; persistent 429 backoff.
- **Do not copy:** credential reading with a spoofed User-Agent; an API-sniffing proxy;
  a `PreToolUse` hook that injects warnings into the model's context.

## What Clear UI takes from this

1. Native stdin only for context and usage. Missing → hidden. No credentials, no network.
2. Deterministic installer script: timestamped backup, atomic write, refuse on unparseable
   JSON, Keep / Replace / Cancel, and an uninstall that **restores the previous command**.
3. `statusLine.command` = `node` + one file at a stable path. No shell pipeline, no npx.
4. Render path: zero dependencies, stdin reader with timeout, explicit `process.exit(0)`,
   print nothing on failure, never exit non-zero.
5. One sanitising pass at the render boundary, not per call site.
6. Width from `COLUMNS`; unknown width → compact layout, never a guess.
7. One git call, async, short timeout, TTL cache.
8. Subagents from the native `subagentStatusLine` feed, not from the transcript.
9. No transcript parsing in v0.1 at all.
