# Hexora Windows release process

## Development versus installed app
- `npm start` uses `%APPDATA%\hexora-workspace-dev`.
- The packaged application uses `%APPDATA%\hexora-workspace`.
- These profiles have independent cookies, databases, sessions and single-instance locks. Existing data under `hexora-workspace` stays with the installed app; development starts with a new profile.

## Build without publishing
Run `npm ci`, then `npm run build:win` on Windows. The NSIS installer is written to `dist/`. The existing `windows-test-build.yml` workflow also uploads an installer artifact after pushes to main.

## Approved stable release
1. Merge and test the release candidate on main.
2. Increment `package.json` version and synchronize the lockfile in a PR.
3. Once merged, tag that exact main commit `vX.Y.Z` and push the tag.
4. `stable-release.yml` validates the tag and runs Windows build/tests before publishing GitHub Release installer assets and `latest.yml`.

Do not publish a release tag for every push. A tag is the explicit approval gate.

## Remaining work before unattended updates
- Integrate a tested updater in the packaged application (for example electron-updater), with an updated dependency lockfile, startup check, downloaded-update notification, and install-on-restart.
- Test signed versus unsigned installer behavior, Windows SmartScreen, rollback, persistence and migration.
- Confirm GitHub Actions workflow can publish in repository settings (Actions workflow permissions).
- Microsoft Store requires Partner Center identity and signing; the current AppX settings are preview placeholders.

**Important:** GitHub release publishing alone does not cause an installed application to update itself. No auto-updater has been wired in this PR.
