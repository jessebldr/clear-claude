`git stash` temporarily shelves your uncommitted changes (both staged and unstaged modifications to tracked files) and restores your working directory to match the last commit (`HEAD`). This lets you switch branches or pull updates without committing half-finished work.

Common commands:

- `git stash` (or `git stash push -m "message"`): save changes and clean the working tree
- `git stash -u`: also stash untracked files
- `git stash list`: show all saved stashes
- `git stash pop`: reapply the most recent stash and remove it from the stash list
- `git stash apply`: reapply a stash but keep it in the list
- `git stash drop`: delete a stash
- `git stash show -p`: view the diff of a stash

Stashes are stored in a stack (`stash@{0}` is the newest), are local to your repository, and aren't pushed to remotes.