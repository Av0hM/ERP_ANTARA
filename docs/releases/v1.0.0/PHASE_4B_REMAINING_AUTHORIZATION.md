# Phase 4B — remaining scoped authorization

## Execution plan

Authority: the complete frozen specification, Phase 1A/1B/2/3/4A records, and the approved Phase 4B amendments. Shared profiles are self/OWNER-only; assignment always requires an active target membership, including for OWNER.

1. Inventory every controller/event and alternate feature access path.
2. Reuse current actor loading, policy and account/object transactions for assignment, profile, Resources, Files, Calendar/Meetings, Reports, Notifications, Worklogs and AI-adjacent reads.
3. Filter nested outputs and isolate caches. Fail closed on ambiguous historical scope; retain truthful provider failures and explicit meeting action-item 501.
4. Add isolated PostgreSQL HTTP/race coverage and rerun all foundation gates, API/web checks, builds and formatting.

No production access, backfill, schema redesign, later-phase architecture, deployment, commit or push. Phase 1C remains a deployment blocker.

## Implemented policy and alternate entry points

All feature controllers retain JWT/session authentication and coarse RolesGuard gates. Current database actors and Phase 1B policies determine final scope. No actor authority is cached. An empty membership set stays empty. Caller filters cannot widen persisted scope.

### Assignment and shared profiles

Both `/tasks/:id/assign` and `/resources/tasks/:id/assign` call `TasksService.reassign`. Task creation uses the same `CoreAuthorizationService.assertAssignee` invariant. OWNER also needs an active, non-deleted target with a MEMBER or ADMIN membership in the actual task subsystem. Unassignment remains supported. No existing assignment is rewritten automatically.

The actor and target User rows are locked in sorted order before the Task row. Membership writers use the same target-account protocol; the membership check and write happen in the transaction after any wait. The error is 403 `INVALID_TASK_ASSIGNEE`. Scope denial and invalid targets produce no task/audit write. Creation locks the assignee too.

`PATCH /users/:id/profile` permits self or OWNER, with existing skills/capacity DTO fields only. The former ADMIN shared-member exception is removed, including overlapping memberships. This is not a new profile UI or per-subsystem metadata model. Directory behavior remains Phase 4A: OWNER global, ADMIN administered-scope candidates, MEMBER minimal readable-scope collaborators.

### Resources

OWNER sees global planning; ADMIN sees exactly administered memberships, including nested assigned tasks, users and suggestion inputs. MEMBER and empty ADMIN receive an empty planning board, since the existing board contains administrative workload planning, not a separate ordinary collaboration view. MEMBER cannot call reassignment/suggested-moves. No global candidate fallback exists.

The current board contract has one display subsystem per user: the first authorized membership in stable ID order is used for that label. All scoped assignments still contribute to planning; this display label is never an authorization input. Multi-membership presentation can improve later without changing access.

### Files

Lists filter through the persisted Task relation and return only minimal task metadata and safe uploader fields. OWNER may see unlinked attachments; non-OWNER cannot infer scope from a missing/deleted relationship. ADMIN may upload/delete only through managed tasks. Existing upload semantics were OWNER/ADMIN-only, so MEMBER remains read-only; no new upload privilege is invented.

Upload authorizes before contacting Drive, then locks/reloads/rechecks after provider success before inserting metadata and audit in one transaction. Revocation/scope change/persistence failure triggers provider compensation. Deletion locks the Attachment, derives its task, locks/checks that task, then deletes metadata and audits atomically. The existing metadata-only deletion behavior is retained: provider deletion/retention and authorized downloads remain Phase 6.

### Calendar and meetings

Persisted calendar rows are filtered by readable memberships. Subsystem creation requires exact management authority. Unscoped/null-subsystem events are OWNER-only, **not inferred to be public/global**. OWNER may still create them under existing semantics. No update/delete routes existed; none were added.

Google configuration/error semantics remain Phase 3. Creation checks before provider I/O and reauthorizes under an account lock before event/audit persistence. A final authorization/audit/database failure compensates a provider-created event. Network I/O does not hold database locks.

