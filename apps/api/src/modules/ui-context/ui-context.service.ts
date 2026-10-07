import { Injectable, UnauthorizedException } from "@nestjs/common";
import {
  canonicalSubsystems,
  DashboardContext,
  UiContext,
} from "@antara/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import {
  canManageSubsystem,
  isActiveActor,
} from "../../common/authorization/authorization.policy";

@Injectable()
export class UiContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}
  async get(userId: string): Promise<UiContext> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
      const actor = await this.authorization.loadActorContext(userId, tx);
      if (!isActiveActor(actor))
        throw new UnauthorizedException("Account is unavailable");
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, avatarUrl: true, role: true },
      });
      const rows = await tx.subsystem.findMany({
        where: {
          AND: [
            this.authorization.subsystemWhere(actor, "read"),
            { key: { in: canonicalSubsystems.map((s) => s.key) } },
          ],
        },
        select: { id: true, key: true },
        orderBy: { key: "asc" },
      });
      const scopes: DashboardContext[] = rows.flatMap((row) => {
        const canonical = canonicalSubsystems.find((s) => s.key === row.key);
        if (!canonical) return [];
        const canManage = canManageSubsystem(actor, row.id);
        return [
          {
            id: `subsystem:${row.id}`,
            label: canonical.name,
            view: canManage ? "ANALYTICS" : "SUBSYSTEM",
            subsystemId: row.id,
            key: canonical.key,
            slug: canonical.slug,
            canManage,
          },
        ];
      });
      const manage = actor.globalAuthority || scopes.some((s) => s.canManage);
      const primary: DashboardContext = actor.globalAuthority
        ? {
            id: "global",
            label: "Global Dashboard",
            view: "ANALYTICS",
            canManage: true,
          }
        : manage
          ? {
              id: "managed",
              label: "Admin Dashboard",
              view: "ANALYTICS",
              canManage: true,
            }
          : {
              id: "personal",
              label: "Personal Dashboard",
              view: actor.role === "MEMBER" ? "ANALYTICS" : "EMPTY",
              canManage: false,
            };
      return {
        user,
        globalAuthority: actor.globalAuthority,
        contexts: [primary, ...scopes],
        defaultContextId: primary.id,
        permissions: {
          manageOperations: manage,
          viewResources: manage,
          viewReports: manage,
        },
        unreadCount: await tx.notification.count({
          where: { userId, isRead: false },
        }),
      };
    });
  }
}
