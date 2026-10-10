# People management and invitation onboarding

This approved follow-up extends the v1 foundations. It supersedes the earlier environment-allowlist-only Google eligibility rule. It does not change cryptographic identity verification, canonical subsystems, OWNER quorum, or object authorization. No production/provider changes are part of implementation validation.

## Product and API

`/people` uses the existing authenticated shell, navigation, theme and server-provided `permissions.viewPeople`. Members and Invitations views provide loading, empty, error and confirmation states. Invitations display all authorized historical statuses, including computed Expired. One-time creation panels show the configured frontend invitation URL and Copy Link feedback; the URL is not put in query caches or persisted client preferences. OWNER can edit access, deactivate/reactivate and revoke sessions. There is no hard-delete control. Pending onboarding accounts are distinguished and cannot be access-edited before acceptance.

| Operation                                                 | OWNER                                                | Scoped ADMIN                                                                                                    | MEMBER                                |
| --------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `GET /users` People directory                             | All non-deleted accounts, including inactive/pending | Users sharing administered scopes; only those memberships returned                                              | Denied                                |
| `POST /invitations`                                       | Member/Owner; zero or multiple member/admin grants   | Member grants only, every scope administered; no unassigned invitation                                          | Denied                                |
| `GET /invitations`                                        | All invitation history                               | Only Member invitations whose entire grant set is within administered scopes; matching legacy Member placements | Denied                                |
| `POST /invitations/:id/revoke`                            | Pending invitations                                  | Same grant restrictions as creation                                                                             | Denied                                |
| `PATCH /users/:id/access`                                 | Replace memberships and/or explicit Owner transition | Denied                                                                                                          | Denied                                |
| Existing deactivate/reactivate/revoke-session/role routes | Existing OWNER lifecycle policy and quorum           | Denied                                                                                                          | Denied                                |
| Existing `/users/members` collaboration directory         | Existing Phase 4 policy                              | Existing Phase 4 policy                                                                                         | Existing minimal collaboration policy |

Controllers use current authenticated user identity; service policies reload database authority. Existing collaboration routes are unchanged. No global ADMIN chooser exists. The editor uses canonical contexts supplied by the backend, not a duplicated catalog. Access mutations invalidate People/context queries; session revocation still applies immediately in the API.

## Database and migration

New migration: `20261010000000_people_invitation_grants`.

- `User.onboardingPending BOOLEAN NOT NULL DEFAULT false`. Existing accounts remain fully onboarded.
- `Invitation.token` becomes nullable, retaining its unique constraint for legacy values.
- `Invitation.tokenHash` is nullable and unique. New records store only SHA-256 of a random 32-byte token.
- `InvitationGrant` has an ID, invitation/subsystem foreign keys, MEMBER/ADMIN access level, timestamps, unique `(invitationId, subsystemId)` and a subsystem/access index.
- New hashed invitations require MEMBER or OWNER global semantics and a null legacy subsystem. No additional globalRole database column.
- Pending User rows must be MEMBER. Database triggers prevent memberships while pending and prevent moving a member-bearing account back into pending state. The membership trigger locks the same User row used by membership services.
- No original six migrations are edited; no users, sessions or historical operational rows are rewritten by this migration. No bootstrap/seed is invoked.

The shared `normalizeInvitation` handles both models. Legacy ADMIN + subsystem becomes a Member-global invitation with an Admin membership. Legacy Member placements map to Member grants; an unassigned Member remains unassigned; legacy Owner remains global. Explicit grants take precedence. Existing legacy token values and links remain untouched. Malformed legacy administrative placement is rejected rather than guessed. The public creation contract is now `{ email, globalRole: MEMBER | OWNER, memberships }`; the old service-level call shape remains only as a trusted internal compatibility adapter for existing fixtures/operator callers.

## Google eligibility and pending identities

The existing Google verifier still checks signature, audience, issuer, expiry and verified identity claims. Frontend allowlist vetoes are removed; only the backend decides eligibility.