Agenda and Markdown reads require exact subsystem readership; the unused global task query was removed. Sync preview filters configured groups by current membership and canonical key. Legacy schedule constants are not mapped to new groups or assigned to canonical IDs. A canonical group without an existing reviewed matching schedule returns `created: 0`, `unavailable: REVIEWED_SYNC_SCHEDULE_REQUIRED`. Sync creation requires exact management and uses the protected Calendar service for each event. Batch creation remains per-event, not atomic across the batch. Action items still return explicit 501 and create no tasks.

### Reports and AI-adjacent reads

All three handoff endpoints (JSON, Markdown, download) share the same scope loader: OWNER global/selected subsystem, ADMIN normalized administered set/authorized selection, MEMBER denied. Tasks, members, contacts, decisions and calendar milestones all use that scope. Decision exports additionally enforce explicit Phase 1B decision metadata. Empty scopes produce empty datasets.

Historical snapshot/prose provenance cannot safely establish current scoped readership. Reports do **not** query legacy GLOBAL snapshots and explicitly mark `metadata.historicalAnalytics = UNAVAILABLE_PENDING_SCOPE_REVIEW`; Markdown includes the same limitation. Risk-register history is empty pending review. Current metrics and critical-task milestones use authorized live records; existing heuristic score formulas remain, with empty-scope scores zero. No historical rows are rewritten.

AI provider/fallback architecture is unchanged. Administrative insight/schedule/workload inputs use exact ADMIN scopes or OWNER global; MEMBER only receives personal readable-task reminders and empty administrative arrays (schedule-risk returns 403). Task dependency IDs are intersected with the actual queried task set. Scoped users do not load historical generated prose or persist new prose into the shared unprovenanced insight pool. Unsafe fixed demo recommendations are no longer returned as scoped results. Cache keys include actor ID, role and current normalized membership scope; authorization precedes cache lookup. Text summarization uses caller-supplied text only and remains authenticated.

### Worklog and timing privacy

OWNER may list/summarize all worklogs. Every other actor, including ADMIN, gets only their own records/totals; caller `userId` query parameters cannot select another account. A personal historical worklog may remain accessible after task membership loss, but its task reference/title is redacted if no longer readable. Start/manual creation locks and authorizes the linked task; stop is strictly personal and may finish an existing session after membership loss without returning task detail. Real failures remain errors.

Alternate timing surfaces were closed too: ADMIN analytics never queries team worklogs; non-OWNER subsystem health omits worklog activity; MEMBER subsystem health omits administrative workload; AI does not consume others' worklogs for scoped actors. Personal task analytics additionally requires readable membership, even for legacy invalid assignments. Analytics cache/snapshot identity advances to `v4b:` so prior ADMIN timing payloads cannot be reused. Existing snapshots are untouched.

### Notifications, sockets, audit

Notification list/update/delete predicates always include authenticated recipient ID. OWNER has no global notification override. Missing/other-user notification mutations return 404. Current notifications have only an optional task link; legacy/general messages lack complete scope provenance. List/update responses redact protected content and task IDs to generic ANTARA updates; new notifications persist generic content. Email delivery reloads the notification/current active non-deleted recipient and sends generic text, ignoring old queued titles, bodies and recipient email. This avoids replaying revoked object content without inventing new notification reference architecture.

The only WebSocket gateway is task collaboration. Its Phase 4A per-delivery JWT/session/database scope checks, generic invalidations, scoped typing and self-only presence remain unchanged. Socket transport tests now supply the Phase 2 session boundary and cover a revoked-session token as well as invalid/expired credentials. No other event broadcast or alternate task writer remains outside the audited feature services.

Audit history lacks reliable scope metadata for all rows, so `/audit` is OWNER-only in both controller and service. Task, file, calendar and profile mutations write privileged audit records transactionally. Report-generation auditing remains the existing best-effort read/export audit; no durable audit row is claimed on failure.

## Transaction and race protocol

1. Lock authenticated actor and any target account rows in sorted order.
2. Load current actor context inside READ COMMITTED transaction.
3. Lock persisted target object(s), then derive actual scope.
4. Authorize current state; perform target membership checks under the target User lock.
5. Persist mutation and privileged audit; commit before task invalidation.

