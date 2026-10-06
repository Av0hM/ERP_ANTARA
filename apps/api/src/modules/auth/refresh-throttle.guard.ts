import { CanActivate, ExecutionContext, HttpException, Inject, Injectable } from "@nestjs/common";
import { InjectThrottlerStorage, ThrottlerStorage } from "@nestjs/throttler";
import { PrismaClient } from "@prisma/client";
import { createHmac, randomBytes } from "node:crypto";
import { Response } from "express";
import { PrismaService } from "../../common/prisma/prisma.service";
import { refreshDigest } from "../../common/sessions/session.service";

export const refreshLimits = { ttl: 60000, source: 3000, credential: 20, session: 60 } as const;

/** Storage adapter is Nest's replaceable ThrottlerStorage. Only opaque, keyed
 * identifiers leave this guard; never put a usable credential in a storage key.
 */
@Injectable()
export class RefreshThrottleGuard implements CanActivate {
  private readonly keySecret = randomBytes(32);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaClient,
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ body?: unknown; ip?: string }>();
    const response = context.switchToHttp().getResponse<Response>();
    // req.ip follows Express's existing trust-proxy setting. Never parse forwarded headers.
    const source = request.ip ?? "unknown";
    await this.consume("source", source, refreshLimits.source, response);
    const body = request.body;
    const token = body && typeof body === "object" && "refreshToken" in body ? body.refreshToken : undefined;
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
      await this.consume("malformed", source, refreshLimits.credential, response);
      return true; // DTO/session validation supplies the authentication error.
    }
    await this.consume("credential", token, refreshLimits.credential, response);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: refreshDigest(token) }, select: { id: true },
    });
    // A stable bucket survives credential rotation. Lookup conveys NO authentication.
    if (session) await this.consume("session", session.id, refreshLimits.session, response);
    return true;
  }

  private async consume(kind: string, value: string, limit: number, response: Response) {
    const key = `refresh:${kind}:${createHmac("sha256", this.keySecret).update(kind).update(":").update(value).digest("hex")}`;
    const result = await this.storage.increment(key, refreshLimits.ttl, limit, refreshLimits.ttl, "refresh");
    if (result.isBlocked) {
      response.setHeader("Retry-After", Math.max(1, result.timeToBlockExpire));
      throw new HttpException({ statusCode: 429, message: "Too many refresh attempts", error: "Too Many Requests" }, 429);
    }
  }
}