| Verified identity/current state            | Outcome                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Inactive or deleted                        | Deny, including when allowlisted/invited                                                    |
| Existing active, `onboardingPending=false` | Allow without environment allowlist; preserve role and memberships                          |
| Existing pending                           | Require a currently eligible unexpired pending invitation or explicit environment allowlist |
| Unknown with eligible invitation           | Create pending MEMBER, zero memberships; do not consume or grant invitation                 |
| Unknown, environment-allowlisted           | Create ordinary MEMBER, zero memberships                                                    |
| Unknown, neither                           | Deny                                                                                        |

An eligible invitation includes the inviter's current authority to grant every requested scope. Pending eligibility is checked on Google login, refresh and authenticated session evaluation. Revoking/expiring the final valid invitation prevents continued authentication unless the email is explicitly environment-allowlisted. Pending identities remain stored for history, but Phase 1 authorization context marks them PENDING and denies project authority. Credentials login rejects pending accounts. Ordinary unassigned MEMBER accounts are not confused with pending identities.

`GOOGLE_ALLOWED_EMAILS` is an operator/bootstrap/emergency fallback, not the ongoing roster. It never auto-promotes OWNER. A pending account temporarily permitted by the allowlist remains pending until explicit acceptance.

## Acceptance and race protocol

1. Hash lookup, with legacy plaintext lookup fallback.
2. Lock Invitation; re-read status/expiry and normalize all grants.
3. Lock inviter and existing target accounts in sorted ID order.
4. Revalidate current inviter authority for every grant.
5. Match authenticated account email/ID, or verify existing password before modifying an existing credential account. New credential accounts are created only via invitation acceptance.
6. Clear pending state in the same transaction, apply grants, retain stronger existing ADMIN access, and synchronize compatibility role using the established helper.
7. Revoke target sessions, consume invitation and write acceptance/membership/role audit records atomically.

There is one acceptance winner. Failure rolls back identity, pending state, memberships, sessions, audit and consumption. Google eligibility locks its chosen invitation and rechecks that same invitation before issuing credentials. New multi-query invitation/access/Google transactions use explicit 10-second acquisition/30-second execution limits; global Prisma defaults are not changed.

OWNER access edits use the existing advisory-lock quorum transaction before sorted account locks. Demotion delegates to the lifecycle role-transition helper, preserving the final-active-OWNER protection. OWNER selection preserves existing memberships but never fabricates five admin memberships. Membership changes are audited and revoke sessions; the final ADMIN removal synchronizes to MEMBER. OWNER promotion/demotion is audited through the existing role primitive.

The invitation page shows email, grants and expiry. Logged-out users can choose configured Google sign-in or supported credentials acceptance. A wrong signed-in account gets a sign-out prompt, not an acceptance form. Matching authenticated accounts explicitly accept, then sign out and reauthenticate. Accepting an invitation never trusts caller-supplied grants.

## Delivery and bearer credentials

Database creation and email dispatch are separate. A failed DB transaction is an error; a committed invitation always yields a truthful creation result:

- `disabled`: delivery disabled; share Copy Link.
- `queued`: enqueue acknowledged, not a claim that mail was delivered.
- `unavailable`: missing provider configuration, enqueue failure or enqueue acknowledgement exceeding three seconds; share Copy Link. A delayed enqueue may subsequently succeed, so this is not a guarantee of nondelivery.

BullMQ uses the invitation ID as job ID, three attempts with exponential backoff, and removes completed/final-failed new jobs. Retryable delivery failures retain retry semantics. The queue temporarily contains the bearer URL needed for delivery; use authenticated/TLS Redis and protect queue backups/dashboards. Never log job payloads. Older queued email payloads remain deliverable with a generic access description and the original link. Old completed job retention is not silently rewritten by this deployment.

Resend exceptions and SDK error returns become fixed sanitized delivery failures; emails show actual expiry and escaped display names, not database subsystem IDs. No provider calls occur inside the DB transaction. Lists, audits and errors omit token/hash values. New invitation validation/list/create responses use `Cache-Control: no-store`. Safe exception handling does not print raw database/provider errors. Infrastructure access logs must also redact `/invitations/validate/<token>` and `/invite/<token>` paths; browser/provider transport necessarily carries the invitation bearer.

## Operator deployment notes (not executed)