Attachment deletion locks Attachment then Task because its relationship must first be stabilized. No current API changes attachment-task links or task subsystem; future writers must use a compatible lock order. Deadlocks abort/roll back rather than authorize stale writes. Provider operations use precheck, external I/O, final locked recheck and compensation; PostgreSQL and Google are not one distributed transaction. Process crashes or failed provider cleanup still require Phase 6 reconciliation.

## Phase 1C and release blockers

**Do not deploy against the current production dataset.** Reviewed canonical mapping, valid memberships, decision metadata and report/snapshot compatibility remain required. No production data was read and no legacy counts are claimed.

Records intentionally restricted pending review:

- zero/unmapped memberships: no subsystem authority; global ADMIN is not a fallback;
- incomplete decision scope/authority: excluded from reads/exports and denied mutations;
- legacy unscoped calendar/attachment rows: OWNER-only;
- old global/scoped snapshot or generated-prose history without safe provenance: not reused for scoped exports;
- legacy meeting schedule IDs: no guessed mapping to canonical IDs;
- task assignees outside the subsystem or inactive/deleted: retained historically, but cannot be recreated through assignment/create;
- old notification payloads: generic delivery instead of replaying potentially unauthorized content.

For an explicitly authorized local restored copy, the following **read-only** inventory identifies assignment reconciliation candidates without emails or account secrets. It was not run on production:

```sql
SELECT t.id AS "taskId", t."subsystemId", t."assignedToId",
       CASE WHEN u.id IS NULL THEN 'MISSING_USER'
            WHEN NOT u."isActive" OR u."deletedAt" IS NOT NULL THEN 'INACTIVE_OR_DELETED'
            ELSE 'MISSING_MEMBERSHIP' END AS reason
FROM "Task" t
LEFT JOIN "User" u ON u.id = t."assignedToId"
LEFT JOIN "SubsystemMembership" m
  ON m."userId" = t."assignedToId" AND m."subsystemId" = t."subsystemId"
WHERE t."assignedToId" IS NOT NULL
  AND (u.id IS NULL OR NOT u."isActive" OR u."deletedAt" IS NOT NULL OR m."userId" IS NULL);
```

Remaining design work is explicit: reviewed canonical meeting schedules; historical report/AI provenance; provider URL revocation/open/download and storage lifecycle (Phase 6); richer notification references/UI (later phase). No new role fallback, bulk backfill, timer redesign, Ollama provider, UI shell or staging environment is introduced.

## Complete controller endpoint inventory

75 HTTP routes were inventoried from controller decorators. Policies above apply to every route in the corresponding feature, including exports and alternate mutation paths.

