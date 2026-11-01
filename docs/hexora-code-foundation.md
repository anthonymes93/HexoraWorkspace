# Hexora Code — Windows-first foundation

The previous code-server npm dependency was removed because its Unix postinstall script failed on Windows. Hexora Code now loads a local editor document directly in Electron. No server, port, runtime download, or extra npm dependency is required.

Current scope: open a UTF-8 text file, edit, save, Save As, line numbers, tab indentation, Ctrl+S and Ctrl+O. The main-process file operations accept requests only from the editor WebContents, cap content at 5 MiB, and use native file dialogs. This is an **early text-editor prototype**, not a VS Code replacement: there is no Explorer tree, syntax highlighting, extensions, terminal, language server, debugging, or workspace support yet.

Security follow-up: migrate this local editor to a dedicated context-isolated preload API rather than enabling Node integration in the editor view; restrict save paths to explicitly user-authorized files and folders. Do not ship commercially before this work.
