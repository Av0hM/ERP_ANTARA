# Phase 3 — API privacy and truthful persistence

Authority: ANTARA_ERP_V1_SPEC.md (especially sections 17 and 23), Phase 1A/1B and Phase 2/2.1 foundations, and the Phase 3 task contract. No foundation redesign or membership authorization rollout.

## Implementation boundary

The work audited API User queries/relations, mutation DTOs/controllers, and mutation catches. It then introduced safe feature projections, removed caller-controlled acting identities, removed fabricated persistence responses, updated affected client payloads, and tested the resulting services and HTTP routes with current database session authentication.

No schema or migration changes, account/subsystem backfill, production access, deployment, commit or push. Existing uncommitted Phase 2.1 files were preserved and are not part of this phase's inventory.

## Projections and authenticated identity

`common/prisma/safe-user.select.ts` defines `safeUserSelect` (`id`, `name`, `avatarUrl`) for normal feature relations and `memberProfileSelect` for existing directory/profile/resource planning requirements (adds email, compatibility role, skills, capacity, availability and safe subsystem metadata). Neither loads password hashes, session relations, dummy flags, activation/deletion state or other security metadata.

Full User relations were removed from task lists/creates/status changes/reassignments, nested comments/activity, worklog lists, attachment lists/creates, and resource reassignment. Resource planning now explicitly selects its necessary User fields instead of loading the whole User before mapping it. User lookup/create/profile-update results now use explicit projections; profile audit reads select only the prior fields being audited. Analytics actor lookup selects only its current account/scope decision fields and never returns them as a raw user response.

Decisions already used explicit author selections; they now use the shared minimal projection and no longer return author email. The shared DecisionRecord contract matches this response. Existing narrower selects in subsystem health, reports, notifications, authorization and authentication remain. `_count.select.users: true` is a count, not a User relation leak. Auth-only selects remain limited to internal credential/account checks and explicit safe response mapping.

External DTOs no longer accept:

- task `assignedById`;
- comment `authorId`;
- worklog create/start `userId`;
- attachment `uploadedById`.

The existing global ValidationPipe rejects these fields with 400. Controllers pass the JWT guard's current database-backed actor ID into services; services assign identity explicitly rather than spreading caller objects. Service tests also pass crafted extra properties directly and prove the trusted actor wins. Task assignee/subsystem/task targets and decision author search filters remain legitimate inputs. Decision updates now enumerate editable fields instead of spreading a DTO into unchecked Prisma data.

Worklog stop additionally matches the persisted `userId` to the authenticated actor in the update predicate; missing/other-user records return 404 (`WORKLOG_NOT_FOUND`). This is personal-record identity integrity, not a membership scope rollout. Other feature role gates and read scopes remain unchanged.

## Truthful persistence

### Worklogs

Create/start/stop propagate database errors; list/summary never return seeded records or synthetic totals on failure. Successful responses are actual Prisma records. No fabricated IDs or success timestamps remain. Existing duration/timer semantics are preserved; this does not add Time Intelligence or redesign timers.

### Calendar

Lists read persisted ERP events, so provider unavailability cannot replace local records with fake data or hide successfully saved ERP events. When Google is not configured, creation persists an ERP event with `externalRef=null` and returns `integrationStatus=NOT_CONFIGURED`. When configured, Google must return an event ID; success persists it and returns `SYNCED`. Provider failure returns 503 (`CALENDAR_PROVIDER_UNAVAILABLE`) without creating an ERP event. A database failure after provider creation attempts to delete that provider event and rethrows the database error.

This deliberately changes the former list behavior: it no longer substitutes provider-only events for the database list. Import/sync of external-only calendar events is not implemented by this patch. There is no calendar update endpoint in the current API.

### Attachments

Missing content returns 400 (`ATTACHMENT_CONTENT_REQUIRED`). Unconfigured Drive returns 503 (`STORAGE_NOT_CONFIGURED`); failed upload or missing provider ID returns 503 (`STORAGE_UNAVAILABLE`). No database attachment is written before a successful upload. Size is calculated from decoded content rather than trusting caller metadata. The uploader is the authenticated actor; the URL is the actual provider link or a Drive view URL for the successfully uploaded provider ID, never an unbacked local URL.

