import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/prisma/prisma.service";

export interface AuditLogInput {
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  payload?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) { }

  async log(input: AuditLogInput) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          actorId: input.actorId,
          payload: input.payload,
        },
      });
    } catch {
      // Audit logging should never block the main operation
      return null;
    }
  }

  async findAll(limit = 100) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }
}