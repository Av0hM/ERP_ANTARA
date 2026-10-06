import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  administeredSubsystemIds,
  buildActorContext,
  canManageDecision,
  canReadDecision,
  compatibilityRoleForMemberships,
  isActiveActor,
  readableSubsystemIds,
} from "./authorization.policy";
import type { ActorContext } from "./authorization.types";

export const actorAuthorizationSelect = {
  id: true,
  role: true,
  isActive: true,
  deletedAt: true,
  memberships: {
    select: { subsystemId: true, accessLevel: true },
    orderBy: { subsystemId: "asc" },
  },
} satisfies Prisma.UserSelect;
export const decisionAuthorizationSelect = {
  id: true,
  scope: true,
  authority: true,
  subsystemId: true,
} satisfies Prisma.DecisionRecordSelect;

@Injectable()
export class AuthorizationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  /** No caching or JWT role/scope parameters. Reevaluate for each authorization attempt. */
  async loadActorContext(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ActorContext> {
    if (!userId) return buildActorContext(userId, null);
    const record = await (tx ?? this.prisma).user.findUnique({
      where: { id: userId },
      select: actorAuthorizationSelect,
    });
    return buildActorContext(userId, record);
  }

  /** Filter for Subsystem rows, NOT Task IDs. Empty IN stays a deny-all filter. */
  subsystemWhere(
    actor: ActorContext,
    action: "read" | "manage",
  ): Prisma.SubsystemWhereInput {
    const scope =
      action === "read"
        ? readableSubsystemIds(actor)
        : administeredSubsystemIds(actor);
    return scope.kind === "GLOBAL" ? {} : { id: { in: [...scope.ids] } };
  }

  /** Object ID only: request body subsystem/authority fields cannot override stored placement.
   * Later mutation callers must pass their transaction and address concurrent object changes.
   */
  async assertDecisionAccess(
    userId: string,
    decisionId: string,
    action: "read" | "manage",
    tx?: Prisma.TransactionClient,
  ) {
    const actor = await this.loadActorContext(userId, tx);
    if (!isActiveActor(actor))
      throw new UnauthorizedException("Account is unavailable");
    const decision = await (tx ?? this.prisma).decisionRecord.findUnique({
      where: { id: decisionId },
      select: decisionAuthorizationSelect,
    });
    if (!decision) throw new NotFoundException("Decision not found");
    const allowed =
      action === "read"
        ? canReadDecision(actor, decision)
        : canManageDecision(actor, decision);
    if (!allowed) throw new ForbiddenException("Decision access denied");
    return { actor, decision };
  }

  /** Trusted service primitive, NOT an authorization bypass endpoint.
   * Future callers must authorize the actor/grant and restrict changes to this target user.
   * All membership writers must lock this same User row BEFORE touching memberships.
   * Role synchronization and membership changes commit/rollback together; no mass backfill.
   */
  async withMembershipRoleSync<T>(
    userId: string,
    mutate: (tx: Prisma.TransactionClient) => Promise<T>,
    transaction?: Prisma.TransactionClient,
  ) {
    const operation = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const before = await this.loadActorContext(userId, tx);
      if (!isActiveActor(before))
        throw new UnauthorizedException("Account is unavailable");
      const result = await mutate(tx);
      const after = await this.loadActorContext(userId, tx);
      if (
        !isActiveActor(after) ||
        after.role !== before.role ||
        before.role === null
      ) {
        throw new ForbiddenException(
          "Membership operation must not change account state or global role",
        );
      }
      const role = compatibilityRoleForMemberships(
        before.role,
        after.memberships,
      );
      if (role !== before.role)
        await tx.user.update({
          where: { id: userId },
          data: { role },
          select: { id: true },
        });
      return { result, role };
    };
    return transaction
      ? operation(transaction)
      : this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        });
  }
}
