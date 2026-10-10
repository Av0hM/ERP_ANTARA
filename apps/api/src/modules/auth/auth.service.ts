import { eligiblePendingInvitation } from "../invitations/invitation-access";
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  accountAuthSelect,
  accountCanAuthenticate,
  lockAccounts,
  SessionService,
} from "../../common/sessions/session.service";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto } from "./dto/logout.dto";
import { RefreshSessionDto } from "./dto/refresh-session.dto";
import { GoogleCallbackDto } from "./dto/google-callback.dto";
import { dummyLoginAllowed } from "./dummy-credentials";
import { GoogleIdentityService } from "./google-identity.service";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaClient,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
    private readonly google: GoogleIdentityService,
  ) {}

  register(): never {
    throw new ForbiddenException("Registration requires an invitation");
  }

  async login(payload: LoginDto) {
    const candidate = await this.prisma.user.findUnique({
      where: { email: payload.email.trim().toLowerCase() },
      select: { ...accountAuthSelect, passwordHash: true },
    });
    if (
      !candidate?.passwordHash ||
      !accountCanAuthenticate(candidate) ||
      candidate.onboardingPending ||
      !dummyLoginAllowed(candidate) ||
      !(await bcrypt.compare(payload.password, candidate.passwordHash))
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return this.prisma.$transaction(async (tx) => {
      await lockAccounts(tx, [candidate.id]);
      const user = await tx.user.findUnique({
        where: { id: candidate.id },
        select: { ...accountAuthSelect, passwordHash: true },
      });
      if (
        !user ||
        !accountCanAuthenticate(user) ||
        user.onboardingPending ||
        user.passwordHash !== candidate.passwordHash ||
        !dummyLoginAllowed(user)
      )
        throw new UnauthorizedException("Invalid credentials");
      const response = await this.sessions.issue(tx, user);
      await tx.auditLog.create({
        data: {
          action: "LOGIN",
          entityType: "User",
          entityId: user.id,
          actorId: user.id,
          payload: { provider: "credentials" },
        },
      });
      return response;
    });
  }

  async googleCallback(payload: GoogleCallbackDto) {
    const identity = await this.google.verify(payload.idToken);
    const allowed =
      this.config
        .get<string>("GOOGLE_ALLOWED_EMAILS")
        ?.split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean) ?? [];
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.user.findUnique({
          where: { email: identity.email },
          select: accountAuthSelect,
        });
        if (existing && !accountCanAuthenticate(existing))
          throw new UnauthorizedException("Authentication failed");
        const envAllowed = allowed.includes(identity.email);
        const needsInvitation =
          !envAllowed && (!existing || existing.onboardingPending);
        if (needsInvitation) {
          const invitation = await eligiblePendingInvitation(
            tx,
            identity.email,
          );
          if (!invitation)
            throw new UnauthorizedException("Authentication failed");
          // Same invitation-before-account order as acceptance and revocation.
          await tx.$queryRaw`SELECT id FROM "Invitation" WHERE id = ${invitation.id} FOR UPDATE`;
          await lockAccounts(tx, [
            invitation.invitedById,
            ...(existing ? [existing.id] : []),
          ]);
          if (
            !(await eligiblePendingInvitation(
              tx,
              identity.email,
              invitation.id,
            ))
          )
            throw new UnauthorizedException("Authentication failed");
        }
        const candidate = await tx.user.upsert({
          where: { email: identity.email },
          update: {},
          create: {
            email: identity.email,
            name: identity.name,
            avatarUrl: identity.avatarUrl,
            role: "MEMBER",
            isActive: true,
            onboardingPending: !envAllowed,
          },
          select: { id: true },
        });
        await lockAccounts(tx, [candidate.id]);
        const user = await tx.user.findUnique({
          where: { id: candidate.id },
          select: accountAuthSelect,
        });
        if (
          !user ||
          !accountCanAuthenticate(user) ||
          !(await this.sessions.pendingCanAuthenticate(user, tx))
        )
          throw new UnauthorizedException("Authentication failed");
        const response = await this.sessions.issue(tx, user);
        await tx.auditLog.create({
          data: {
            action: "LOGIN",
            entityType: "User",
            entityId: user.id,
            actorId: user.id,
            payload: { provider: "google" },
          },
        });
        return response;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }
  refreshSession(payload: RefreshSessionDto) {
    return this.sessions.refresh(payload.refreshToken);
  }
  logout(payload: LogoutDto) {
    return this.sessions.logout(payload.refreshToken);
  }
}
