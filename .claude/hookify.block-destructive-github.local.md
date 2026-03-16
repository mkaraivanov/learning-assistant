---
name: block-destructive-github
enabled: true
event: bash
pattern: git push\s+.*(-f\b|--force(?!-with-lease))|git push\s+(-f\b|--force(?!-with-lease))|git reset\s+--hard|git branch\s+-D\s|gh\s+(pr\s+(close|merge)|issue\s+close|release\s+delete|repo\s+delete)
action: block
---

🚫 **Destructive GitHub/git operation blocked**

This command can cause irreversible damage (overwrite history, delete branches, close/merge PRs, delete releases or repos).

**Triggered by one of:**
- `git push --force` / `git push -f` — overwrites remote history
- `git reset --hard` — discards local commits/changes permanently
- `git branch -D` — force-deletes a branch without merge check
- `gh pr close` / `gh pr merge` — closes or merges a PR
- `gh issue close` — closes an issue
- `gh release delete` / `gh repo delete` — deletes a release or repo

**Before proceeding, confirm with the user:**
1. Is this intentional?
2. Has the user explicitly approved this specific operation?
3. Is there a safer alternative (e.g. `--force-with-lease` instead of `--force`)?

Do NOT retry this command automatically. Ask the user to confirm first.
