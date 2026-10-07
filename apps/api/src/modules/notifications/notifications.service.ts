import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import { NotFoundException } from "@nestjs/common";
import { NotificationType } from "@prisma/client";
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
    private readonly core: CoreAuthorizationService,
  ) {}

  async onModuleInit() {
    // Queue event listeners can be added here if needed
  }

  async list(actorId: string) {
    await this.core.actor(actorId);
    const notifications = await this.prisma.notification.findMany({
      where: { userId: actorId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    // Legacy/general rows do not consistently retain object references; never replay stale protected content.
    return notifications.map((item) => ({
      ...item,
      ...genericNotification,
      taskId: null,
    }));
  }

  async createAndNotify(
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    taskId?: string,
  ) {
    await this.core.actor(userId);
    // Task linkage is optional and historical/general notifications lack reliable scope. Generic delivery is safe even if membership
    // is revoked between creation, queue delivery, and the user's later HTTP read.
    title = genericNotification.title;
    body = genericNotification.body;
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        body,
        type,
      },
    });

    await this.queueEmailNotification(notification.id, userId, title, body);

    return notification;
  }

  private async queueEmailNotification(
    notificationId: string,
    userId: string,
    title: string,
    body: string,
  ) {
    const emailEnabled =
      this.configService.get<string>("NOTIFICATIONS_EMAIL_ENABLED") === "true";
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

    await this.emailQueue.add(
      "send-email",
      {
        notificationId,
        userId,
        email: user.email,
        title,
        body,
      } as NotificationEmailJob,
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      },
    );
  }

  async update(id: string, payload: UpdateNotificationDto, actorId: string) {
    return this.core.withActor(actorId, async (tx) => {
      const result = await tx.notification.updateMany({
        where: { id, userId: actorId },
        data: { isRead: payload.isRead },
      });
      if (!result.count) throw new NotFoundException("Notification not found");
      return {
        ...(await tx.notification.findUniqueOrThrow({ where: { id } })),
        ...genericNotification,
        taskId: null,
      };
    });
  }

  async delete(id: string, actorId: string) {
    return this.core.withActor(actorId, async (tx) => {
      const result = await tx.notification.deleteMany({
        where: { id, userId: actorId },
      });
      if (!result.count) throw new NotFoundException("Notification not found");
      return { deleted: true };
    });
  }
}

export const genericNotification = {
  title: "ANTARA update",
  body: "An update is available. Open ANTARA to view information you can access.",
};
