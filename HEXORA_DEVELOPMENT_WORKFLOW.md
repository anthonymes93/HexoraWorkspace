# Hexora development integration

- **main** is the stable release branch. Do not push experimental features to main.
- **develop** is the shared live development branch. The user's local `npm run dev:watch` follows this branch and restarts Electron when it fast-forwards.
- Each contributor or ChatGPT conversation uses a **task-specific feature branch created from develop**, and opens a PR targeting **develop**.
- Internal, non-draft PRs to develop run `.github/workflows/develop-integration.yml` syntax/regression checks. Passing PRs are automatically squash-merged by the workflow. Conflicts or failing checks require manual resolution.
- Never bypass PR checks, force-push develop, or overwrite other conversations' branches. Windows manual verification is still required for Electron UI changes; automated syntax tests do not prove runtime functionality.
- New PRs to main are intentionally **not** auto-merged.
- Local tracked edits pause the watcher to protect user changes. Keep the development checkout clean, and never silently discard or stash user files.
- To initialize once from the existing Hexora repository, preserve local edits before switching branches, then run `git fetch origin; git switch develop; git pull; npm run dev:watch`. Keep the terminal open.
- Existing historical PRs may target other feature branches; do not automatically retarget or merge them without inspecting dependencies and changes.
