# Phase 4A — core scoped authorization

Execution plan (specification sections 4–6, 12, 17; approved Phase 4A amendments):

1. Compose the unchanged Phase 1B policies with current database actor loading, explicit query filters, and transactional account/object locking.
2. Integrate subsystem/task/decision reads and mutations, including nested links and task collaboration delivery. Keep RolesGuard as a coarse gate.
3. Resolve analytics from ADMIN memberships, isolate/version caches and snapshots by normalized scopes, and narrow the member directory.
4. Adjust only necessary web contracts/error handling. Add isolated PostgreSQL/HTTP race and policy coverage; rerun all prior foundation gates.

**Deployment blocked:** reviewed Phase 1C legacy mapping/backfill must populate memberships and explicit decision metadata before this branch is deployed against the current production dataset. No role-only fallback, automatic mapping, or production access is permitted.

## Implemented foundation and endpoint matrix

`CoreAuthorizationService` composes the unchanged Phase 1B `AuthorizationService` and policy functions. Each evaluation loads the actor from the database. Actor context is never cached or reconstructed from JWT role/subsystem claims. Invalid accounts are denied. `RolesGuard` remains the existing coarse gate.

| Surface                                               | Read / mutation rule                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /subsystems`                                     | Canonical catalog intersected with readable memberships; OWNER gets all five; empty stays empty               |
| `GET /subsystems/:slug/health`                        | Exact readable subsystem; cross-subsystem dependency candidates also filtered by readable membership          |
| `GET /tasks`                                          | Persisted subsystem in readable membership set, or global OWNER                                               |
| `GET /tasks/activity`                                 | Comments only on readable, non-deleted/non-archived tasks                                                     |
| `GET /tasks/dependency-graph`                         | Readable tasks only; optional subsystem selector cannot expand scope                                          |
| `POST /tasks`                                         | OWNER or exact ADMIN membership in destination subsystem                                                      |
| `PATCH /tasks/:id/status`                             | OWNER/exact ADMIN, or readable task assigned to the actor                                                     |
| `PATCH /tasks/:id/assign`, `DELETE /tasks/:id`        | OWNER/exact ADMIN of persisted subsystem                                                                      |
| `POST /tasks/:id/comments`                            | Readable persisted task; author remains server-derived                                                        |
| Decision list/detail                                  | Phase 1B read policy and explicit metadata; filters only narrow authorized rows                               |
| Decision create/update/delete/supersede               | Phase 1B management policy; transactional stored-object checks                                                |
| Analytics overview/bundle/velocity/heatmap/subsystems | Reauthorize and resolve current membership scope before every cache lookup                                    |
| `GET /users/members`                                  | OWNER organization-wide; ADMIN administered-scope members; MEMBER readable-scope collaborators                |
| `PATCH /users/:id/profile`                            | OWNER, or ADMIN managing a MEMBER target with a membership in an administered subsystem                       |
| Task collaboration                                    | Typing sender and recipients must read the task; events carry invalidations rather than raw task/comment data |

There is no existing standalone task-detail GET or subsystem CRUD route; none was added. There is no existing task-subsystem move/edit route; none was added. Supplying subsystemId to status is rejected by DTO validation; assignment only extracts its legitimate target assignee ID and never changes scope. Future moves must authorize both current and destination scope while holding the object lock. Tests cover non-exposure of a move route and concurrent scope changes through a controlled database fixture, not a newly invented move API.

## Task matrix and nested data

| Actor                                        | Read/comment | Create/reassign/delete | Status                      |
| -------------------------------------------- | ------------ | ---------------------- | --------------------------- |
| OWNER                                        | All tasks    | All tasks              | All tasks                   |
| ADMIN membership in target scope             | Yes          | Yes                    | Yes                         |
| MEMBER membership, including ADMIN elsewhere | Yes          | No                     | Only when assigned to actor |
| No target membership                         | No           | No                     | No                          |
| Inconsistent MEMBER + ADMIN membership       | No           | No                     | No                          |

User.role=ADMIN alone never grants subsystem authority. Multiple admins and mixed memberships work independently. User.subsystemId is not an authorization fallback.

Task dependency IDs are filtered before returning records, and dependency graphs filter edges and critical paths as well as nodes. Subsystem health queries only load readable cross-scope task candidates, preventing private titles/names from leaking through blocker summaries. Task/comment User relations retain Phase 3 projections.

Creation validates that supplied dependency IDs are readable. No additional assignee-membership restriction was invented: existing assignment to a user outside the task subsystem remains possible if the actor can manage the task. That assignee still cannot read/change the task without membership. Resolving whether such assignment should be prohibited is an explicit product/integrity question for subsequent review.

## Decision matrix

| Placement                            | Read                              | Manage                         |
| ------------------------------------ | --------------------------------- | ------------------------------ |
| GLOBAL + OWNER                       | All active authenticated accounts | OWNER                          |
| SUBSYSTEM + OWNER                    | OWNER / exact subsystem members   | OWNER                          |
| SUBSYSTEM + SUBSYSTEM_ADMIN          | OWNER / exact subsystem members   | OWNER / exact ADMIN membership |
| NULL/partial/invalid legacy metadata | Denied                            | Denied, including OWNER        |

New decisions always persist explicit scope/authority. For compatible existing create forms, absent scope is derived from whether a subsystem was selected; absent authority defaults to OWNER for OWNER and SUBSYSTEM_ADMIN otherwise. The complete requested placement must pass Phase 1B canManageDecision before any insert. ADMIN cannot request OWNER authority or GLOBAL scope, or select an unrelated subsystem. OWNER may explicitly delegate subsystem authority through the API. No legacy metadata is inferred or backfilled.

Updates enumerate editable fields; scope/authority/subsystem are not mutable through this DTO. Supersession requires management of both decisions and an accepted, different target. Nested supersession summaries/IDs and relatedTaskIds are filtered by readership. The response mapper follows the persisted supersededById relationship rather than relying on the schema's confusing inverse relation names. Deletion also locks and authorizes records whose supersession FK would be cleared, so ADMIN cannot indirectly edit an OWNER-authoritative or legacy decision via ON DELETE SET NULL.

Existing decision DTOs incorrectly required UUIDs while Prisma creates CUID IDs. Target IDs now accept nonempty strings (as other API targets do), with existence and scope enforced by Prisma/policy. This was necessary to make canonical subsystem decision creation work; identity remains server-derived.

## Analytics and cache behavior

- OWNER: global by default; `?subsystemId=<canonical ID>` selects one canonical subsystem.
- ADMIN: aggregate of exactly its normalized ADMIN membership set by default; an explicit selector must be in that set. MEMBER-only memberships never enter administrative queries.
- MEMBER: assigned-task / own-worklog personal metrics only; no subsystem administrative selection.
- ADMIN with no ADMIN memberships and inconsistent MEMBER with ADMIN membership: explicit empty scope; no global fallback.

Query filters apply independently to tasks, task-linked worklogs, member availability, subsystem summaries and insights. Scope resolution always precedes protected cache reads. The response preserves the existing SUBSYSTEM label for an administrative aggregate so no switcher/UI redesign is needed.

Keys distinguish `v4a:OWNER_GLOBAL`, `v4a:OWNER_SUBSYSTEM:<id>`, `v4a:ADMIN:<JSON normalized IDs>`, `v4a:PERSONAL:<userId>`, and explicit empty scopes. ADMIN set ordering/duplicates cannot produce alternate scope identities. Cache entries contain computed data, never actor authority. Removing a membership changes the next resolved scope/key (or denies a selected scope) before any cached result is served.

Snapshots use the same versioned scope identity. Old snapshots and cache entries are not rewritten or deleted; new scope history starts empty. The worker enumerates current membership scopes rather than deprecated User.subsystemId. Existing report consumers that read legacy snapshot identifiers remain Phase 4B integration work; this patch does not claim their exports have been migrated.

## Directory and membership behavior

The member directory uses current memberships and active/non-deleted target accounts. OWNER receives safe directory fields globally. ADMIN gets safe candidate information only for users with membership in administered scopes. MEMBER gets id/name/avatar for collaborators in readable scopes, without email, global role, legacy subsystem placement or security metadata. Empty readable/administered sets return empty directories. No global candidate search fallback exists.

The existing profile update route previously allowed global ADMIN updates. It now locks actor and target accounts and permits ADMIN to update only a MEMBER target with a membership in an administered scope; ADMIN cannot edit OWNER/ADMIN profiles through this path. OWNER retains its behavior. The fields remain skills/capacity only; no role, activation or membership changes are added. Targets with mixed memberships have one shared profile: whether subsystem admins should edit those globally shared profile fields remains a product boundary question; the implementation restricts targets rather than creating per-subsystem profile state.

No membership-management CRUD endpoints or UI existed to integrate. None were introduced. Existing Phase 2 invitations remain the controlled membership creation path, using the Phase 1B synchronization and Phase 2 session/audit rules. No bulk backfill, reconciliation, role-only fallback or production change ran.

## Transactions and concurrency

Core mutations use an explicit READ COMMITTED transaction:

1. lock actor User row (and profile target, sorted) using the existing Phase 2 account protocol;
2. load current Phase 1B actor context inside the transaction;
3. lock persisted Task/DecisionRecord rows FOR UPDATE before reading their scope/assignment/authority;
4. authorize persisted state, then mutate and insert audit data in the same transaction;
5. commit before sending best-effort UI invalidation.

Membership writers must continue to lock the target User before membership changes, as withMembershipRoleSync and invitations already do. This serializes permission removal with in-flight core mutations. A task move/decision authority change that obtained the object lock first is observed after waiting; stale permission checks cannot authorize the subsequent write. PostgreSQL tests use observable lock waiters, not timing assumptions, to prove both object races and membership removal serialization.

Known decision IDs for supersession are locked in sorted order. Deletion locks incoming supersession references too and authorizes them before FK effects. Competing multi-object operations can still deadlock (especially direct SQL or future writers with a different order); PostgreSQL aborts and rolls back the transaction rather than allowing an unchecked write. No automatic retry of non-idempotent mutations was added. Future writers must follow the documented account-before-object protocol, and all scope-changing paths must use equivalent object locks.

Core task/decision/profile audit failures now roll back their mutation; failed authorization produces no audit or feature write. The global OWNER quorum/session primitives are unchanged.

## Web and real-time compatibility

Task responses include server-computed canManage/canUpdateStatus hints. Existing task-detail controls use them; create dialogs use manageable subsystem catalog entries. Decision creation offers only manageable subsystem choices (OWNER retains Global). Existing mutation error toasts/rollback behavior remains.

Task sockets no longer broadcast raw task/comment objects. Each connected recipient's JWT expiry, database session, current actor and persisted task subsystem are checked before an empty `tasks.invalidate` event; the client refetches through protected HTTP. Typing is similarly scoped. Global presence rosters were removed from delivery: each viewer receives only their own presence entry, avoiding a parallel unscoped user directory. A richer scoped presence roster is deliberately not added here. Invalid/revoked recipients fail closed.

The web member-directory type reflects that email/role are omitted for MEMBER. No header, dashboard switcher, storage or AI UI was built. No browser E2E is claimed; API/HTTP and web typecheck are the verification evidence.

## Validation and results

All PostgreSQL commands used dedicated local databases on loopback port 55461. The new harness requires `antara_phase4a_test`, creates a unique schema, deploys the unchanged migration chain using explicit DATABASE_URL/DIRECT_URL in a temporary directory, and drops only that schema. No repository .env or dummy-user file supplies test state. Cache state is a deterministic in-process test double; Redis/provider services and production are not contacted.

| Gate                                                                       | Command / result                                                                                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 4A PostgreSQL/HTTP/races                                             | `CORE_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase4a_test npm run test:core:integration --workspace @antara/api` — 55 passed                  |
| Phase 3 units + task units                                                 | `npm run test:privacy --workspace @antara/api` — 21 passed                                                                                                           |
| Phase 3 PostgreSQL/HTTP                                                    | `PRIVACY_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase3_test npm run test:privacy:integration --workspace @antara/api` — 31 passed             |
| Phase 2/2.1 units                                                          | `npm run test:auth --workspace @antara/api` — 53 passed                                                                                                              |
| Phase 2/2.1 PostgreSQL/HTTP                                                | `AUTH_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase2_test npm run test:auth:integration --workspace @antara/api` — 56 passed                   |
| Phase 1B policies/services                                                 | `npm run test:authorization --workspace @antara/api` — 196 passed                                                                                                    |
| Phase 1B PostgreSQL                                                        | `AUTHORIZATION_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1b_test npm run test:authorization:integration --workspace @antara/api` — 7 passed |
| Phase 1A migrations/contracts                                              | `PHASE1A_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1a_test npm run test:phase1a --workspace @antara/api` — 14 passed                        |
| Existing analytics/subsystems/decisions/RolesGuard and scoped socket tests | API Jest five focused suites — 32 passed                                                                                                                             |
| API validation                                                             | `npm run lint --workspace @antara/api`; `npm run build --workspace @antara/api` — passed                                                                             |
| Web validation                                                             | `npm run lint --workspace @antara/web` — passed                                                                                                                      |
| Formatting/whitespace                                                      | Focused Prettier write/check and `git diff --check` — passed                                                                                                         |

Total: 465 passing tests across non-overlapping gates. Prior fixtures were updated to use valid explicit memberships and current service arguments, not bypasses or weaker assertions. Existing graph/analytics behaviors remain tested. Socket tests now assert scoped delivery rather than the prohibited global broadcast. The existing duplicate BullMQ manual-mock warning remains. Initial DTO validation, stale analytics assertion, and duplicated JSX attribute failures were corrected before the passing runs.

## Deployment blockers and remaining work

**Do not deploy this branch against the current production dataset before reviewed Phase 1C backfill.** Memberships and decision metadata must be valid first. Empty legacy memberships intentionally lose subsystem authority; legacy decisions fail closed even for OWNER. Code does not auto-repair either condition.

Phase 4B must still authorize Resources, Files, Calendar/Meetings, Reports and remaining feature entry points. In particular, Resources retains its own task reassignment route, and unrelated modules still have legacy reads; securing `/tasks` does not claim to secure every path to Task data in the application. These are explicit release blockers for the broader rollout, not silent scope exceptions added to core policy.

Remaining questions: out-of-subsystem assignees; shared multi-subsystem profile fields; richer scoped presence; historical analytics/report adapters. No task moves or broad membership endpoints were invented. No production access, migration/backfill, deployment, commit or push occurred. No schema/migration or shared-contract source was changed in Phase 4A.

## Exact Phase 4A files changed/created

Relative to the approved Phase 3 workspace (pre-existing Phase 2/3 changes are preserved):

```text
apps/api/package.json
apps/api/src/common/authorization/authorization.module.ts
apps/api/src/common/authorization/core-authorization.service.ts
apps/api/src/common/authorization/core.integration.spec.ts
apps/api/src/common/privacy/privacy.integration.spec.ts
apps/api/src/common/privacy/privacy.spec.ts
apps/api/src/modules/analytics/analytics.controller.ts
apps/api/src/modules/analytics/analytics.module.ts
apps/api/src/modules/analytics/analytics.service.spec.ts
apps/api/src/modules/analytics/analytics.service.ts
apps/api/src/modules/auth/auth.integration.spec.ts
apps/api/src/modules/decisions/decisions.controller.ts
apps/api/src/modules/decisions/decisions.module.ts
apps/api/src/modules/decisions/decisions.service.ts
apps/api/src/modules/decisions/dto/decision.dto.ts
apps/api/src/modules/subsystems/subsystems.controller.ts
apps/api/src/modules/subsystems/subsystems.module.ts
apps/api/src/modules/subsystems/subsystems.service.spec.ts
apps/api/src/modules/subsystems/subsystems.service.ts
apps/api/src/modules/tasks/events/task-events.service.ts
apps/api/src/modules/tasks/gateways/task-collaboration.gateway.spec.ts
apps/api/src/modules/tasks/gateways/task-collaboration.gateway.ts
apps/api/src/modules/tasks/tasks.controller.ts
apps/api/src/modules/tasks/tasks.module.ts
apps/api/src/modules/tasks/tasks.service.spec.ts
apps/api/src/modules/tasks/tasks.service.ts
apps/api/src/modules/users/users.controller.ts
apps/api/src/modules/users/users.service.ts
apps/web/src/app/(platform)/decisions/page.tsx
apps/web/src/components/tasks/create-task-dialog.tsx
apps/web/src/components/tasks/task-detail-panel.tsx
apps/web/src/hooks/use-task-control.ts
apps/web/src/lib/operations-api.ts
apps/web/src/lib/operations-types.ts
apps/web/src/lib/task-api.ts
apps/web/src/lib/task-types.ts
docs/releases/v1.0.0/PHASE_4A_CORE_AUTHORIZATION.md
```
