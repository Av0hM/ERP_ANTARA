import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma, PrismaClient } from "@prisma/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

export const safeAuthUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
} satisfies Prisma.UserSelect;
export const accountAuthSelect = {
  ...safeAuthUserSelect,
  isActive: true,
  deletedAt: true,
  isDummySeed: true,
} satisfies Prisma.UserSelect;
export type SafeAuthUser = Prisma.UserGetPayload<{
  select: typeof safeAuthUserSelect;
}>;
export function safeAuthUser(user: SafeAuthUser): SafeAuthUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
export function accountCanAuthenticate(
  user: {
    isActive: boolean;
    deletedAt: Date | null;
    isDummySeed: boolean;
  } | null,
): boolean {
  return (
    !!user &&
    user.isActive &&
    user.deletedAt === null &&
    !(user.isDummySeed && process.env.NODE_ENV === "production")
  );
}
export function refreshDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
/** All account/session/membership mutations acquire these locks first, in ID order. */
export async function lockAccounts(
  tx: Prisma.TransactionClient,
  ids: readonly string[],
) {
  for (const id of [...new Set(ids)].sort()) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
  }
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Caller holds the User lock and validated the current account in this transaction. */
  async issue(
    tx: Prisma.TransactionClient,
    user: SafeAuthUser,
    sessionId?: string,
  ) {
    const id = sessionId ?? randomUUID();
    const refreshToken = randomBytes(32).toString("hex");
    const refreshTokenHash = refreshDigest(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const accessTokenExpiresAt = new Date(
      Date.now() + 15 * 60 * 1000,
    ).toISOString();
    const accessToken = await this.jwt.signAsync(
      { ...safeAuthUser(user), sid: id },
      {
        secret:
          this.config.get<string>("auth.accessSecret") ?? "dev-access-secret",
        expiresIn: "15m",
      },
    );
    if (sessionId) {
      await tx.session.update({
        where: { id },
        data: { refreshTokenHash, expiresAt },
        select: { id: true },
      });
    } else {
      await tx.session.create({
        data: { id, userId: user.id, refreshTokenHash, expiresAt },
        select: { id: true },
      });
    }
    return {
      user: safeAuthUser(user),
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  }

  async refresh(refreshToken: string) {
    if (!/^[a-f0-9]{64}$/.test(refreshToken))
      throw new UnauthorizedException("Invalid session");
    const refreshTokenHash = refreshDigest(refreshToken);
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.session.findUnique({
        where: { refreshTokenHash },
        select: { userId: true },
      });
      if (!candidate) throw new UnauthorizedException("Invalid session");
      await lockAccounts(tx, [candidate.userId]);
      // Re-read AFTER the lock: concurrent rotation/revocation must invalidate this credential.
      const session = await tx.session.findUnique({
        where: { refreshTokenHash },
        select: {
          id: true,
          expiresAt: true,
          revokedAt: true,
          user: { select: accountAuthSelect },
        },
      });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        !accountCanAuthenticate(session.user)
      ) {
        throw new UnauthorizedException("Invalid session");
      }
      return this.issue(tx, session.user, session.id);
    });
  }

  async logout(refreshToken: string) {
    const hash = refreshDigest(refreshToken);
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { refreshTokenHash: hash },
        select: { id: true, userId: true },
      });
      if (session) {
        await lockAccounts(tx, [session.userId]);
        const result = await tx.session.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (result.count)
          await tx.auditLog.create({
            data: {
              action: "LOGOUT",
              entityType: "User",
              entityId: session.userId,
              actorId: session.userId,
            },
          });
      }
      return { success: true };
    });
  }

  /** Pass the account mutation's transaction to make revocation atomic with it. */
  async revokeAllSessions(
    userId: string,
    transaction?: Prisma.TransactionClient,
  ) {
    const operation = async (tx: Prisma.TransactionClient) => {
      await lockAccounts(tx, [userId]);
      return tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    };
    return transaction
      ? operation(transaction)
      : this.prisma.$transaction(operation);
  }

  /** JWT claims identify the session only. Current DB role/account state is authoritative. */
  async authenticateAccess(payload: unknown): Promise<SafeAuthUser> {
    if (
      !payload ||
      typeof payload !== "object" ||
      !("id" in payload) ||
      typeof payload.id !== "string" ||
      !("sid" in payload) ||
      typeof payload.sid !== "string"
    ) {
      throw new UnauthorizedException("Invalid session");
    }
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: accountAuthSelect },
      },
    });
    if (
      !session ||
      session.userId !== payload.id ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !accountCanAuthenticate(session.user)
    ) {
      throw new UnauthorizedException("Invalid session");
    }
    return safeAuthUser(session.user);
  }
}
