`git stash` shelves your uncommitted changes (tracked files, both staged and unstaged) and restores your working directory to match the last commit. It's a clean slate without committing or losing work.

Common commands:
- `git stash` (or `git stash push -m "msg"`): save changes and clean the tree
- `git stash list`: see saved stashes
- `git stash pop`: reapply the most recent stash and remove it from the list
- `git stash apply`: reapply but keep it in the list
- `git stash drop`: delete a stash

By default it **skips untracked files**. Add `-u` to include them, or `-a` to also include ignored files.

Typical use: you're mid-change and need to switch branches or pull, so you stash, do that, then `git stash pop`.