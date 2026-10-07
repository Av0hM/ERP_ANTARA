# Phase 5 — authenticated application shell

Authority: the complete frozen specification and approved Phase 1A/1B/1C/2/3/4A/4B documents. This phase changes frontend presentation and adds three small authenticated UI/notification routes. It does not change schema, migrations, authorization policy, storage providers, AI providers, onboarding or production data.

## Desktop and mobile shell

The shared authenticated layout now mounts `AppShell`, which waits for a valid NextAuth session and a successful current-database UI context before mounting feature content. Initial loading, unavailable access, retry and sign-out states are explicit. Protected cached content is withheld when the context request fails.

The existing 1800px wide layout and persistent sidebar-collapse preference remain. Desktop navigation displays the repository's existing ANTARA badge and `ANTARA ERP`; the collapsed rail retains the badge with an accessible brand name. On smaller screens branding appears in the header and the existing horizontally scrollable mobile navigation stays at the bottom. The badge is an unchanged copy of `docs/design/antara-theme/assets/badge.png`, not a new logo.

The header provides dashboard context selection (with an adjacent explicit access-refresh button), notification bell and profile menu. There is no primary logout/session block in desktop or mobile navigation. The header wraps into two rows on narrow screens; the popovers portal above stacking contexts, constrain width/height to the viewport and scroll internally. Theme tokens/button variants were not redesigned.

## Current backend context and presentation contract

`GET /api/ui/context` is JWT/session authenticated, returns `Cache-Control: no-store`, and uses a PostgreSQL REPEATABLE READ / READ ONLY transaction. It loads current Phase 1B actor state, rejects unavailable accounts, projects only id/name/avatarUrl/compatibility role, intersects readable subsystems with the canonical catalog and derives management through `canManageSubsystem`. It never uses JWT role/subsystem claims as authority and never caches actor context.

The shared `UiContext` / `DashboardContext` contracts carry:

- safe current identity and global-authority flag;
- server-selected context IDs, labels, canonical key/slug and persisted subsystem ID;
- view kind (ANALYTICS, SUBSYSTEM or EMPTY) and management hint;
- server-derived resource/report/operation presentation flags;
- exact recipient-only unread count (not just the latest page).

These are presentation hints, not capabilities accepted by mutation APIs. All existing Phase 4 object checks remain authoritative. No independent React role-permission matrix or canonical catalog was introduced.

| Current database authority         | Primary context                                      | Subsystem choices                                                               |
| ---------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| OWNER, zero memberships allowed    | Global Dashboard                                     | All available five canonical groups; scoped analytics                           |
| ADMIN with ADMIN memberships       | Admin Dashboard, aggregate of exact administered set | Managed groups use analytics; MEMBER-only groups use read-only subsystem health |
| MEMBER                             | Personal Dashboard                                   | Only explicit readable memberships, using read-only health                      |
| ADMIN without management authority | Explicit empty primary view                          | Any remaining readable contexts only; no role-only fallback                     |
| No readable memberships            | Personal/empty primary only                          | None; compact display replaces one-option selector                              |

A mixed ADCS ADMIN / Payload MEMBER sees both scopes, but selecting Payload makes no administrative analytics request and displays no workload-management panel. OWNER authority never depends on fake memberships. Invalid/inconsistent membership state receives only the policies' permitted presentation.

## Dashboard queries and persistence

The dashboard and analytics hooks use the existing Phase 4 `/analytics/bundle` endpoint with the selected persisted subsystem ID where permitted. Query keys include context identity. A read-only subsystem choice uses the existing protected subsystem-health endpoint instead; it never calls administrative analytics with that scope. OWNER global retains the existing authorized AI reads; selected/scoped dashboards use the scoped analytics response. No provider or AI-generation redesign is included.

Personal dashboards display authorized personal metrics and assigned tasks from the existing protected task catalog. Empty tasks, missing history, missing insights, API errors and loading have explicit states. No team timing is added. Existing static claims of improving trends/AI provenance were replaced with neutral scope labels; no new KPI was invented.

Selection is stored under `antara.context.<userId>` and represented in dashboard URLs by `?context=...`. The stored/requested ID must appear in the latest server context list. Invalid IDs fall back to the server's default; an invalid dashboard query is replaced once with the valid ID. Selection never changes backend authority. Context affects dashboard/analytics/report presentation; other feature pages retain their existing independently authorized object scopes, rather than silently filtering every module.

Context refresh occurs on window focus, explicit refresh and a 60-second foreground interval. API 403 events trigger context revalidation and an access-change notice. When identity/role/context permissions change, protected query requests are cancelled, cached feature queries removed, and children remounted only after the new authorization signature is accepted. There is no persisted authorization cache. Revocation becomes visible on the next evaluation/refetch; this is not a push-based revocation bus.

