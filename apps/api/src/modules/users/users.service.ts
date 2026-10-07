import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import {
  administeredSubsystemIds,
  readableSubsystemIds,
} from "../../common/authorization/authorization.policy";
import { safeUserSelect } from "../../common/prisma/safe-user.select";
import { memberProfileSelect } from "../../common/prisma/safe-user.select";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AppRole } from "@antara/contracts";

import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly core: CoreAuthorizationService,
  ) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: memberProfileSelect,
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: memberProfileSelect,
    });
  }

  create(data: {
    email: string;
    name: string;
    passwordHash?: string;
    role?: AppRole;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        role: data.role,
      },
      select: memberProfileSelect,
    });
  }

  async updateProfile(
    userId: string,
    data: { skills?: string[]; weeklyCapacityHours?: number },
    actorId: string,
  ) {
    return this.core.withActor(
      actorId,
      async (tx, actor) => {
        const target = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (!target) throw new NotFoundException("User not found");
        if (!actor.globalAuthority && actor.userId !== userId)
          throw new ForbiddenException("Profile management denied");
        const user = await tx.user.update({
          where: { id: userId },
          data: {
            skills: data.skills,
            weeklyCapacityHours: data.weeklyCapacityHours,
          },
          select: memberProfileSelect,
        });
        await tx.auditLog.create({
          data: {
            action: "PROFILE_UPDATE",
            entityType: "User",
            entityId: userId,
            actorId,
          },
        });
        // Do not expose a target's legacy subsystem outside the authorized directory scope.
        const { subsystem, subsystemId, ...profile } = user;
        return profile;
      },
      [userId],
    );
  }

  async listMembers(actorId: string) {
    const actor = await this.core.actor(actorId);
    const access =
      actor.role === "ADMIN"
        ? administeredSubsystemIds(actor)
        : readableSubsystemIds(actor);
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(access.kind === "GLOBAL"
          ? {}
          : {
              memberships: { some: { subsystemId: { in: [...access.ids] } } },
            }),
      },
      select:
        actor.role === "MEMBER"
          ? safeUserSelect
          : {
              ...safeUserSelect,
              email: true,
              role: true,
              skills: true,
              weeklyCapacityHours: true,
            },
      orderBy: { name: "asc" },
    });
  }
}
