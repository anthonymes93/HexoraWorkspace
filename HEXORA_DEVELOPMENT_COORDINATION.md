# Hexora Development Coordination

Repository: `anthonymes93/HexoraWorkspace`

This is a durable coordination policy, not a live status report. GitHub is the cross-conversation source of truth. Read this and `HEXORA_DEVELOPMENT_OPERATING_SYSTEM.md` before editing.

## Default delivery workflow

**User requests a change → implement → merge into `develop` → dev watcher receives push and restarts.** The user should not have to manage routine branches, PRs, or Git commands.

1. Inspect live `develop`, open PRs, relevant branches and files before changing code. Check for collisions with other conversations.
2. For small, isolated edits, create a short-lived task branch, commit, open a PR and **merge into `develop` in the same operation** when safe. Do not pause at a branch or PR and call the task done.
3. For larger changes, keep an owned task branch and PR until ready; resolve dependencies and conflicts before integration. Do not overwrite concurrent work.
4. Keep `main` stable. Never merge to `main` without explicit user approval. Never force-push shared branches.
5. Preserve existing user data, workspace settings, tabs and profiles. Avoid unnecessary rewrites.
6. After integration, report verified commit/PR/merge status. Distinguish code pushed, PR opened, merged, automated checks and Windows manual testing. Never claim a restart was observed unless confirmed.

## Updates and restarts

Cloudflare's push relay is the remote event source for `dev:watch`; **do not poll GitHub**. Local Git HEAD changes may be observed via local filesystem events. Watcher must protect dirty or divergent branches, not silently discard commits. If auto-update is blocked, explain the specific blocker and the shortest safe resolution.

## Backlog and coordination

"The list", "backlog it", "track this bug" and similar requests mean GitHub Issues in this repository. Search duplicates, include type, priority, area, summary and acceptance criteria, and report the actual issue URL. Do not implement a request merely because it was added to the list. GitHub Projects is a view of those issues, not a separate backlog.

## Escalation

Ask for user action only for genuine conflicts, missing authorization, failed tool operations, required manual Windows verification or meaningful risk. If integration fails, say **not merged** and identify what remains. Keep user commands minimal.
