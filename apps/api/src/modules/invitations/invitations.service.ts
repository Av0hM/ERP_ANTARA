import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import * as crypto from "crypto";
import { Queue } from "bullmq";
import { BadRequestException, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

interface InvitationToken {
  email: string;
  role: string;
  subsystemId?: string;
  invitedBy: string;
  expiresAt: Date;
}

@Injectable()
export class InvitationsService {
  private readonly tokenExpiryHours = 72;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    @InjectQueue("invitation-email") private readonly emailQueue: Queue,
  ) {}

  async createInvitation(
    email: string,
    role: "OWNER" | "ADMIN" | "MEMBER",
    subsystemId: string | undefined,
    invitedById: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const existingInvite = await this.prisma.invitation.findFirst({
      where: { email, status: "PENDING" },
    });

    if (existingInvite) {
      await this.prisma.invitation.delete({ where: { id: existingInvite.id } });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + this.tokenExpiryHours * 60 * 60 * 1000);

    const invitation = await this.prisma.invitation.create({
      data: {
        email,
        role,
        subsystemId,
        invitedById,
        token,
        expiresAt,
        status: "PENDING",
      },
    });

    await this.queueInvitationEmail(invitation);

    await this.auditService.log({
      action: "INVITATION_CREATED",
      entityType: "Invitation",
      entityId: invitation.id,
      actorId: invitedById,
      payload: { email, role, subsystemId },
    });

    return { token, expiresAt };
  }

  private async queueInvitationEmail(invitation: {
    email: string;
    token: string;
    role: string;
    subsystemId?: string | null;
    expiresAt: Date;
  }) {
    const emailEnabled = this.configService.get<string>("NOTIFICATIONS_EMAIL_ENABLED") === "true";
    if (!emailEnabled) {
      return;
    }

    await this.emailQueue.add("send-email", {
      email: invitation.email,
      role: invitation.role,
      subsystemId: invitation.subsystemId ?? undefined,
      token: invitation.token,
      expiresAt: invitation.expiresAt,
    }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    });
  }

  async validateToken(token: string): Promise<{ email: string; role: string; subsystemId?: string } | null> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });

    if (!invitation || invitation.status !== "PENDING") {
      return null;
    }

    if (invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      return null;
    }

    return {
      email: invitation.email,
      role: invitation.role,
      subsystemId: invitation.subsystemId ?? undefined,
    };
  }

  async acceptInvitation(token: string, password: string, name: string): Promise<{ userId: string }> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });

    if (!invitation || invitation.status !== "PENDING") {
      throw new BadRequestException("Invalid or expired invitation");
    }

    if (invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      throw new BadRequestException("Invitation has expired");
    }

    const bcrypt = require("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: invitation.email,
        name,
        passwordHash,
        role: invitation.role as "OWNER" | "ADMIN" | "MEMBER",
        subsystemId: invitation.subsystemId,
      },
    });

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" },
    });

    await this.auditService.log({
      action: "INVITATION_ACCEPTED",
      entityType: "User",
      entityId: user.id,
      actorId: user.id,
      payload: { email: user.email, role: user.role },
    });

    return { userId: user.id };
  }

  async listPendingInvitations() {
    return this.prisma.invitation.findMany({
      where: { status: "PENDING" },
      include: {
        invitedBy: { select: { id: true, name: true, email: true } },
        subsystem: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeInvitation(invitationId: string, actorId: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new NotFoundException("Invitation not found");
    }

    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "REVOKED" },
    });

    await this.auditService.log({
      action: "INVITATION_REVOKED",
      entityType: "Invitation",
      entityId: invitationId,
      actorId,
      payload: { email: invitation.email },
    });

    return { revoked: true };
  }
}