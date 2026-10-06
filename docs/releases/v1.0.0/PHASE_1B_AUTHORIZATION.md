# Phase 1B — scoped authorization foundation (not activated)

Authority: `ANTARA_ERP_V1_SPEC.md`, `PHASE_1A_FOUNDATION.md`, and the approved Phase 1B instructions. Phase 1A schema/migration are unchanged. No existing feature/root module imports AuthorizationModule. No guard, controller, login/session flow, or production data was changed.

## ActorContext

`loadActorContext(authenticatedUserId, optionalTransaction)` selects only:

- User: `id`, `role`, `isActive`, `deletedAt`;
- memberships: `subsystemId`, `accessLevel` (ordered by subsystem ID).

It returns a frozen context with userId, current role, account status (ACTIVE/INACTIVE/DELETED/UNKNOWN), isActive, deletedAt, memberships, readable/administered subsystem ID arrays, globalAuthority, and roleInconsistency. Unknown actors have null role and no permissions. No password hash, email, refresh token, raw User, or deprecated User.subsystemId is returned or used to decide scope.

There is no actor-context cache. Supply only the verified user ID, never JWT role or subsystem claims. Each new load observes current committed database state; retaining a context across requests would retain stale permissions and is not supported. Transactional callers observe their transaction's visibility rules.

## Scope representation and policy API

Pure policy functions:

- `canReadSubsystem(actor, subsystemId)`
- `canManageSubsystem(actor, subsystemId)`
- `readableSubsystemIds(actor)`
- `administeredSubsystemIds(actor)`
- `classifyDecision(decision)`
- `canReadDecision(actor, decision)`
- `canManageDecision(actor, decision)`
- `canGrantMembership(actor, subsystemId, accessLevel)`
- `canInviteMemberIntoSubsystem(actor, subsystemId)`
- `canGrantGlobalRole(actor, requestedRole)`
- `compatibilityRoleForMemberships(currentRole, memberships)`

The two scope functions deliberately return a discriminated union, not an ambiguous array:

```ts
{ kind: "GLOBAL" }
// or
{ kind: "SCOPED", ids: [] }
```

Only valid OWNER yields GLOBAL. Context ID arrays enumerate explicit membership-derived access; OWNER's independent authority is recorded separately. Do not infer global access from an empty array.

`AuthorizationService.subsystemWhere(actor, "read" | "manage")` converts these scopes into a filter for **Subsystem rows**. A denied/empty scope becomes `{ id: { in: [] } }`, never `{}`. Do not use this ID filter as a Task/Decision filter; future feature integrations must translate scope to their actual subsystem foreign key.

## Matrix

| Actor/state                     | Read subsystem                   | Manage subsystem        | Grant membership                   |
| ------------------------------- | -------------------------------- | ----------------------- | ---------------------------------- |
| Active OWNER                    | Any                              | Any                     | MEMBER or ADMIN                    |
| Active ADMIN                    | Explicit memberships             | Exact ADMIN memberships | MEMBER only in administered scopes |
| Active MEMBER                   | Explicit MEMBER memberships      | Never                   | Never                              |
| ADMIN without ADMIN memberships | Existing MEMBER memberships only | Never                   | Never                              |
| MEMBER with ADMIN membership    | Denied pending reconciliation    | Never                   | Never                              |
| Inactive/deleted/unknown        | Never                            | Never                   | Never                              |

Only active OWNER may grant a global role (including OWNER). This is grant eligibility, not a public role-changing endpoint.

| Decision                      | Read                             | Manage                         |
| ----------------------------- | -------------------------------- | ------------------------------ |
| GLOBAL + OWNER                | Every active authenticated actor | OWNER only                     |
| SUBSYSTEM + OWNER             | OWNER or subsystem member        | OWNER only                     |
| SUBSYSTEM + SUBSYSTEM_ADMIN   | OWNER or subsystem member        | OWNER or exact subsystem ADMIN |
| NULL/partial/invalid metadata | Denied, explicitly UNKNOWN       | Denied, including OWNER        |

Legacy/unknown reads conservatively fail closed as well as mutations: no global/subsystem meaning is inferred. A role-inconsistent but active account may still read a valid GLOBAL/OWNER decision, as required for all active authenticated users; it receives no inferred subsystem authority.

MEMBER_WITH_ADMIN_MEMBERSHIP and ADMIN_WITHOUT_ADMIN_MEMBERSHIP are explicit reconciliation flags. Loading never repairs the database. Multiple administrators of the same subsystem are independent; ADCS authority conveys none in Payload, SDM, Ground-Station & Comms, or Main Satellite.

## Persisted-object checks

`assertDecisionAccess(userId, decisionId, action, optionalTransaction)` reloads the actor and selects only the decision's id/scope/authority/subsystemId. It takes no requested placement overrides. Invalid accounts return UnauthorizedException, missing decisions NotFoundException, denied/legacy decisions ForbiddenException. Database failures propagate.

This service is not yet wired to routes. Later mutation integrations must perform checking and writing with appropriate transaction/locking rules for both actor permission changes and object scope changes. A check returning success is not a permanent capability or a guarantee against a subsequent concurrent object change.

## Transactional compatibility-role helper

`withMembershipRoleSync(targetUserId, mutate)` is a trusted internal service primitive for future authorized membership writes. It:

1. starts a READ COMMITTED transaction;
2. locks the target User row before any membership mutation;
3. rejects missing/inactive/deleted target accounts;
4. runs the caller's mutation in that transaction;
5. rejects callbacks changing the target account state/global role;
6. preserves OWNER, otherwise derives ADMIN iff an ADMIN membership remains;
7. updates role and commits membership changes together, or rolls everything back.

All future membership writers must follow the same target-row locking protocol. This prevents concurrent last-ADMIN removals leaving a stale ADMIN compatibility role. The helper is not an authorization endpoint: callers must authorize the requesting actor/grant, limit mutation to the locked target, and add required audit/session behavior in the later appropriate phase. It must not be used as a mass reconciliation/backfill command. No startup hook invokes it.

## Validation commands

```sh
npm run test:authorization --workspace @antara/api
AUTHORIZATION_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1b_test npm run test:authorization:integration --workspace @antara/api
npm run lint --workspace @antara/api
npm run build --workspace @antara/api
```

Integration tests require an explicit loopback URL and dedicated database name `antara_phase1b_test*`. The dedicated command fails if the URL is absent; the ordinary test suite skips integration tests without it. Tests apply existing migrations in a unique disposable schema, provision canonical subsystem fixtures, and remove only that schema. No production URL, developer dummy credential file, or destructive database reset is used.

Coverage includes all required role/account/membership cases, the five-subsystem matrix, all nullable decision placement combinations, explicit select/privacy checks, stale JWT/current DB differences, revocation on the next actor load, deny-all filters against real rows, decision authority, role promotion/demotion, OWNER preservation, rollback, concurrent removals, and module injection.

Repository note: Phase 1A appeared as existing modified/untracked work in this workspace despite being described as committed. It was preserved unchanged. Only two test scripts were added to its package.json. The authorization module follows the exact six-file requested structure plus one real-PostgreSQL integration test file; no global registration was added.
