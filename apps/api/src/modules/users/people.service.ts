import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { canonicalSubsystems } from "@antara/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import {
  administeredSubsystemIds,
  isActiveActor,
} from "../../common/authorization/authorization.policy";
import {
  lockAccounts,
  SessionService,
} from "../../common/sessions/session.service";
import { AccountLifecycleService } from "./account-lifecycle.service";
import { withOwnerQuorum } from "./owner-quorum";
import { UpdateAccessDto } from "./people.dto";

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly sessions: SessionService,
    private readonly lifecycle: AccountLifecycleService,
  ) {}
  async list(actorId: string) {
    const actor = await this.authorization.loadActorContext(actorId);
    const scope = administeredSubsystemIds(actor);
    if (!isActiveActor(actor) || (scope.kind === "SCOPED" && !scope.ids.length))
      throw new ForbiddenException("People management denied");
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(scope.kind === "GLOBAL"
          ? {}
          : { memberships: { some: { subsystemId: { in: [...scope.ids] } } } }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        onboardingPending: true,
        memberships: {
          where:
            scope.kind === "GLOBAL"
              ? {}
              : { subsystemId: { in: [...scope.ids] } },
          select: {
            subsystemId: true,
            accessLevel: true,
            subsystem: { select: { name: true, key: true } },
          },
          orderBy: { subsystemId: "asc" },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }
  async updateAccess(userId: string, input: UpdateAccessDto, actorId: string) {
    if (
      new Set(input.memberships.map((g) => g.subsystemId)).size !==
        input.memberships.length ||
      input.memberships.length > 5 ||
      (input.globalRole === "OWNER" && input.memberships.length)
    )
      throw new BadRequestException("Invalid access selection");
    return withOwnerQuorum(
      this.prisma,
      async (tx) => {
        await lockAccounts(tx, [actorId, userId]);
        const actor = await this.authorization.loadActorContext(actorId, tx);
        if (!actor.globalAuthority)
          throw new ForbiddenException("OWNER authority required");
        const target = await this.authorization.loadActorContext(userId, tx);
        if (!isActiveActor(target))
          throw new BadRequestException(
            "Account must be active and fully onboarded to edit access",
          );
        const count = await tx.subsystem.count({
          where: {
            id: { in: input.memberships.map((g) => g.subsystemId) },
            key: { in: canonicalSubsystems.map((s) => s.key) },
          },
        });
        if (count !== input.memberships.length)
          throw new BadRequestException("Select valid canonical subsystems");
        // OWNER selection leaves existing historical memberships intact; never fabricates five.
        const desired =
          input.globalRole === "OWNER"
            ? [...target.memberships]
            : input.memberships;
        const ordered = (grants: typeof target.memberships) =>
          JSON.stringify(
            [...grants].sort((a, b) =>
              a.subsystemId.localeCompare(b.subsystemId),
            ),
          );
        const before = ordered(target.memberships);
        const synchronized = await this.authorization.withMembershipRoleSync(
          userId,
          async (memberTx) => {
            for (const old of target.memberships)
              if (!desired.some((g) => g.subsystemId === old.subsystemId)) {
                await memberTx.subsystemMembership.delete({
                  where: {
                    userId_subsystemId: {
                      userId,
                      subsystemId: old.subsystemId,
                    },
                  },
                });
                await memberTx.auditLog.create({
                  data: {
                    action: "MEMBERSHIP_REMOVED",
                    entityType: "User",
                    entityId: userId,
                    actorId,
                    payload: { ...old },
                  },
                });
              }
            for (const grant of desired) {
              const old = target.memberships.find(
                (g) => g.subsystemId === grant.subsystemId,
              );
              if (old?.accessLevel === grant.accessLevel) continue;
              await memberTx.subsystemMembership.upsert({
                where: {
                  userId_subsystemId: {
                    userId,
                    subsystemId: grant.subsystemId,
                  },
                },
                create: { userId, ...grant },
                update: { accessLevel: grant.accessLevel },
              });
              await memberTx.auditLog.create({
                data: {
                  action: old ? "MEMBERSHIP_UPDATED" : "MEMBERSHIP_ADDED",
                  entityType: "User",
                  entityId: userId,
                  actorId,
                  payload: { ...grant },
                },
              });
            }
          },
          tx,
        );
        if (target.role !== synchronized.role)
          await tx.auditLog.create({
            data: {
              action: "ROLE_CHANGE",
              entityType: "User",
              entityId: userId,
              actorId,
              payload: { oldRole: target.role, newRole: synchronized.role },
            },
          });
        const changingOwner =
          (target.role === "OWNER") !== (input.globalRole === "OWNER");
        if (changingOwner)
          await this.lifecycle.updateRoleInTransaction(
            tx,
            userId,
            input.globalRole,
            actorId,
          );
        else if (before !== ordered(desired)) {
          await this.sessions.revokeAllSessions(userId, tx);
          await tx.auditLog.create({
            data: {
              action: "SESSIONS_REVOKED",
              entityType: "User",
              entityId: userId,
              actorId,
            },
          });
        }
        return { updated: true };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }
}