## Notifications

The bell shows the current backend unread count, recent generic notifications, read state, mark-one-read, mark-all-read and a Notifications link. Queries refresh once per minute in the foreground and on focus; no new socket roster or aggressive polling was added.

The Notifications page supports paginated history, mark read/unread, delete and mark all read. Mutations wait for backend success then refetch recipient data/counts; failures show errors/toasts rather than false success. Empty, fully read, loading and unavailable states are distinct.

Small API additions:

| Route                                       | Policy                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /api/ui/context`                       | Current active authenticated actor; safe identity and authorized presentation only           |
| `GET /api/notifications/history?cursor=...` | Recipient-only; 20 rows/page, stable ordering; foreign/missing cursor rejected               |
| `PATCH /api/notifications/read-all`         | Current active recipient only; account lock plus transaction; updates only their unread rows |

Existing notification list/update/delete routes retain Phase 4B behavior. Historical title/body and task references remain redacted to generic content. There are no client-invented deep links or protected titles. The same generic UI can display future asynchronous completion updates; no AI queue, fake completion event or notification provider change was introduced.

## Profile, logout and navigation

The profile menu displays initials, current safe name and effective compatibility role. Logout lives here and uses the existing NextAuth sign-out event/backend refresh-session revocation. The shell immediately hides content, cancels/clears React Query data, clears the NextAuth session and redirects to login. Backend 401/session-refresh failure uses this same path. Backend revocation and protected-page rejection are exercised for all three roles.

No existing standalone profile-edit surface exists, so no dead Profile link or new profile-management UI was invented. Phase 4B self/OWNER global-profile editing remains unchanged; no subsystem ADMIN exception was added.

The shared navigation retains Dashboard, Tasks, Calendar, Worklogs, Analytics, Decisions and Resources, and adds reachable Subsystems, Files, Reports and Notifications surfaces. Resources/Reports navigation consumes backend hints. The new subsystem list derives links solely from authorized contexts. Files wraps the existing vault; upload choices use task `canManage` hints, and MEMBER upload remains unavailable under current backend semantics. Calendar creation lists only manageable scopes. Task creation and resource controls now consume current server hints rather than compatibility role alone.

Calendar is labelled Calendar / Meetings, preserving the current calendar surface. No new meeting workflow is invented. Reports provides the existing protected Markdown handoff and an explicit historical-provenance-unavailable notice; MEMBER/read-only contexts cannot request administrative reports. The file provider architecture and existing provider links remain Phase 6 work.

## Accessibility

- Native labelled select supports keyboard context changes.
- Existing Radix DropdownMenu primitives provide roving keyboard focus, Escape dismissal, focus restoration and portal collision handling.
- Bell, profile, collapse and refresh buttons have accessible labels/focus states.
- Unread state has numbers and text, not color alone.
- A keyboard-visible Skip to content link targets the content region.
- No essential action requires hover. Mobile links scroll within their own navigation container without page overflow.

## Browser fixtures and security evidence

`apps/api/test/phase5-server.ts` is a test-only Nest server bound to 127.0.0.1. It requires an explicit loopback `PHASE5_TEST_DATABASE_URL` named `antara_phase5_test`, refuses production mode, deploys unchanged migrations into its own generated schema and provisions synthetic OWNER/ADMIN/MEMBER accounts. Cleanup removes only that schema. No application module imports this fixture.

Playwright signs in through the real credentials form/NextAuth callback and real AuthService, SessionService, JWT strategy, current-database authorization and feature controllers. No role-only frontend session is mocked. Queue/cache/external identity boundaries are local doubles; an explicit 503 browser interception tests the notification error state. Membership/session changes are made only in the isolated fixture. Neither the production-restored database nor its account supplies test state.

The dedicated browser configuration uses the optimized web build, loopback API port 4105/web port 3105 and system Chromium (override with PHASE5_CHROMIUM_PATH). It refuses server reuse. Browser artifacts live under `/tmp/antara-phase5-playwright-results`. The ordinary Playwright config excludes this suite because it requires its dedicated DB/API harness; use `test:shell` explicitly.

Coverage includes OWNER branding/all five scopes/selected analytics; mixed ADMIN read-only context; MEMBER personal/authorized choices/no management; invalid stored context without unauthorized requests; membership removal and stale session-role assumptions; safe UI JSON; notification recipient/cursor isolation, generic content, read/all/delete/empty/error/pagination; all-role logout with backend 401 afterward; current-session revocation; desktop collapse persistence; native-select keyboard input; menu Escape/focus restoration; mobile navigation and no horizontal overflow at 375, 768 and 1280px. Screenshots were inspected for mobile and desktop.

## Commands and results

Build shared contracts first:

```sh
npm run build --workspace @antara/contracts
npm run lint --workspace @antara/api
npm run build --workspace @antara/api
npm run lint --workspace @antara/web

