# VS Code project restoration (Windows experiment)

On the `experiment/vscode-no-flash` implementation, Hexora already saves native
VS Code tab IDs and workspaces in SQLite. This change adds a **separate, durable
project folder per tab**, saved in the same database.

## Use it

1. Create a VS Code tab with **⌘** in the Hexora rail.
2. Right-click that **VS Code tab** (top tab strip or left sidebar).
3. Select **Choose VS Code project folder…** and choose the local project folder.
4. Restart Hexora. When that tab becomes active, its native VS Code host is
   launched with `code.cmd --new-window "<saved folder>"`. Other Code tabs stay
   dormant until activated. Each tab uses its own saved folder.
5. Change the association with **Change VS Code project…**, or remove it with
   **Clear saved project folder**. Changes to a *running* Code window deliberately
   take effect on its **next launch**; Hexora never forcibly closes an editor
   containing unsaved work.

The saved paths are in `native_code_projects` inside the existing
`hexora-tabs.sqlite` database, included in the existing encrypted recovery
snapshot. Closing a tab removes its project association. Moving/renaming a tab
does not lose its association. If a directory is missing, the tab displays a
warning in the sidebar and VS Code opens without a folder rather than crashing
Hexora; choose the new folder in the tab menu.

## Scope and limitations

- **This is an experiment, not yet commercially certified.** Native Win32 window
  reparenting and window identity remain supported by the experimental host.
- **Selecting File > Open Folder inside VS Code does not automatically modify the
  saved Hexora association.** Use the tab's Hexora context menu to update it.
  Accurate automatic in-editor project tracking would require a VS Code
  companion extension or another trustworthy per-window bridge.
- VS Code owns open-file lists, unsaved drafts, split editors, and Hot Exit
  behavior. Hexora stores and restores the project folder **only**; other
  editor restoration is controlled by installed VS Code and user settings.
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

1. Set folder A for Code tab 1 and folder B for Code tab 2.
2. Switch to a normal web tab, restart Hexora, then activate each Code tab.
   Verify each opens its **own** folder, and the inactive tab stays unlaunched.
3. Rename and move tab 1 to a different Hexora workspace, restart, and verify
   its folder remains the same.
4. Change tab 1's association while its editor is running: the existing editor
   must not be killed; after restart the new folder must be used.
5. Rename or remove folder B on disk: Hexora should stay operational, show
   a warning, and offer a replacement project folder.
6. Close Code tab 1, restart, and ensure it does not return. Other tabs and
   their projects must still load.
7. Test a Windows crash/restart and multi-monitor focus/resize/detach behavior
   separately. Confirm no loss of unsaved editor state before treating this
   native integration as production-ready.
