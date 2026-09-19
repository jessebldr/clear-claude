# End-to-end dogfood of Clear UI's two opt-in features with REAL hook payloads, not fixtures:
# verification state (PostToolUse / PostToolUseFailure) and the activity row
# (subagentStatusLine feed + Stop hook). See docs/clear-ui-dogfood.md for what to look for.
#
# Needs: Clear UI set up with `setup.mjs apply --activity`, and a throwaway git project at
# ~/demo/verify-demo that Claude Code already trusts, holding check.mjs (`process.exit(0)`),
# notes.txt and .claude/clear-ui.json with { "verify": ["node check.mjs"] }.
# --plugin-dir loads the plugin's hooks for this session from the working tree.
Output frames-dogfood-windows/
Set Shell "bash"
Set FontSize 15
Set Width 1300
Set Height 780
Set Padding 16
Set Framerate 10
Set TypingSpeed 30ms
Sleep 1s
# VHS on Windows can drop the first keystroke; a leading space is harmless to bash.
Type " cd ~/demo/verify-demo && claude --plugin-dir ~/work/clear-claude/plugins/clear-ui"
Enter
Sleep 9s
Type "Answer in English, every reply under ten words. Run exactly this command: node check.mjs"
Sleep 500ms
Enter
Sleep 24s
Type "Append the line hello to notes.txt"
Sleep 500ms
Enter
Sleep 20s
Type "Edit check.mjs so it exits with code 1, then run exactly: node check.mjs"
Sleep 500ms
Enter
Sleep 30s
Type "Start a 90 second sleep as a background shell command. At the same time use 2 subagents in parallel, each counting the files in this folder. Report both counts."
Sleep 500ms
Enter
Sleep 70s
