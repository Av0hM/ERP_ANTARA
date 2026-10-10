# Phase 2 — authentication and account security

Authority: the frozen v1 specification, Phase 1A/1B foundations, and the Phase 2 task amendments.

## Execution plan and implemented boundary

1. Disable public registration; verify Google ID tokens on the backend and enforce its explicit email allowlist. Both providers issue the same projected user/session response.
2. Add a session cutover migration: revoke existing sessions, remove plaintext refresh credentials, and store SHA-256 digests of new cryptographically random refresh credentials. Serialize issuance, rotation, revocation and account changes on the User row. Use current account/session state for authenticated requests.
3. Authorize invitations with Phase 1B policy at creation and acceptance. Accept invitations and synchronize memberships/compatibility roles in one transaction. Protect existing account credentials; add OWNER-only global privilege and activation lifecycle operations with transactional revocation/audit.
4. Verify the security matrix with offline verifier/unit tests and isolated PostgreSQL integration tests, clean/populated migrations, Phase 1 regressions, formatting, typechecks and builds.

No production access, deployment, commits, pushes, subsystem backfill, feature-wide scope migration, storage/AI changes, or UI shell work were performed. Existing Phase 1 work was already modified/untracked in this workspace; it was preserved. Its original three migration files are byte-for-byte unchanged.

## Architecture and safe responses

`POST /auth/register` always returns 403, with or without a supplied role. The retained public registration DTO has no role field. There is no public account-creation fallback.

Credentials login normalizes email, checks bcrypt credentials, active/deleted status and local dummy rules, then reloads and locks the account before issuing a session. Dummy-seeded accounts are denied in production for login, refresh and access-session validation regardless of development allowlist settings. The local allowlist/file/seed tooling itself remains unchanged and its production-disable regression still passes.

Both providers return `{ user: { id, email, name, role }, accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt }`. Auth projections select only necessary account fields and, for credential comparison only, passwordHash. Responses explicitly reconstruct the four-field user DTO; neither password hashes nor refresh digests are serialized. `/auth/me` uses the same safe projection. Privilege/lifecycle responses are projected too. Broad serialization cleanup of unrelated feature APIs remains Phase 3.

Passport JWT validation now identifies a session with signed `id`/`sid` claims and reads its current database account/role/validity. JWT role claims are not authoritative. Collaboration connection authentication and incoming authenticated messages use the same session primitive. This changes account/session authentication, not task/subsystem object authorization. RolesGuard remains the coarse compatibility gate.

## Google verification