1. Take an approved backup and verify the existing six migration identities/checksums.
2. Stop old API/email writers during the coordinated rollout. Old code cannot safely accept new multi-grant/hashed invitation rows or enforce pending state.
3. Apply the seventh migration using the existing approved migration procedure; generate the matching Prisma client and deploy matching API/web/worker code.
4. Keep the existing Google client/audience configuration. Set `FRONTEND_URL` to the actual ERP origin. No routine allowlist edits are needed for invited users.
5. Email is optional. If enabling it, configure `NOTIFICATIONS_EMAIL_ENABLED`, `RESEND_API_KEY`, `NOTIFICATIONS_FROM_EMAIL` and protected Redis. Otherwise use Copy Link.
6. Smoke-test invitation creation, Google callback/return, acceptance, reauthentication, scoped access, and email delivery with explicitly approved accounts.

No ordinary seed should recreate people or grant OWNER. There is no destructive down migration or token restoration. Existing normal sessions need no migration-wide invalidation; access/lifecycle changes revoke affected sessions. Do not roll application code back to pre-pending eligibility while pending identities/new invitations exist without an explicit reviewed rollback plan.

## Validation and limitations

Tests use isolated loopback PostgreSQL schemas, real application authorization/session services, offline Google verifier and Resend boundaries, and optimized Next.js/browser fixtures. No live Google/Resend or production infrastructure is used. The offline Google browser test wraps backend-issued credentials in an actual encrypted NextAuth session; it does not pretend a frontend role proves authorization. Real external OAuth consent/redirect and deliverability remain operator smoke tests.

Migration tests cover clean installation, populated six-migration upgrade with legacy invitation preservation, prior checksum identity, token storage, pending-state DB constraints, transaction rollback and concurrent acceptance. Existing Phase 1–8 security regression gates remain required. Historical Phase 1A fixtures use only their original schema columns instead of asking the latest Prisma client to insert a later default field.

The page intentionally excludes deleted accounts from its normal directory and exposes no undelete operation. Lists are currently unpaginated, appropriate to the present team scale; pagination is a future scaling improvement. ADMIN cannot inspect/manage an invitation that includes any grant outside their authority. No security control depends on hiding frontend actions.

## Completed validation — 2026-10-10

| Command / gate                                                                                            | Result                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run build --workspace @antara/contracts`                                                             | Passed                                                                                               |
| `npm run lint --workspace @antara/api`                                                                    | Passed                                                                                               |
| `npm run build --workspace @antara/api`                                                                   | Passed                                                                                               |
| `npm run lint --workspace @antara/web`                                                                    | Passed                                                                                               |
| `npm run build --workspace @antara/web`                                                                   | Optimized standalone build passed with explicit loopback API/auth URLs                               |
| `npm run test --workspace @antara/api`                                                                    | **47 suites, 804 tests passed; no skipped tests**                                                    |
| `npm run test:shell --workspace @antara/web`                                                              | **25 browser tests passed**, including five new People flows and all 20 shell/storage/AI regressions |
| `prisma format`, `prisma validate`, `prisma generate`, each with `--schema apps/api/prisma/schema.prisma` | Passed; explicit local database variables supplied; no production connection                         |
| Prettier `--write` then `--check` on changed TS/TSX/Markdown files                                        | Passed                                                                                               |
| `git diff --check`                                                                                        | Passed                                                                                               |
| Compare all six historical migration files to HEAD                                                        | Byte-for-byte unchanged                                                                              |

The complete API gate supplied every existing integration fixture URL explicitly: `PHASE1A_TEST_DATABASE_URL`, `AUTHORIZATION_TEST_DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, `PRIVACY_TEST_DATABASE_URL`, `CORE_TEST_DATABASE_URL`, `REMAINING_TEST_DATABASE_URL`, `PHASE1C_TEST_DATABASE_URL`, `STORAGE_TEST_DATABASE_URL`, and `AI_TEST_DATABASE_URL`, all using dedicated `antara_phase*_test` databases on `127.0.0.1:55461`. `AI_TEST_REDIS_URL` used isolated loopback port 55462/database 15. The browser gate used `PHASE5_TEST_DATABASE_URL` for `antara_phase5_test` on the same local PostgreSQL fixture, API port 4105, web port 3105, and offline provider boundaries. Random fixture schemas were cleaned up by the suites. No repository production connection fallback was used for tests.

