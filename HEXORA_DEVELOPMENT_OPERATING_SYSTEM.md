# HEXORA DEVELOPMENT OPERATING SYSTEM
Version 1.0 · 2026-11-01

## Canonical meaning of "the list"
In **any ChatGPT conversation inside the Hexora Workspace Project**, phrases such as "add it to the list", "put it on the list", "backlog this", "remember this feature", and "track this bug" mean: **create or update a GitHub Issue in anthonymes93/HexoraWorkspace**. The canonical list is the repository's **open GitHub Issues**, not a private chat list, Notion database, or this document. If a GitHub Projects board is connected, include the issue there too. Never say an issue was added unless the GitHub action succeeded. If access is unavailable, say so and supply a ready-to-post issue instead.

## Source of truth and separation
- GitHub Issues: feature requests, bugs, enhancements, chores, decisions, acceptance criteria.
- GitHub pull requests: actual code changes, reviews, test evidence, dependencies, integration.
- GitHub Projects (when configured): visual workflow view of the same issues/PRs, **not** a second list.
- This guide: durable rules; never record volatile live status as fact.
- ChatGPT Project instructions: point all chats here and to HEXORA_DEVELOPMENT_COORDINATION.md.
- No code implementation when user says only "add it to the list", unless separately requested.

## New conversation bootstrap
1. Read `HEXORA_DEVELOPMENT_COORDINATION.md` and this document, from Project files or repository.
2. Before any code change, inspect live GitHub branches, PRs, issues, default branch, and relevant files.
3. Before adding a task, search existing open and closed issues for duplicates. Prefer commenting/updating an existing issue where supported; otherwise link the existing issue and avoid a duplicate.
4. When adding an issue, state the verified issue number and URL.
5. When coding, identify an owned task branch and integration base. Never overwrite another conversation's work. Use dedicated PRs and document cross-PR dependencies.
6. Separate "committed", "PR opened", "merged", "automated tests passed", and "Windows manually tested"; do not conflate.

## Issue template
**Summary:** one clear behavior/outcome.
**Type:** bug / feature / enhancement / chore / research.
**Priority:** P0 critical data loss/security; P1 broken core workflow; P2 important improvement; P3 polish/idea.
**Status:** Backlog / Planned / In Progress / Testing / Review / Done / Blocked.
**Area:** tabs, workspaces, embedded sites, native VS Code, browser, navigation, design, security, packaging, infrastructure.
**Context:** observed behavior or rationale; links to relevant PRs/screenshots.
**Acceptance criteria:** concrete, testable checklist.
**Dependencies and risk:** related issues/PRs, shared files, persistence, security, performance.
**Verification:** what can be tested and by whom.
When the user provides insufficient detail, create a clearly labeled discovery issue rather than inventing requirements.

## Status policy
- Backlog: captured, not committed to implementation.
- Planned: scope and priority agreed.
- In Progress: developer owns a branch/PR.
- Testing: implementation awaits or is undergoing verification.
- Review: tests recorded, ready for integration review.
- Done: merged to agreed integration branch AND verified as required; closing a ticket alone is not proof.
- Blocked: dependency/decision prevents progress.
A PR can be open while an issue remains Testing. A stacked PR is not independently merged.

## Project board specification
Suggested title: **Hexora · Development HQ**.
Views: Board (Status), Table (all work), Roadmap (when dates are real), Bugs (type=bug), Ready to Test, Release Candidates.
Fields: Status, Priority, Type, Area, Target Release, Owner, Dependency, Verification, Effort (optional).
Workflow columns: Backlog → Planned → In Progress → Testing → Review → Done, with Blocked separately.
Automation: add new repo issues to board; close-to-Done only when completion criteria are met; do not blindly equate closed PR with fully verified feature.
Suggested initial seed: issue #49 adaptive website backing (P2 / enhancement / Backlog), issue #26 VS Code lifecycle (triage), issue #23 integration handoff (triage). Review open PRs for status and dependencies, especially #40–#48 stacked series; do not auto-mark Done.

## New issue quality and duplicate avoidance
Use concise, searchable titles. Link related PRs and issues. Record user-observed symptoms vs hypotheses separately. For design requests, include expected interaction and keyboard behavior. For native-window changes, include Windows Alt+Tab, focus, startup, and restoration regression tests. Do not paste secrets or private credentials.

## Coordination
Follow `HEXORA_DEVELOPMENT_COORDINATION.md` in full. If documents conflict, stop and flag the conflict instead of silently changing policy. GitHub is durable coordination across chats; shared Project files help bootstrap but do not magically synchronize live activity. Do not edit or merge another conversation's branch without explicit coordination.

## Project setup
Create GitHub Projects board through GitHub UI if connector cannot manage Projects. Link repository; configure fields/views above; turn on built-in auto-add workflow if available. Project URL must be verified before declaring board created. Add both this document and the ChatGPT Project instructions file to the Hexora ChatGPT Project files, and paste the latter into Project instructions. Project files alone may not guarantee automatic reading; Project instructions make the convention explicit.
