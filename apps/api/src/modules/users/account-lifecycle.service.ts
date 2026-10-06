import { withOwnerQuorum } from "./owner-quorum";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import {
  canGrantGlobalRole,
  compatibilityRoleForMemberships,
} from "../../common/authorization/authorization.policy";
import {
  lockAccounts,
  safeAuthUserSelect,
  SessionService,
} from "../../common/sessions/session.service";

@Injectable()
export class AccountLifecycleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaClient,
    private readonly authorization: AuthorizationService,
    private readonly sessions: SessionService,
  ) {}

  async updateRole(userId: string, requestedRole: Role, actorId: string) {
    if (requestedRole !== "OWNER" && requestedRole !== "MEMBER")
      throw new BadRequestException(
        "Grant subsystem ADMIN through a membership invitation",
      );
    return withOwnerQuorum(this.prisma, async (tx) => {
      await lockAccounts(tx, [actorId, userId]);
      if (
        !canGrantGlobalRole(
          await this.authorization.loadActorContext(actorId, tx),
          requestedRole,
        )
      )
        throw new ForbiddenException("OWNER authority required");
      const target = await this.authorization.loadActorContext(userId, tx);
      if (target.accountStatus !== "ACTIVE")
        throw new BadRequestException("Account is unavailable");
      const role =
        requestedRole === "OWNER"
          ? "OWNER"
          : compatibilityRoleForMemberships("MEMBER", target.memberships);
      const user = await tx.user.update({
        where: { id: userId },
        data: { role },
        select: safeAuthUserSelect,
      });
      await this.sessions.revokeAllSessions(userId, tx);
      await tx.auditLog.create({
        data: {
          action: "ROLE_CHANGE",
          entityType: "User",
          entityId: userId,
          actorId,
          payload: { oldRole: target.role, newRole: role },
        },
      });
      return user;
    });
  }

  async setActive(userId: string, isActive: boolean, actorId: string) {
    return withOwnerQuorum(this.prisma, async (tx) => {
      await lockAccounts(tx, [actorId, userId]);
      if (
        !canGrantGlobalRole(
          await this.authorization.loadActorContext(actorId, tx),
          "OWNER",
        )
      )
        throw new ForbiddenException("OWNER authority required");
      const target = await this.authorization.loadActorContext(userId, tx);
      if (target.accountStatus === "UNKNOWN")
        throw new NotFoundException("Account not found");
      if (isActive && target.deletedAt !== null)
        throw new BadRequestException("Deleted accounts cannot be reactivated");
      const user = await tx.user.update({
        where: { id: userId },
        data: { isActive },
        select: { ...safeAuthUserSelect, isActive: true },
      });
      await this.sessions.revokeAllSessions(userId, tx);
      await tx.auditLog.create({
        data: {
          action: isActive ? "ACCOUNT_REACTIVATED" : "ACCOUNT_DEACTIVATED",
          entityType: "User",
          entityId: userId,
          actorId,
        },
      });
      return user;
    });
  }

  async revokeSessions(userId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockAccounts(tx, [actorId, userId]);
      if (
        !canGrantGlobalRole(
          await this.authorization.loadActorContext(actorId, tx),
          "OWNER",
        )
      )
        throw new ForbiddenException("OWNER authority required");
      if (
        (await this.authorization.loadActorContext(userId, tx))
          .accountStatus === "UNKNOWN"
      )
        throw new NotFoundException("Account not found");
      const result = await this.sessions.revokeAllSessions(userId, tx);
      await tx.auditLog.create({
        data: {
          action: "SESSIONS_REVOKED",
          entityType: "User",
          entityId: userId,
          actorId,
        },
      });
      return { revoked: result.count };
    });
  }
}
