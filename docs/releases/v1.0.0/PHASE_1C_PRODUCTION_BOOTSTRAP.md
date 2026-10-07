# Phase 1C — controlled initial v1 bootstrap

Authority: the complete v1 specification and approved Phase 1A/1B/2/3/4A/4B records, with the owner's verified empty-operational-dataset amendment. This supersedes the proposed 7→5 production reconciliation exercise for this particular snapshot. No legacy operational subsystem rows exist to merge. This is an initialization, not a permanent one-user product design.

## Provenance and boundaries

- Approved backup: `antara-prod-20261007-185820.dump`.
- Immutable artifact: `/home/sammo/antara-v1-backups/antara-prod-20261007-185820.dump`.
- Source (operator-confirmed): ANTARA ERP production PostgreSQL / Neon.
- Backup timestamp: `2026-10-07 18:58:44.147922298 +0530` (also verified as file mtime).
- Restore timestamp (operator-confirmed): `2026-10-07T18:58:44+05:30`; status COMPLETE.
- Artifact size: 51,833 bytes.
- SHA-256: `bfd1633ecec62de4914bf259beed0ee69e6e4b140a072ee0923d7f88c9bea902`.
- Local restore: `127.0.0.1:5432`, database `antara_v1_reconciliation`.
- Connection source: explicit `PHASE1C_DATABASE_URL` only; no URL/password is recorded here.

The operator verified production/restored counts before this phase. This phase independently read the local copy; it did not connect to Neon or independently recount production. The operator confirmed this is not a tunnel/proxy/port-forward. The local listener and PostgreSQL `inet_server_addr()` (`127.0.0.1/32`) were inspected; verification transactions reported `transaction_read_only=on`. Client and server loopback checks complement the operator's provenance confirmation; hostname validation alone cannot prove absence of a tunnel.

Only the local restored database was bootstrapped. The original backup was read for metadata/checksum, never restored over or modified. Synthetic tests used a separate cluster on port 55461 and disposable schemas; no synthetic future team accounts were added to the restored copy. No production access, deployment, commit, push, migration change or later-phase implementation occurred.

## Initial and final local state

| Item                                                       | Initial                     | After bootstrap and both reruns |
| ---------------------------------------------------------- | --------------------------- | ------------------------------- |
| Users                                                      | 1                           | 1                               |
| Target ID                                                  | `cmuvhzwq10001d301zl97hox6` | unchanged                       |
| Target name                                                | Saksham Mishra              | unchanged                       |
| Target role                                                | MEMBER                      | OWNER                           |
| Active / deletedAt                                         | true / NULL                 | unchanged                       |
| Legacy subsystemId                                         | NULL                        | unchanged                       |
| Subsystems                                                 | 0                           | exactly 5 canonical records     |
| Memberships                                                | 0                           | 0                               |
| Tasks / decisions / invitations                            | 0 / 0 / 0                   | 0 / 0 / 0                       |
| Sessions                                                   | 1                           | 1 preserved historical row      |
| Target unrevoked sessions                                  | 0                           | 0                               |
| INITIAL_OWNER_BOOTSTRAP audit rows                         | 0                           | 1                               |
| Unmapped subsystems / legacy decisions                     | 0 / 0                       | 0 / 0                           |
| Invalid assignments / role conflicts / pending invitations | 0 / 0 / 0                   | 0 / 0 / 0                       |
| Current database OWNER authority                           | false                       | true, without memberships       |

The restored session was **already revoked** before the rehearsal. Promotion therefore returned `revokedSessions: 0`; it did not fabricate an additional revocation or restore that session. Separate PostgreSQL fixtures prove active-session revocation. The user must authenticate again.

Canonical records:

| Key            | Name                   | Slug           |
| -------------- | ---------------------- | -------------- |
| ADCS           | ADCS                   | adcs           |
| PAYLOAD        | Payload                | payload        |
| GROUND_COMMS   | Ground-Station & Comms | ground-comms   |
| SDM            | SDM                    | sdm            |
| MAIN_SATELLITE | Main Satellite         | main-satellite |

SDM retains the approved Sponsorship, Design & Media description. No sixth group, fake OWNER memberships, account recreation, operational content or ordinary ADMIN role assignment occurs.

## Operator commands and safeguards

From repository root, using the explicitly configured environment variable:

