import { Prisma, PrismaClient } from "@prisma/client";
import { canonicalSubsystems } from "@antara/contracts";

type SubsystemRow = {
  id: string;
  name: string;
  slug: string;
  key: string | null;
};
type ForeignKey = {
  table: string;
  column: string;
  constraint: string;
  onDelete: string;
};
const identifier = (value: string) =>
  Prisma.raw(`"${value.replace(/"/g, '""')}"`);
const normalize = (value: string) => value.trim().toLowerCase();

/** Executes all reads within a PostgreSQL-enforced, consistent read-only transaction.
 * Raw projections deliberately work both before and after the additive migration.
 */
export async function inventoryV1(prisma: PrismaClient) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
      const transaction = await tx.$queryRaw<
        Array<{ readOnly: string }>
      >`SELECT current_setting('transaction_read_only') AS "readOnly"`;
      const subsystems = await tx.$queryRaw<SubsystemRow[]>`
      SELECT id, name, slug, to_jsonb(s)->>'key' AS key FROM "Subsystem" s ORDER BY id`;
      // Inventory ALL actual incoming FKs, including memberships added by this phase.
      const foreignKeys = await tx.$queryRaw<ForeignKey[]>`
      SELECT child.relname AS "table", attr.attname AS "column", c.conname AS "constraint", c.confdeltype::text AS "onDelete"
      FROM pg_constraint c
      JOIN pg_class parent ON parent.oid = c.confrelid
      JOIN pg_namespace ns ON ns.oid = parent.relnamespace
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_attribute attr ON attr.attrelid = child.oid AND attr.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND parent.relname = 'Subsystem' AND ns.nspname = current_schema()
      ORDER BY child.relname, c.conname`;
      const relationCounts: Record<string, Record<string, number>> = {};
      for (const fk of foreignKeys) {
        const rows = await tx.$queryRaw<
          Array<{ subsystemId: string; count: number }>
        >(Prisma.sql`
        SELECT ${identifier(fk.column)} AS "subsystemId", COUNT(*)::int AS count
        FROM ${identifier(fk.table)} WHERE ${identifier(fk.column)} IS NOT NULL GROUP BY ${identifier(fk.column)}`);
        relationCounts[`${fk.table}.${fk.column}`] = Object.fromEntries(
          rows.map((row) => [row.subsystemId, row.count]),
        );
      }
      const users = await tx.$queryRaw<
        Array<{
          id: string;
          role: string;
          subsystemId: string | null;
          isActive: boolean;
          deletedAt: Date | null;
        }>
      >`
      SELECT id, role::text, "subsystemId", "isActive", "deletedAt" FROM "User" ORDER BY id`;
      const pendingInvitations = await tx.$queryRaw<
        Array<{
          id: string;
          role: string;
          subsystemId: string | null;
          invitedById: string;
          expiresAt: Date;
        }>
      >`
      SELECT id, role::text, "subsystemId", "invitedById", "expiresAt" FROM "Invitation" WHERE status = 'PENDING' ORDER BY id`;
      const snapshotScopes = await tx.$queryRaw<
        Array<{ scope: string; count: number }>
      >`
      SELECT scope, COUNT(*)::int AS count FROM "AnalyticsSnapshot" GROUP BY scope ORDER BY scope`;
      const snapshots = await tx.$queryRaw<
        Array<{ id: string; scope: string; payload: Prisma.JsonValue }>
      >`
      SELECT id, scope, payload FROM "AnalyticsSnapshot" ORDER BY id`;
      const snapshotReferences = snapshots.flatMap((snapshot) => {
        const serialized = JSON.stringify(snapshot.payload);
        const matches = subsystems.filter(
          (subsystem) =>
            snapshot.scope === `SUBSYSTEM:${subsystem.id}` ||
            [subsystem.id, subsystem.name, subsystem.slug].some((value) =>
              serialized.includes(JSON.stringify(value)),
            ),
        );
        return matches.length
          ? [
              {
                id: snapshot.id,
                scope: snapshot.scope,
                possibleSubsystemIds: matches.map(({ id }) => id),
              },
            ]
          : [];
      });
      const records = subsystems.map((subsystem) => {
        const legacyUsers = users.filter(
          (user) => user.subsystemId === subsystem.id,
        );
        const candidates = canonicalSubsystems
          .filter(
            (canonical) =>
              (subsystem.key !== null && subsystem.key === canonical.key) ||
              normalize(subsystem.name) === normalize(canonical.name) ||
              normalize(subsystem.slug) === canonical.slug,
          )
          .map(({ key }) => key);
        return {
          ...subsystem,
          counts: Object.fromEntries(
            foreignKeys.map((fk) => {
              const relation = `${fk.table}.${fk.column}`;
              return [relation, relationCounts[relation]?.[subsystem.id] ?? 0];
            }),
          ),
          legacyRoleBreakdown: Object.fromEntries(
            ["OWNER", "ADMIN", "MEMBER"].map((role) => [
              role,
              legacyUsers.filter((user) => user.role === role).length,
            ]),
          ),
          inactiveOrDeletedUserCount: legacyUsers.filter(
            (user) => !user.isActive || user.deletedAt !== null,
          ).length,
          candidateKeysForReviewOnly: candidates,
          requiresOwnerReview: !canonicalSubsystems.some(
            (canonical) =>
              canonical.key === subsystem.key &&
              canonical.name === subsystem.name &&
              canonical.slug === subsystem.slug,
          ),
          conflictingMatches: candidates.length > 1,
        };
      });
      const duplicateMatches = canonicalSubsystems.flatMap(({ key }) => {
        const matches = records.filter((record) =>
          record.candidateKeysForReviewOnly.includes(key),
        );
        return matches.length > 1
          ? [{ key, subsystemIds: matches.map(({ id }) => id) }]
          : [];
      });
      return {
        version: 1,
        mode: "READ_ONLY",
        transactionReadOnly: transaction[0]?.readOnly === "on",
        canonicalKeys: canonicalSubsystems.map(({ key }) => key),
        foreignKeys,
        subsystems: records,
        pendingInvitations,
        usersWithoutSubsystem: users.filter(
          (user) => user.subsystemId === null,
        ),
        inactiveOrDeletedUsers: users.filter(
          (user) => !user.isActive || user.deletedAt !== null,
        ),
        snapshotScopes,
        snapshotReferences,
        duplicateMatches,
        warnings: [
          "No mapping is approved or applied by this report, including exact name/slug candidates.",
          "Software, Avionics, Structures, Thermal, Communications and Ground Station require explicit OWNER review; consolidation may expand ADMIN access.",
          "Snapshot JSON matches are heuristic; absence of a match does not establish absence of a reference. Historical audit/JSON text requires separate review.",
          "No role/membership backfill or compatibility-role reconciliation has occurred.",
        ],
      };
    },
    { timeout: 60000 },
  );
}
