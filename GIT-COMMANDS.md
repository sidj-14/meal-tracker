# Git commands used for this project, in order

This is every command used to get the code from an empty folder onto GitHub. Repeat it yourself later.

## 1. One-time setup on GitHub (in the browser)

- github.com → **+** → **New repository** → name `meal-tracker`, **Public**, no README/.gitignore/license → **Create repository**.

## 2. Turn the project folder into a Git repository

```bash
cd meal-tracker                 # go into the project folder
git init -b main                # start tracking history; name the main branch "main"
```

## 3. Tell Git who you are (once per computer, or per repo like here)

```bash
git config user.name "Adi"
git config user.email "sidj-14@users.noreply.github.com"
```

The `users.noreply.github.com` address keeps your real email out of a public repo. GitHub still links the commits to your account.
To do this for every repo on your computer, add `--global`: `git config --global user.name "Adi"`.

## 4. Save the first snapshot (commit)

```bash
git add .                       # stage every file in the folder ("." = here)
git status --short              # check what's staged: "A" = added
git commit -m "Phase 1: targets, daily and weekly tracking, custom foods"
git log --oneline               # list commits: bd4aeb6 Phase 1: ...
```

## 5. Connect to GitHub and upload (push)

```bash
git remote add origin https://github.com/sidj-14/meal-tracker.git   # "origin" = nickname for the GitHub copy
git remote -v                   # confirm the address
git push -u origin main         # upload; -u remembers origin/main so later you just type "git push"
git ls-remote origin            # ask GitHub what it has: the same commit id = push worked
```

## 6. Every change after that

```bash
# edit files...
git status                      # what changed?
git diff                        # the exact lines that changed
git add .                       # stage the changes
git commit -m "Describe the change"
git push                        # upload; GitHub Pages republishes in ~1 minute
```

## Working on your own computer later

```bash
git clone https://github.com/sidj-14/meal-tracker.git   # download the repo, with full history
cd meal-tracker
python3 -m http.server 8000                             # preview at http://localhost:8000
git pull                                                # get changes pushed from elsewhere (e.g. by Claude)
```

`git pull` before you start editing, and `git push` when you're done. That keeps your computer and GitHub in step.
