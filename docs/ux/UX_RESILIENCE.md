# ANTARA UX resilience — staged work record

## Stage 0: repository map (completed before implementation)

| Area                 | Current behavior                                                                  | Failure mode                                                                                         | Desired UX                                                               | Priority | Likely files                                                                |
| -------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------- |
| Shared API clients   | Separate task, operations, people wrappers                                        | Status-only errors; file/people expose body text; no deadline                                        | Typed safe errors, bounded reads, no automatic write retry               | P0       | lib/http-error.ts, task-api.ts, operations-api.ts, people-api.ts            |
| Auth                 | BackendAuthError classification, signIn mapping, 90s timestamp cooldown           | Other OAuth failures generic; refresh failures trigger immediate logout                              | Preserve cooldown; explain expiry; never infer inactive from generic 401 | P0       | auth.ts, backend-auth.ts, backend-sign-in.ts, login-form.tsx, app-shell.tsx |
| Shell/context        | Current DB contexts, cache clearing, scope refetch, persistent selection          | Access-check errors generic; session redirect drops local forms                                      | Safe denial/expiry explanation without exposing stale protected data     | P0       | layout/app-shell.tsx, shell-header.tsx                                      |
| Tasks/comments       | Scoped permission hints; optimistic status/comments/create; create draft retained | fetchTasks catches errors as []; comment text cleared before persistence; string-based 403 detection | Distinct error/empty; preserve comment until saved; explicit rollback    | P0       | task-api.ts, use-task-control.ts, tasks/*                                   |
| Calendar             | Google create first; ERP transaction second; compensation on DB failure           | Provider failure prevents ERP save; timeout may leave provider orphan; no durable sync status/retry  | ERP-first persistence plus durable idempotent external sync              | P0       | calendar.service.ts, Google integration, schema, calendar-workspace.tsx     |
| Invitations          | Atomic invite, queued/disabled/unavailable email status; copy link                | Acceptance displays raw body; invalid/expired/used combined                                          | Preserve separate delivery status; sanitized failure and expiry          | P1       | invitations.service.ts, access-dialog.tsx, invite-accept-form.tsx           |
| Files                | Multipart upload, safe backend scope, retention, busy state                       | Raw server error text; no client size validation; delete immediate                                   | Scoped failure/retry, validation, contextual confirmation                | P1       | attachment-vault.tsx, operations-api.ts, storage/upload-safety.ts           |
| AI                   | Durable jobs; queued/running/final; 5s active polling, 60s health/history         | Optional AI fetch can fail analytics bundle; generic submission failure                              | Independent optional availability and safe manual retry                  | P1       | ai-summary-panel.tsx, use-operations.ts, ai/*                               |
| Decisions            | Awaited create preserves draft; scoped permissions                                | List error not consumed; inline dialogs lack shared focus policy                                     | Error distinct from empty; accessible dialogs                            | P1       | decisions/page.tsx, decision-log.tsx                                        |
| Resources/reports    | Scoped backend; reports explicitly unavailable for historical provenance          | Resource query error renders empty; reports show error.message                                       | Safe actionable error; preserve unavailable history                      | P1       | resources/page.tsx, reports/page.tsx                                        |
| Worklogs             | Personal scope; awaited writes                                                    | Hook fabricates display ID/time on malformed response; list error hidden                             | Render authoritative result; distinguish failed list from no entries     | P1       | use-operations.ts, worklog-workspace.tsx                                    |
| Notifications        | Generic privacy-safe data, recipient isolation, mark/read/delete; 60s polling     | Some action errors generic; no safe target provenance                                                | Preserve generic messages; never invent deep links/titles                | P1       | notification-center.tsx, shell-header.tsx, notifications/*                  |
| People/access        | Radix dialogs; backend permissions; deactivate/revoke confirmation                | Raw response messages, no dirty guard; confirmation generic                                          | Preserve self/OWNER rules and explicit lifecycle implications            | P1       | people-workspace.tsx, access-dialog.tsx                                     |
| Feedback/toasts      | Portal, alert/status roles, 3.5s messages                                         | No persistent retry/diagnostics; close icon unlabeled                                                | Inline operation status for saves; accessible dismiss                    | P1       | ui/toast.tsx, ui/error-boundary.tsx                                         |
| Loading/empty        | Many local loading/empty labels; some skeletons                                   | Disabled queries or swallowed errors resemble empty; no shared deadline                              | Distinguish unavailable, pending, and truly empty                        | P1       | hooks, feature pages                                                        |
| Navigation/drafts    | Local filters, context URL; substantial forms in component state                  | Refresh/navigation loses work; no scoped dirty guard                                                 | Explicit discard for substantial forms; no secret browser drafts         | P2       | tasks/decisions/calendar forms                                              |
| Concurrency          | Backend transactional scope locks                                                 | No client revision precondition found in tasks/decisions/calendar                                    | Separate stale-write contract before promising conflict detection        | P1       | task/decision DTOs/services                                                 |
| Audit                | Backend structured audit; subsystem activity surface                              | No dedicated audit-history UI identified                                                             | Human labels only where safe structured records exist                    | P2       | SubsystemHealthClient.tsx, audit services                                   |
| Onboarding           | onboardingPending is security/account state                                       | Not a tutorial preference                                                                            | Do not repurpose it for dismissible UI onboarding                        | P2       | users/auth, ui context                                                      |
| Offline/support      | No shared offline status/reference UX                                             | Network and HTTP failures collapse; references absent                                                | Safe diagnostics with no query/token/body; no write auto-resubmit        | P1       | providers, http-error.ts                                                    |
| Boundaries           | Class ErrorBoundary renders raw error.message and logs error/info                 | Possible private message leak; no Next error/not-found files                                         | Branded safe fallbacks, manual recovery                                  | P0       | ui/error-boundary.tsx, app error files                                      |
| Mobile/accessibility | Responsive shell/Radix menus; custom create-task portal                           | Custom dialog labels/focus, calendar toolbar, table overflow need browser checks                     | Targeted keyboard/narrow viewport verification                           | P1       | feature dialogs, calendar, shell                                            |

Search covered web routes/components/hooks/clients and API error filter, calendar, invitations, storage and auth paths. Existing backend authorization, provider isolation and audit behavior remain authoritative. No browser alert/confirm calls found in the initial literal search. This map is not a claim that every UI behavior has been browser-tested.

## Correctness gates discovered

- **Calendar (high):** provider-first create and absent durable sync state cannot support truthful ERP-saved/sync-failed retry. Stop the Stage 6 redesign here pending a dedicated additive sync-state/idempotency design: persist ERP event plus deterministic provider ID, retry only that event, recover ambiguous provider timeouts, authorize every retry, persist outcome. No frontend success claim or retry-create workaround.
- **Concurrent edits (medium):** transaction scope safety does not detect stale content edits. Version/updatedAt preconditions need an explicit backend write contract before UI can promise prevention.
- **Inactive-account UX:** current authentication intentionally returns generic invalid credentials/session. Never infer deactivation from 401/403 or reveal account existence. Dedicated messaging needs an approved safe authenticated error code.
- **Notifications:** protected titles/deep links require server-verified provenance. Preserve generic content rather than relaxing Phase 4B privacy.

## Implementation checkpoints

Stages 1–2: safe centralized taxonomy, shared transport boundary, reusable inline operation feedback; focused tests before continuing. No backend/schema/security changes in this checkpoint.

## Stage checkpoint and remaining work

This is **NOT READY** as a completed 0–30 rollout. Implemented foundations are separately reviewable; partial stages must not be represented as finished.

| Stage                  | Status                      | Evidence / remaining work                                                                                                                                                              |
| ---------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Audit                | Implemented                 | Map above, completed before edits                                                                                                                                                      |
| 1 Taxonomy             | Implemented                 | Controlled copy, status/transport distinctions, allowlisted validation fields, safe unknown fallback                                                                                   |
| 2 Operation feedback   | Partially implemented       | Reusable inline component; Calendar read/save wired; remaining forms need adoption                                                                                                     |
| 3 Authentication       | Partially implemented       | Cooldown preserved; expiry explanation; safe OAuth failure route; inactive distinction blocked on safe backend contract; unsaved form recovery across reauthentication not implemented |
| 4 Permissions          | Partially implemented       | Safe shared denials and task-specific mutation message; task/decision/resource error states; existing backend hints preserved                                                          |
| 5 Services             | Partially implemented       | 30s ordinary API request deadline, safe diagnostics, no automatic write retry; not every feature consumes shared feedback                                                              |
| 6 Calendar             | Deferred (correctness gate) | Current ordering preserved; truthful confirmed SYNCED / NOT_CONFIGURED feedback and retained failed draft. Durable retry/sync state requires dedicated backend work                    |
| 7 Invitations          | Partially implemented       | Existing independent queued/disabled/unavailable delivery states preserved; acceptance sanitized; sent/failed worker status not newly exposed                                          |
| 8 Forms                | Partially implemented       | Task/comment/worklog draft preservation and invitation busy guard; full inline-field adoption pending                                                                                  |
| 9 Unsaved changes      | Partially implemented       | Task-draft unload warning and explicit dialog discard; no SPA-wide navigation blocker                                                                                                  |
| 10 Uploads             | Partially implemented       | Empty-file validation, bounded upload request, status, retained selection on failure; configured size discovery and byte progress pending                                              |
| 11 AI                  | Partially implemented       | Optional-service independence stated; explicit readiness retry; existing bounded polling/jobs preserved; global analytics and optional AI now use independent queries                  |
| 12 Loading             | Partially implemented       | Bounded shared requests and explicit task/calendar states; 10s delayed working message; wider skeleton adoption pending                                                                |
| 13 Empty states        | Partially implemented       | Task error/empty separated; decisions/resources failure distinguished; remaining swallowed optional reads listed below                                                                 |
| 14 Destructive actions | Partially implemented       | File deletion confirmation; existing People confirmations preserved; full action inventory integration pending                                                                         |
| 15 Optimistic UI       | Partially implemented       | Existing rollback retained; worklog synthetic display metadata removed; broader task optimistic concurrency review pending                                                             |
| 16 Notifications       | Partially implemented       | Existing read states and 60s polling preserved; generic privacy-safe messages retained; no invented protected deep links                                                               |
| 17 Subsystem context   | Implemented (existing)      | Backend contexts and Admin/Read indicators preserved; no additional scope rules                                                                                                        |
| 18 New user onboarding | Deferred                    | onboardingPending is security state, not dismissal state; do not repurpose it                                                                                                          |
| 19 Filters/URL state   | Partially implemented       | Task priority/subsystem, decision status/subsystem and People tab use bounded URL choices; private search text remains local                                                           |
| 20 Offline             | Implemented                 | Subtle event-based status; offline shared requests fail locally; mutations never pause for reconnect replay                                                                            |
| 21 Concurrent edits    | Deferred (correctness gate) | Requires version/precondition contract; no fake conflict detection                                                                                                                     |
| 22 Audit readability   | Deferred                    | No general audit-history UI identified; backend structured audit unchanged                                                                                                             |
| 23 Support diagnostics | Partially implemented       | Controlled code/time/page only; no trustworthy correlation ID available, none invented                                                                                                 |
| 24 Accessibility       | Partially implemented       | Radix task/confirmation focus handling, native disabled controls, toast dismiss label; wider form labels audit pending                                                                 |
| 25 Mobile              | Partially implemented       | Existing shell/mobile suite plus auth cooldown viewport coverage; 375px Calendar toolbar coverage added; broader tables still pending                                                  |
| 26 Boundaries          | Implemented                 | Safe root/global/not-found fallbacks; class boundary no raw exception or private console dump                                                                                          |
| 27 Regression matrix   | Partially implemented       | Focused taxonomy/auth/browser and prior API suites; deferred capabilities cannot have passing feature assertions                                                                       |
| 28 Observability       | Partially implemented       | Removed raw boundary exception logging; safe backend logs retained; no new correlation infrastructure                                                                                  |
| 29 Performance         | Partially implemented       | No added polling/framework; event-only offline state; 30s JSON/120s upload deadlines; no automatic write replay                                                                        |
| 30 Cleanup             | Partially implemented       | Shared raw error paths sanitized; remaining known gaps below                                                                                                                           |

## Taxonomy and safe copy

The authoritative UI catalog is `apps/web/src/lib/ux-error.ts`.

| Code                 | Meaning / message                      | Action                      | Retry                                      |
| -------------------- | -------------------------------------- | --------------------------- | ------------------------------------------ |
| AUTH_RATE_LIMITED    | Too many login attempts                | Wait; fresh login           | Existing 90s page                          |
| SESSION_EXPIRED      | Your session has expired               | Sign in again               | Explicit only                              |
| ACCOUNT_INACTIVE     | Account inactive                       | Contact administrator       | No (requires explicit safe backend signal) |
| AUTH_REQUIRED        | Sign in required                       | Sign in                     | Explicit only                              |
| FORBIDDEN            | No permission; access may have changed | Check context/admin         | No automatic retry                         |
| NOT_FOUND            | Item unavailable                       | Return to list              | No                                         |
| VALIDATION_ERROR     | Check input                            | Review allowlisted fields   | After correction                           |
| CONFLICT             | Change could not be applied            | Review latest state         | Explicit review                            |
| NETWORK_OFFLINE      | Offline                                | Reconnect/check saved state | Manual                                     |
| NETWORK_ERROR        | Could not reach ANTARA                 | Check state before retry    | Manual                                     |
| REQUEST_TIMEOUT      | Outcome unconfirmed; server may finish | Check state before retry    | Manual                                     |
| SERVICE_UNAVAILABLE  | Services temporarily unavailable       | Check state; try later      | Manual                                     |
| EXTERNAL_SYNC_FAILED | External sync unavailable              | Check ERP/sync state        | Only future dedicated sync retry           |
| UPLOAD_FAILED        | Upload unconfirmed                     | Check file list             | Manual                                     |
| UPLOAD_TOO_LARGE     | File exceeds server limit              | Choose a smaller file       | After correction                           |
| AI_UNAVAILABLE       | AI unavailable; core ERP unaffected    | Retry AI later              | Manual                                     |
| RATE_LIMITED         | Too many requests                      | Wait                        | Manual                                     |
| UNKNOWN_ERROR        | Request could not complete             | Review state/support        | No automatic retry                         |

Reserved categories are not inferred from arbitrary backend messages. HTTP 500 remains UNKNOWN_ERROR; 502/503/504 map to SERVICE_UNAVAILABLE. OAuth Configuration is never classified as rate limited. Validation text is discarded; only explicitly allowed field-name associations survive. A timeout does not mean a mutation rolled back.

## Before / after in this checkpoint

- Authentication: unexplained expiry redirect → explanatory login notice; default OAuth/config page → safe fresh-login recovery. Verified 429 remains the only path selecting cooldown.
- Calendar: generic toast → persistent read/save/error feedback and draft-preserved note. Provider-first transaction semantics unchanged; no false partial-success promise.
- Invitations: raw acceptance body → safe classified message. Existing email queue outcome/copy link remains distinct from invitation persistence.
- Files: raw provider error + immediate delete → safe error/status and explicit retained-content deletion confirmation.
- Forms: comment cleared before await → clear only after success; failed worklog keeps notes/timer; task discard requires confirmation. Required task fields have inline feedback; synchronous submit guards prevent duplicate submission.
- Permissions: task failure could appear empty → distinct error with no stale task detail. Server enforcement unchanged.
- Notifications: no invented titles/targets. Existing recipient isolation and generic messages preserved.
- AI: isolated availability retry and explicit core-ERP-unaffected message; no provider details disclosed. Global metrics remain available when the optional AI request fails.

## Backend and database

No production backend source changes, migrations, production access, deployment, secrets or environment configuration changes. Test commands use explicit loopback fixture URLs and temporary command-local environment values. Local PostgreSQL test database contains synthetic accounts, not restored production users. The browser API fixture now supplies the existing identity-throttle guard/storage dependencies, preserving the real limiter rather than bypassing it.

## Remaining weaknesses and release dependencies

1. Durable Calendar ERP-first sync/idempotency and recovery must be designed/tested before claiming partial success support.
2. Auth inactive reason cannot be inferred safely from generic denial; OAuth callback error labels cannot distinguish every issuer/state/PKCE cause. Do not weaken verification or expose exception strings.
3. Session expiry still clears protected caches and local component drafts; no secure draft restore across login implemented.
4. Several optional legacy read helpers still swallow failures as empty arrays; global analytics is now independent of optional AI fetching.
5. Field associations are available in typed errors but not all forms render them inline.
6. Upload configured max-size discovery/byte progress and per-file queue remain pending. No fake progress percentages.
7. Stale write preconditions and richer audit-history presentation require separate backend/product contracts.
8. Remaining filters, first-login dismissible onboarding, broad unsaved navigation coverage, and all viewports not completed.
9. No generic backend body/URL/correlation header is copied to diagnostics; a trusted correlation contract is still needed.
10. Default query read retries remain bounded; mutation replay on reconnect is disabled.

## Deployment plan (not executed)

Web needs rebuilding/redeployment after remaining stages are approved. API and worker changes are not required for this frontend checkpoint. Future Calendar sync work will require API/worker and possibly an additive migration, explicitly reviewed before deployment. Do not deploy local fixture builds; rebuild with normal deployment configuration.

## Manual smoke checklist (future approved production validation)

- Fresh Google login; account rejection; issuer/state failure remains a failure, not cooldown.
- Genuine auth 429: disabled 90s timer, refresh preserves deadline, clean Back to login.
- Expired session: protected data cleared, expiry explanation, no stale OAuth query.
- Two different users: independent login and private notification data.
- Scoped task denial: safe contextual message, no unrelated details.
- Calendar save with integration enabled/disabled; provider failure must not imply ERP save. Partial-sync retry is not yet implemented.
- Invitation creation with email disabled/unavailable: existing link remains usable; no false creation failure.
- Upload failure: retain selection, no success row; delete requires confirmation, retained restore still works.
- AI unavailable: non-AI task/file flows remain usable.
- Offline task submit: draft retained, no delayed submission on reconnect.
- Failed comment/task save: inputs remain; manual retry only after checking saved state.

## Exact changed-file inventory

- `apps/api/test/phase5-server.ts`
- `apps/web/playwright.ux-unit.config.ts`
- `apps/web/src/app/(auth)/login/error/page.tsx`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(platform)/decisions/page.tsx`
- `apps/web/src/app/(platform)/resources/page.tsx`
- `apps/web/src/app/error.tsx`
- `apps/web/src/app/global-error.tsx`
- `apps/web/src/app/not-found.tsx`
- `apps/web/src/auth.ts`
- `apps/web/src/components/analytics/ai-summary-panel.tsx`
- `apps/web/src/components/analytics/analytics-live.tsx`
- `apps/web/src/components/auth/invite-accept-form.tsx`
- `apps/web/src/components/auth/login-form.tsx`
- `apps/web/src/components/calendar/calendar-workspace.tsx`
- `apps/web/src/components/dashboard/notification-center.tsx`
- `apps/web/src/components/files/attachment-vault.tsx`
- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/components/layout/shell-header.tsx`
- `apps/web/src/components/people/access-dialog.tsx`
- `apps/web/src/components/people/people-workspace.tsx`
- `apps/web/src/components/providers/app-providers.tsx`
- `apps/web/src/components/providers/connectivity-status.tsx`
- `apps/web/src/components/tasks/create-task-dialog.tsx`
- `apps/web/src/components/tasks/task-detail-panel.tsx`
- `apps/web/src/components/tasks/task-workspace.tsx`
- `apps/web/src/components/ui/confirm-action.tsx`
- `apps/web/src/components/ui/error-boundary.tsx`
- `apps/web/src/components/ui/operation-feedback.tsx`
- `apps/web/src/components/ui/toast.tsx`
- `apps/web/src/components/worklogs/worklog-workspace.tsx`
- `apps/web/src/hooks/use-operations.ts`
- `apps/web/src/hooks/use-task-control.ts`
- `apps/web/src/hooks/use-unsaved-changes.ts`
- `apps/web/src/hooks/use-url-choice.ts`
- `apps/web/src/lib/auth-ux.ts`
- `apps/web/src/lib/backend-sign-in.ts`
- `apps/web/src/lib/http-error.ts`
- `apps/web/src/lib/operations-api.ts`
- `apps/web/src/lib/operations-types.ts`
- `apps/web/src/lib/people-api.ts`
- `apps/web/src/lib/task-api.ts`
- `apps/web/src/lib/ux-error.ts`
- `apps/web/tests/auth-feedback.spec.ts`
- `apps/web/tests/backend-sign-in.spec.ts`
- `apps/web/tests/shell.spec.ts`
- `apps/web/tests/ux-error.spec.ts`
- `docs/releases/v1.0.0/AUTH_RATE_LIMIT_UX.md`
- `docs/ux/UX_RESILIENCE.md`

## Validation record

All database/browser commands used synthetic loopback fixtures, never production. API source was unchanged; its fixture dependency correction retains real throttling.

| Command                                                                                                                                          | Result                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `npm run test:auth --workspace @antara/api`                                                                                                      | 54 tests passed, 6 suites                                |
| `npm run test:authorization --workspace @antara/api`                                                                                             | 196 tests passed, 2 suites                               |
| `npm run test --workspace @antara/api -- --runTestsByPath src/modules/calendar/calendar.service.spec.ts src/modules/files/files.service.spec.ts` | 22 tests passed, 2 suites                                |
| `AUTH_TEST_DATABASE_URL=<explicit synthetic loopback fixture> npm run test:auth:integration --workspace @antara/api`                             | 58 PostgreSQL tests passed                               |
| `npm run lint --workspace @antara/api`                                                                                                           | Passed                                                   |
| `npm run build --workspace @antara/api`                                                                                                          | Passed                                                   |
| `playwright test --config playwright.auth.config.ts` (apps/web)                                                                                  | 31 tests passed                                          |
| `playwright test --config playwright.ux-unit.config.ts` (apps/web)                                                                               | 19 tests passed; final repeat 6.0s                       |
| `npm run build --workspace @antara/web` (explicit local fixture API URLs, mocked Google fonts)                                                   | Passed; optimized Next 15.5.27 build, 20 generated pages |
| `npm run lint --workspace @antara/web`                                                                                                           | Passed (TypeScript noEmit)                               |

The browser Calendar outcome tests use response doubles for confirmed sync/not-configured/failure presentation; they do not prove an unimplemented partial-sync retry backend. Separate Calendar unit tests exercise existing provider/persistence behavior. No live Google, Ollama or storage requests are used.

## Security review and limitations

- OAuth issuer/state/PKCE verification is unchanged. Only the existing concrete backend error classification selects auth recovery paths.
- Identity/malformed/source/refresh/invitation limits and backend authorization remain unchanged. No forwarded-IP trust was added.
- Protected caches still clear on session expiry/revocation; draft recovery across reauthentication is not claimed.
- No new token/password/account browser persistence. Existing cooldown timestamp remains UX-only.
- Diagnostics contain controlled page label/code/time only. No response body, callback parameters, cookies, credentials, provider URL or stack trace.
- Notification privacy remains intentionally generic unless existing safe target provenance exists.
- No API production behavior or schema migration was changed. The only API-side edit is browser-fixture dependency wiring.
- One focused browser rerun initially could not start because automatic permission review timed out. Its permitted one-time retry started successfully; this was infrastructure approval, not a test failure.

## Final browser and repository validation

- `PHASE5_TEST_DATABASE_URL=<synthetic loopback fixture> playwright test --config playwright.shell.config.ts`: **32 passed, 2 failed (4.1m)**. Failures were test synchronization/locator issues: duplicated toast/inline text and Back invoked before URL navigation completed.
- Corrected the offline assertion to target the dialog, and waited for `priority=LOW` before Back while also asserting return to `priority=HIGH`. No application/security assertion was removed.
- Same command with `--grep 'offline task submission|task filter survives'`: **2 passed (39.8s)**. All 34 browser cases passed across the full run and focused rerun; not claimed as one clean 34-test run.
- Final source optimized build and web typecheck passed before this test-only correction.
- **414 distinct test cases passed across the recorded suites and focused rerun.** Earlier repeated runs are not counted again.
- Changed-file Prettier check and `git diff --check` passed after report formatting.
- Final literal search for `window.alert`, `window.confirm`, `Something went wrong`, `Request failed`, and `Unknown error` in web TS/TSX found no matches. This does not imply all semantic error/empty/loading gaps are eliminated.
- Synthetic local PostgreSQL cluster was shut down after validation. Nothing was committed, pushed, deployed or executed against production.