```sh
npm run bootstrap:v1 --workspace @antara/api -- --action verify --mode local --user-id cmuvhzwq10001d301zl97hox6 --ack LOCAL_RESTORE_BOOTSTRAP
npm run bootstrap:v1 --workspace @antara/api -- --action provision --mode local --user-id cmuvhzwq10001d301zl97hox6 --ack LOCAL_RESTORE_BOOTSTRAP
npm run bootstrap:v1-owner --workspace @antara/api -- --mode local --user-id cmuvhzwq10001d301zl97hox6 --ack LOCAL_RESTORE_BOOTSTRAP
npm run bootstrap:v1 --workspace @antara/api -- --action verify --mode local --user-id cmuvhzwq10001d301zl97hox6 --ack LOCAL_RESTORE_BOOTSTRAP
```

These commands use the existing ts-node operator convention and require source checkout, installed dependencies and built contracts/generated Prisma client. They do not initialize Nest's application module or load repository environment configuration. Every action requires explicit mode, target ID, acknowledgement and PHASE1C_DATABASE_URL. Unknown/duplicate/incomplete flags are rejected. Local mode accepts only literal loopback or localhost resolving exclusively to loopback; remote hosts and connection-routing/schema overrides are rejected. Only sslmode is accepted as a URL query option.

The CLI displays mode/action, database host/port/name and target ID before any action. Passwords, usernames, tokens, hashes, emails and raw Prisma exceptions are not logged. Errors exit 1. Read-only verify exits 2 for a valid inspected database that is not yet bootstrap-ready; initial verification returned this expected status. Final verification exits 0. Its `ready` is a **data/authorization-foundation readiness** result, not permission to deploy an otherwise unfinished v1 release. A connection or migration mismatch aborts before provisioning/promotion.

Verification uses REPEATABLE READ / READ ONLY, explicit safe projections, exact migration names/checksums, canonical key/name/slug matching, current Phase 1B actor context, authorized subsystem IDs, assignment validity, compatibility-role conflicts and legacy decision counts. It does not use JWT claims or cache authority. Normal future users, memberships, tasks and valid invitations are not prohibited by readiness checking.

### Canonical provisioning

The operator wrapper reuses the unchanged Phase 1A `provisionCanonicalSubsystems`. Its advisory-locked transaction creates only missing canonical records and leaves existing matching rows unchanged. Unexpected legacy/conflicting rows abort before writes; nothing is deleted or guessed. It never creates users, promotes roles or changes memberships. It remains idempotent after later onboarding.

### Initial OWNER and quorum

`bootstrapInitialOwner` is an operator-only exported helper, not an endpoint, seed or startup hook. The command requires the explicit ID; no first-user/email/allowlist ordering exists. The target ID is not embedded in implementation or ordinary seeds.

It uses the unchanged `withOwnerQuorum` transaction: advisory lock `(1095652434, 1)` before the target User row lock. It selects only ID/role/active/deleted state, rejects absent/inactive/deleted accounts and refuses a new promotion if another active OWNER already exists. Subsequent OWNER grants must use normal authenticated OWNER administration.

In one transaction it sets only the exact target's role, calls Phase 2 `SessionService.revokeAllSessions`, inserts a privileged audit and commits. The quorum wrapper checks the resulting active OWNER count; 0→1 succeeds naturally without weakening removal protection. Competing bootstrap targets serialize on the same quorum lock. Any failed revocation/audit/transaction rolls everything back.

An already-active OWNER target is a no-op: no extra audit, role update or revocation of sessions created after bootstrap. The first invocation revokes all then-unrevoked sessions; rerunning is not a replacement for the normal explicit session-reset operation.

Audit action: `INITIAL_OWNER_BOOTSTRAP`; entity type User; entity ID exact target; payload records `EXPLICIT_OPERATOR_COMMAND`, previous/new role and revoked-session count. The existing AuditLog schema requires a User actor, so actorId is the target with explicit operator provenance in payload. This does **not** claim the target authenticated the operator command; OS/operator identity must be recorded in the external cutover log. No audit schema redesign was introduced.

Provisioning and OWNER promotion are separate atomic commands. If the second fails, the additive canonical catalog may already exist; repair the cause and rerun safely. Neither command performs a migration, backfill or destructive rollback.

## Local rehearsal evidence

