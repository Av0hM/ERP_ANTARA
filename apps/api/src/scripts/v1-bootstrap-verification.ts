import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { canonicalSubsystems } from "@antara/contracts";
import { AuthorizationService } from "../common/authorization/authorization.service";

export async function verifyBootstrap(prisma: PrismaClient, userId: string) {
  const directory = path.resolve(__dirname, "../../prisma/migrations");
  const expected = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      checksum: createHash("sha256")
        .update(readFileSync(path.join(directory, entry.name, "migration.sql")))
        .digest("hex"),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
    const applied = await tx.$queryRaw<
      Array<{
        name: string;
        checksum: string;
        finished: boolean;
        rolledBack: boolean;
      }>
    >`
      SELECT migration_name AS name, checksum, finished_at IS NOT NULL AS finished,
      rolled_back_at IS NOT NULL AS "rolledBack" FROM "_prisma_migrations" ORDER BY migration_name`;
    if (
      applied.length !== expected.length ||
      applied.some(
        (row, i) =>
          !row.finished ||
          row.rolledBack ||
          row.name !== expected[i]?.name ||
          row.checksum !== expected[i]?.checksum,
      )
    )
      throw new Error("MIGRATION_HISTORY_MISMATCH: stop for release review");
    const server = await tx.$queryRaw<
      Array<{ database: string; address: string; readOnly: string }>
    >`
      SELECT current_database() AS database, inet_server_addr()::text AS address,
      current_setting('transaction_read_only') AS "readOnly"`;
    const subsystems = await tx.subsystem.findMany({
      select: { id: true, key: true, name: true, slug: true },
      orderBy: { key: "asc" },
    });
    const actor = await new AuthorizationService(prisma).loadActorContext(
      userId,
      tx,
    );
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        isActive: true,
        deletedAt: true,
        subsystemId: true,
      },
    });
    const invalidAssignments = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT t.id FROM "Task" t LEFT JOIN "User" u ON u.id=t."assignedToId"
      LEFT JOIN "SubsystemMembership" m ON m."userId"=t."assignedToId" AND m."subsystemId"=t."subsystemId"
      WHERE t."assignedToId" IS NOT NULL AND (u.id IS NULL OR NOT u."isActive" OR u."deletedAt" IS NOT NULL OR m."userId" IS NULL)`;
    const roleConflicts = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT u.id FROM "User" u WHERE (u.role='ADMIN' AND NOT EXISTS
        (SELECT 1 FROM "SubsystemMembership" m WHERE m."userId"=u.id AND m."accessLevel"='ADMIN'))
      OR (u.role='MEMBER' AND EXISTS
        (SELECT 1 FROM "SubsystemMembership" m WHERE m."userId"=u.id AND m."accessLevel"='ADMIN'))`;
    const counts = {
      users: await tx.user.count(),
      memberships: await tx.subsystemMembership.count(),
      tasks: await tx.task.count(),
      decisions: await tx.decisionRecord.count(),
      invitations: await tx.invitation.count(),
      sessions: await tx.session.count(),
      targetUnrevokedSessions: await tx.session.count({
        where: { userId, revokedAt: null },
      }),
      bootstrapAudits: await tx.auditLog.count({
        where: { action: "INITIAL_OWNER_BOOTSTRAP", entityId: userId },
      }),
      pendingInvitations: await tx.invitation.count({
        where: { status: "PENDING" },
      }),
      legacyDecisions: await tx.decisionRecord.count({
        where: { OR: [{ scope: null }, { authority: null }] },
      }),
      invalidAssignments: invalidAssignments.length,
      roleConflicts: roleConflicts.length,
    };
    const catalogValid =
      subsystems.length === 5 &&
      canonicalSubsystems.every((c) =>
        subsystems.some(
          (s) => s.key === c.key && s.name === c.name && s.slug === c.slug,
        ),
      );
    return {
      server,
      migrations: applied,
      target,
      subsystems,
      counts,
      globalAuthority: actor.globalAuthority,
      targetMemberships: actor.memberships,
      readableSubsystemIds: (
        await tx.subsystem.findMany({
          where: new AuthorizationService(prisma).subsystemWhere(actor, "read"),
          select: { id: true },
          orderBy: { id: "asc" },
        })
      ).map((row) => row.id),
      catalogValid,
      ready:
        catalogValid &&
        actor.globalAuthority &&
        counts.legacyDecisions === 0 &&
        counts.invalidAssignments === 0 &&
        counts.roleConflicts === 0,
    };
  });
}
