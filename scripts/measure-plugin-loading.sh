#!/usr/bin/env bash
# Measures two things about how Claude Code loads this marketplace's plugins, in throwaway
# config directories, without a credential and without touching any real setting:
#
#   1. rename     what `renames` in marketplace.json does to an install made under a former
#                 plugin name, at user, project and local scope, and how many sessions pass
#                 before the renamed plugin is loaded again.
#   2. shadowing  whether an output-style file outside the plugin can take the place of the
#                 plugin's forced style, and under which `name:` it has to be written to do so.
#
#   bash scripts/measure-plugin-loading.sh [rename|shadowing|all]      default: all
#
#   OLD_REF   a ref of this repository that still lists the former name   default: v0.3.0
#   NEW_REF   a ref that lists the current name and the renames map       default: main
#   REPO      owner/repo on GitHub                                        default: jessebldr/clear-claude
#   OLD_ID / NEW_ID   the plugin ids under test    default: clear-claude@clear-claude / clear-partner@clear-claude
#   CLAUDE    the claude executable to measure                             default: claude
#
# A session here is `claude -p hi`. With no credential it stops at "Not logged in", which is
# after the plugins have loaded, and what it loaded is read from its --debug-file log. Nothing
# is sent to a model and nothing is billed. Needs: claude, node, bash. Results are recorded by
# hand in docs/migration.md and docs/research/style-shadowing.md, with the version they were
# measured on; this script is how to take them again after a Claude Code release or a rename.
set -u

WHAT="${1:-all}"
REPO="${REPO:-jessebldr/clear-claude}"
OLD_REF="${OLD_REF:-v0.3.0}"
NEW_REF="${NEW_REF:-main}"
OLD_ID="${OLD_ID:-clear-claude@clear-claude}"
NEW_ID="${NEW_ID:-clear-partner@clear-claude}"
MARKETPLACE="${NEW_ID#*@}"
CLAUDE="${CLAUDE:-claude}"
export DISABLE_AUTOUPDATER=1

HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d 2>/dev/null || mktemp -d -t clearclaude)"
trap 'rm -rf "$WORK"' EXIT

# Claude Code on Windows wants a Windows path in CLAUDE_CONFIG_DIR and on its command line.
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

say() { printf '%s\n' "$*"; }
rule() { say; say "== $*"; }

new_config() { # name -> exports CLAUDE_CONFIG_DIR, echoes nothing
  CFG="$WORK/$1"; mkdir -p "$CFG"
  CLAUDE_CONFIG_DIR="$(native "$CFG")"; export CLAUDE_CONFIG_DIR
}

# One session in directory $1; prints what the loader did with the plugin, from the debug log.
session() { # dir label
  local log="$WORK/debug-$RANDOM.log"
  ( cd "$1" && "$CLAUDE" --debug-file "$(native "$log")" -p hi >/dev/null 2>&1 )
  local forced miss
  forced="$(grep -o 'Using forced plugin output style: .*' "$log" 2>/dev/null | sort -u | head -1)"
  miss="$(grep -c 'error type: plugin-cache-miss' "$log" 2>/dev/null)"
  [ "${miss:-0}" -gt 0 ] 2>/dev/null && miss="  (plugin-cache-miss)" || miss=""
  say "  $2: ${forced:-no forced style}$miss"
  rm -f "$log"
}

# Point the registered marketplace at another ref, the way `main` moving would, and refresh it.
move_marketplace() { # config-dir extra-settings-file...
  node -e '
    const fs = require("fs"); const [ref, name, ...files] = process.argv.slice(1)
    for (const file of files) {
      if (!fs.existsSync(file)) continue
      const json = JSON.parse(fs.readFileSync(file, "utf8"))
      const entry = file.endsWith("known_marketplaces.json") ? json[name] : json.extraKnownMarketplaces && json.extraKnownMarketplaces[name]
      if (entry && entry.source) { entry.source.ref = ref; fs.writeFileSync(file, JSON.stringify(json, null, 2)) }
    }' "$NEW_REF" "$MARKETPLACE" "$@"
  "$CLAUDE" plugin marketplace update "$MARKETPLACE" 2>&1 | tail -1 | sed 's/^/  /'
}

enabled() { # settings-file label
  node -e '
    const fs = require("fs"); const [file, label, name] = process.argv.slice(1)
    if (!fs.existsSync(file)) { console.log(`  ${label}: no such file`); process.exit(0) }
    const all = JSON.parse(fs.readFileSync(file, "utf8")).enabledPlugins || {}
    const ours = Object.fromEntries(Object.entries(all).filter(([id]) => id.endsWith("@" + name)))
    console.log(`  ${label}: ${JSON.stringify(ours)}`)' "$1" "$2" "$MARKETPLACE"
}

listed() { "$CLAUDE" plugin list 2>&1 | awk -v m="@$MARKETPLACE" 'index($0, m) { on = 1; print "  " $2; next } /^ *$/ { on = 0 } on && /Version|Status|Note/ { sub(/^ */, "    "); print }'; }

