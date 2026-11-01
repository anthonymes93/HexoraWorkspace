# VS Code project restoration (Windows experiment)

On the `experiment/vscode-no-flash` implementation, Hexora already saves native
VS Code tab IDs and workspaces in SQLite. This change adds a **separate, durable
project folder per tab**, saved in the same database.

## Fast native opening without tab context menus

1. Click **⌘ VS Code** in Hexora. A native Windows folder picker appears
   **before** launching VS Code. Pick the project folder to associate it with
   the new Hexora tab, without using any tab context menu.
2. VS Code opens the selected project in its own managed Hexora session.
   The folder, last active file, and cursor restore when you restart Hexora.
   Background tabs do not create additional VS Code processes until selected.
3. **Cancel** the picker to open an ordinary blank VS Code window instead,
   or **Ctrl-click ⌘** to skip the picker entirely and immediately open a
   blank window via VS Code's original fast `code.cmd --new-window` launch.
4. For a running managed VS Code session, the companion's **Open Project**
   status-bar action (or **Ctrl+K, Ctrl+O**) changes its folder without
   losing the Hexora association. The original right-click picker remains a
   fallback.

**Reason:** the previous implementation opened every blank tab as a synthetic
`.code-workspace` file. That adds startup work and VS Code's built-in
**File → Open Folder** may replace the native child window Hexora is hosting.
Blank tabs no longer use that synthetic workspace. VS Code's ordinary File
menu is still controlled by VS Code, not Hexora; until native window replacement
is handled by the host, use the pre-launch picker or the in-editor
**Open Project** action for reliable project switching.

## Startup behavior

- New blank tabs skip workspace creation and skip companion installation.
- Managed tabs retain isolated `.code-workspace` descriptors in
  `<Hexora userData>/hexora-native-code` for project/file/caret restoration.
- A companion update is installed **asynchronously**, never before the Code
  host starts. After a new companion installation, a VS Code reload or next
  session may be needed for the new extension code to activate.
- If the installer fails, native Code still starts; Hexora logs the error and
  retries on a later Hexora run rather than delaying every new tab.

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

1. Click the VS Code rail icon and choose project A in the Windows folder
   dialog. Verify the editor launches with folder A without using the tab
   right-click menu. Click again and choose project B.
   Ctrl-click the icon: a blank native Code tab should start without showing
   the picker, without a synthetic empty .code-workspace descriptor, and
   without a blocking companion install.
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

Manual native hosting validation remains required: in a blank Code tab, open
**File → Open Folder** and confirm whether VS Code retains its hosted native
window. Hexora cannot guarantee this menu behavior when VS Code replaces its
window; use the pre-launch picker for a reliable project opening path.
