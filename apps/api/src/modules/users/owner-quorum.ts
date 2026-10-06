import { ConflictException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

/** All operations that can remove active OWNER authority MUST enter here BEFORE
 * acquiring any User locks. Lock order: this advisory lock -> sorted User locks.
 * READ COMMITTED ensures the final count sees the previous lock holder's commit.
 * Never nest this in another transaction or swallow its exception. Additive OWNER
 * grants need not take the lock: they cannot reduce the quorum.
 */
export function withOwnerQuorum<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async tx => {
    // Stable application namespace ("ANTR", 1); held until commit/rollback.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(1095652434, 1)::text`;
    const result = await operation(tx);
    const remaining = await tx.user.count({ where: { role: "OWNER", isActive: true, deletedAt: null } });
    if (remaining === 0) throw new ConflictException({
      statusCode: 409,
      code: "LAST_ACTIVE_OWNER",
      message: "At least one active, non-deleted OWNER must remain",
    });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