The commands above were executed on the supplied local copy. The initial verify reported not ready, then provisioning and promotion succeeded. Both mutation commands were rerun: catalog IDs remained stable, OWNER bootstrap returned `changed:false`, and exactly one bootstrap audit remained. Final current-database authorization yields global OWNER access and five readable subsystems with zero memberships.

The migration identities and checksums were equal before and after:

| Migration                               | SHA-256                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| 20260921000000_init                     | 83d550d1662edac027948bcf48a8a2b15be300ea1f518e187cf374a6e3b5db52 |
| 20261005000000_dummy_seed_marker        | ab3b732dd94327c491c711ab9b3a20270cde1aafb80d3ff65010bdf6531ec5c3 |
| 20261006000000_phase_1a_foundation      | 8df17a3a1c8d9358ca6fb035ea8b6c9ac6d0f97297f72c219d333441ebcda19d |
| 20261007000000_phase_2_session_security | 257086475948fd0cb6c96179188454eafc3c75e6fdcedfa52070864ef3afff92 |

All four rows are finished and not rolled back. No migration was deployed to the restored copy, replayed, marked applied or edited. A deliberately corrupted checksum in an isolated synthetic fixture is rejected.

## Future onboarding

This bootstrap does not restrict future user counts. Normal invitations and verified Google onboarding remain authoritative. OWNER may invite MEMBER or subsystem ADMIN; permitted ADMIN may invite MEMBER only within exact administered scopes. New Google accounts remain limited MEMBER identities until authorized assignment. Invitation acceptance uses real account/membership transactions and Phase 1B compatibility-role synchronization.

Post-bootstrap synthetic integration tests use the actual InvitationsService to establish MEMBER in ADCS, multiple MEMBER memberships, ADMIN in Payload plus ADCS, MEMBER in Main Satellite on that same ADMIN account, and two ADMINs in ADCS. Removing final ADMIN memberships through the synchronization primitive derives MEMBER. OWNER stays global without memberships. Reprovisioning preserves all these legitimate accounts and memberships. No production-restored fixture was populated with these users.

## Validation

- New CLI safety and PostgreSQL bootstrap/onboarding tests cover missing explicit arguments/URL, remote and override rejection, production acknowledgement, no secret identity display, account validity, exact targeting, session/audit behavior, transaction rollback, initial-OWNER concurrency, no-op rerun, quorum protection, catalog conflict/idempotency, migration mismatch and future onboarding.
- Full API gate includes Phase 1A, 1B, 2/2.1, 3, 4A and 4B, including existing OWNER-global HTTP route and session regressions.
- Real restored-copy inspection/rehearsal uses only PHASE1C_DATABASE_URL. No live Google, Neon, Redis, email or storage service is exercised.

Commands:

```sh
PHASE1C_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1c_test npm run test:bootstrap --workspace @antara/api

PHASE1C_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1c_test \
PHASE1A_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1a_test \
AUTHORIZATION_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1b_test \
AUTH_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase2_test \
PRIVACY_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase3_test \
CORE_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase4a_test \
REMAINING_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase4b_test \
npm run test --workspace @antara/api

npm run lint --workspace @antara/api
npm run build --workspace @antara/api
npm run lint --workspace @antara/web
git diff --check
```

Final results: **585 tests passed in 34 suites, none skipped**: all 559 prior tests plus 26 Phase 1C cases (12 CLI safety units and 14 PostgreSQL integration cases). API lint/typecheck, API build/postbuild, web typecheck, focused Prettier and `git diff --check` passed. The initial test-only argument-table typing error was corrected before the passing gate. The existing duplicate generated/source BullMQ mock warning remains. No web source changed, so no additional web build/browser E2E was run. No new schema/client generation is needed. Prior Phase 4B workspace changes were preserved.

Final local verification exited 0 with `ready:true`, `globalAuthority:true` and exactly five authorized subsystem IDs. The backup SHA-256 remained unchanged after rehearsal. The local account was not logged in through the UI and no new real-account session was minted; OWNER route compatibility is established by current database policy verification and the passing isolated Phase 4 HTTP regression suites.

## Future production cutover — DOCUMENTED ONLY, NOT EXECUTED

