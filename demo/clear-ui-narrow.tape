# Clear UI inside a real Claude Code session. Nothing here is drawn or edited:
# VHS types the keys below into a real terminal and records what appears.
# Watch the bottom row: the context chip fills in after the first answer, and the
# orange dot beside the branch follows the working tree within a few seconds.
Output frames-clear-ui-narrow/
Set Shell "bash"
Set FontSize 15
Set Width 760
Set Height 640
Set Padding 16
Set Framerate 12
Set TypingSpeed 35ms
Sleep 1s
# VHS on Windows can drop the first keystroke; a leading space is harmless to bash.
Type " cd ~/demo/clear-claude && claude"
Enter
Sleep 8s
Type "Answer in English. In one sentence, what does the clear-ui plugin in this repo do?"
Sleep 600ms
Enter
Sleep 22s
Escape
Sleep 3s
