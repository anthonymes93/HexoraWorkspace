# Hexora Windows installation and Store packaging

This repository contains the source code for Hexora Workspace. The GitHub Actions workflow
[`Build Hexora Windows test packages`](https://github.com/anthonymes93/HexoraWorkspace/actions/workflows/windows-test-build.yml)
builds **two separate Windows x64 packages**.

## Try the normal Windows installer (no Store approval required)

1. Open the workflow link and select the latest successful run. If there is no run yet,
   use **Run workflow** on the `main` branch.
2. Under **Artifacts**, download **Hexora-Windows-Installer** and extract the ZIP.
3. Close the running development copy of Hexora first.
4. Run `Hexora-Setup-0.4.0-x64.exe`.
5. Launch Hexora Workspace from your Windows Start menu.
6. Test the browser, VS Code embedding, Notion launcher, saved tabs, detached windows and restart restoration.

**This EXE is an unsigned test build.** Windows may show SmartScreen or publisher
warnings. Do not distribute it publicly as a trusted installer. Never disable
Defender/SmartScreen system-wide to test it.

## AppX/MSIX Microsoft Store compatibility test

The other artifact, **Hexora-Microsoft-Store-Preview**, is an *unsigned* AppX package.
It is **not** yet Microsoft-certified or Store-signed and will not install as a
normal trusted Store app. For local testing it must be signed with a local test
certificate and that certificate trusted on the test PC; Microsoft documents
the process:
https://learn.microsoft.com/en-us/windows/msix/package/sign-msix-package-guide

Before submitting a Store package, reserve the Hexora name in Partner Center and
replace the `build.appx.identityName`, `publisher`, and `publisherDisplayName`
preview placeholders in `package.json` with the **exact values** Microsoft provides.
Store publication requires certification; the Store then signs the package.

## Build on Windows locally

```powershell
npm ci
npm run build:win
# or:
npm run build:store
```

The generated outputs go to `dist/`. The build tool version is pinned within
the scripts so source builds are repeatable.

## User data and safety

The app explicitly keeps its existing local profile at
`%APPDATA%\hexora-workspace` for the normal unpackaged Windows application.
The NSIS installer does not intentionally delete that directory on install/update.
The Store-packaged environment may virtualize application data differently, so
**do not assume the Store build shares the NSIS profile**.

Before installation: close Hexora and back up the entire
`%APPDATA%\hexora-workspace` directory, including `hexora-tabs.sqlite`,
its `-wal` and `-shm` sidecars and browser session files.
Copy these only when Hexora is closed.

A build completing does **not** prove every embedded Windows integration works.
Verify on the actual PC before public distribution. Icons, privacy documentation,
signed releases, Store-specific identity, testing and certification still remain.