NextAuth forwards `account.id_token` to `POST /auth/google-callback` as `{ idToken }`. Plain email/name payloads fail DTO validation. The API uses pinned `google-auth-library@10.5.0` and `OAuth2Client.verifyIdToken`, following [Google's supported verification flow](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

The verifier checks signature, audience, issuer and expiry. The adapter additionally requires the configured audience, accepted issuer, an unexpired token, nonempty subject, boolean `email_verified=true` and a valid email claim. Email/name/avatar are derived only from verified claims. The backend's `GOOGLE_ALLOWED_EMAILS` is mandatory in practice: empty/unset denies all Google login. `GOOGLE_CLIENT_ID` must be configured on the API and match the web OAuth client. Frontend allowlist checks remain UX only.

Existing active users retain their database role and memberships. New allowlisted identities become active MEMBER with no memberships, no legacy subsystem assignment and no password. OWNER is never inferred. Inactive/deleted users are not reactivated. NextAuth keeps the backend identity/tokens and rejects incomplete session responses instead of inventing a MEMBER role or expiry.

Tests mock Google's certificate-fetch boundary and exercise real RSA signature/claim verification offline, plus mock the verifier result at the application integration boundary. Live Google sign-in/provider configuration was not exercised.

## Invitations and privilege transitions

Invitation create/revoke/accept operations load current Phase 1B actor context. OWNER may invite OWNER, subsystem ADMIN or MEMBER (including an unassigned MEMBER). ADMIN may invite MEMBER only in an exact administered subsystem; MEMBER cannot invite. ADMIN invitations require subsystem placement. Lists/revocation are scoped too, and lists no longer expose invitation bearer tokens.

Acceptance locks the invitation and relevant accounts, rechecks expiry/status and the inviter's current authority, then commits account creation/update, membership, compatibility role synchronization, session revocation, invitation consumption and audit together. No acceptance uses a caller-provided placement/role. Concurrent acceptance has one winner. Failed operations roll back everything. MEMBER invitations never downgrade an existing ADMIN membership or OWNER role.

- New credentials users: public `POST /invitations/accept` takes token/name/password.
- Existing credentials users: the same route requires their current password, preserves name/password, and applies only the invitation's authorized grant.
- Existing authenticated users, including Google-only accounts: `POST /invitations/accept-existing` takes only token; JwtAuthGuard supplies the actor ID and the service requires the invited account to match it. It never sets a password. The invitation form uses this route when signed in as the invited account, then signs out for reauthentication with updated access.

Phase 1B's `withMembershipRoleSync` now optionally accepts an existing transaction so invitation acceptance can reuse its locking, validation and synchronization atomically. Its policy is unchanged. No reconciliation/backfill runs.

`PATCH /users/:id/role` is OWNER-only and accepts OWNER or MEMBER. OWNER means explicit global promotion; MEMBER means remove global OWNER authority and derive compatibility ADMIN/MEMBER from memberships. Direct ADMIN assignment is rejected; use an OWNER-created ADMIN membership invitation. Memberships are preserved. Every role operation revokes sessions and records an audit event transactionally.

## Sessions, lifecycle and revocation

New refresh credentials are 32 cryptographically random bytes encoded as hex, stored only as SHA-256 digests. They are opaque credentials, not JWTs. Access JWTs expire in 15 minutes; refresh sessions expire seven days after issuance/rotation.

Refresh finds the digest, locks the account, re-reads the session after the lock, validates current account/session expiry/revocation, and atomically replaces the digest. Concurrent use has exactly one winner; old credentials cannot refresh again. No plaintext legacy-token fallback exists. Existing access tokens from that session remain subject to their short expiry and current database validity.

`SessionService.revokeAllSessions(userId, optionalTransaction)` is reusable for lifecycle, security reset and future membership writers. Its User-row lock coordinates with issuance/rotation. `SessionService.issue` is a trusted internal primitive: callers must hold the account lock and validate current account state, as both providers do.

OWNER-only routes:

- `PATCH /users/:id/deactivate`: sets isActive=false, preserves deletedAt and all historical authorship, revokes every active session, audits atomically.
- `PATCH /users/:id/reactivate`: rejects deleted accounts, reactivates and revokes sessions without restoring old credentials.
- `PATCH /users/:id/revoke-sessions`: explicit security reset of all sessions, with audit.

Logout revokes its backend session. NextAuth sign-out calls the backend logout path. Revoked sessions fail refresh and subsequent authenticated HTTP/WS evaluations. Already connected sockets are not proactively disconnected or removed from all broadcast recipients by a cross-process revocation bus; stream/object scoping is still later work.

## Migration and deployment implications

New migration: `20261007000000_phase_2_session_security`.

Within one SQL transaction it:

1. adds nullable, uniquely indexed `Session.refreshTokenHash`;
2. sets revokedAt on every previously active session, preserving earlier revocation timestamps;
3. drops the plaintext `Session.refreshToken` column and its old unique index;
4. adds a SQL CHECK permitting only 64-character lowercase hex digests, or NULL for already-revoked historical sessions.

Session history, user IDs/roles/memberships and authored data are retained. NULL digests are never authentication credentials. Prisma cannot express this SQL CHECK; preserve it in future migrations.

**Controlled cutover required: all existing refresh sessions and old sessionless access JWTs become invalid. Every user must sign in again.** Coordinate API/web rollout; stop old API session writers before applying the migration. The old API cannot run against this schema afterward. Do not attempt a mixed-version refresh fallback or restore plaintext credentials to roll back. Take an approved backup and use the reviewed deployment process; no production migration was run here.

Configure backend Google client ID and allowlist before enabling Google sign-in. JWT_REFRESH_SECRET remains in existing boot configuration but is no longer used to mint/verify refresh credentials; configuration cleanup belongs to the later deployment phase. Fresh canonical provisioning still creates no accounts: initial OWNER provisioning requires an explicitly reviewed operator process.

## Rate limiting

Auth and invitation controllers use the already-installed Nest ThrottlerGuard at 20 requests per 60 seconds per IP/handler for login, Google callback and public invitation acceptance. Phase 2.1 replaces refresh's shared-IP bucket with the dedicated limits documented below. Other endpoints retain the existing general middleware limit. HTTP tests exercise both layers.

Counters are process-local. Refresh credentials/sessions behind NextAuth's shared source IP have independent small buckets. Multiple API replicas would require shared state and coordinated keyed identifiers before scale-out. No untrusted forwarded-IP header is made authoritative.

## Validation evidence

All database tests used the dedicated local cluster on loopback port 55461 and explicit test database URLs. They create/drop only unique fixture schemas. Neither the repository .env database URL nor the developer's dummy-user file was used as test state.

| Gate                                                       | Command                                                                                                                                                                                                                                                           | Result                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Prisma client                                              | `npm run prisma:generate --workspace @antara/api`                                                                                                                                                                                                                 | Passed                                                                     |
| Prisma formatting                                          | `node_modules/.bin/prisma format --schema apps/api/prisma/schema.prisma`                                                                                                                                                                                          | Passed                                                                     |
| Schema validation                                          | `DATABASE_URL=<local> DIRECT_URL=<local> node_modules/.bin/prisma validate --schema apps/api/prisma/schema.prisma`                                                                                                                                                | Passed                                                                     |
| Auth units/dummy/Google/invitation/WS guard                | `npm run test:auth --workspace @antara/api`                                                                                                                                                                                                                       | 47 passed                                                                  |
| Auth PostgreSQL + HTTP + migrations                        | `AUTH_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase2_test npm run test:auth:integration --workspace @antara/api`                                                                                                                            | 36 passed                                                                  |
| Phase 1A                                                   | `PHASE1A_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1a_test npm run test:phase1a --workspace @antara/api`                                                                                                                                 | 14 passed                                                                  |
| Phase 1B units                                             | `npm run test:authorization --workspace @antara/api`                                                                                                                                                                                                              | 196 passed                                                                 |
| Phase 1B PostgreSQL                                        | `AUTHORIZATION_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1b_test npm run test:authorization:integration --workspace @antara/api`                                                                                                         | 7 passed                                                                   |
| Existing analytics/RBAC/decision/collaboration regressions | `npm run test --workspace @antara/api -- --runTestsByPath src/modules/analytics/analytics.service.spec.ts src/common/guards/roles.guard.spec.ts src/modules/decisions/decisions.controller.spec.ts src/modules/tasks/gateways/task-collaboration.gateway.spec.ts` | 28 passed                                                                  |
| API lint/typecheck                                         | `npm run lint --workspace @antara/api`                                                                                                                                                                                                                            | Passed                                                                     |
| API build                                                  | `npm run build --workspace @antara/api`                                                                                                                                                                                                                           | Passed, including postbuild                                                |
| Web lint/typecheck                                         | `npm run lint --workspace @antara/web`                                                                                                                                                                                                                            | Passed                                                                     |
| Web exchange tests                                         | `node_modules/.bin/playwright test --config /tmp/antara-phase2-web-tests.config.ts`                                                                                                                                                                               | 7 passed; isolated backend-auth.spec.ts, no web server or browser required |
| Formatting                                                 | Prettier write/check on the exact Phase 2 TS/JSON/Markdown file list                                                                                                                                                                                              | Passed                                                                     |
| Whitespace                                                 | `git diff --check`                                                                                                                                                                                                                                                | Passed                                                                     |

Total: 335 passing tests across these non-overlapping gates. Initial strict fixture typing errors were corrected before the passing runs. Existing Jest warning about duplicate BullMQ manual mocks in src/generated dist remains; no unrelated cleanup was performed. No full browser OAuth/onboarding E2E or production web build was claimed.

The PostgreSQL gate applies the original three migrations, inserts legacy users/audit and active/revoked plaintext sessions, applies the new migration, and verifies revocation/scrubbing/history preservation. A separate empty schema runs the entire four-migration chain and verifies migration history/no account creation. Original migration SHA-256 hashes are pinned. Integration tests also prove transaction rollback, concurrent refresh/acceptance, deactivation races, current DB role/session checks, and unchanged historical tasks/comments/files/decisions.

## Remaining risks and deliberate choices

- This is not the v1-wide authorization rollout. Unrelated task/resource/file/calendar/analytics endpoints retain their current compatibility behavior. A Google MEMBER has no new memberships, but complete isolation of feature data still depends on later endpoint integration.
- Legacy global ADMIN accounts without memberships can no longer issue invitations. Pending legacy invitations are honored only if their inviter's current membership policy permits the original grant; no legacy mapping is guessed.
- Existing credentials invitations require the current password; Google-only accounts use authenticated acceptance. This avoids account takeover/password reset by an inviter.
- Refresh rotation deliberately has no replay grace period. Concurrent refresh requests from multiple NextAuth requests/tabs have one winner and may force reauthentication for a losing request. Distributed frontend refresh coordination is not implemented.
- Invitation email queue delivery happens after DB creation, using the existing queue/retry mechanism. A queue outage can leave a pending invitation without delivered mail; there is no new transactional outbox.
- Google-provider connectivity/configuration, full browser interaction, distributed rate limits and proactive live-socket disconnects still require release/deployment verification.
- Phase 2.1 enforces the last-active-OWNER invariant for normal lifecycle/role operations. Direct SQL and future writers must follow the documented quorum protocol. No automatic OWNER bootstrap or repair of an already ownerless database was added.
- Third-party Google-account email ownership follows the requested verified-email/explicit-allowlist model. Google recommends an additional challenge for non-Gmail/non-Workspace email ownership; provider-subject binding/account-linking policy is not introduced here.

## Exact Phase 2 file inventory

Created:

```text
apps/api/prisma/migrations/20261007000000_phase_2_session_security/migration.sql
apps/api/src/common/sessions/session.module.ts
apps/api/src/common/sessions/session.service.ts
apps/api/src/modules/auth/auth.integration.spec.ts
apps/api/src/modules/auth/dto/google-callback.dto.ts
apps/api/src/modules/auth/google-identity.service.ts
apps/api/src/modules/auth/google-identity.service.spec.ts
apps/api/src/modules/invitations/invitation.policy.ts
apps/api/src/modules/invitations/invitations.dto.ts
apps/api/src/modules/users/account-lifecycle.service.ts
docs/releases/v1.0.0/PHASE_2_AUTHENTICATION.md
```

Changed (relative to the workspace at the start of Phase 2):

```text
apps/api/package.json
package-lock.json
apps/api/prisma/schema.prisma
apps/api/src/common/authorization/authorization.service.ts
apps/api/src/modules/auth/auth.controller.ts
apps/api/src/modules/auth/auth.module.ts
apps/api/src/modules/auth/auth.service.ts
apps/api/src/modules/auth/auth.service.spec.ts
apps/api/src/modules/auth/dto/register.dto.ts
apps/api/src/modules/auth/strategies/jwt.strategy.ts
apps/api/src/modules/auth/guards/ws-jwt-auth.guard.ts
apps/api/src/modules/auth/guards/ws-jwt-auth.guard.spec.ts
apps/api/src/modules/invitations/invitations.controller.ts
apps/api/src/modules/invitations/invitations.module.ts
apps/api/src/modules/invitations/invitations.service.ts
apps/api/src/modules/invitations/invitations.service.spec.ts
apps/api/src/modules/users/users.controller.ts
apps/api/src/modules/users/users.module.ts
apps/api/src/modules/users/users.service.ts
apps/api/src/modules/tasks/tasks.module.ts
apps/api/src/modules/tasks/gateways/task-collaboration.gateway.ts
apps/api/src/modules/tasks/gateways/task-collaboration.gateway.spec.ts
apps/web/src/auth.ts
apps/web/src/lib/backend-auth.ts
apps/web/src/components/auth/invite-accept-form.tsx
apps/web/tests/backend-auth.spec.ts
```

The task gateway/module changes only wire current session authentication; they do not migrate task object authorization. The invitation-form change is onboarding only, not UI shell work. One direct Google verification dependency was added; no existing dependency versions were upgraded. Shared contracts were not changed by Phase 2, so their pre-existing built artifacts were used and no contracts rebuild was necessary.

## Phase 2.1 — OWNER quorum and proxy-safe refresh throttling

This patch addresses only the two Phase 2 review blockers. No schema/migration, frontend, dependency version, production configuration or Phase 3 feature changes are introduced.

### Last-active-OWNER invariant

`withOwnerQuorum(prisma, operation)` wraps operations that can remove active OWNER authority. An active OWNER is exactly `role=OWNER AND isActive=true AND deletedAt IS NULL`. `AccountLifecycleService.updateRole` and `setActive` run inside this wrapper, covering demotion/deactivation and preserving promotion/reactivation behavior. There is no existing public delete endpoint. The internal wrapper also protects future soft-delete/bulk-removal operations when used according to its contract; tests exercise those internal paths.

The wrapper starts an explicit PostgreSQL READ COMMITTED transaction, acquires `pg_advisory_xact_lock(1095652434, 1)` **before all User row locks and mutations**, runs the operation, and checks that at least one active OWNER remains before commit. A zero count throws HTTP **409**, code **LAST_ACTIVE_OWNER**, with message “At least one active, non-deleted OWNER must remain”. All role/account updates, session revocation and audit inserts roll back together. It is an explicit failure, never a silent no-op.

[PostgreSQL transaction advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS) last through commit/rollback. Competing removals use the same database-wide application lock, so only one removal transaction evaluates its final state at a time. READ COMMITTED gives the waiting transaction a fresh snapshot after its predecessor commits. This protects concurrent self-demotions/deactivations of the final two owners even though their User-row locks are disjoint.

**Mandatory future-writer protocol:** acquire the quorum advisory lock first, then the existing sorted User-row locks; make all account/session/audit writes in the supplied transaction; propagate failures; do not nest this wrapper inside another transaction or acquire the advisory lock after User locks. All removal paths, including future deletion/security administration, must use it. Additive OWNER grants do not need this lock because they cannot reduce quorum. The existing membership helper preserves OWNER and rejects callback role/account changes. Session-only revocation does not remove OWNER authority.

This is an application transactional invariant, not a database trigger. Direct SQL and older application binaries can bypass it. Replace all old lifecycle writers during release; do not assume this repairs a database already lacking an active OWNER. Initial OWNER bootstrap remains separately controlled.

### Refresh limiter

`RefreshThrottleGuard` uses the existing replaceable Nest `ThrottlerStorage` adapter with process-local state for the single-API-instance v1 deployment:

| Endpoint / dimension                                        | Limit                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| Login / Google callback / public invitation acceptance      | Unchanged: 20 attempts / 60 seconds / source IP / handler |
| Refresh, same well-formed credential                        | 20 attempts / 60 seconds                                  |
| Refresh, stable database session across credential rotation | 60 attempts / 60 seconds                                  |
| Refresh, malformed credentials                              | 20 attempts / 60 seconds / source IP                      |
| Refresh, all attempts from one source IP                    | 3,000 attempts / 60 seconds, before database lookup       |

Refresh alone skips the generic controller IP bucket. The exact POST `/api/auth/refresh` route (including trailing slash/case variants accepted by the router) also bypasses the older 100-per-15-minute general middleware bucket, so that bucket cannot reintroduce proxy-wide refresh starvation. Its dedicated guard remains mandatory. Other routes and methods retain the previous general middleware protection.

The credential bucket runs before a minimal session-ID lookup using the credential's SHA-256 digest. If a session exists, a stable session bucket prevents rotation from resetting the limit. This lookup grants no authentication: the existing session service still validates expiry, revocation/account validity and atomically rotates the credential. Unknown random-credential floods remain bounded by the larger source limit. Blocked requests receive 429 and Retry-After; credentials are never included in responses or logs by the limiter.

All storage keys use domain-separated HMAC-SHA-256 identifiers with a random per-guard process-lifetime secret. Neither raw refresh credentials nor their database digests become cache keys. The guard does not log them. Later distributed throttling can replace the storage adapter and provide a coordinated HMAC secret; that is deliberately not added for v1.

**Proxy assumption:** use Express `req.ip` under the existing trust-proxy configuration. Do not parse or trust arbitrary X-Forwarded-For headers. The larger source bucket is an intentional flood bound, not an unlimited proxy exemption. A restart resets counters; distributed floods or scale-out require deployment-level protection/shared state later.

### Phase 2.1 validation

Commands run on dedicated loopback PostgreSQL only:

```sh
npm run test:auth --workspace @antara/api
AUTH_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase2_test npm run test:auth:integration --workspace @antara/api
npm run test:authorization --workspace @antara/api
AUTHORIZATION_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1b_test npm run test:authorization:integration --workspace @antara/api
npm run lint --workspace @antara/api
npm run build --workspace @antara/api
```

Results: **53 auth unit tests, 56 PostgreSQL/HTTP auth tests, 196 Phase 1 authorization unit tests and 7 Phase 1 PostgreSQL tests passed (312 total)**. API lint/typecheck and build (including postbuild) passed.

Focused Prettier write/check and `git diff --check` passed. Web typecheck is not required for this patch because no web files changed. Existing Phase 2 migration/rotation/concurrency tests remain in the gate. No production, deploy, commit or push was performed.

Added coverage: sole OWNER demotion/deactivation/internal soft deletion, inactive/deleted OWNER exclusion, two-owner successful transitions, all concurrent demotion/deactivation combinations, deterministic PostgreSQL lock waiting, transactional account/session/audit rollback, preserved promotion/reactivation/session behavior, independent proxy refresh sessions, unchanged login/Google/invitation HTTP protection, credential/session/flood limits, opaque limiter state, expiry recovery and forwarded-header spoof resistance. HTTP tests install the actual general middleware and prove **125 valid sessions across 25 users** succeed behind one source IP.

Exact Phase 2.1 file inventory:

```text
apps/api/package.json
apps/api/src/common/middleware/rate-limiting.middleware.ts
apps/api/src/modules/auth/auth.controller.ts
apps/api/src/modules/auth/auth.module.ts
apps/api/src/modules/auth/auth.integration.spec.ts
apps/api/src/modules/auth/refresh-throttle.guard.ts                 (new)
apps/api/src/modules/auth/refresh-throttle.guard.spec.ts            (new)
apps/api/src/modules/users/account-lifecycle.service.ts
apps/api/src/modules/users/owner-quorum.ts                          (new)
docs/releases/v1.0.0/PHASE_2_AUTHENTICATION.md
```

## Approved People management follow-up

[People management and invitation onboarding](./PEOPLE_USER_MANAGEMENT.md) records the approved seventh migration, scoped People UI, multi-subsystem grants, hashed new invitation tokens, and pending Google onboarding state. Its backend eligibility matrix supersedes the earlier allowlist-only Google policy; normal existing active accounts and eligible invitations no longer require routine environment allowlist edits. Deploy matching API/web/worker code with the migration, and complete the documented live OAuth/email smoke checks. Existing quorum, session and object authorization remain authoritative.