1. Obtain explicit release/operator approval, confirm a current immutable backup and restore rehearsal, and record its checksum. The current snapshot approval is not permission to access production in this task.
2. Enter the maintenance window and stop incompatible old API/background writers. Do not allow concurrent direct SQL, old onboarding or lifecycle writers during bootstrap.
3. Use the reviewed source checkout/operator environment. Supply PHASE1C_DATABASE_URL explicitly from approved secret management; do not paste a password into logs or this document. Verify displayed host/database/user target against the approved cutover ticket.
4. Run the production-mode **read-only** verification below. Exit 2 is expected only for the known uninitialized baseline; exit 1 or migration mismatch is a hard stop. Review current counts for drift. The four approved migrations are already applied: do not replay or mark them. Phase 1C introduces no pending migration. Any future pending migration requires separate review before this tool can proceed; do not ignore checksum mismatch.
5. Run explicit catalog provisioning, then explicit initial OWNER bootstrap. Inspect each result before the next step.
6. Verify global OWNER, canonical catalog, session revocation and bootstrap audit. No future users should be manually inserted with SQL.
7. Deploy the compatible reviewed API/web release through its separately approved deployment process. Keep incompatible writers stopped until replacement is ready.
8. Sign in again and smoke-test OWNER-global routes, all five subsystems, no membership requirement for OWNER, and ordinary session behavior.
9. Begin normal invitation/verified-Google member/admin onboarding only after release smoke tests pass.

Exact operator commands (PHASE1C_DATABASE_URL supplied securely beforehand):

```sh
npm run bootstrap:v1 --workspace @antara/api -- --action verify --mode production --user-id cmuvhzwq10001d301zl97hox6 --ack PRODUCTION_BOOTSTRAP
npm run bootstrap:v1 --workspace @antara/api -- --action provision --mode production --user-id cmuvhzwq10001d301zl97hox6 --ack PRODUCTION_BOOTSTRAP
npm run bootstrap:v1-owner --workspace @antara/api -- --mode production --user-id cmuvhzwq10001d301zl97hox6 --ack PRODUCTION_BOOTSTRAP
npm run bootstrap:v1 --workspace @antara/api -- --action verify --mode production --user-id cmuvhzwq10001d301zl97hox6 --ack PRODUCTION_BOOTSTRAP
```

Production mode is deliberately separate, permits an explicitly configured remote PostgreSQL target, and requires PRODUCTION_BOOTSTRAP on every action. Its parsing is unit-tested; no production command was executed. Deployment commands are intentionally not invented here: deployment remains a separate release operation.

## Rollback and remaining release blockers

Canonical creation is additive; retain it after a failed later step. OWNER bootstrap is a privilege transition; revoked credentials must never be resurrected, and plaintext refresh credentials must never be restored into the new architecture. Do not roll back to old role-only authorization after membership-based code is deployed. Use a compatible fix-forward release; approved backup restoration is the disaster-recovery boundary for a catastrophic cutover, followed by the normal secure migration/session invalidation process. No destructive rollback script exists.

The local snapshot requires no legacy 7→5 operational merge, decision backfill, assignment cleanup or invitation reconciliation. This conclusion applies to this verified snapshot only; rerun verification and review drift before production cutover. Production itself is unchanged and still needs the explicitly approved bootstrap/cutover. Phase 5 and later product/release gates remain outstanding; this does not certify a final v1 release. Browser/live identity/storage/provider smoke tests remain future release work. Meeting schedule configuration and later provider/AI work remain outside Phase 1C.

## Exact files for this phase

- `apps/api/package.json` — three explicit bootstrap/testing scripts.
- `apps/api/src/scripts/bootstrap-v1.ts` — operator CLI.
- `apps/api/src/scripts/v1-bootstrap-safety.ts` — explicit argument/URL/mode validation.
- `apps/api/src/scripts/v1-owner-bootstrap.ts` — atomic first OWNER operation.
- `apps/api/src/scripts/v1-bootstrap-verification.ts` — read-only migration/readiness verifier.
- `apps/api/src/scripts/__tests__/phase1c.spec.ts` — safety units.
- `apps/api/src/scripts/__tests__/phase1c.integration.spec.ts` — isolated PostgreSQL/bootstrap/onboarding tests.
- `docs/releases/v1.0.0/PHASE_1C_PRODUCTION_BOOTSTRAP.md` — provenance, evidence and runbook.

No approved migration, provisioner, policy, session, lifecycle or feature-controller implementation was changed. Deviations are limited to using the existing target-user AuditLog actor field with explicit operator provenance, and observing that the restored session was already revoked. The command naming follows existing API-workspace ts-node conventions.
