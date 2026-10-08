# Phase 7 — optional Ollama generation and durable jobs

Authority: the complete frozen v1 specification, approved Phase 1A/1B/1C/2/3/4A/4B/5/6 records and the Phase 7 task amendments. Existing approved Phase 6 workspace changes were preserved. No production/restored-copy access, bootstrap, deployment, commit or push occurred.

## Existing AI audit and implementation plan

The existing `/ai/insights` GET synchronously called OpenAI function generation, substituted deterministic diagnostics on failure and persisted derived records into the shared AIInsight pool. `/ai/summarize` synchronously called OpenAI, shared a content-hash cache and substituted local text. Neither represented durable generation state. The OpenAI adapter contained both prompt/request implementations.

Other routes (`/ai/bundle`, `/reminders`, `/schedule`, `/workload`, `/schedule-risk`) compute existing scoped deterministic diagnostics. Resources consumes workload suggestions; Reports injects AiService but does not require model inference. Analytics can read historical AIInsight rows under its existing policy. Frontend consumers are dashboard/analytics insight lists, summary panel, resource suggestions and schedule-risk views.

Implementation sequence: isolate Ollama/configuration; add durable jobs without rewriting history; authorize source selection and publication; integrate BullMQ with database-authoritative retries/results; update the existing summary surface; verify migrations, real database/queue semantics and browser/security regressions.

OpenAI runtime requests/configuration and fabricated summary fallback are removed. GET diagnostics no longer trigger generation or persist heuristic results as model output. Historical AIInsight rows remain unchanged; new generation uses AIJob.result because both text summaries and task analysis have requester-specific provenance that the old shared insight table cannot represent safely. Diagnostics are labelled separately from Ollama results. Existing deterministic reminder/schedule/workload algorithms remain unchanged; no new prediction or Time Intelligence behavior was implemented.

## Provider and configuration