| Endpoint                                         | Authorization contract                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `GET /api/`                                      | Public static service information only                                                                    |
| `GET /api/ai/insights`                           | 4B: scoped administrative inputs; MEMBER personal reminders; caller-text summarize                        |
| `GET /api/ai/bundle`                             | 4B: scoped administrative inputs; MEMBER personal reminders; caller-text summarize                        |
| `GET /api/ai/reminders`                          | 4B: scoped administrative inputs; MEMBER personal reminders; caller-text summarize                        |
| `GET /api/ai/schedule`                           | 4B: scoped administrative inputs; MEMBER personal reminders; caller-text summarize                        |
| `GET /api/ai/workload`                           | 4B: scoped administrative inputs; MEMBER personal reminders; caller-text summarize                        |
| `GET /api/ai/schedule-risk`                      | 4B: scoped administrative inputs; MEMBER personal reminders; caller-text summarize                        |
| `POST /api/ai/summarize`                         | 4B: scoped administrative inputs; MEMBER personal reminders; caller-text summarize                        |
| `GET /api/analytics/overview`                    | 4A+4B: resolved DB scope/cache; no ADMIN member timing or unprovenanced insights                          |
| `GET /api/analytics/bundle`                      | 4A+4B: resolved DB scope/cache; no ADMIN member timing or unprovenanced insights                          |
| `GET /api/analytics/velocity`                    | 4A+4B: resolved DB scope/cache; no ADMIN member timing or unprovenanced insights                          |
| `GET /api/analytics/heatmap`                     | 4A+4B: resolved DB scope/cache; no ADMIN member timing or unprovenanced insights                          |
| `GET /api/analytics/subsystems`                  | 4A+4B: resolved DB scope/cache; no ADMIN member timing or unprovenanced insights                          |
| `GET /api/audit`                                 | 4B: OWNER-only history                                                                                    |
| `POST /api/auth/register`                        | Phase 2/2.1: registration denied; verified login; current account/session; protected me/logout            |
| `POST /api/auth/login`                           | Phase 2/2.1: registration denied; verified login; current account/session; protected me/logout            |
| `POST /api/auth/google-callback`                 | Phase 2/2.1: registration denied; verified login; current account/session; protected me/logout            |
| `POST /api/auth/refresh`                         | Phase 2/2.1: registration denied; verified login; current account/session; protected me/logout            |
| `POST /api/auth/logout`                          | Phase 2/2.1: registration denied; verified login; current account/session; protected me/logout            |
| `GET /api/auth/me`                               | Phase 2/2.1: registration denied; verified login; current account/session; protected me/logout            |
| `GET /api/calendar/events`                       | 4B: memberships read, exact ADMIN manage, unscoped OWNER-only                                             |
| `POST /api/calendar/events`                      | 4B: memberships read, exact ADMIN manage, unscoped OWNER-only                                             |
| `POST /api/decisions`                            | 4A: explicit metadata policies; stored scope; legacy fail closed                                          |
| `GET /api/decisions`                             | 4A: explicit metadata policies; stored scope; legacy fail closed                                          |
| `GET /api/decisions/:id`                         | 4A: explicit metadata policies; stored scope; legacy fail closed                                          |
| `PATCH /api/decisions/:id`                       | 4A: explicit metadata policies; stored scope; legacy fail closed                                          |
| `DELETE /api/decisions/:id`                      | 4A: explicit metadata policies; stored scope; legacy fail closed                                          |
| `GET /api/files/attachments`                     | 4B: persisted Task read/manage; unlinked OWNER-only; existing upload/delete coarse gate                   |
| `POST /api/files/attachments`                    | 4B: persisted Task read/manage; unlinked OWNER-only; existing upload/delete coarse gate                   |
| `DELETE /api/files/attachments/:id`              | 4B: persisted Task read/manage; unlinked OWNER-only; existing upload/delete coarse gate                   |
| `GET /api/health`                                | Phase 3: minimal public status only                                                                       |
| `GET /api/health/ready`                          | Phase 3: minimal public status only                                                                       |
| `GET /api/health/live`                           | Phase 3: minimal public status only                                                                       |
| `POST /api/invitations`                          | Phase 2: current membership grants; public token validation/acceptance; authenticated existing acceptance |
| `GET /api/invitations`                           | Phase 2: current membership grants; public token validation/acceptance; authenticated existing acceptance |
| `POST /api/invitations/:id/revoke`               | Phase 2: current membership grants; public token validation/acceptance; authenticated existing acceptance |
| `POST /api/invitations/accept`                   | Phase 2: current membership grants; public token validation/acceptance; authenticated existing acceptance |
| `POST /api/invitations/accept-existing`          | Phase 2: current membership grants; public token validation/acceptance; authenticated existing acceptance |
| `GET /api/invitations/validate/:token`           | Phase 2: current membership grants; public token validation/acceptance; authenticated existing acceptance |
| `GET /api/meetings/sync-preview`                 | 4B: readable agenda/preview; managed sync; action-items 501                                               |
| `GET /api/meetings/agenda/:subsystemId`          | 4B: readable agenda/preview; managed sync; action-items 501                                               |
| `GET /api/meetings/agenda/:subsystemId/markdown` | 4B: readable agenda/preview; managed sync; action-items 501                                               |
| `POST /api/meetings/sync/create/:subsystemId`    | 4B: readable agenda/preview; managed sync; action-items 501                                               |
| `POST /api/meetings/action-items`                | 4B: readable agenda/preview; managed sync; action-items 501                                               |
| `GET /api/metrics`                               | Phase 3: current OWNER session                                                                            |
| `GET /api/notifications`                         | 4B: recipient-only; generic payload; 404 for other recipients                                             |
| `PATCH /api/notifications/:id`                   | 4B: recipient-only; generic payload; 404 for other recipients                                             |
| `DELETE /api/notifications/:id`                  | 4B: recipient-only; generic payload; 404 for other recipients                                             |
| `GET /api/reports/handoff`                       | 4B: OWNER/global or ADMIN exact managed set; same policy for exports                                      |
| `GET /api/reports/handoff/markdown`              | 4B: OWNER/global or ADMIN exact managed set; same policy for exports                                      |
| `GET /api/reports/handoff/download`              | 4B: OWNER/global or ADMIN exact managed set; same policy for exports                                      |
| `GET /api/resources/allocation-board`            | 4B: exact administered planning; MEMBER empty board; reassignment delegates to Tasks                      |
| `GET /api/resources/suggested-moves`             | 4B: exact administered planning; MEMBER empty board; reassignment delegates to Tasks                      |
| `PATCH /api/resources/tasks/:id/assign`          | 4B: exact administered planning; MEMBER empty board; reassignment delegates to Tasks                      |
| `GET /api/subsystems`                            | 4A+4B: canonical/readable groups; no hidden dependencies or member timing/workload                        |
| `GET /api/subsystems/:slug/health`               | 4A+4B: canonical/readable groups; no hidden dependencies or member timing/workload                        |
| `GET /api/tasks`                                 | 4A+4B: persisted scope; exact management; shared assignment invariant; readable comments/assigned status  |
| `GET /api/tasks/activity`                        | 4A+4B: persisted scope; exact management; shared assignment invariant; readable comments/assigned status  |
| `GET /api/tasks/dependency-graph`                | 4A+4B: persisted scope; exact management; shared assignment invariant; readable comments/assigned status  |
| `POST /api/tasks`                                | 4A+4B: persisted scope; exact management; shared assignment invariant; readable comments/assigned status  |
| `PATCH /api/tasks/:id/status`                    | 4A+4B: persisted scope; exact management; shared assignment invariant; readable comments/assigned status  |
| `PATCH /api/tasks/:id/assign`                    | 4A+4B: persisted scope; exact management; shared assignment invariant; readable comments/assigned status  |
| `POST /api/tasks/:id/comments`                   | 4A+4B: persisted scope; exact management; shared assignment invariant; readable comments/assigned status  |
| `DELETE /api/tasks/:id`                          | 4A+4B: persisted scope; exact management; shared assignment invariant; readable comments/assigned status  |
| `GET /api/users/members`                         | 4B: directory scoped; profile self/OWNER; lifecycle OWNER with quorum/session safety                      |
| `PATCH /api/users/:id/role`                      | 4B: directory scoped; profile self/OWNER; lifecycle OWNER with quorum/session safety                      |
| `PATCH /api/users/:id/deactivate`                | 4B: directory scoped; profile self/OWNER; lifecycle OWNER with quorum/session safety                      |
| `PATCH /api/users/:id/reactivate`                | 4B: directory scoped; profile self/OWNER; lifecycle OWNER with quorum/session safety                      |
| `PATCH /api/users/:id/revoke-sessions`           | 4B: directory scoped; profile self/OWNER; lifecycle OWNER with quorum/session safety                      |
| `PATCH /api/users/:id/profile`                   | 4B: directory scoped; profile self/OWNER; lifecycle OWNER with quorum/session safety                      |
| `GET /api/worklogs`                              | 4B: OWNER global reads, others personal; task-read create/start; own stop                                 |
| `GET /api/worklogs/summary`                      | 4B: OWNER global reads, others personal; task-read create/start; own stop                                 |
| `POST /api/worklogs`                             | 4B: OWNER global reads, others personal; task-read create/start; own stop                                 |
| `POST /api/worklogs/start`                       | 4B: OWNER global reads, others personal; task-read create/start; own stop                                 |
| `PATCH /api/worklogs/:id/stop`                   | 4B: OWNER global reads, others personal; task-read create/start; own stop                                 |

