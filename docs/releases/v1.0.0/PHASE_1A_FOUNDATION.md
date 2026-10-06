# Phase 1A — additive data foundation

Authority: [ANTARA ERP v1 specification](ANTARA_ERP_V1_SPEC.md), sections 3–6, 19–20 and the owner's Phase 1A amendments (including DecisionAuthority and authenticated global-decision readership).

## Implemented boundary

This phase adds database structures, canonical contracts/provisioning, and read-only migration inventory. It does not activate membership-based authorization or change Google authentication, sessions, task/resource/file/calendar policies, UI context switching, storage, or AI providers.

The five canonical keys are `ADCS`, `PAYLOAD`, `GROUND_COMMS`, `SDM`, and `MAIN_SATELLITE`. The contracts define their approved names/slugs; SDM's description is Sponsorship, Design & Media. A deprecated display-only type preserves existing legacy task labels until reviewed backfill. It is not a canonical catalog or mapping.

## Schema and compatibility

Migration: `20261006000000_phase_1a_foundation`. The two older migrations remain byte-for-byte unchanged.

- `Subsystem.key`: nullable, unique string. Multiple legacy NULLs are permitted; no subsystem identity enum.
- `SubsystemMembership`: `(userId, subsystemId)` primary key, MEMBER/ADMIN access level, timestamps, index `(subsystemId, accessLevel, userId)`, restrictive user/subsystem foreign keys. Several users may be ADMIN of the same subsystem.
- `User.role` and deprecated `User.subsystemId` remain. No role synchronization or membership backfill runs. Later transactional membership administration must maintain ADMIN iff at least one ADMIN membership exists; OWNER remains independent.
- `DecisionRecord.scope` and `.authority`: nullable enums without defaults. Both NULL preserves legacy writers/records. Supplying either requires a complete valid placement.
- Explicit GLOBAL requires NULL subsystem and OWNER authority. Explicit SUBSYSTEM requires a subsystem and OWNER or SUBSYSTEM_ADMIN authority. The SQL CHECK uses `IS TRUE` so SQL NULL/UNKNOWN cannot bypass validation.
- The existing decision FK is replaced with `ON DELETE RESTRICT`, including for legacy rows. This changes deletion behavior, not existing data. It prevents deletion from silently globalizing decisions. No table or column is dropped.

The CHECK is SQL-managed because Prisma does not express it in the schema DSL. Preserve it in future migrations. NULL metadata still requires an explicit reviewed backfill before a later NOT NULL migration. These checks validate placement, not who may edit it; authorization enforcement remains later work.

Intended subsequent policy: GLOBAL is readable by all authenticated ANTARA users and mutable only by OWNER. SUBSYSTEM/OWNER is readable by subsystem members and mutable only by OWNER. SUBSYSTEM/SUBSYSTEM_ADMIN is readable by members and mutable by OWNER or a target ADMIN membership.

## Canonical provisioning

Build shared contracts and generate Prisma before running scripts:

```sh
npm run build --workspace @antara/contracts
npm run prisma:generate --workspace @antara/api
```

On an explicitly configured fresh local installation, apply migrations and then run:

```sh
DATABASE_URL="$LOCAL_DATABASE_URL" DIRECT_URL="$LOCAL_DATABASE_URL" npm run prisma:migrate:deploy --workspace @antara/api
DATABASE_URL="$LOCAL_DATABASE_URL" npm run seed:canonical --workspace @antara/api
```

Provisioning creates exactly five canonical subsystem records on an empty database and is idempotent on a canonical database. It never reads the Google allowlist, creates users, changes roles, assigns OWNER, modifies memberships, or deletes/renames existing subsystems. Any legacy/conflicting subsystem causes the entire provisioning transaction to fail before writes. Even an unkeyed Payload row is not adopted automatically. Existing-data migration is a separate reviewed operation, not ordinary seeding.

## Read-only preflight

Run against an isolated local database/copy, either before or after the additive migration:

```sh
V1_PREFLIGHT_DATABASE_URL="$LOCAL_DATABASE_URL" npm run preflight:v1 --workspace @antara/api
```

The tool requires its own explicit URL, rejects non-loopback database hosts and connection-host overrides, and never falls back to DATABASE_URL or loads a repository .env. It uses REPEATABLE READ plus PostgreSQL-enforced READ ONLY for the complete inventory. It does not seed, backfill, merge, or update rows. Do not point local tooling at a production tunnel.

Output includes subsystem IDs/names/slugs/keys; counts for every discovered incoming subsystem FK; legacy role breakdown; inactive/deleted users; unassigned users; pending invitations; snapshot scope counts and detectable JSON references; exact-name/slug/key candidates marked for review; conflicts and duplicate candidates. It omits passwords, tokens, user emails, and raw snapshot payloads. IDs are retained for review; reports still belong in controlled operator storage.

Example excerpt from the synthetic legacy test fixture:

