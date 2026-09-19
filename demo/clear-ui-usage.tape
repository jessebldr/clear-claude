# Clear UI 0.2's opt-in usage provider, in a real Claude Code session. Nothing here is drawn:
# VHS types the keys below into a real terminal and records what appears.
#
# One command switches the provider on; then watch the right end of the bottom row. The last
# chip is the weekly limit scoped to one model, under the name Claude Code gives it. The number
# is the recording account's own, fetched by Claude Code's own `claude -p /usage`.
#
# Recorded from the default: provider off, no cached answer. The hidden line changes directory
# and switches CLAUDE.md discovery off, so the machine owner's private working rules do not shape
# the answer. Everything after Show is what the viewer sees being typed. The command is the
# repository's own script, run from the clone; the session beneath it is the installed plugin.
Output frames-clear-ui-usage/
Set Shell "bash"
Set FontSize 15
Set Width 1300
Set Height 720
Set Padding 16
Set Framerate 12
Set TypingSpeed 35ms
Hide
# VHS on Windows can drop the first keystroke; a leading space is harmless to bash.
Type " cd ~/demo/clear-claude && export CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 && clear"
Enter
Sleep 1s
Show
Type "node plugins/clear-ui/bin/configure.mjs usage on"
Sleep 600ms
Enter
Sleep 4s
Type "claude"
Sleep 400ms
Enter
Sleep 14s
Type "In one sentence, what does the usage provider in plugins/clear-ui do?"
Sleep 600ms
Enter
Sleep 32s
