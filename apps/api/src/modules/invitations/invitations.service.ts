import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { randomBytes } from "node:crypto";
import { Queue } from "bullmq";
import * as bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import { administeredSubsystemIds } from "../../common/authorization/authorization.policy";
import {
  lockAccounts,
  accountCanAuthenticate,
  accountAuthSelect,
  SessionService,
} from "../../common/sessions/session.service";
import { canInvite } from "./invitation.policy";

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
    private readonly authorization: AuthorizationService,
    @InjectQueue("invitation-email")
    private readonly emailQueue: Pick<Queue, "add">,
    private readonly sessions: SessionService,
  ) {}

  async createInvitation(
    email: string,
    role: Role,
    subsystemId: string | undefined,
    invitedById: string,
  ) {
    const invitation = await this.prisma.$transaction(async (tx) => {
      await lockAccounts(tx, [invitedById]);
      const actor = await this.authorization.loadActorContext(invitedById, tx);
      if (!canInvite(actor, role, subsystemId))
        throw new ForbiddenException("Invitation not permitted");
      const result = await tx.invitation.create({
        data: {
          email: email.trim().toLowerCase(),
          role,
          subsystemId,
          invitedById,
          token: randomBytes(32).toString("hex"),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        },
      });
      await tx.auditLog.create({
        data: {
          action: "INVITATION_CREATED",
          entityType: "Invitation",
          entityId: result.id,
          actorId: invitedById,
          payload: { role, subsystemId: subsystemId ?? null },
        },
      });
      return result;
    });
    if (
      this.configService.get<string>("NOTIFICATIONS_EMAIL_ENABLED") === "true"
    ) {
      await this.emailQueue.add(
        "send-email",
        {
          email: invitation.email,
          role: invitation.role,
          subsystemId: invitation.subsystemId ?? undefined,
          token: invitation.token,
          expiresAt: invitation.expiresAt,
        },
        { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
      );
    }
    return { token: invitation.token, expiresAt: invitation.expiresAt };
  }

  async validateToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });
    if (
      !invitation ||
      invitation.status !== "PENDING" ||
      invitation.expiresAt <= new Date()
    )
      return null;
    const actor = await this.authorization.loadActorContext(
      invitation.invitedById,
    );
    if (!canInvite(actor, invitation.role, invitation.subsystemId)) return null;
    return {
      email: invitation.email,
      role: invitation.role,
      subsystemId: invitation.subsystemId ?? undefined,
    };
  }

  async acceptInvitation(
    token: string,
    password: string,
    name: string,
  ): Promise<{ userId: string }> {
    return this.accept(token, { kind: "CREDENTIALS", password, name });
  }

  acceptForAccount(
    token: string,
    authenticatedUserId: string,
  ): Promise<{ userId: string }> {
    return this.accept(token, {
      kind: "AUTHENTICATED",
      userId: authenticatedUserId,
    });
  }

  private async accept(
    token: string,
    proof:
      | { kind: "CREDENTIALS"; password: string; name: string }
      | { kind: "AUTHENTICATED"; userId: string },
  ): Promise<{ userId: string }> {
    // Hash outside the transaction to avoid holding row locks during password derivation.
    const passwordHash =
      proof.kind === "CREDENTIALS"
        ? await bcrypt.hash(proof.password, 12)
        : undefined;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invitation" WHERE token = ${token} FOR UPDATE`;
      const invitation = await tx.invitation.findUnique({ where: { token } });
      if (
        !invitation ||
        invitation.status !== "PENDING" ||
        invitation.expiresAt <= new Date()
      )
        throw new BadRequestException("Invalid or expired invitation");
      const candidate = await tx.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
      });
      await lockAccounts(tx, [
        invitation.invitedById,
        ...(candidate ? [candidate.id] : []),
      ]);
      const actor = await this.authorization.loadActorContext(
        invitation.invitedById,
        tx,
      );
      if (!canInvite(actor, invitation.role, invitation.subsystemId))
        throw new ForbiddenException("Invitation not permitted");
      let user = candidate
        ? await tx.user.findUnique({
            where: { id: candidate.id },
            select: { ...accountAuthSelect, passwordHash: true },
          })
        : null;
      if (user) {
        // An invitation is not a password reset or proof of an existing account's identity.
        const validProof =
          proof.kind === "AUTHENTICATED"
            ? proof.userId === user.id
            : !!user.passwordHash &&
              (await bcrypt.compare(proof.password, user.passwordHash));
        if (!accountCanAuthenticate(user) || !validProof)
          throw new BadRequestException(
            "Cannot accept invitation with these credentials",
          );
      } else {
        if (proof.kind !== "CREDENTIALS")
          throw new BadRequestException(
            "Invitation does not match this account",
          );
        user = await tx.user.create({
          data: {
            email: invitation.email,
            name: proof.name.trim(),
            passwordHash,
            role: "MEMBER",
          },
          select: { ...accountAuthSelect, passwordHash: true },
        });
      }
      const userId = user.id;
      if (invitation.role === "OWNER")
        await tx.user.update({
          where: { id: userId },
          data: { role: "OWNER" },
          select: { id: true },
        });
      await this.authorization.withMembershipRoleSync(
        userId,
        async (memberTx) => {
          if (invitation.subsystemId) {
            const accessLevel =
              invitation.role === "ADMIN" ? "ADMIN" : "MEMBER";
            await memberTx.subsystemMembership.upsert({
              where: {
                userId_subsystemId: {
                  userId,
                  subsystemId: invitation.subsystemId,
                },
              },
              create: {
                userId,
                subsystemId: invitation.subsystemId,
                accessLevel,
              },
              // A MEMBER invitation never removes an existing ADMIN grant.
              update: accessLevel === "ADMIN" ? { accessLevel } : {},
            });
          }
        },
        tx,
      );
      await this.sessions.revokeAllSessions(userId, tx);
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED" },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          action: "INVITATION_ACCEPTED",
          entityType: "User",
          entityId: userId,
          actorId: userId,
          payload: {
            invitationId: invitation.id,
            invitedById: invitation.invitedById,
            intendedRole: invitation.role,
          },
        },
      });
      return { userId };
    });
  }

  async listPendingInvitations(actorId: string) {
    const actor = await this.authorization.loadActorContext(actorId);
    const scope = administeredSubsystemIds(actor);
    return this.prisma.invitation.findMany({
      where: {
        status: "PENDING",
        ...(scope.kind === "GLOBAL"
          ? {}
          : { role: "MEMBER", subsystemId: { in: [...scope.ids] } }),
      },
      select: {
        id: true,
        email: true,
        role: true,
        subsystemId: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        invitedBy: { select: { id: true, name: true, email: true } },
        subsystem: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeInvitation(invitationId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invitation" WHERE id = ${invitationId} FOR UPDATE`;
      const invitation = await tx.invitation.findUnique({
        where: { id: invitationId },
      });
      if (!invitation) throw new NotFoundException("Invitation not found");
      await lockAccounts(tx, [actorId]);
      if (
        !canInvite(
          await this.authorization.loadActorContext(actorId, tx),
          invitation.role,
          invitation.subsystemId,
        )
      )
        throw new ForbiddenException("Invitation not permitted");
      await tx.invitation.updateMany({
        where: { id: invitationId, status: "PENDING" },
        data: { status: "REVOKED" },
      });
      await tx.auditLog.create({
        data: {
          action: "INVITATION_REVOKED",
          entityType: "Invitation",
          entityId: invitationId,
          actorId,
        },
      });
      return { revoked: true };
    });
  }
}