`AiProvider` exposes only generate and readiness. `OllamaAiProvider` uses the documented [Ollama generate API](https://docs.ollama.com/api/generate): explicit model, non-streaming JSON-schema output, separate system instruction and data prompt, bounded output tokens and an AbortSignal deadline. Parsed output must be exactly `{summary: string}` with 1–8000 characters; unknown properties, invalid JSON, incomplete responses and excessive bodies fail. Provider response reading is capped at 64 KiB. ERP-derived context is also bounded to 64 KiB.

There is one configured model and no cloud or implicit localhost fallback. AI_ENABLED defaults false. Enabled AI requires an explicit HTTP(S) root URL and model. URL credentials, query, fragment and arbitrary paths are rejected. The backend alone supplies the endpoint; DTOs reject caller provider URLs. Redirects are prohibited. Logs/errors never echo the internal URL, credentials, prompts or model output.

| Variable                  | Default / bounds                                                         |
| ------------------------- | ------------------------------------------------------------------------ |
| AI_ENABLED                | false; explicit true enables generation                                  |
| OLLAMA_BASE_URL           | no default; operator-controlled infrastructure URL                       |
| OLLAMA_MODEL              | no default; explicit model identifier                                    |
| OLLAMA_REQUEST_TIMEOUT_MS | 60000; 1000–180000                                                       |
| AI_MAX_RETRIES            | 2; 0–5 retries, hence 1–6 total attempts                                 |
| AI_RETRY_BASE_DELAY_MS    | 5000; 1000–60000                                                         |
| AI_WORKER_ENABLED         | true; false permits a producer-only instance                             |
| REDIS_URL                 | existing explicit Redis configuration; AI adds no second queue framework |

No provider authentication scheme is invented. Infrastructure must restrict access to the configured Ollama service. Configuration syntax is validated at construction; provider availability is not a boot requirement. Readiness returns only available, temporarily unavailable or disabled, separately from core ERP health.

## Schema, migration and provenance

Additive migration `20261009000000_phase_7_ai_jobs` creates AIJobStatus and AIJob. Earlier migrations and AIInsight rows are unchanged. AIJob stores actor FK, operation, scope kind, normalized subsystem IDs, source references/version hashes, bounded personal summary input, model, template version, status, attempts/maxAttempts, retry/start/completion timestamps, sanitized error code and validated result. Indexes support actor history and pending-state review. SQL checks constrain operation/scope vocabulary, attempts and success/result coherence. User deletion is restrictive for job provenance; ordinary account deactivation remains unchanged.

Supported generation operations are SUMMARY (the existing caller-text summary feature) and INSIGHTS (advisory analysis of authorized task records). Both return a structured advisory summary rather than allowing generated IDs or authorities to become ERP records. No autonomous mutations or new AI product feature is introduced.

For INSIGHTS, submission queries at most 50 tasks only after resolving current administrative scope. It stores task IDs and SHA-256 versions, not duplicated task bodies. Execution and publication reload those exact records and require unchanged scope/content versions. Changed/deleted/archived/moved sources fail with SOURCE_CHANGED rather than silently selecting new data. Result reads also reject changed sources. For SUMMARY, the bounded user-provided text/context is retained as the necessary immutable job input and is never returned in status/history responses. Template version is `antara-advisory-v1`.

## Authorization and endpoints

| Endpoint                 | Contract                                                               |
| ------------------------ | ---------------------------------------------------------------------- |
| POST /ai/summarize       | Current authenticated user; bounded personal text; 202 job state       |
| POST /ai/jobs            | SUMMARY personal; INSIGHTS OWNER global/selected or exact ADMIN scopes |
| GET /ai/jobs             | Current requester's authorized recent history, at most 20              |
| GET /ai/jobs/:id         | Current requester plus current account/scope/source checks             |
| POST /ai/jobs/:id/cancel | Requester or current OWNER; QUEUED only                                |
| GET /ai/readiness        | Authenticated; sanitized optional-provider status                      |
| GET /ai/reconciliation   | Current OWNER; read-only paginated operator review                     |

MEMBER cannot request administrative analysis. Mixed ADMIN/MEMBER actors cannot analyze MEMBER-only scopes. Empty ADMIN scope is denied; it never becomes global. Caller actor/scope/provenance/model fields cannot override persisted job identity. OWNER can request global work without memberships, but cannot browse another requester's private summary jobs merely by possessing an ID.

Submission, worker claim, publication and reads use current Phase 1B/4 database actors, never JWT role claims. Actor User locks precede AIJob and sorted Task locks. This coordinates with existing membership/session lifecycle writers. Provider I/O happens outside database locks; publication takes locks and revalidates again. A role/account/membership removal cannot publish newly unauthorized content. Any session revocation recorded after submission conservatively invalidates that actor's job access/execution, including logout; this deliberately favors privacy over retaining access to old summaries after a security transition.

ERP text is untrusted data, separated from the system instruction in a JSON context envelope. No model output decides authorization, task assignment, lifecycle, file access, invitations or approved decisions. Generation has no privileged mutation tools.

## Queue, state, retries and idempotency

The existing BullMQ/Redis stack uses a dedicated `ai-generation` queue. Redis carries only the database job ID. Submission atomically persists QUEUED plus audit, then enqueues with that ID. It returns actual database state with HTTP 202, never a completed-success claim. Queue submission is bounded to three seconds; failure records FAILED/QUEUE_UNAVAILABLE where still unclaimed. A late queue acknowledgement cannot execute a failed row. A crash between DB commit and enqueue is detectable by reconciliation.

Workers claim a QUEUED row under lock, increment attempts and persist RUNNING before inference. Validated output, SUCCEEDED, one generic notification and completion audit commit atomically after reauthorization. Duplicate worker delivery cannot claim RUNNING/terminal rows or duplicate results/notifications. A database failure never fabricates completion; uncertain interrupted executions remain available for operator review.

Transient network/timeout/429/5xx failures persist the attempt/error and nextAttemptAt, then use BullMQ exponential backoff. Missing model, malformed output, invalid provenance, changed source, configuration drift and denied authority are terminal. Every job has a frozen maximum attempt count. Malformed structured output is terminal on its first occurrence. Three pending jobs per actor bound concurrent submission. The worker has concurrency one for v1.

Final failure creates at most one fixed generic notification if the recipient still passes authorization. Retries generate no notification spam. The notification API exposes only fixed completion/failure wording, never persisted arbitrary body text or source titles. Normal notification polling plus completion invalidation refreshes the shell. No external messages are sent by AI.

QUEUED cancellation is durable and audited. RUNNING cancellation is explicitly rejected; the API does not pretend to recall generated bytes. A crashed/stalled RUNNING job is not automatically regenerated: ambiguous executions require review. This conservative limitation avoids duplicate or uncertain publication.

## Frontend

The existing analytics summary panel supports availability/disabled, submitting, queued, retry queued, running, completed, failed, cancelled, empty and unavailable/403 states. It renders model output as plain text, never HTML, and preserves notes after failed submission. Polling pending jobs is every five seconds; availability/history refresh once per minute. Completed history can be reopened without retaining prompts in client storage. Server context management hints gate the existing task-analysis action; APIs remain authoritative. Backend scope changes clear protected shell caches as in Phase 5. No progress percentage is fabricated.

Dashboard operational diagnostics retain their useful deterministic behavior under a truthful label. Core task/report/resource/storage operations make no model call. Provider/queue/worker outage affects AI work only; optional worker startup is asynchronous and does not await a healthy inference service.

## Reconciliation and recovery

OWNER may paginate `GET /api/ai/reconciliation?cursor=<last-id>`. Output contains safe job IDs/statuses and issue codes only: QUEUE_UNAVAILABLE, QUEUE_ENTRY_MISSING, STALE_RUNNING, RESULT_MISSING, EXECUTION_STATE_MISMATCH and ATTEMPTS_EXHAUSTED. No automatic requeue, historical regeneration or model call occurs. Review stalled/incomplete records and their audited state before deciding on a fresh user submission. No unsafe operator apply script is included.

DB is the user-visible authority. Redis completion alone never supplies a result. Queue delivery and PostgreSQL are not one transaction; this implementation uses explicit failure state plus reconciliation, not an exactly-once distributed-transaction claim. Completed/failed Redis entries are bounded to 1000 each. Database jobs/provenance remain retained; a reviewed retention policy is release follow-up.

## Validation and migration evidence

Tests use explicit loopback-only dedicated PostgreSQL databases, unique disposable schemas, synthetic identities and offline Ollama doubles. The new database is `antara_phase7_test` on port 55461. Redis integration requires the isolated loopback instance at port 55462/database 15. Neither repository production configuration nor the restored production dataset supplies fixture state.

Clean migration deployment and upgrade from all five prior migrations are exercised. A historical AIInsight row survives unchanged; applied checksums are compared to every repository SQL file. The original four pinned foundation hashes still match, and the Phase 6 storage migration is unchanged. No migration was run on production or the restored copy.

Commands:

```sh
npm run prisma:generate --workspace @antara/api
node_modules/.bin/prisma format --schema apps/api/prisma/schema.prisma
DATABASE_URL=<explicit-local-test-url> DIRECT_URL=<same-local-test-url> node_modules/.bin/prisma validate --schema apps/api/prisma/schema.prisma
AI_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase7_test AI_TEST_REDIS_URL=redis://127.0.0.1:55462/15 npm run test:ai --workspace @antara/api
npm run test --workspace @antara/api
npm run lint --workspace @antara/api
npm run build --workspace @antara/api
npm run lint --workspace @antara/web
API_URL=http://127.0.0.1:4105/api NEXT_PUBLIC_API_URL=http://127.0.0.1:4105/api NEXTAUTH_URL=http://127.0.0.1:3105 NEXTAUTH_SECRET=<fixture-secret> NEXT_TELEMETRY_DISABLED=1 GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= npm run build --workspace @antara/web
PHASE5_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase5_test npm run test:shell --workspace @antara/web
git diff --check
```

The complete API gate supplies AI_TEST_DATABASE_URL, AI_TEST_REDIS_URL and every existing dedicated Phase 1–6 test URL. Final complete API regression: **721 tests in 41 suites passed, none skipped**. The final focused AI gate passed **67 tests**, including two subsequently added database cases (inactive requester and corrupt success metadata), giving **723 distinct passing API tests**. Optimized-build Playwright passed **19 tests**, preserving all 16 Phase 5/6 browser cases and adding queued/running/completed/disabled/failed/revoked AI flows. Combined distinct coverage is **742 tests**. API lint/typecheck/build/postbuild, web lint/typecheck/optimized build, Prisma generation/format/validation, focused formatting and git diff --check passed. Contracts were not changed. All inference was offline; the real queue tests used only the isolated Redis fixture.

The final focused rerun also verified atomic queue-submission failure state/notification handling. Initial Redis tests exposed the manual-mock collision described below; it was fixed without suppressing queue execution or removing a security assertion. Initial formatting differences were corrected. No remaining test failure is known.

The old Nest decorator fixture lived in `__mocks__/bullmq.ts`, unintentionally shadowing the real queue package and duplicating its generated copy. Phase 7 real Redis tests exposed that defect. It now lives under test/queue-decorators.fixture.ts with explicit Nest mappings; Jest excludes generated dist artifacts from its test/module registry. Real BullMQ is exercised rather than mocked away. Security assertions were retained.

## Release implications and deferred work

Apply the additive migration with compatible API/web through the separately approved release process. Configure explicit Ollama networking/model and existing Redis, or leave AI disabled. Provisioning a model, private network controls, resource sizing, live provider smoke tests and operational monitoring remain release tasks. No production command was executed here. Core health does not require Ollama readiness.

Known conservative choices: one model, no fallback model; requester-only generated history; version changes invalidate old source-derived results; any post-submission session revocation invalidates old jobs; no automatic stale-job requeue; no running cancellation; no new historical-insight adoption. These are documented v1 safety choices, not role-only compatibility fallbacks.

Remaining release work includes provider capacity/availability checks, operator reconciliation/runbook exercises, dependency advisory review inherited from Phase 6, Next standalone test-harness warning, and final release hardening. No automatic Time Intelligence, learned scheduling, chatbot, RAG, agent orchestration, storage redesign or autonomous ERP action was added. Existing deterministic schedule diagnostics were not expanded.

## Exact Phase 7 file inventory

Created:

```text
apps/api/prisma/migrations/20261009000000_phase_7_ai_jobs/migration.sql
apps/api/src/common/ai/ai.config.ts
apps/api/src/common/ai/ai.provider.ts
apps/api/src/common/ai/ollama-ai.provider.ts
apps/api/src/common/ai/ollama-ai.provider.spec.ts
apps/api/src/modules/ai/ai-jobs.controller.ts
apps/api/src/modules/ai/ai-jobs.service.ts
apps/api/src/modules/ai/ai-jobs.integration.spec.ts
apps/api/src/modules/ai/ai-queue.service.ts
apps/api/src/modules/ai/ai-queue.integration.spec.ts
apps/api/src/modules/ai/ai-worker.service.ts
apps/api/test/queue-decorators.fixture.ts
docs/releases/v1.0.0/PHASE_7_AI_OLLAMA.md
```

Changed:

```text
.env.example
apps/api/jest.config.js
apps/api/package.json
apps/api/prisma/schema.prisma
apps/api/src/common/config/app.config.ts
apps/api/src/common/authorization/remaining.integration.spec.ts
apps/api/src/modules/ai/ai.controller.ts
apps/api/src/modules/ai/ai.controller.spec.ts
apps/api/src/modules/ai/ai.module.ts
apps/api/src/modules/ai/ai.service.ts
apps/api/src/modules/ai/ai.service.spec.ts
apps/api/src/modules/auth/auth.integration.spec.ts
apps/api/src/modules/notifications/notifications.service.ts
apps/api/test/phase5-server.ts
apps/web/src/components/analytics/ai-summary-panel.tsx
apps/web/src/components/dashboard/insight-list.tsx
apps/web/src/lib/operations-api.ts
apps/web/src/lib/operations-types.ts
apps/web/tests/shell.spec.ts
```

Removed: apps/api/src/common/integrations/openai.integration.service.ts and the relocated apps/api/src/**mocks**/bullmq.ts. All other existing modified/untracked files belong to approved Phase 6 and were preserved. No new dependency or shared-contract package change was required.
