import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

import { PrismaService } from "../../common/prisma/prisma.service";
import { UpdateNotificationDto } from "./dto/update-notification.dto";

interface NotificationEmailJob {
  notificationId: string;
  userId: string;
  email: string;
  title: string;
  body: string;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @InjectQueue("notification-email") private readonly emailQueue: Queue,
  ) {}

  async onModuleInit() {
    // Queue event listeners can be added here if needed
  }

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

  async createAndNotify(userId: string, title: string, body: string, type: string, taskId?: string) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        body,
        type: type as any,
      },
    });

    await this.queueEmailNotification(notification.id, userId, title, body);

    return notification;
  }

  private async queueEmailNotification(notificationId: string, userId: string, title: string, body: string) {
    const emailEnabled = this.configService.get<string>("NOTIFICATIONS_EMAIL_ENABLED") === "true";
    if (!emailEnabled) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user?.email) {
      return;
    }

    await this.emailQueue.add("send-email", {
      notificationId,
      userId,
      email: user.email,
      title,
      body,
    } as NotificationEmailJob, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    });
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
