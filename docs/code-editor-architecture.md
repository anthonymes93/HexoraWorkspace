# Hexora code editor architecture (v1)

## Decision
The native Win32 `SetParent` VS Code experiment is a proof of concept, **not** a supported integration. It stays isolated on `experiment/native-vscode-host`. No HWND reparenting, polling focus, synthetic mouse events, or activation tricks belong in this architecture branch.

## Goals
- One coherent Hexora workspace, predictable editor lifecycle, keyboard/mouse accessibility, and reliable Alt+Tab.
- Explicit provider capability negotiation and error reporting.
- Preserve user project folders and settings; avoid silently modifying VS Code installations.
- Test on Windows with multiple monitors, DPI scaling, sleep/resume, project switching, and shutdown.

## Integration candidates
1. **Code - OSS-derived editor shell:** deepest integration, but substantial packaging, extension compatibility, licensing and maintenance review required.
2. **Browser-based editor backend (e.g. code-server/OpenVSCode Server):** native WebContentsView integration is feasible; requires explicit local server lifecycle, authentication, file access boundaries, and extension compatibility validation.
3. **Managed companion VS Code window:** safest interim option; independent top-level window with supported command-line launch and OS focus handling, but not a truly embedded editor.

Do not choose a final backend until a short prototype passes the acceptance criteria below.

## Provider boundary
`integrations/code/editor-provider.js` defines `EditorSession` and capability names. This is framework-neutral code, intentionally **not yet wired** into Electron. Providers must advertise supported operations; embedded mode must not be claimed unless implemented and tested.

## Acceptance criteria
- Editor, Explorer, terminal, command palette, find, dialogs, keyboard shortcuts, and mouse work without repair actions.
- Switching between Hexora, other apps, and monitors never strands keyboard focus.
- Open/close/switch projects 100 times without orphaned processes or hidden windows.
- Closing Hexora cleans up only processes it owns.
- Failed startup, crash and restart surface actionable errors.
- Clear security model for filesystem access and any local editor server.

## Next implementation
Prototype a supported WebContentsView-based editor provider behind this contract; benchmark startup, extensions, file access, and reliability before making it the default.
