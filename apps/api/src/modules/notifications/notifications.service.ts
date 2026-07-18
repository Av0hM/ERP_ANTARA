import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import { UpdateNotificationDto } from "./dto/update-notification.dto";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    try {
      return await this.prisma.notification.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    } catch {
      return [
        {
          id: "n1",
          title: "Deadline risk detected",
          body: "Telemetry validation is trending 2 days late against dependencies.",
          type: "OVERDUE_RISK",
          isRead: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: "n2",
          title: "Design review reminder",
          body: "Payload and structures sync begins at 5:00 PM.",
          type: "DEADLINE_WARNING",
          isRead: true,
          createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        },
      ];
    }
  }

  async update(id: string, payload: UpdateNotificationDto) {
    try {
      return await this.prisma.notification.update({
        where: { id },
        data: {
          isRead: payload.isRead,
        },
      });
    } catch {
      return {
        id,
        isRead: payload.isRead,
      };
    }
  }

  async delete(id: string) {
    try {
      return await this.prisma.notification.delete({
        where: { id },
      });
    } catch {
      return {
        id,
        deleted: true,
      };
    }
  }
}
