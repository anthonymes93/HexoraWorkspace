# Real Microsoft VS Code: focus diagnostics

This is an **isolated experiment** on `experiment/vscode-focus-diagnostics`, based on `experiment/native-vscode-host`. It does not replace VS Code, change the production branch, or claim that native window embedding is supported.

## Hypothesis
The previous diagnostics used `GetFocus()` from the PowerShell thread, temporarily attaching to the VS Code thread. That can show a focus HWND without revealing whether the *foreground thread's* GUI focus belongs to VS Code or Hexora. `GetGUIThreadInfo` provides an independent snapshot of child, parent, and foreground thread focus/active HWNDs.

## Manual test
Run `git fetch origin; git switch experiment/vscode-focus-diagnostics; npm start` with Microsoft VS Code installed and `code.cmd` on PATH.

1. Click the native VS Code rail icon and wait for READY.
2. Click directly into the VS Code editor and type a short test string.
3. Click Hexora's sidebar, then click the VS Code editor and type again.
4. Shift-click the VS Code rail icon to perform the existing detach/reattach repair and type again.
5. Right-click the rail icon to detach, then left-click to reattach and type again.
6. Share terminal output containing `FOCUS_TRACE` and `DIAG` lines, and state exactly which steps accepted typing.

No automatic focus polling, input injection, or additional reparenting workarounds were added. This is a measurement step, not a fix. If focus cannot be made stable without unsupported Win32 behavior, keep VS Code as a separate native application.
