# Sourced by the recording scripts. Not a recording step itself.

# winget installs vhs and ttyd without putting them on the PATH of a shell that is already open.
if [ -n "${LOCALAPPDATA:-}" ] && command -v cygpath > /dev/null; then
  packages="$(cygpath "$LOCALAPPDATA")/Microsoft/WinGet/Packages"
  for dir in "$packages"/charmbracelet.vhs_*/vhs_* "$packages"/tsl0922.ttyd_*; do
    [ -d "$dir" ] && PATH="$dir:$PATH"
  done
  export PATH
fi

# A recording must not inherit the Claude Code session that launched it: with these set, the
# recorded session shows "Transcript saving is off" and other parent-session state.
for v in $(env | grep -E '^(CLAUDE|ANTHROPIC)[A-Z_]*=' | cut -d= -f1); do unset "$v"; done

for tool in vhs ttyd ffmpeg ffprobe node; do
  command -v "$tool" > /dev/null || { echo "demo: $tool is not on PATH" >&2; exit 1; }
done