Socket inventory: `/collaboration` connection; `presence.join`; `discussion.typing`; outbound `presence.connected`, self-only `presence.snapshot`, `discussion.typing`, and empty `tasks.invalidate`. No additional WebSocket gateway exists.

## Verification results

The final combined gate passed **559 tests in 32 suites**, with no skipped tests. All six database harnesses used dedicated loopback databases, unique disposable schemas and explicit DATABASE_URL/DIRECT_URL for migration deployment; no repo `.env`, production URL, dummy-user credential file or destructive database reset supplied test state. Google/AI/email providers and Redis caches were mocked at their boundaries. Local socket transport tests used ephemeral loopback ports.

| Gate                                                          | Result     |
| ------------------------------------------------------------- | ---------- |
| Phase 1A contracts/clean and legacy migrations                | 14 passed  |
| Phase 1B policy/service/PostgreSQL                            | 203 passed |
| Phase 2/2.1 auth/session/quorum/rate-limit/dummy regressions  | 109 passed |
| Phase 3 privacy/task units and PostgreSQL HTTP integrity      | 52 passed  |
| Phase 4A core PostgreSQL HTTP/race regressions                | 55 passed  |
| New Phase 4B PostgreSQL HTTP/race suite                       | 63 passed  |
| New notification email delivery/privacy units                 | 2 passed   |
| Remaining existing feature, health and socket transport tests | 61 passed  |
| API lint/typecheck and build/postbuild                        | Passed     |
| Web lint/typecheck and optimized build                        | Passed     |
| Focused Prettier and `git diff --check`                       | Passed     |