If metadata persistence fails, the API attempts to delete the uploaded Drive object and propagates the error. No attachment row is fabricated. Provider cleanup helpers use the existing Google adapter; its access-token cache is now keyed by OAuth scope so Drive/Calendar operations cannot accidentally reuse a token authorized only for the other service.

### Other mutation/error paths

Notification update/delete and list no longer fabricate success/data when Prisma fails. Notification recipients remain business targets, not spoofable acting identities. Existing notification email queue delivery still follows database persistence; it is not a transactional outbox.

Meeting sync creation propagates calendar failures instead of silently skipping them. Previously completed events in a multi-event request remain persisted if a later event fails; no all-or-nothing batch guarantee is claimed. The action-items endpoint previously returned `created: true` without any write; it now explicitly returns 501 (`MEETING_ACTION_ITEMS_NOT_IMPLEMENTED`) instead of inventing a new feature implementation.

Unknown database errors use Nest's existing sanitized 500 response (`Internal server error`), not raw Prisma error text. Domain/provider errors use Nest HTTP exceptions. No new global error infrastructure was introduced. Existing legacy feature audit logging remains best-effort and returns null on failure; it now logs a fixed reconciliation warning rather than silently swallowing the failure. Critical Phase 2 transactional audit behavior is unchanged.

Read-only AI heuristic/seed outputs, resource AI suggestions and report generation were not redesigned. Their provider/fallback architecture remains future work, not a claim of successful feature mutation persistence.

### Operational privacy

Metrics now require a current OWNER session. The unused Prometheus module registration (which exposed an additional unguarded default controller/registry) was removed; the existing MetricsService owns its own registry and collection. Public health responses contain status/timestamp only; internal memory/disk/database details are no longer returned by health endpoints. Readiness and liveness remain public.

## Test design

The dedicated local PostgreSQL database is `antara_phase3_test` on loopback port 55461. The integration harness rejects non-loopback URLs and other database names, copies the Prisma migration chain into a temporary directory, supplies explicit DATABASE_URL and DIRECT_URL without reading repository .env, creates one unique schema, applies all existing migrations, and drops only that schema afterward. No developer dummy-user file is used.

HTTP tests run real controllers/services, ValidationPipe, Passport JWT strategy, SessionService and PostgreSQL. Google storage/calendar calls and queue delivery are mocked at provider boundaries; no Google, Redis or production service is contacted. Fixture accounts have sensitive-field sentinels and real backend session digests. JSON assertions recurse through nested responses and emitted task/comment payloads.

Unit tests use Prisma DMMF model metadata to validate actual service query selections, detect nested raw User relations and fail if sensitive fields are added to the shared projection. This complements real-database JSON tests; it is not a regex-only assurance or a claim to statically prove every future query safe.

Coverage includes actor spoof rejection/direct-service actor derivation, preserved assignee targets, safe task/comment/worklog/decision/file/profile/resource responses, actual foreign-key failures, worklog create/start/stop failures, no ghost attachment rows, provider compensation, calendar configuration/failure/success distinctions, notification failures, explicit meeting 501, guarded metrics, and rejection of a revoked session's still-signed JWT.

## Validation

