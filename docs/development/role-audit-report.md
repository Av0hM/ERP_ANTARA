# Role and workflow audit implementation

Verification used an isolated PostgreSQL database on port 55441, Redis on 6391, the real Nest API on 4011, and the built Next.js frontend on 3111. No production services or existing development database were modified. The API's request limit was raised only in the test process after repeated browser runs exhausted its normal limit.

## Task 0 — Dummy users and dynamic allowlist

Added an explicit `User.isDummySeed` marker, migration, runtime file reader, validated/idempotent bcrypt seed command, and password-login allowlist. The flag defaults off, cannot activate in production, and denies dummy logins if the enabled local allowlist is missing/invalid. Non-dummy users are unaffected. The seed refuses production execution and refuses to overwrite an existing non-dummy email.

Removed tokenless JSON credentials and the login form's demo-cookie bypass. The form uses Auth.js signIn, waits for client readiness, reads submitted form values, and never uses a GET fallback for credentials.

Files:
- `.gitignore`, `.env.example`, `dummy-credentials.example.json`, ignored `dummy-credentials.local.json`
- `apps/api/package.json`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261005000000_dummy_seed_marker/migration.sql`
- `apps/api/src/scripts/seed-dummy-users.ts`
- `apps/api/src/modules/auth/dummy-credentials.ts`
- `apps/api/src/modules/auth/dummy-credentials.spec.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/web/src/auth.ts`
- `apps/web/src/components/auth/login-form.tsx`
- `apps/web/playwright.config.ts`, `apps/web/tests/login.spec.ts`
- `docs/development/dummy-users.md`

Verified: three real dummy rows and roles, real browser sign-in for all roles, session roles and working JWTs, immediate MEMBER login denial after removing its entry while the other two still succeed, restoration afterward, ignored local file, repeated seeding, production seed refusal, and tests for disabled/production/missing/malformed/ordinary-user cases. Revocation applies to subsequent password logins, not existing sessions or Google sessions.

## Task 1 — Privileged actions and visible failures

A shared permission helper gates task creation, decision creation, assignee selection, calendar scheduling, and resource rebalancing. MEMBER does not request the privileged member catalog or suggested-moves endpoint. Existing task/decision delete APIs remain guarded; there are no task/decision delete buttons in this checkout to hide. Notification deletion remains available because it is a personal action.

Task mutation failures display toasts and roll back optimistic changes. The create dialog retains input on failure and closes only after success. Status-update API failures now propagate instead of fabricating success. Runtime verification also required fetching tasks when initial data is empty and using real subsystem catalog IDs when creating tasks.

Files:
- `apps/web/src/lib/permissions.ts`
- `apps/web/src/components/tasks/task-workspace.tsx`
- `apps/web/src/components/tasks/create-task-dialog.tsx`
- `apps/web/src/components/tasks/task-detail-panel.tsx`
- `apps/web/src/app/(platform)/decisions/page.tsx`
- `apps/web/src/components/calendar/calendar-workspace.tsx`
- `apps/web/src/components/resources/resource-allocation-board.tsx`
- `apps/web/src/hooks/use-task-control.ts`, `apps/web/src/hooks/use-operations.ts`
- `apps/web/src/lib/task-api.ts`, `apps/web/src/lib/task-types.ts`

Verified: real OWNER/ADMIN task creation succeeds; MEMBER has no privileged buttons/select; real MEMBER task create/reassign/delete, calendar create, and resource move requests receive 403. A create request sent with a real MEMBER JWT through the privileged UI displays a permission toast and preserves the form. Decision creation is hidden for MEMBER as requested; the existing backend decision-create policy (which permits MEMBER) was not changed.

## Task 2 — Modal stacking

The create-task dialog is portaled into document.body. Decision dialogs remain page-level siblings outside isolated sections. Browser verification found that the toast portal itself caused initial hydration mismatches; it now mounts after hydration. Toasts have accessible status/alert roles and sit above modal overlays.

Files:
- `apps/web/src/components/tasks/create-task-dialog.tsx`
- `apps/web/src/components/ui/toast.tsx`

Verified portal parent, hit-testing above background cards, screenshot inspection, and visible 403 toast over the dialog. No CSS isolation or color tokens were changed.

## Task 3 — Navigation

Desktop/mobile navigation share one source with Decisions and Resources. Mobile links scroll horizontally so all destinations remain reachable. Task detail subsystem names link using catalog slugs to the existing subsystem-health route. Both locale landing pages use the literal `/login` destination.

Files:
- `apps/web/src/lib/nav-links.ts`
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/components/layout/mobile-nav.tsx`
- `apps/web/src/components/tasks/task-detail-panel.tsx`
- `apps/web/src/app/[locale]/page.tsx`

