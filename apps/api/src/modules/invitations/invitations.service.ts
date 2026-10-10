import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { randomBytes } from "node:crypto";
import { Queue } from "bullmq";
import * as bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import { canonicalSubsystems } from "@antara/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import {
  administeredSubsystemIds,
  isActiveActor,
} from "../../common/authorization/authorization.policy";
import {
  lockAccounts,
  accountCanAuthenticate,
  accountAuthSelect,
  SessionService,
} from "../../common/sessions/session.service";
import {
  canInviteAccess,
  findInvitation,
  invitationDigest,
  invitationInclude,
  invitationProjection,
  normalizeInvitation,
  InvitationAccess,
} from "./invitation-access";

const transactionOptions = { maxWait: 10_000, timeout: 30_000 };
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

  // Trusted internal legacy call shape is normalized; public DTO accepts only the new shape.
  async createInvitation(
    email: string,
    requested: InvitationAccess | Role,
    actorOrSubsystem: string | undefined,
    legacyActorId?: string,
  ) {
    const access =
      typeof requested === "string"
        ? normalizeInvitation({
            role: requested,
            subsystemId: actorOrSubsystem ?? null,
            grants: [],
          })
        : requested;
    const actorId =
      typeof requested === "string" ? legacyActorId! : actorOrSubsystem!;
    if (
      !actorId ||
      !["OWNER", "MEMBER"].includes(access.globalRole) ||
      access.memberships.length > 5 ||
      new Set(access.memberships.map((g) => g.subsystemId)).size !==
        access.memberships.length ||
      (access.globalRole === "OWNER" && access.memberships.length)
    )
      throw new BadRequestException("Invalid invitation access");
    const token = randomBytes(32).toString("hex");
    const base =
      this.configService.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
    const invitationUrl = new URL(`/invite/${token}`, base).toString();
    const invitation = await this.prisma.$transaction(async (tx) => {
      await lockAccounts(tx, [actorId]);
      const actor = await this.authorization.loadActorContext(actorId, tx);
      if (!canInviteAccess(actor, access))
        throw new ForbiddenException("Invitation not permitted");
      const subsystems = await tx.subsystem.count({
        where: {
          id: { in: access.memberships.map((g) => g.subsystemId) },
          key: { in: canonicalSubsystems.map((s) => s.key) },
        },
      });
      if (subsystems !== access.memberships.length)
        throw new BadRequestException("Select valid canonical subsystems");
      const result = await tx.invitation.create({
        data: {
          email: email.trim().toLowerCase(),
          role: access.globalRole,
          invitedById: actorId,
          tokenHash: invitationDigest(token),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          grants: { create: access.memberships },
        },
        include: invitationInclude,
      });
      await tx.auditLog.create({
        data: {
          action: "INVITATION_CREATED",
          entityType: "Invitation",
          entityId: result.id,
          actorId,
          payload: access,
        },
      });
      return result;
    }, transactionOptions);
    const projected = invitationProjection(invitation);
    let status: "disabled" | "queued" | "unavailable" = "disabled";
    if (
      this.configService.get<string>("NOTIFICATIONS_EMAIL_ENABLED") === "true"
    ) {
      status = "unavailable";
      if (
        this.configService.get<string>("RESEND_API_KEY") &&
        this.configService.get<string>("NOTIFICATIONS_FROM_EMAIL")
      ) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            this.emailQueue.add(
              "send-email",
              {
                invitationId: invitation.id,
                email: invitation.email,
                globalRole: access.globalRole,
                memberships: projected.memberships,
                invitationUrl,
                expiresAt: invitation.expiresAt.toISOString(),
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 1000 },
                removeOnComplete: true,
                removeOnFail: true,
                jobId: invitation.id,
              },
            ),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("EMAIL_QUEUE_UNAVAILABLE")),
                3000,
              );
            }),
          ]);
          status = "queued";
        } catch {
          /* Committed invitation remains valid; copy link is the recovery path. */
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
    }
    return { ...projected, token, invitationUrl, emailDelivery: { status } };
  }

  async validateToken(token: string) {
    const row = await findInvitation(this.prisma, token);
    if (!row || row.status !== "PENDING" || row.expiresAt <= new Date())
      return null;
    const actor = await this.authorization.loadActorContext(row.invitedById);
    if (!canInviteAccess(actor, normalizeInvitation(row))) return null;
    const projected = invitationProjection(row);
    return { ...projected, role: projected.globalRole };
  }
  acceptInvitation(token: string, password: string, name: string) {
    return this.accept(token, { kind: "CREDENTIALS", password, name });
  }
  acceptForAccount(token: string, userId: string) {
    return this.accept(token, { kind: "AUTHENTICATED", userId });
  }

  private async accept(
    token: string,
    proof:
      | { kind: "CREDENTIALS"; password: string; name: string }
      | { kind: "AUTHENTICATED"; userId: string },
  ) {
    const passwordHash =
      proof.kind === "CREDENTIALS"
        ? await bcrypt.hash(proof.password, 12)
        : undefined;
    return this.prisma.$transaction(async (tx) => {
      const found = await findInvitation(tx, token);
      if (!found)
        throw new BadRequestException("Invalid or expired invitation");
      await tx.$queryRaw`SELECT id FROM "Invitation" WHERE id = ${found.id} FOR UPDATE`;
      const invitation = await tx.invitation.findUniqueOrThrow({
        where: { id: found.id },
        include: invitationInclude,
      });
      if (invitation.status !== "PENDING" || invitation.expiresAt <= new Date())
        throw new BadRequestException("Invalid or expired invitation");
      const access = normalizeInvitation(invitation);
      const candidate = await tx.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
      });
      await lockAccounts(tx, [
        invitation.invitedById,
        ...(candidate ? [candidate.id] : []),
      ]);
      if (
        !canInviteAccess(
          await this.authorization.loadActorContext(invitation.invitedById, tx),
          access,
        )
      )
        throw new ForbiddenException("Invitation not permitted");
      let user = candidate
        ? await tx.user.findUnique({
            where: { id: candidate.id },
            select: { ...accountAuthSelect, passwordHash: true },
          })
        : null;
      if (user) {
        const valid =
          proof.kind === "AUTHENTICATED"
            ? proof.userId === user.id
            : !!user.passwordHash &&
              (await bcrypt.compare(proof.password, user.passwordHash));
        if (!accountCanAuthenticate(user) || !valid)
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
            onboardingPending: false,
          },
          select: { ...accountAuthSelect, passwordHash: true },
        });
      }
      const userId = user.id;
      // Pending state clears in this same transaction, before membership invariants execute.
      await tx.user.update({
        where: { id: userId },
        data: {
          onboardingPending: false,
          ...(access.globalRole === "OWNER" ? { role: "OWNER" } : {}),
        },
        select: { id: true },
      });
      const synchronized = await this.authorization.withMembershipRoleSync(
        userId,
        async (memberTx) => {
          for (const grant of access.memberships) {
            const before = await memberTx.subsystemMembership.findUnique({
              where: {
                userId_subsystemId: { userId, subsystemId: grant.subsystemId },
              },
            });
            await memberTx.subsystemMembership.upsert({
              where: {
                userId_subsystemId: { userId, subsystemId: grant.subsystemId },
              },
              create: { userId, ...grant },
              update:
                grant.accessLevel === "ADMIN" ? { accessLevel: "ADMIN" } : {},
            });
            if (
              !before ||
              (before.accessLevel !== "ADMIN" && grant.accessLevel === "ADMIN")
            )
              await memberTx.auditLog.create({
                data: {
                  action: before ? "MEMBERSHIP_UPDATED" : "MEMBERSHIP_ADDED",
                  entityType: "User",
                  entityId: userId,
                  actorId: invitation.invitedById,
                  payload: grant,
                },
              });
          }
        },
        tx,
      );
      if (user.role !== synchronized.role)
        await tx.auditLog.create({
          data: {
            action: "ROLE_CHANGE",
            entityType: "User",
            entityId: userId,
            actorId: invitation.invitedById,
            payload: { oldRole: user.role, newRole: synchronized.role },
          },
        });
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
            ...access,
          },
        },
      });
      return { userId };
    }, transactionOptions);
  }

  async listPendingInvitations(actorId: string, history = false) {
    const actor = await this.authorization.loadActorContext(actorId);
    const scope = administeredSubsystemIds(actor);
    if (!isActiveActor(actor) || (scope.kind !== "GLOBAL" && !scope.ids.length))
      throw new ForbiddenException("People management denied");
    const rows = await this.prisma.invitation.findMany({
      where: {
        ...(!history ? { status: "PENDING" } : {}),
        ...(scope.kind === "GLOBAL"
          ? {}
          : {
              role: "MEMBER",
              OR: [
                {
                  grants: {
                    some: {},
                    every: {
                      accessLevel: "MEMBER",
                      subsystemId: { in: [...scope.ids] },
                    },
                  },
                },
                { grants: { none: {} }, subsystemId: { in: [...scope.ids] } },
              ],
            }),
      },
      include: {
        ...invitationInclude,
        invitedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      ...invitationProjection(row),
      invitedBy: row.invitedBy,
    }));
  }

  async revokeInvitation(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invitation" WHERE id = ${id} FOR UPDATE`;
      const row = await tx.invitation.findUnique({
        where: { id },
        include: invitationInclude,
      });
      if (!row) throw new NotFoundException("Invitation not found");
      await lockAccounts(tx, [actorId]);
      if (
        !canInviteAccess(
          await this.authorization.loadActorContext(actorId, tx),
          normalizeInvitation(row),
        )
      )
        throw new ForbiddenException("Invitation not permitted");
      if (row.status !== "PENDING" || row.expiresAt <= new Date())
        throw new ConflictException("Only pending invitations can be revoked");
      await tx.invitation.update({
        where: { id },
        data: { status: "REVOKED" },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          action: "INVITATION_REVOKED",
          entityType: "Invitation",
          entityId: id,
          actorId,
        },
      });
      return { revoked: true };
    }, transactionOptions);
  }
}