New API coverage totals 32 cases: 15 PostgreSQL People cases, 13 normalization/policy/DTO cases and four offline email processor cases. Existing tests were adapted to the approved contracts rather than removing security assertions. The five new browser tests cover copied-link credentials onboarding, mixed access and scoped ADMIN invitations, wrong-account/revocation behavior, lifecycle/quorum/mobile keyboard behavior, and authenticated Google acceptance with subsequent session revocation. Desktop and mobile screenshots were visually inspected.

The first runs exposed test wiring/historical-fixture-column issues and overly broad browser locators; these were corrected. Final gates above are green. Test-injected audit/storage failure logs and Playwright's existing NO_COLOR/FORCE_COLOR warning remain expected; no warning was suppressed.

New migration SHA-256: `97ff043449624beb80f1cbbc42d918746fcadbe4f20a3bf1202ef5980244fd6d`.

Git review scope: **50 files: 36 modified, 14 new**. At final review, tracked changes report **813 insertions / 440 deletions**, with the 14 new files separately untracked until the user chooses to stage/commit. No commit, push, deployment or live provider smoke test was performed.

Remaining live checks: real Google OAuth consent/redirect return, real Resend deliverability/retry, and approved production rollout of the seventh migration plus matching API/web/worker. These are deployment smoke requirements, not claims of completed live testing. No known failing local gate remains.

## Exact changed-file inventory

