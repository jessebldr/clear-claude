# Clear Transcript in a real working session: three reads, a failing test run, a command that fails, an edit,
# a passing test run and a sub-agent; then ctrl+o, then /clear-transcript off and on. The last two are the
# before and after of assets/clear-transcript-tools.png: the same transcript, drawn by Claude Code and by
# Clear Transcript. Nothing here is drawn: VHS types the keys below.
#
# The project is demo/fixtures/sum-bug, copied fresh to ~/demo/sum-bug. Open that folder once by hand and
# accept the workspace-trust dialog before recording. CT_REPO is the checkout that holds the fixture and
# experimental/clear-transcript (default: ~/demo/clear-claude). Set CLAUDE_CODE_NO_FLICKER=0 in the hidden
# line to record the main-screen layout instead of the fullscreen one.
Output frames-clear-transcript-work/
Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 1000
Set Padding 16
Set Framerate 5
Set TypingSpeed 5ms
Hide
# VHS on Windows can drop the first keystroke; a leading space is harmless to bash.
Type " export CT_REPO=${CT_REPO:-$HOME/demo/clear-claude} && rm -rf ~/demo/sum-bug && cp -r $CT_REPO/demo/fixtures/sum-bug ~/demo/sum-bug && cd ~/demo/sum-bug && git init -q . && git add -A && git -c user.name=demo -c user.email=demo@example.invalid commit -qm fixture && export CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 && clear"
Enter
Sleep 2s
Show
Type "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --model sonnet --permission-mode acceptEdits --allowedTools 'Bash(node:*)' --plugin-dir $CT_REPO/experimental/clear-transcript"
Enter
Sleep 9s
Type "Answer in English. Do these in order: 1) read src/sum.mjs, src/format.mjs and src/parse.mjs; 2) run node --test; 3) run the command node missing-file.js, which is expected to fail; 4) fix the bug in src/sum.mjs with the Edit tool and run node --test again; 5) use one Explore subagent, which must use only the Read tool, to report how many lines src/parse.mjs has. Finish with a five-line summary."
Sleep 500ms
Enter
Sleep 95s
Ctrl+O
Sleep 5s
Escape
Sleep 3s
Type "/clear-transcript off"
Sleep 1500ms
Enter
Sleep 5s
Type "/clear-transcript on"
Sleep 1500ms
Enter
Sleep 5s
Type "/exit"
Enter
Sleep 3s