| Command                                                                                                                                                   | Result                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run test:privacy --workspace @antara/api`                                                                                                            | 21 passed (16 new privacy units + 5 existing task tests)                                   |
| `PRIVACY_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase3_test npm run test:privacy:integration --workspace @antara/api`              | 31 passed                                                                                  |
| `npm run test:auth --workspace @antara/api`                                                                                                               | 53 passed                                                                                  |
| `AUTH_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase2_test npm run test:auth:integration --workspace @antara/api`                    | 56 passed, including migrations, refresh/concurrency and Phase 2.1 HTTP rate limits/quorum |
| `npm run test:authorization --workspace @antara/api`                                                                                                      | 196 passed                                                                                 |
| `AUTHORIZATION_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1b_test npm run test:authorization:integration --workspace @antara/api` | 7 passed                                                                                   |
| API Jest analytics, RolesGuard, decisions controller and task collaboration gateway suites                                                                | 28 passed                                                                                  |
| `npm run build --workspace @antara/contracts`                                                                                                             | Passed                                                                                     |
| `npm run lint --workspace @antara/api`                                                                                                                    | Passed (API typecheck)                                                                     |
| `npm run build --workspace @antara/api`                                                                                                                   | Passed, including postbuild                                                                |
| `npm run lint --workspace @antara/web`                                                                                                                    | Passed (web typecheck)                                                                     |
| Focused Prettier write/check; `git diff --check`                                                                                                          | Passed                                                                                     |

392 passing tests across these non-overlapping gates. Initial integration queue injection and stale web input-type errors were corrected before the passing runs. The existing Jest duplicate BullMQ mock warning (source plus generated dist) remains. No browser E2E, live Google storage test or production test is claimed.

## Compatibility, limitations and subsequent phases

- Deploy compatible web/API changes together: old callers submitting actor fields now receive 400. Decision author email is removed from the response contract. Metrics scrapers now need an authenticated OWNER request; there is no new machine-token mechanism in this phase.
- Calendar can persist locally with explicit integration status; uploads cannot succeed without actual configured storage. Existing historical ghost attachment rows are not rewritten or deleted automatically.
- PostgreSQL and Google are not one distributed transaction. A provider timeout after accepting a request, a process crash, or failed cleanup can leave a remote object requiring reconciliation. Cleanup failure is logged with a fixed message and never converted to API success. No outbox/provider reconciliation redesign was introduced.
- Legacy feature audit writes and email delivery are not atomic with feature persistence. Phase 4 should integrate transactional privileged auditing while implementing object authorization; Phase 2 critical audit/session behavior is already transactional.
- Phase 4 must still integrate membership-based task/resource/file/calendar/decision/report authorization and scoped read/query filtering. This phase must not be treated as completion of those policies.
- Phase 6 must implement provider-neutral storage, Drive/S3 routing, authorized open/download, lifecycle/retention and reconciliation. Existing metadata-only attachment deletion behavior is not a Phase 6 implementation.
- No schema migration or session cutover is introduced. The existing Phase 2/2.1 release implications remain applicable.

## Exact Phase 3 file inventory

```text
apps/api/package.json
apps/api/src/common/integrations/google.integration.service.ts
apps/api/src/common/prisma/safe-user.select.ts
apps/api/src/common/privacy/privacy.integration.spec.ts
apps/api/src/common/privacy/privacy.spec.ts
apps/api/src/modules/analytics/analytics.service.ts
apps/api/src/modules/audit/audit.service.ts
apps/api/src/modules/calendar/calendar.service.ts
apps/api/src/modules/decisions/decisions.service.ts
apps/api/src/modules/files/dto/create-attachment.dto.ts
apps/api/src/modules/files/files.controller.ts
apps/api/src/modules/files/files.service.ts
apps/api/src/modules/health/health.controller.ts
apps/api/src/modules/meetings/meetings.controller.ts
apps/api/src/modules/meetings/meetings.service.ts
apps/api/src/modules/metrics/metrics.controller.ts
apps/api/src/modules/metrics/metrics.module.ts
apps/api/src/modules/notifications/notifications.service.ts
apps/api/src/modules/resources/resources.service.ts
apps/api/src/modules/tasks/dto/create-task-comment.dto.ts
apps/api/src/modules/tasks/dto/create-task.dto.ts
apps/api/src/modules/tasks/tasks.service.spec.ts
apps/api/src/modules/tasks/tasks.service.ts
apps/api/src/modules/users/users.service.ts
apps/api/src/modules/worklogs/dto/create-worklog.dto.ts
apps/api/src/modules/worklogs/dto/start-worklog-session.dto.ts
apps/api/src/modules/worklogs/worklogs.controller.ts
apps/api/src/modules/worklogs/worklogs.service.ts
apps/web/src/components/worklogs/worklog-workspace.tsx
apps/web/src/hooks/use-operations.ts
apps/web/src/lib/operations-api.ts
apps/web/src/lib/task-api.ts
docs/releases/v1.0.0/PHASE_3_API_INTEGRITY.md
packages/contracts/src/lib/decisions.ts
```
