import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MailService } from "../mail/mail.service";

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
    private readonly mailService: MailService,
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

    await this.sendInvitationEmail(invitation);

    await this.auditService.log({
      action: "INVITATION_CREATED",
      entityType: "Invitation",
      entityId: invitation.id,
      actorId: invitedById,
      payload: { email, role, subsystemId },
    });

    return { token, expiresAt };
  }

  private async sendInvitationEmail(invitation: {
    email: string;
    token: string;
    role: string;
    subsystemId?: string | null;
    expiresAt: Date;
  }) {
    const baseUrl = this.configService.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
    const inviteUrl = `${baseUrl}/invite/${invitation.token}`;

    await this.mailService.send({
      to: invitation.email,
      subject: "You're invited to join ANTARA ERP",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 12px; padding: 32px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: rgba(59, 130, 246, 0.2); border-radius: 12px;">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                  </svg>
                </div>
              </div>
              <h1 style="color: #f8fafc; font-size: 24px; font-weight: 600; margin: 0 0 16px; text-align: center;">You're invited to ANTARA ERP</h1>
              <p style="color: #e2e8f0; margin: 0 0 16px; text-align: center;">You've been invited to join the ANTARA CubeSat team's mission control platform.</p>
              <div style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 20px; color: #e2e8f0; white-space: pre-wrap;">Role: ${invitation.role}${invitation.subsystemId ? `\nSubsystem: ${invitation.subsystemId}` : ""}</div>
              <div style="text-align: center; margin-top: 24px;">
                <a href="${inviteUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Accept Invitation</a>
              </div>
              <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 24px;">
                This invitation expires on ${invitation.expiresAt.toLocaleString()}.<br>
                If you didn't expect this invitation, please ignore this email.
              </p>
            </div>
          </body>
        </html>
      `,
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
      throw new Error("Invalid or expired invitation");
    }

    if (invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      throw new Error("Invitation has expired");
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
      throw new Error("Invitation not found");
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