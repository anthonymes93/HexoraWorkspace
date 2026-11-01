# Bundled local editor prototype
Hexora now starts a bundled `code-server` process when the ⌘ editor button is clicked, waits for its HTTP endpoint, and embeds it using Electron `WebContentsView`. The service binds only to 127.0.0.1 on an ephemeral port and is terminated when Hexora closes.

Install dependencies with `npm install` after pulling. The editor runtime is supplied as an npm dependency; it is **not yet packaged into an installer**. This is an integration prototype, not a production security design. It currently uses `--auth none` on loopback, which means other local processes can connect while Hexora is running. Do not ship this configuration. Add per-session authentication, harden filesystem access, package/runtime verification, crash recovery and automated end-to-end tests before release.

Right-click ⌘ to override the bundled runtime with an existing loopback editor URL. Clear the field to return to automatic startup.