API_URL=http://127.0.0.1:4105/api \
NEXT_PUBLIC_API_URL=http://127.0.0.1:4105/api \
NEXTAUTH_URL=http://127.0.0.1:3105 \
NEXTAUTH_SECRET=phase5-local-browser-fixture-secret \
NEXT_TELEMETRY_DISABLED=1 GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= \
npm run build --workspace @antara/web

PHASE5_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase5_test \
npm run test:shell --workspace @antara/web
```

The full API regression command supplies the existing dedicated Phase 1A/1B/1C/2/3/4A/4B loopback test URLs and runs `npm run test --workspace @antara/api`. No migrations run against the restored copy or production. Formatting is restricted to this phase's changed files; `git diff --check` is required.

Final results: **606 passing tests** across the two non-overlapping gates: **592 API tests in 35 suites** (all prior phases plus seven new UI-context units), and **14 PostgreSQL-backed Playwright cases** covering the required role/notification/revocation/responsive scenarios. No API tests were skipped. Contracts build, API lint/typecheck/build/postbuild, web typecheck, optimized web build, focused formatting and `git diff --check` passed. The final browser gate ran against that optimized build. Screenshots at 375/768/1280px and traces remain in /tmp; no sensitive browser artifacts were added to the repo. Initial browser failures were incorrect selectors for Radix's trigger-derived accessible menu names, modal-hidden background controls and Next's additional route-announcer alert; the underlying behavior was retained and selectors corrected. The first sandboxed web build could not download the existing Google Font; the network-approved rerun kept all ERP URLs loopback. Existing duplicate BullMQ mock and Next standalone/start warnings are recorded, not treated as feature failures.

## Remaining work and boundaries

Phase 6 still owns provider-neutral Drive/S3 routing, authorized downloads and storage retention; Phase 7 owns Ollama and later queue/retry behavior. Current notifications intentionally remain generic until safe target provenance exists. Canonical meeting schedules still need their separately reviewed configuration. Final browser/live Google/storage/provider release smoke tests, operational hardening and actual production cutover remain later gates.

No production or restored-copy data was accessed, no bootstrap/deployment ran, no schema/migration changed, and nothing was committed or pushed. No Time Intelligence or staging environment was added. Product choices: read-only subsystem contexts reuse the existing health view; no nonexistent profile editor is linked; calendar remains the current Calendar / Meetings surface; the Reports page exposes existing Markdown data rather than inventing a report designer.

## Exact file inventory (42 files)

```text
apps/api/src/app.module.ts
apps/api/src/modules/notifications/notifications.controller.ts
apps/api/src/modules/notifications/notifications.service.ts
apps/api/src/modules/ui-context/ui-context.controller.ts
apps/api/src/modules/ui-context/ui-context.module.ts
apps/api/src/modules/ui-context/ui-context.service.spec.ts
apps/api/src/modules/ui-context/ui-context.service.ts
apps/api/test/phase5-server.ts
apps/web/package.json
apps/web/playwright.config.ts
apps/web/playwright.shell.config.ts
apps/web/public/antara-badge.png
apps/web/src/app/(platform)/analytics/page.tsx
apps/web/src/app/(platform)/dashboard/page.tsx
apps/web/src/app/(platform)/files/page.tsx
apps/web/src/app/(platform)/layout.tsx
apps/web/src/app/(platform)/notifications/page.tsx
apps/web/src/app/(platform)/reports/page.tsx
apps/web/src/app/(platform)/subsystems/[slug]/SubsystemHealthClient.tsx
apps/web/src/app/(platform)/subsystems/page.tsx
apps/web/src/components/analytics/analytics-live.tsx
apps/web/src/components/calendar/calendar-workspace.tsx
apps/web/src/components/dashboard/dashboard-live.tsx
apps/web/src/components/dashboard/notification-center.tsx
apps/web/src/components/files/attachment-vault.tsx
apps/web/src/components/layout/app-shell.tsx
apps/web/src/components/layout/brand.tsx
apps/web/src/components/layout/mobile-nav.tsx
apps/web/src/components/layout/shell-header.tsx
apps/web/src/components/layout/sidebar.tsx
apps/web/src/components/resources/resource-allocation-board.tsx
apps/web/src/components/tasks/task-workspace.tsx
apps/web/src/hooks/use-actor-profile.ts
apps/web/src/hooks/use-operations.ts
apps/web/src/lib/http-error.ts
apps/web/src/lib/nav-links.ts
apps/web/src/lib/operations-api.ts
apps/web/src/lib/task-api.ts
apps/web/tests/shell.spec.ts
docs/releases/v1.0.0/PHASE_5_APP_SHELL.md
packages/contracts/src/index.ts
packages/contracts/src/lib/ui-context.ts
```
