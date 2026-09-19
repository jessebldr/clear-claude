#!/usr/bin/env bash
# Measures how the installed Claude Code loads this marketplace's plugins, in throwaway config
# directories and without touching any real setting:
#
#   rename     what `renames` in marketplace.json does to an install made under a former plugin
#              name — at user, project and local scope, enabled and disabled — and what it takes
#              before the renamed plugin is loaded again.
#   managed    the same for a plugin enabled only from administrator-managed settings.
#   shadowing  whether an output-style file outside the plugin can take the place of the
#              plugin's forced style, and under which `name:` it has to be written to do so.
#
#   bash scripts/measure-plugin-loading.sh [rename|managed|shadowing|all]      default: all
#
#   OLD_REF   a ref of this repository that still lists the former name   default: v0.3.0
#   NEW_REF   a ref that lists the current name and the renames map       default: main
#   REPO      owner/repo on GitHub                                        default: jessebldr/clear-claude
#   OLD_ID / NEW_ID   the plugin ids under test    default: clear-claude@clear-claude / clear-partner@clear-claude
#   CLAUDE    the claude executable to measure                            default: claude
#   MEASURE_POLICY=1   also measure the administrator-managed level. This WRITES to the
#             machine-wide managed directory (/etc/claude-code, /Library/Application
#             Support/ClaudeCode, C:\Program Files\ClaudeCode). It needs root, sudo or an
#             elevated shell; it only proceeds if it can create that directory itself, and it
#             removes exactly what it created, also when interrupted. It is meant for a
#             disposable machine such as a CI runner — never a machine someone uses.
#
# Nothing is sent to a model and nothing is billed, and the script checks that rather than
# assume it: it refuses to start if a credential is in the environment, and asks
# `claude auth status` in each throwaway configuration before the first session there (a
# config directory alone does not prove that on macOS, where the sign-in lives in the
# Keychain). A session is `claude -p hi`; signed out, it stops at "Not logged in", which is
# after the plugins have loaded, and what it loaded is read from its --debug-file log.
#
# A step that fails stops the run: a missing log must never be printed as "no forced style".
# Results are copied by hand into docs/migration.md and docs/research/style-shadowing.md, with
# the Claude Code version. Needs: claude, node, bash (3.2 is enough).
set -euo pipefail

WHAT="${1:-all}"
REPO="${REPO:-jessebldr/clear-claude}"
OLD_REF="${OLD_REF:-v0.3.0}"
NEW_REF="${NEW_REF:-main}"
OLD_ID="${OLD_ID:-clear-claude@clear-claude}"
NEW_ID="${NEW_ID:-clear-partner@clear-claude}"
MARKETPLACE="${NEW_ID#*@}"
CLAUDE="${CLAUDE:-claude}"
export DISABLE_AUTOUPDATER=1

say() { printf '%s\n' "$*"; }
rule() { say; say "== $*"; }
die() { say "measure: $*" >&2; exit 1; }

for name in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX; do
  if [ -n "${!name:-}" ]; then die "$name is set; a session could reach a model. Unset it and run again."; fi
done

HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d 2>/dev/null || mktemp -d -t clearclaude)" || die "could not create a temporary directory"
case "$WORK" in /*) [ -d "$WORK" ] || die "temporary directory $WORK does not exist" ;; *) die "temporary directory is not an absolute path: '$WORK'" ;; esac

as_root() { if [ "$(id -u)" = 0 ] || ! command -v sudo >/dev/null 2>&1; then "$@"; else sudo "$@"; fi; }

# What this run created in the machine-wide managed directory, newest first, with spaces kept
# as "|" so the lists stay word-split. Removed on any exit: files by name, directories with
# rmdir — never a recursive delete of anything under a machine-wide path.
POLICY_FILES=""
POLICY_DIRS=""
release_policy_dir() {
  local path
  for path in $POLICY_FILES; do as_root rm -f "${path//|/ }" 2>/dev/null || true; done
  for path in $POLICY_DIRS; do as_root rmdir "${path//|/ }" 2>/dev/null || true; done
  POLICY_FILES=""; POLICY_DIRS=""
}
cleanup() { release_policy_dir; rm -rf "$WORK"; }
trap cleanup EXIT
trap 'exit 130' INT TERM

# Claude Code on Windows wants a Windows path in CLAUDE_CONFIG_DIR and on its command line.
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

# Run a claude command that has to succeed; print its last line, indented.
must() {
  local out
  out="$("$@" 2>&1)" || die "failed: $* — ${out##*$'\n'}"
  say "  ${out##*$'\n'}"
}

new_config() { # name
  CFG="$WORK/$1"; mkdir -p "$CFG"
  CLAUDE_CONFIG_DIR="$(native "$CFG")"; export CLAUDE_CONFIG_DIR
  # A throwaway config directory is signed out only where the sign-in is stored inside it.
  local status
  status="$("$CLAUDE" auth status 2>&1 || true)"
  case "$status" in
    *'"loggedIn": false'*|*'"loggedIn":false'*) ;;
    *) die "claude is not signed out in a throwaway config directory; a session here could be billed. Not measuring. ($(printf '%s' "$status" | tr -d '\n' | cut -c1-120))" ;;
  esac
}

# One session in directory $1; prints what the loader did with the plugin, from the debug log.
session() { # dir label
  local log="$WORK/debug-$RANDOM.log" out forced miss
  out="$( (cd "$1" && "$CLAUDE" --debug-file "$(native "$log")" -p hi 2>&1) || true )"
  case "$out" in *"Not logged in"*) ;; *) die "a session did not stop at \"Not logged in\": ${out%%$'\n'*}" ;; esac
  [ -s "$log" ] || die "the session wrote no debug log, so there is nothing to read a result from"
  grep -q -E 'Found [0-9]+ plugins' "$log" || die "the debug log never reached plugin loading; not reporting a result from it"
  forced="$(grep -o 'Using forced plugin output style: .*' "$log" | sort -u | head -1 || true)"
  miss=""; if grep -q 'error type: plugin-cache-miss' "$log"; then miss="  (plugin-cache-miss)"; fi
  say "  $2: ${forced:-no forced style}$miss"
  rm -f "$log"
}

# Point the registered marketplace at another ref, the way `main` moving would, and refresh it.
move_marketplace() { # settings files that may name the marketplace
  node -e '
    const fs = require("fs"); const [ref, name, ...files] = process.argv.slice(1)
    let moved = 0
    for (const file of files) {
      if (!fs.existsSync(file)) continue
      const json = JSON.parse(fs.readFileSync(file, "utf8"))
      const entry = file.endsWith("known_marketplaces.json") ? json[name] : json.extraKnownMarketplaces && json.extraKnownMarketplaces[name]
      if (entry && entry.source) { entry.source.ref = ref; fs.writeFileSync(file, JSON.stringify(json, null, 2)); moved++ }
    }
    if (moved === 0) { console.error("no registered marketplace named " + name + " to move"); process.exit(1) }' \
    "$NEW_REF" "$MARKETPLACE" "$@" || die "could not point the marketplace at $NEW_REF"
  must "$CLAUDE" plugin marketplace update "$MARKETPLACE"
}

enabled() { # settings-file label
  node -e '
    const fs = require("fs"); const [file, label, name] = process.argv.slice(1)
    if (!fs.existsSync(file)) { console.log(`  ${label}: no such file`); process.exit(0) }
    const all = JSON.parse(fs.readFileSync(file, "utf8")).enabledPlugins || {}
    const ours = Object.fromEntries(Object.entries(all).filter(([id]) => id.endsWith("@" + name)))
    console.log(`  ${label}: ${JSON.stringify(ours)}`)' "$1" "$2" "$MARKETPLACE"
}

listed() {
  local out
  out="$("$CLAUDE" plugin list 2>&1)" || die "claude plugin list failed"
  printf '%s\n' "$out" | awk -v m="@$MARKETPLACE" 'index($0, m) { on = 1; print "  " $2; next } /^ *$/ { on = 0 } on && /Version|Status|Note/ { sub(/^ */, "    "); print }'
}

