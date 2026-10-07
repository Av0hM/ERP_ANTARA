import { ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import {
  lockAccounts,
  SessionService,
} from "../common/sessions/session.service";
import { withOwnerQuorum } from "../modules/users/owner-quorum";

/** Operator-only first OWNER transition. Never call from startup, seeds or HTTP. */
export async function bootstrapInitialOwner(
  prisma: PrismaClient,
  sessions: Pick<SessionService, "revokeAllSessions">,
  userId: string,
) {
  if (!userId?.trim())
    throw new BadRequestException("Explicit user ID required");
  // Same quorum lock as lifecycle removals, then target User lock. The final
  // quorum check permits 0 -> 1 without weakening ordinary lifecycle policy.
  return withOwnerQuorum(prisma, async (tx) => {
    await lockAccounts(tx, [userId]);
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true, deletedAt: true },
    });
    if (!target || !target.isActive || target.deletedAt !== null)
      throw new BadRequestException(
        "Bootstrap target must be an active, non-deleted account",
      );
    if (target.role === "OWNER")
      return { userId, changed: false, revokedSessions: 0 };
    if (
      await tx.user.count({
        where: { role: "OWNER", isActive: true, deletedAt: null },
      })
    )
      throw new ConflictException(
        "An active OWNER already exists; use normal OWNER administration",
      );
    await tx.user.update({
      where: { id: userId },
      data: { role: "OWNER" },
      select: { id: true },
    });
    const revoked = await sessions.revokeAllSessions(userId, tx);
    await tx.auditLog.create({
      data: {
        action: "INITIAL_OWNER_BOOTSTRAP",
        entityType: "User",
        entityId: userId,
        // Audit schema requires a User actor. This is explicitly an operator
        // action on the target, not a claim that the target authenticated.
        actorId: userId,
        payload: {
          source: "EXPLICIT_OPERATOR_COMMAND",
          oldRole: target.role,
          newRole: "OWNER",
          revokedSessions: revoked.count,
        },
      },
    });
    return { userId, changed: true, revokedSessions: revoked.count };
  });
}