| File                                                                               | Change                                                              | Reason                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `.env.example`                                                                     | Clarify Google fallback and email/queue settings                    | Operator-safe onboarding configuration                                 |
| `apps/api/prisma/migrations/20261010000000_people_invitation_grants/migration.sql` | New additive invitation/pending-state migration                     | Preserve six historical migrations and legacy links                    |
| `apps/api/prisma/schema.prisma`                                                    | Pending account state, hashed token and relational grants           | Represent secure multi-scope onboarding                                |
| `apps/api/src/common/authorization/authorization.policy.ts`                        | Project authority denies pending identities                         | No pre-acceptance subsystem or global access                           |
| `apps/api/src/common/authorization/authorization.service.spec.ts`                  | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/api/src/common/authorization/authorization.service.ts`                       | Project authority denies pending identities                         | No pre-acceptance subsystem or global access                           |
| `apps/api/src/common/authorization/authorization.types.ts`                         | Project authority denies pending identities                         | No pre-acceptance subsystem or global access                           |
| `apps/api/src/common/authorization/core.integration.spec.ts`                       | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/api/src/common/authorization/remaining.integration.spec.ts`                  | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/api/src/common/privacy/privacy.integration.spec.ts`                          | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/api/src/common/sessions/session.service.ts`                                  | Revalidate pending identity eligibility                             | Revocation/expiry cannot become permanent login eligibility            |
| `apps/api/src/modules/auth/auth.integration.spec.ts`                               | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/api/src/modules/auth/auth.service.spec.ts`                                   | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/api/src/modules/auth/auth.service.ts`                                        | Backend Google eligibility and acceptance presentation              | Verified identity plus explicit onboarding, no frontend allowlist veto |
| `apps/api/src/modules/invitations/invitation-access.spec.ts`                       | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/api/src/modules/invitations/invitation-access.ts`                            | Normalize grants, hash bearer, accept atomically, truthful delivery | Legacy compatibility and invitation integrity                          |
| `apps/api/src/modules/invitations/invitations.controller.ts`                       | Normalize grants, hash bearer, accept atomically, truthful delivery | Legacy compatibility and invitation integrity                          |
| `apps/api/src/modules/invitations/invitations.dto.ts`                              | Normalize grants, hash bearer, accept atomically, truthful delivery | Legacy compatibility and invitation integrity                          |
| `apps/api/src/modules/invitations/invitations.service.ts`                          | Normalize grants, hash bearer, accept atomically, truthful delivery | Legacy compatibility and invitation integrity                          |
| `apps/api/src/modules/invitations/processors/invitation-email.processor.spec.ts`   | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/api/src/modules/invitations/processors/invitation-email.processor.ts`        | Normalize grants, hash bearer, accept atomically, truthful delivery | Legacy compatibility and invitation integrity                          |
| `apps/api/src/modules/ui-context/ui-context.service.spec.ts`                       | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/api/src/modules/ui-context/ui-context.service.ts`                            | Server People visibility hint and navigation                        | Scoped ADMIN/OWNER presentation                                        |
| `apps/api/src/modules/users/account-lifecycle.service.ts`                          | Reuse role-transition transaction primitive with bounded options    | Retain last-OWNER locking and session safety                           |
| `apps/api/src/modules/users/owner-quorum.ts`                                       | Reuse role-transition transaction primitive with bounded options    | Retain last-OWNER locking and session safety                           |
| `apps/api/src/modules/users/people.dto.ts`                                         | Scoped safe directory and OWNER access mutation                     | Atomic memberships, role synchronization, quorum and revocation        |
| `apps/api/src/modules/users/people.integration.spec.ts`                            | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/api/src/modules/users/people.service.ts`                                     | Scoped safe directory and OWNER access mutation                     | Atomic memberships, role synchronization, quorum and revocation        |
| `apps/api/src/modules/users/users.controller.ts`                                   | Wire People routes/services                                         | Thin authenticated controllers                                         |
| `apps/api/src/modules/users/users.module.ts`                                       | Wire People routes/services                                         | Thin authenticated controllers                                         |
| `apps/api/src/scripts/__tests__/phase1a.integration.spec.ts`                       | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/api/test/phase5-server.ts`                                                   | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/api/test/queue-decorators.fixture.ts`                                        | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/web/playwright.shell.config.ts`                                              | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `apps/web/src/app/(auth)/invite/[token]/page.tsx`                                  | Invitation acceptance route wiring                                  | Configured Google entry and explicit reauthentication                  |
| `apps/web/src/app/(platform)/people/page.tsx`                                      | People lists, dialogs and lifecycle actions                         | In-ERP onboarding with current server permissions                      |
| `apps/web/src/auth.ts`                                                             | Backend Google eligibility and acceptance presentation              | Verified identity plus explicit onboarding, no frontend allowlist veto |
| `apps/web/src/components/auth/invite-accept-form.tsx`                              | Backend Google eligibility and acceptance presentation              | Verified identity plus explicit onboarding, no frontend allowlist veto |
| `apps/web/src/components/people/access-dialog.tsx`                                 | People lists, dialogs and lifecycle actions                         | In-ERP onboarding with current server permissions                      |
| `apps/web/src/components/people/people-workspace.tsx`                              | People lists, dialogs and lifecycle actions                         | In-ERP onboarding with current server permissions                      |
| `apps/web/src/lib/nav-links.ts`                                                    | Server People visibility hint and navigation                        | Scoped ADMIN/OWNER presentation                                        |
| `apps/web/src/lib/people-api.ts`                                                   | People lists, dialogs and lifecycle actions                         | In-ERP onboarding with current server permissions                      |
| `apps/web/tests/people.spec.ts`                                                    | Focused coverage or fixture adaptation                              | Real scoped authorization, migration and browser regressions           |
| `docs/releases/v1.0.0/ANTARA_ERP_V1_SPEC.md`                                       | Approved follow-up contract, runbook and evidence                   | Document compatibility and deployment implications                     |
| `docs/releases/v1.0.0/PEOPLE_USER_MANAGEMENT.md`                                   | Approved follow-up contract, runbook and evidence                   | Document compatibility and deployment implications                     |
| `docs/releases/v1.0.0/PHASE_2_AUTHENTICATION.md`                                   | Approved follow-up contract, runbook and evidence                   | Document compatibility and deployment implications                     |
| `docs/releases/v1.0.0/V1_RELEASE_CHECKLIST.md`                                     | Approved follow-up contract, runbook and evidence                   | Document compatibility and deployment implications                     |
| `packages/contracts/src/index.ts`                                                  | Typed People/invitation contracts                                   | Shared API/UI shape                                                    |
| `packages/contracts/src/lib/people.ts`                                             | Typed People/invitation contracts                                   | Shared API/UI shape                                                    |
| `packages/contracts/src/lib/ui-context.ts`                                         | Server People visibility hint and navigation                        | Scoped ADMIN/OWNER presentation                                        |
