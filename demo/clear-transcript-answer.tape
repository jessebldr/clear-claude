# Clear Transcript in a real Claude Code session: one structured answer, the same answer in the ctrl+o view
# (where every row is Claude Code's own drawing), then a short answer with no section title, which Clear
# Transcript must leave exactly as stock draws it. Nothing here is drawn: VHS types the keys below.
#
# Clear Transcript is experimental and loads only with --plugin-dir and the function-hooks gate, set for the
# one command. CT_REPO is the checkout that holds experimental/clear-transcript (default: ~/demo/clear-claude).
# The hidden line also switches CLAUDE.md discovery off, so the recording machine owner's private working
# rules do not shape the answers.
Output frames-clear-transcript-answer/
Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 1000
Set Padding 16
Set Framerate 5
Set TypingSpeed 5ms
Hide
# VHS on Windows can drop the first keystroke; a leading space is harmless to bash.
Type " cd ~/demo/clear-claude && export CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 CT_PLUGIN=${CT_REPO:-$HOME/demo/clear-claude}/experimental/clear-transcript && clear"
Enter
Sleep 1s
Show
Type "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --model haiku --plugin-dir $CT_PLUGIN"
Enter
Sleep 9s
Type "Answer in English and use no tools. In about 220 words explain how DNS resolution works. Start with a one-sentence answer, then use two level-2 headings with two level-3 headings under the first one, one short bullet list, one three-row table and a three-line bash code block."
Sleep 500ms
Enter
Sleep 22s
Ctrl+O
Sleep 5s
Escape
Sleep 3s
Type "Use no tools. In two sentences and no headings: what is a CNAME record?"
Sleep 500ms
Enter
Sleep 12s
Type "/exit"
Enter
Sleep 3s
