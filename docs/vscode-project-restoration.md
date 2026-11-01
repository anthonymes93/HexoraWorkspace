# VS Code project restoration (Windows experiment)

On the `experiment/vscode-no-flash` implementation, Hexora already saves native
VS Code tab IDs and workspaces in SQLite. This change adds a **separate, durable
project folder per tab**, saved in the same database.

## Use it — no Hexora context menu needed

1. Create a VS Code tab with **⌘** in Hexora. New tabs now launch an **empty,
   uniquely identified VS Code workspace** so the companion is active before a
   project is selected.
2. In VS Code, click **Open Project** in the bottom status bar, or press
   **Ctrl+K, Ctrl+O** while that Hexora-managed Code window is active.
3. Choose any local folder. The companion writes the project association
   automatically, and Hexora syncs it into SQLite without requiring a
   right-click in Hexora.
4. Open a file and position the cursor. On restart, Hexora launches the
   same folder and restores that file and cursor, independently for every tab.
   Only the active Code tab launches; other Code sessions remain dormant.

The companion also detects workspace-folder changes within the *same
Hexora-managed .code-workspace* (e.g., VS Code's **Add Folder to Workspace**).
It supports one local folder per Code tab. The existing Hexora right-click
**Choose VS Code project folder…** remains as a fallback. Changing a project
with that fallback while an editor is running takes effect on its next launch.

The project association is saved in the existing SQLite \`native_code_projects\`
table and is included in encrypted recovery backups. The active editor, caret,
and companion project-update event are stored locally under
\`<Hexora userData>/hexora-native-code\`, not in the project folder.
Hexora checks a per-window owner token so a stale detached VS Code window
cannot overwrite a newly activated tab's project association.

## Scope and limitations

- **This is an experiment, not yet commercially certified.** Native Win32 window
  reparenting and window identity remain supported by the experimental host.
- VS Code's ordinary **File > Open Folder** can replace or spawn a window,
  potentially leaving the Hexora-managed workspace. Use **Open Project** in
  the VS Code status bar (or **Ctrl+K, Ctrl+O** in a Hexora Code tab) to reliably
  keep the folder associated with its tab. Adding/changing folders without
  leaving the managed workspace is also auto-detected.
- A new first workspace folder can restart the VS Code extension without
  emitting a folder-change event; Hexora's in-editor picker publishes its
  choice directly before that happens. First-run companion updates may
  require restarting Hexora and reactivating the Code tab.
- Hexora restores the project, **last active local file, and cursor** via the
  companion extension. It does **not** yet capture every editor group, split,
  tab ordering, unsaved buffer contents, or terminal state. VS Code itself owns
  unsaved drafts and Hot Exit; Hexora does not claim to back them up.
- First-run installation may require VS Code to finish updating its extensions
  or a manual VS Code reload. If the local bridge installation fails, folder
  restoration still works and the PowerShell host reports the error in its log.
- Files opened in VS Code **before the bridge was installed** cannot be inferred
  retroactively. Visit the file after updating Hexora to allow it to be saved.
- Hexora does not close native Code windows when the host stops, to avoid
  destructively discarding unsaved work. Those standalone windows can remain
  open on the desktop after Hexora exits. Avoid confusing them with restored
  windows during testing.
- Paths are local to the Windows machine and must still exist after restart.
  A recovery snapshot taken on another machine may point to unavailable folders.
- VS Code's `code.cmd` must be on PATH, just as for the original native host.

## Regression checks

Run the SQLite project association test:

```sh
npm run test:code-projects
```

On Windows, also test manually:

1. Create a fresh Code tab with no project. Use its **Open Project** status bar
   button, choose folder A, and verify Hexora now remembers the folder without
   opening the Hexora right-click menu. Repeat with folder B in a second tab.
   Also test the Ctrl+K, Ctrl+O shortcut in a managed tab.
2. Switch to a normal web tab, restart Hexora, then activate each Code tab.
   Verify each opens its **own** folder, and the inactive tab stays unlaunched.
3. Rename and move tab 1 to a different Hexora workspace, restart, and verify
   its folder remains the same.
4. Change tab 1's association while its editor is running: the existing editor
   must not be killed; after restart the new folder must be used.
5. Rename or remove folder B on disk: Hexora should stay operational, show
   a warning, and offer a replacement project folder.
6. Open `src/index.js` in tab 2, move the cursor to a recognizable line,
   restart Hexora, and confirm the same editor opens with the cursor restored.
   Repeat with two Hexora tabs pointing to the **same** project folder.
7. Close Code tab 1, restart, and ensure it does not return. Other tabs and
   their projects must still load.
8. Test a Windows crash/restart and multi-monitor focus/resize/detach behavior
   separately. Confirm no loss of unsaved editor state before treating this
   native integration as production-ready.

Run the companion package and workspace isolation tests:

```sh
npm run test:code-session
```

Additional automated checks:

```sh
npm run test:code-auto-project
npm run test:code-project-sync
```