Verified desktop/mobile navigation and valid subsystem link destinations for all roles. Judgment call: task detail labels are the subsystem entry point, without adding a new list page.

## Task 4 — Google role/token wiring

The initial Google JWT callback exchanges its verified-provider profile with the backend and uses the same validated auth-response mapping as Credentials. Backend failures or missing tokens cannot produce a successful session. Existing Google email allowlisting and refresh handling remain in place.

Files:
- `apps/web/src/auth.ts`
- `apps/web/src/lib/backend-auth.ts`
- `apps/web/tests/backend-auth.spec.ts`

Verified simulated Google exchanges through the actual frontend helper and real backend: existing OWNER/ADMIN/MEMBER roles are preserved, a new user is MEMBER, tokens work for fetching tasks. Retained tests cover mapping and rejection of failed/incomplete auth responses. A real Google consent/browser flow was not performed.

## Task 5 — Approved dashboard scope

The controller resolves current role/assignment from the database for every analytics endpoint. OWNER remains global. ADMIN uses its single subsystem for tasks, task-linked worklogs, and member availability. MEMBER uses assigned tasks and personally authored worklogs. Unassigned ADMIN returns an empty scope. Overview, bundle, velocity, heatmap, breakdown, and cache/snapshot keys follow that scope.

The dashboard uses the scoped bundle and scope-appropriate labels. Non-owner dashboard/analytics views no longer fetch global AI bundles; scoped persisted insights are returned instead. Global AI generation/endpoints were not redesigned. Scoped velocity history stays empty when no matching snapshots exist; this change does not add a scoped snapshot-generation scheduler.

Files:
- `apps/api/src/modules/analytics/analytics.controller.ts`
- `apps/api/src/modules/analytics/analytics.service.ts`
- `apps/api/src/modules/analytics/analytics.service.spec.ts`
- `apps/web/src/hooks/use-operations.ts`
- `apps/web/src/lib/operations-api.ts`, `apps/web/src/lib/operations-types.ts`
- `apps/web/src/components/dashboard/dashboard-live.tsx`

Verified with real tasks/worklogs spanning two subsystems: expected productivity results OWNER=70, ADMIN=66, MEMBER=64; correct subsystem completion breakdown; no global history fallback; cross-role cache isolation; and empty unassigned ADMIN response. Existing client query keys include the account access token. The single-subsystem/worklog attribution design was explicitly approved before implementation.

## Task 6 — Sidebar and width

Added accessible expanded/icon-rail toggle with optional localStorage persistence. Platform content uses `w-full max-w-[1800px]` and a shrinkable content column.

Files:
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/app/(platform)/layout.tsx`

Verified collapse survives reload and desktop/mobile navigation remains usable. Judgment call: 1800px cap provides more operations-dashboard space without unlimited line lengths.

## Checks and boundaries

- API build and typecheck: passed.
- Frontend production build and typecheck: passed.
- Focused API tests: 15 passed across auth, allowlist, and analytics.
- Retained Playwright tests: 6 passed (three real role logins, landing page, two auth exchange tests).
- Additional real-backend/browser scenarios above passed, including successful task writes and denied MEMBER writes.
- Protected CSS tokens, button variants, Render configuration, Docker files, production API URLs, and package versions unchanged.
- No commit or push performed.
- Live timer redesign was not started; it requires its separate approach confirmation.
