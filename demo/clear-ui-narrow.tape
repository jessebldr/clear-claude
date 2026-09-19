# Clear UI inside a real Claude Code session. Nothing here is drawn:
# VHS types the keys below into a real terminal and records what appears.
# Watch the bottom row: the context chip fills in after the first answer, and the
# orange dot beside the branch follows the working tree within a few seconds.
# This is the narrow variant: at 760 px the bar becomes two rows.
#
# The hidden line changes directory and switches CLAUDE.md discovery off, so the recording
# machine owner's private working rules do not shape the answers. Everything after Show is
# what the viewer sees being typed. Both plugins are installed from the marketplace.
Output frames-clear-ui-narrow/
Set Shell "bash"
Set FontSize 15
Set Width 760
Set Height 640
Set Padding 16
Set Framerate 12
Set TypingSpeed 35ms
Hide
# VHS on Windows can drop the first keystroke; a leading space is harmless to bash.
# DEV_STYLE: until clear-claude 0.1.1 is what the marketplace serves, the alias loads the
# working-tree copy of the plugin, which wins over the installed one. Drop the alias after that.
Type " cd ~/demo/clear-claude && export CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 && alias claude='claude --plugin-dir ~/work/clear-claude/plugins/clear-claude' && clear"
Enter
Sleep 1s
Show
Type "claude"
Sleep 400ms
Enter
Sleep 8s
Type "In one sentence, what does the clear-ui plugin in this repo do?"
Sleep 600ms
Enter
Sleep 22s
Escape
Sleep 3s
