# Hexora Workspace — Platform Architecture & Firebase Integration

**Status:** Draft for review · **Date:** 2026-11-03 · **Repository:** `anthonymes93/HexoraWorkspace`

## 1. Product vision

Hexora is a Windows-first Electron workspace evolving into a modular productivity and business platform. The browser and native-app integrations are one part of the product, not the entire product. Planned first-party modules include documents/knowledge, tasks/reminders, projects/boards, CRM, and calendar. All modules should share identity, permissions, search, relationships, and notifications.

**Principle:** Build shared platform primitives, then deliver useful modules incrementally. Do not recreate six mature products before shipping one valuable workflow.

## 2. Architecture at a glance

- **Desktop shell:** Electron, existing window/tab/native VS Code integrations and local persistence; preserve current functionality.
- **Identity:** Firebase Authentication, ideally integrated with the existing Google sign-in flow after inspecting its implementation. Never assume an existing Google session is already a Firebase Auth session.
- **Operational database:** Cloud Firestore for shared application records and live updates.
- **Files:** Cloud Storage for attachments; metadata and access rules in Firestore.
- **Trusted backend:** Cloud Functions or other server-side services for privileged operations, integrations, scheduled processing, and audit-sensitive workflows.
- **Offline/local:** Existing local store where appropriate; Firestore offline persistence where supported and safe. Design explicit sync boundaries, migrations, and conflict handling.
- **Notifications:** Centralized notification service, not a separate implementation per module.

## 3. Shared data model — initial proposal

Use stable IDs and explicit ownership/tenant boundaries. Suggested conceptual entities:

| Entity | Purpose |
| --- | --- |
| users | Profile and personal preferences |
| organizations | Future team/business boundaries |
| memberships | User-to-organization role and access |
| workspaces | Hexora workspace configuration |
| projects | Work containers, possibly associated with clients |
| tasks | Assignments, status, due dates, recurrence references |
| clients | CRM organizations or people, with contact records |
| documents | Notes/pages, content metadata and permissions |
| notifications | User-specific inbox events, read/seen status |
| reminders | Scheduling instructions, delivery state and recurrence |
| activity_events | Auditable cross-module changes where needed |

Use references/IDs to relate clients, projects, tasks, and documents; avoid copying full records into every module. Firestore is not relational: query patterns, index requirements, and denormalization must be designed and tested before finalizing collections. Tenant access must be enforced server-side, not by hiding UI elements.

## 4. Synchronization and offline behavior

- Sync workspace configuration, tasks, documents, CRM records, project metadata, preferences, and notification state.
- Keep browser HTTP cache local. Do not put cookies, authentication tokens, browser profiles, or passwords in ordinary Firestore records.
- Integrate a dedicated password manager rather than inventing a vault. Any cross-device session transfer requires a separate security review and must not be bundled into initial sync.
- Use deterministic record IDs, server timestamps where appropriate, version fields, and explicit conflict policies. Define deletion/tombstone behavior to avoid resurrecting deleted items.
- Support graceful startup offline; surface pending-sync and sync-error states. Test simultaneous edits, reconnects, and device clock differences.
- For rich-text collaborative editing, evaluate a dedicated collaboration mechanism rather than assuming Firestore document writes alone provide safe character-level merges.

## 5. Unified notification system

**Flow:** A module creates a reminder → trusted scheduler processes due reminders → notification event is stored in Firestore → Hexora bell updates via listener → Electron displays an OS notification when permitted and running.

**Requirements:**

- One inbox across CRM, tasks, projects, calendar, and system events.
- User-local timezone with stored canonical timestamps; handle DST changes.
- One-time and recurring reminders; snooze, dismiss, mark read, and deep-link to source item.
- Idempotent delivery and retry handling to prevent duplicates.
- Cloud scheduler processing may be minute-granularity; do not promise exact-to-the-second cloud delivery.
- When Hexora is closed, cloud jobs can create inbox events but cannot by themselves display a Windows toast; evaluate a background agent or push delivery separately.
- Consider per-device notification preferences and avoid duplicate alerts across several open Hexora windows.

## 6. Security and privacy

- Firebase Auth identity is separate from application authorization; enforce Firestore and Storage Security Rules by user/organization membership.
- Keep privileged credentials and Admin SDK operations on trusted backends, never in renderer code.
- Electron renderer isolation, narrow IPC APIs, and no untrusted web content with privileged Firebase access.
- Least-privilege roles, data export/deletion, backup/recovery, abuse limits, and audit logging for sensitive CRM actions.
- Test security rules with emulator tests before production data is stored.
- Separate development/staging/production environments when feasible; avoid committing secrets.

## 7. Cost and scaling controls

- Start small and measure reads, writes, listeners, storage, bandwidth, scheduled jobs, and function invocations.
- Prefer paginated lists and scoped listeners; unsubscribe when views close. Avoid watching entire collections.
- Batch or debounce high-frequency updates, but preserve user-visible correctness.
- Establish billing alerts and usage dashboards before enabling heavy production workflows.
- Reassess Firestore fit if CRM reporting, complex joins, full-text search, or analytics become central; a SQL/search service may complement Firestore later.

## 8. Phased delivery

**Phase 0 — Discovery:** Inspect live repository, active branches/PRs, current Google login, local database, tab persistence, Electron process boundaries, and notification bell. Define Firebase project ownership and data region. No code changes until coordination review.

**Phase 1 — Foundation:** Firebase Auth linkage, security rules, Firestore client boundary, development environment, minimal user profile, and sync health diagnostics.

**Phase 2 — First vertical slice:** Sync one workspace configuration between two devices with offline/reconnect/conflict tests. Preserve existing local data and support rollback.

**Phase 3 — Notifications:** Bell inbox, one-time task reminders, reliable scheduling, read/dismiss state, Windows alerts while running.

**Phase 4 — Revenue-oriented module:** Minimal CRM: client records, follow-ups, linked tasks and reminders. Validate usefulness before expanding into complex boards/docs.

**Phase 5 — Platform expansion:** Projects, documents, calendar, richer recurrence, collaboration, search, permissions, and external integrations as demand justifies.

## 9. Decisions still open

1. Personal-only at launch or multi-user organizations from day one? Recommendation: model ownership cleanly now; defer full collaboration UI.
2. Firebase project, billing plan, data location, and environment separation.
3. Which existing local tables/settings become cloud-owned, local-owned, or hybrid?
4. What reminder precision and closed-app delivery guarantees are required?
5. Whether CRM is the first full module after the sync/notification foundation.

## 10. Definition of done for initial integration

- Existing Hexora windows, tabs, VS Code embedding, deep links, and session restoration still work.
- Same signed-in user sees selected workspace data on a second installation.
- Offline edits survive restart and reconcile predictably on reconnect.
- Cross-account access is denied by tested security rules.
- Firebase usage and errors are observable; secrets are not exposed.
- A documented rollback path exists before migrating existing user data.

## 11. Development coordination

Follow `HEXORA_DEVELOPMENT_COORDINATION.md` and `HEXORA_DEVELOPMENT_OPERATING_SYSTEM.md`. GitHub Issues track tasks, branches/PRs track implementation, and live GitHub status takes precedence over historical chat context. This document is an architecture proposal, not proof that Firebase has been connected or any feature implemented.
