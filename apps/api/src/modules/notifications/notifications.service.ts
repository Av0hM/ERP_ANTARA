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
  ) {}

  async onModuleInit() {
    // Queue event listeners can be added here if needed
  }

  async list() {
    return await this.prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async createAndNotify(
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    taskId?: string,
  ) {
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

  async update(id: string, payload: UpdateNotificationDto) {
    return await this.prisma.notification.update({
      where: { id },
      data: {
        isRead: payload.isRead,
      },
    });
  }

  async delete(id: string) {
    return await this.prisma.notification.delete({
      where: { id },
    });
  }
}