The new dedicated gate is:

```sh
REMAINING_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase4b_test npm run test:remaining:integration --workspace @antara/api
```

Final complete regression command:

```sh
REMAINING_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase4b_test \
CORE_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase4a_test \
PRIVACY_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase3_test \
AUTH_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase2_test \
AUTHORIZATION_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1b_test \
PHASE1A_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1a_test \
npm run test --workspace @antara/api

npm run lint --workspace @antara/api
npm run build --workspace @antara/api
npm run lint --workspace @antara/web

API_URL=http://127.0.0.1:59999/api \
NEXT_PUBLIC_API_URL=http://127.0.0.1:59999/api \
NEXTAUTH_URL=http://127.0.0.1:3000 \
NEXTAUTH_SECRET=phase4b-build-fixture-secret \
NEXT_TELEMETRY_DISABLED=1 npm run build --workspace @antara/web

git diff --check
```

Focused unit/integration runs preceded the combined gate. Initial fixture injection/signature errors and stale expectations were corrected; none remain in the final run. Phase 3 mutation failure tests now inject real PostgreSQL trigger failures inside transactions rather than spies on the root Prisma delegate. Assertions still prove rollback, error status, provider compensation and no ghost rows. Missing notifications now correctly expect 404 instead of an internal 500.

Two test-infrastructure corrections were necessary: the old socket E2E fixture lacked the Phase 2 SessionService/Phase 4A authorization dependencies; it now supplies them and verifies revoked sessions. The existing health test depended on Jest's live heap ratio and intermittently failed in the combined run; its memory input is now deterministic, with a separate high-memory degradation assertion. Runtime health behavior is unchanged. The existing duplicate generated/source BullMQ-mock warning remains harmless. An expected audit-failure unit test emits the fixed reconciliation warning.

The first web build failed fetching its existing Google Font under sandbox DNS restrictions. The approved network-enabled rerun passed, with all ERP API URLs explicitly loopback. No live Google storage/identity, AI provider, Redis delivery or browser E2E was exercised in Phase 4B. Prior offline Google verification tests did pass. No package upgrades, schema changes or migrations were introduced; Prisma regeneration was unnecessary.

## Compatibility and deviations

