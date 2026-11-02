# VS Code + main + Windows release integration

Status: **In progress — planning/audit only; not yet implemented or tested.**

## Goal
Restore the user-confirmed VS Code toolbar button, native hosted VS Code tabs, project picker, and active-file/session restoration to the stable mainline without losing existing main functionality or the Windows release pipeline in draft PR #56.

## Current evidence (2026-11-02)
- User confirmed VS Code button appears when running the VS Code development branch; it is missing from current main/release branch.
- Existing PR #22 (main → feature/hexora-project-picker) is conflicted; do not merge blindly or rewrite its branch.
- feature/hexora-project-picker is 67 commits ahead and 12 behind main. It touches central files main.js, preload.js, toolbar.js, toolbar.html, tab-store.js, style.css and package.json.
- PR #56 adds packaged/development profile separation, release workflow and stable updater; it remains a draft and must not be discarded.

## Integration approach
1. Identify exact user-tested VS Code branch revision and compare the newer VS Code fixes, including auto project detection, fast folder opening and active-file session restoration.
2. Bring isolated VS Code support modules, picker assets and test scripts into this task branch, preserving all mainline code.
3. Reconcile shared Electron entrypoint, IPC, preload, toolbar, tab-store, CSS and package changes deliberately; do not wholesale overwrite either branch.
4. Integrate PR #56 separately after reconciliation or rebase on the accepted mainline; preserve separate userData paths, icon and gated updater.
5. Run automated tests and manually verify Windows: npm start shows VS Code button; create multiple VS Code tabs; project picker opens real Windows folders; Alt+Tab/focus/typing work; last project/file restore; installed app and dev app coexist; deep links and existing tabs work.

## Dependencies / risks
- PR #22 conflict and PR #56 packaging changes.
- Native VS Code window lifecycle and focus are fragile. No claims of completion until Windows verification.

## Next action
Implement the focused integration in this branch and update the PR with actual code and test evidence.