```json
{
  "mode": "READ_ONLY",
  "transactionReadOnly": true,
  "subsystems": [
    {
      "id": "software",
      "name": "Software",
      "slug": "software",
      "key": null,
      "counts": {
        "User.subsystemId": 2,
        "Task.subsystemId": 1,
        "CalendarEvent.subsystemId": 1,
        "AIInsight.subsystemId": 1,
        "Invitation.subsystemId": 1,
        "DecisionRecord.subsystemId": 1,
        "SubsystemMembership.subsystemId": 0
      },
      "legacyRoleBreakdown": { "OWNER": 0, "ADMIN": 1, "MEMBER": 1 },
      "candidateKeysForReviewOnly": [],
      "requiresOwnerReview": true
    }
  ]
}
```

Snapshot JSON matches are heuristic: no match does not prove no reference. The report reads snapshot payloads to detect references but does not output their content. Inventory cost grows with historical data; the tool uses a 60-second transaction timeout. Review arbitrary audit/JSON references separately before backfill.

## Reviewed mapping manifest

`apps/api/prisma/backfills/v1-subsystem-map.example.json` and its JSON Schema define a DRAFT/REVIEWED format with inventory checksum, OWNER reviewer, review timestamp, explicit legacy ID/target key mappings, rationale, and mandatory membership review. The template has no mappings or approval. There is no apply/execution code in Phase 1A.

Do not infer Software/Avionics/Structures/Thermal placement. Communications/Ground Station consolidation also requires review: combining objects can expand administrator access. A future executor must verify reviewer authorization, inventory freshness, source coverage/uniqueness, and the explicit membership decisions; a JSON file marked REVIEWED is not authorization on its own.

## Local test gate

Use a dedicated PostgreSQL database whose name starts with `antara_phase1a_test`. Never use the gitignored dummy-user file as fixture state.

```sh
PHASE1A_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase1a_test npm run test:phase1a --workspace @antara/api
```

The dedicated command fails without a URL; the general test suite skips database tests if none is supplied. Only loopback connections are accepted. Tests create uniquely named clean/legacy schemas, run actual `prisma migrate deploy`, and remove only their own schemas afterward. They never reset the database. Migration tests use temporary copies of the migration directories to simulate the original two-migration state.

The populated fixture covers all six original direct subsystem FK relations, pending invitations, inactive/deleted/unassigned users, global/subsystem legacy decisions, and historical snapshot scope/JSON. Before/after snapshots verify records and relationships remain identical; additive keys/decision fields remain NULL and memberships remain empty.

Verification covers migration hashes and deploy history, five-only idempotent provisioning/no account effects, legacy seed refusal, multiple admins/mixed roles, duplicate membership and FK failures, all 18 decision placement combinations, restrictive deletion, pre/post-expand read-only inventory, ambiguous mapping refusal, and PostgreSQL rejection of writes in read-only mode.

## Remaining risks and subsequent work

- This is not a completed authorization rollout: existing role-only guards remain.
- Current runtime analytics/UI can consume canonical labels before old data is mapped. Do not describe a legacy deployment as fully migrated after expand-only SQL.
- ADMIN compatibility roles may disagree with the empty/new membership table until reviewed backfill. Do not enable membership-based access prematurely.
- Canonical provisioning now intentionally stops on legacy databases instead of adding groups alongside them.
- Restrictive FKs can reject deletes previously allowed. Preserve history through account deactivation and reviewed subsystem migration.
- Adding constraints/indexes and replacing the decision FK requires database locks; schedule deployment appropriately and review size/lock behavior against a local restored copy before production.
- Reverting application code does not remove additive data. Do not roll back through destructive reset/drop scripts.
- Existing checked-in JS siblings in contracts are stale; Jest now resolves TypeScript first. Runtime packages still require the normal contracts build.

## Verification recorded for this implementation

- Dedicated loopback PostgreSQL cluster, port 55461, database `antara_phase1a_test`; no production connection and no dummy-user file.
- Phase 1A gate: 14 tests passed (8 contract/safety cases, 6 PostgreSQL integration cases, including all 18 decision combinations).
- Focused existing analytics/subsystems/roles/auth/decision-controller regressions: 25 tests passed.
- Contracts and API builds; contracts/API/web lint/typechecks: passed.
- Prisma generate, validate, format, and local migrated-database/schema comparison: passed; no drift detected.
- Prettier check on changed TS/JSON/docs and `git diff --check`: passed.
- Actual migrate-deploy, seed:canonical, and preflight:v1 CLI smoke checks: passed on the isolated local database.
- Existing Jest warning: duplicate BullMQ manual mock under src and generated dist; tests pass. No unrelated cleanup performed.
- Existing migration SHA-256 hashes remain `83d550d1662edac027948bcf48a8a2b15be300ea1f518e187cf374a6e3b5db52` and `ab3b732dd94327c491c711ab9b3a20270cde1aafb80d3ff65010bdf6531ec5c3` respectively.