- The two approved product decisions are fully applied: no OWNER assignee-membership exception; no ADMIN shared-profile-edit exception.
- MEMBER upload is not added because current collaboration uploads are privileged. MEMBER resource planning is empty because no distinct non-administrative board exists.
- No new subsystem schedule is invented; unavailable schedules require review. No meeting task generator was added; its 501 remains.
- Historical reports explicitly withhold unsafe history. Existing live heuristic formulas and critical task milestones remain scoped; they are not historical analytics.
- Generic notifications trade rich previews/deep links for safe delivery until complete persisted object provenance is designed. Old protected content is not exposed through queued mail.
- The only frontend change makes the worklog task relation nullable for authorized historical personal records whose task is no longer readable. Existing optional chaining already handles it; no UI shell/profile/notification changes were made.
- Provider URLs already issued cannot be retroactively authorized by this patch. Phase 6 must supply authorized open/download, provider lifecycle and reconciliation. No claim of provider-level revocation is made.
- Direct SQL/older writers can bypass application locking rules. All future membership/object writers must honor the documented account/object protocol. Production deployment remains blocked on Phase 1C review/backfill and later release gates.

## Exact file inventory (52 files)

The workspace was clean at Phase 4B start. No pre-existing changes were overwritten.

```text
apps/api/src/common/authorization/remaining.integration.spec.ts
apps/api/src/modules/notifications/processors/notification-email.processor.spec.ts
apps/api/test/authorization.fixture.ts
docs/releases/v1.0.0/PHASE_4B_REMAINING_AUTHORIZATION.md
apps/api/package.json
apps/api/src/common/authorization/core-authorization.service.ts
apps/api/src/common/privacy/privacy.integration.spec.ts
apps/api/src/common/privacy/privacy.spec.ts
apps/api/src/modules/ai/ai.controller.ts
apps/api/src/modules/ai/ai.module.ts
apps/api/src/modules/ai/ai.service.spec.ts
apps/api/src/modules/ai/ai.service.ts
apps/api/src/modules/analytics/analytics.service.spec.ts
apps/api/src/modules/analytics/analytics.service.ts
apps/api/src/modules/audit/audit.controller.ts
apps/api/src/modules/audit/audit.module.ts
apps/api/src/modules/audit/audit.service.spec.ts
apps/api/src/modules/audit/audit.service.ts
apps/api/src/modules/auth/auth.integration.spec.ts
apps/api/src/modules/calendar/calendar.controller.ts
apps/api/src/modules/calendar/calendar.module.ts
apps/api/src/modules/calendar/calendar.service.spec.ts
apps/api/src/modules/calendar/calendar.service.ts
apps/api/src/modules/files/files.controller.spec.ts
apps/api/src/modules/files/files.controller.ts
apps/api/src/modules/files/files.module.ts
apps/api/src/modules/files/files.service.spec.ts
apps/api/src/modules/files/files.service.ts
apps/api/src/modules/health/health.service.spec.ts
apps/api/src/modules/meetings/meetings.controller.ts
apps/api/src/modules/meetings/meetings.module.ts
apps/api/src/modules/meetings/meetings.service.ts
apps/api/src/modules/notifications/notifications.controller.ts
apps/api/src/modules/notifications/notifications.module.ts
apps/api/src/modules/notifications/notifications.service.ts
apps/api/src/modules/notifications/processors/notification-email.processor.ts
apps/api/src/modules/reports/reports.controller.ts
apps/api/src/modules/reports/reports.module.ts
apps/api/src/modules/reports/reports.service.ts
apps/api/src/modules/resources/resources.controller.ts
apps/api/src/modules/resources/resources.module.ts
apps/api/src/modules/resources/resources.service.ts
apps/api/src/modules/subsystems/subsystems.service.ts
apps/api/src/modules/tasks/gateways/task-collaboration.gateway.e2e-spec.ts
apps/api/src/modules/tasks/tasks.service.spec.ts
apps/api/src/modules/tasks/tasks.service.ts
apps/api/src/modules/users/users.controller.ts
apps/api/src/modules/users/users.service.ts
apps/api/src/modules/worklogs/worklogs.controller.ts
apps/api/src/modules/worklogs/worklogs.module.ts
apps/api/src/modules/worklogs/worklogs.service.ts
apps/web/src/lib/operations-types.ts
```