measure_rename() {
  rule "rename · user scope · marketplace update only"
  new_config rename-user; mkdir -p "$WORK/p-user"
  "$CLAUDE" plugin marketplace add "$REPO#$OLD_REF" 2>&1 | tail -1 | sed 's/^/  /'
  "$CLAUDE" plugin install "$OLD_ID" 2>&1 | tail -1 | sed 's/^/  /'
  move_marketplace "$CFG/plugins/known_marketplaces.json" "$CFG/settings.json"
  for n in 1 2 3; do session "$WORK/p-user" "session $n"; done
  listed; enabled "$CFG/settings.json" "user settings"
  # Whether the plugin comes back by itself has depended on a CLI command running in between.
  session "$WORK/p-user" "session 4, after claude plugin list"
  session "$WORK/p-user" "session 5"

  rule "rename · user scope · marketplace update, then install under the new name"
  new_config rename-two; mkdir -p "$WORK/p-two"
  "$CLAUDE" plugin marketplace add "$REPO#$OLD_REF" >/dev/null 2>&1
  "$CLAUDE" plugin install "$OLD_ID" >/dev/null 2>&1
  move_marketplace "$CFG/plugins/known_marketplaces.json" "$CFG/settings.json"
  "$CLAUDE" plugin install "$NEW_ID" 2>&1 | tail -1 | sed 's/^/  /'
  session "$WORK/p-two" "session 1"
  listed; enabled "$CFG/settings.json" "user settings"

  for scope in project local; do
    rule "rename · $scope scope · marketplace update only"
    new_config "rename-$scope"; local proj="$WORK/p-$scope"; mkdir -p "$proj"
    "$CLAUDE" plugin marketplace add "$REPO#$OLD_REF" >/dev/null 2>&1
    ( cd "$proj" && "$CLAUDE" plugin install "$OLD_ID" --scope "$scope" 2>&1 | tail -1 | sed 's/^/  /' )
    local file="$proj/.claude/settings.json"; [ "$scope" = local ] && file="$proj/.claude/settings.local.json"
    enabled "$file" "before, $scope settings"
    move_marketplace "$CFG/plugins/known_marketplaces.json" "$CFG/settings.json" "$proj/.claude/settings.json" "$proj/.claude/settings.local.json"
    for n in 1 2 3; do session "$proj" "session $n"; done
    enabled "$file" "after, $scope settings"
    enabled "$CFG/settings.json" "after, user settings"
  done

  rule "rename · user scope · the old install was disabled"
  new_config rename-disabled; mkdir -p "$WORK/p-disabled"
  "$CLAUDE" plugin marketplace add "$REPO#$OLD_REF" >/dev/null 2>&1
  "$CLAUDE" plugin install "$OLD_ID" >/dev/null 2>&1
  "$CLAUDE" plugin disable "$OLD_ID" 2>&1 | tail -1 | sed 's/^/  /'
  move_marketplace "$CFG/plugins/known_marketplaces.json" "$CFG/settings.json"
  session "$WORK/p-disabled" "session 1"
  listed; enabled "$CFG/settings.json" "user settings"
}

style_file() { # path name
  mkdir -p "$(dirname "$1")"
  printf -- '---\nname: %s\ndescription: shadowing measurement\n---\n\nA style used only to measure shadowing.\n' "$2" > "$1"
}

measure_shadowing() {
  local plugin="${NEW_ID%@*}" style qualified
  style="$(sed -n 's/^name: *//p' "$HERE/plugins/$plugin/output-styles/"*.md | head -1)"
  qualified="$plugin:$style"
  rule "shadowing · plugin $NEW_ID from this checkout · style \"$style\""
  new_config shadow; local proj="$WORK/p-shadow"; mkdir -p "$proj"
  "$CLAUDE" plugin marketplace add "$(native "$HERE")" 2>&1 | tail -1 | sed 's/^/  /'
  "$CLAUDE" plugin install "$NEW_ID" 2>&1 | tail -1 | sed 's/^/  /'
  session "$proj" "no other style file"
  for level in user project; do
    local file="$CFG/output-styles/measure.md"; [ "$level" = project ] && file="$proj/.claude/output-styles/measure.md"
    style_file "$file" "$style";     session "$proj" "$level file, name: $style"
    style_file "$file" "$qualified"; session "$proj" "$level file, name: $qualified"
    rm -f "$file"
  done
  session "$proj" "files removed again"
  say "  policy level: not measured (needs an administrator to write the managed directory)"
}

say "claude: $("$CLAUDE" --version 2>&1 | head -1) · $(uname -s) $(uname -m) · node $(node --version)"
say "repo $REPO · old ref $OLD_REF ($OLD_ID) · new ref $NEW_REF ($NEW_ID)"
case "$WHAT" in
  rename) measure_rename ;;
  shadowing) measure_shadowing ;;
  all) measure_rename; measure_shadowing ;;
  *) say "usage: $0 [rename|shadowing|all]"; exit 2 ;;
esac
