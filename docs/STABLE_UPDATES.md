# Hexora Stable releases and updates

Stable does **not** update on merges to main. An approved `vX.Y.Z` tag on a tested commit on main triggers the Windows GitHub Actions release workflow. The tag must match `package.json` version. The workflow publishes the NSIS installer and electron-builder `latest.yml` to GitHub Releases.

Installed NSIS Hexora checks for updates after 15 seconds and every six hours, downloads them, and offers **Later** or **Update & Restart**. Dev (`npm start`) and Microsoft Store builds do not use this updater. Stable and Dev have separate profiles.

**Before the first release:** merge the updater and build/install a bootstrap installer manually once. Increment `package.json` and lockfile versions for subsequent releases, merge and test, then push an approved matching tag. Ensure repository GitHub Actions permissions allow release publishing.

**Limitations:** Windows installed update and signing/SmartScreen behavior need real manual verification. GitHub Actions tests are not installer runtime tests. Do not publish a tag until the release candidate is approved. The old 0.4.0 installer cannot self-update until the new updater-enabled bootstrap is installed.