install_old() { # [--scope s], run in the current directory
  "$CLAUDE" plugin marketplace add "$REPO#$OLD_REF" >/dev/null 2>&1 || die "could not add $REPO#$OLD_REF"
  must "$CLAUDE" plugin install "$OLD_ID" "$@"
}

measure_rename() {
  rule "rename · user scope · marketplace update only"
  new_config rename-user; mkdir -p "$WORK/p-user"
  install_old
  move_marketplace "$CFG/plugins/known_marketplaces.json" "$CFG/settings.json"
  for n in 1 2 3; do session "$WORK/p-user" "session $n"; done
  listed; enabled "$CFG/settings.json" "user settings"
  # Whether the plugin comes back by itself has depended on a CLI command running in between.
  session "$WORK/p-user" "session 4, after claude plugin list"
  session "$WORK/p-user" "session 5"

  rule "rename · user scope · marketplace update, then install under the new name"
  new_config rename-two; mkdir -p "$WORK/p-two"
  install_old
  move_marketplace "$CFG/plugins/known_marketplaces.json" "$CFG/settings.json"
  must "$CLAUDE" plugin install "$NEW_ID"
  session "$WORK/p-two" "session 1"
  listed; enabled "$CFG/settings.json" "user settings"

  local scope proj file
  for scope in project local; do
    rule "rename · $scope scope · marketplace update only"
    new_config "rename-$scope"; proj="$WORK/p-$scope"; mkdir -p "$proj"
    ( cd "$proj" && install_old --scope "$scope" )
    file="$proj/.claude/settings.json"; if [ "$scope" = local ]; then file="$proj/.claude/settings.local.json"; fi
    enabled "$file" "before, $scope settings"
    move_marketplace "$CFG/plugins/known_marketplaces.json" "$CFG/settings.json" "$proj/.claude/settings.json" "$proj/.claude/settings.local.json"
    for n in 1 2 3; do session "$proj" "session $n"; done
    enabled "$file" "after, $scope settings"
    enabled "$CFG/settings.json" "after, user settings"
  done

  rule "rename · user scope · the old install was disabled"
  new_config rename-disabled; mkdir -p "$WORK/p-disabled"
  install_old
  must "$CLAUDE" plugin disable "$OLD_ID"
  move_marketplace "$CFG/plugins/known_marketplaces.json" "$CFG/settings.json"
  session "$WORK/p-disabled" "session 1"
  listed; enabled "$CFG/settings.json" "user settings"
}

# ---- the machine-wide managed directory (MEASURE_POLICY=1 only)

policy_dir() {
  case "$(uname -s)" in
    Darwin) printf '%s' "/Library/Application Support/ClaudeCode" ;;
    MINGW*|MSYS*|CYGWIN*) printf '%s' "/c/Program Files/ClaudeCode" ;;
    *) printf '%s' "/etc/claude-code" ;;
  esac
}

# Take the managed directory only if this run can create it: `mkdir` without -p fails when it
# already exists, so a directory someone else made — before or during the run — is never ours
# to write into or to remove. It also fails without administrator rights, which is the test.
claim_policy_dir() { # -> POLICY
  POLICY="$(policy_dir)"
  as_root mkdir "$POLICY" 2>/dev/null || { say "  $POLICY exists or cannot be created (not an administrator?); not measured"; return 1; }
  POLICY_DIRS="${POLICY// /|} $POLICY_DIRS"
}
policy_mkdir() { as_root mkdir "$1" || die "could not create $1"; POLICY_DIRS="${1// /|} $POLICY_DIRS"; }
policy_write() { # path; content on stdin
  case " $POLICY_FILES " in *" ${1// /|} "*) ;; *) POLICY_FILES="${1// /|} $POLICY_FILES" ;; esac
  as_root tee "$1" >/dev/null || die "could not write $1"
}

measure_managed_rename() {
  rule "rename · enabled from managed settings · marketplace update only"
  if [ "${MEASURE_POLICY:-0}" != 1 ]; then say "  not measured here (MEASURE_POLICY=1, on a disposable machine only)"; return; fi
  claim_policy_dir || return 0
  new_config rename-managed; local proj="$WORK/p-managed"; mkdir -p "$proj"
  install_old
  # Move the enabling key out of user settings and into the managed file.
  node -e '
    const fs = require("fs"); const [file, id] = process.argv.slice(1)
    const json = JSON.parse(fs.readFileSync(file, "utf8")); delete json.enabledPlugins[id]
    fs.writeFileSync(file, JSON.stringify(json, null, 2))' "$CFG/settings.json" "$OLD_ID"
  printf '{ "enabledPlugins": { "%s": true } }\n' "$OLD_ID" | policy_write "$POLICY/managed-settings.json"
  session "$proj" "before the rename, enabled only from managed settings"
  move_marketplace "$CFG/plugins/known_marketplaces.json" "$CFG/settings.json"
  for n in 1 2; do session "$proj" "session $n"; done
  listed
  session "$proj" "session 3, after claude plugin list"
  say "  managed settings afterwards: $(as_root cat "$POLICY/managed-settings.json" | tr -d '\n ')"
  enabled "$CFG/settings.json" "user settings afterwards"
  must "$CLAUDE" plugin install "$NEW_ID"
  session "$proj" "session 4, after installing the new name"
  release_policy_dir
}

style_text() { printf -- '---\nname: %s\ndescription: shadowing measurement\n---\n\nA style used only to measure shadowing.\n' "$1"; }

measure_shadowing() {
  local plugin="${NEW_ID%@*}" style qualified level file
  style="$(sed -n 's/^name: *//p' "$HERE/plugins/$plugin/output-styles/"*.md | head -1)"
  [ -n "$style" ] || die "could not read the style name from plugins/$plugin/output-styles"
  qualified="$plugin:$style"
  rule "shadowing · plugin $NEW_ID from this checkout · style \"$style\""
  new_config shadow; local proj="$WORK/p-shadow"; mkdir -p "$proj"
  must "$CLAUDE" plugin marketplace add "$(native "$HERE")"
  must "$CLAUDE" plugin install "$NEW_ID"
  session "$proj" "no other style file"
  for level in user project; do
    file="$CFG/output-styles/measure.md"; if [ "$level" = project ]; then file="$proj/.claude/output-styles/measure.md"; fi
    mkdir -p "$(dirname "$file")"
    style_text "$style" > "$file";     session "$proj" "$level file, name: $style"
    style_text "$qualified" > "$file"; session "$proj" "$level file, name: $qualified"
    rm -f "$file"
  done
  session "$proj" "files removed again"

  if [ "${MEASURE_POLICY:-0}" != 1 ]; then
    say "  policy level: not measured here (MEASURE_POLICY=1, on a disposable machine only)"
    return
  fi
  claim_policy_dir || return 0
  policy_mkdir "$POLICY/.claude"; policy_mkdir "$POLICY/.claude/output-styles"
  style_text "$style" | policy_write "$POLICY/.claude/output-styles/measure.md"
  session "$proj" "policy file, name: $style"
  style_text "$qualified" | policy_write "$POLICY/.claude/output-styles/measure.md"
  session "$proj" "policy file, name: $qualified"
  release_policy_dir
  session "$proj" "policy directory removed again"
}

say "claude: $("$CLAUDE" --version 2>&1 | head -1) · $(uname -s) $(uname -m) · node $(node --version)"
say "repo $REPO · old ref $OLD_REF ($OLD_ID) · new ref $NEW_REF ($NEW_ID)"
case "$WHAT" in
  rename) measure_rename ;;
  managed) measure_managed_rename ;;
  shadowing) measure_shadowing ;;
  all) measure_rename; measure_managed_rename; measure_shadowing ;;
  *) say "usage: $0 [rename|managed|shadowing|all]"; exit 2 ;;
esac
