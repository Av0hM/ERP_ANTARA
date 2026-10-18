import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { InjectThrottlerStorage, ThrottlerStorage } from "@nestjs/throttler";
import { createHmac, randomBytes } from "node:crypto";
import { Request, Response } from "express";
import { GoogleIdentityService } from "./google-identity.service";
import { refreshLimits } from "./refresh-throttle.guard";

/** Identity budgets are independent of the server-to-server proxy. Source quota
 * is only a flood ceiling, using the existing refresh infrastructure allowance.
 * Never use unverified JWT claims or forwarded headers as identity. */
@Injectable()
export class IdentityThrottleGuard implements CanActivate {
  private readonly secret = randomBytes(32);
  private readonly logger = new Logger(IdentityThrottleGuard.name);
  constructor(
    private readonly google: GoogleIdentityService,
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const operation = context.getHandler().name;
    const source = req.socket.remoteAddress ?? "unknown";
    await this.consume(operation, "source", source, refreshLimits.source, res);
    const body: unknown = req.body;
    if (operation === "googleCallback") {
      const token =
        body && typeof body === "object" && "idToken" in body
          ? body.idToken
          : undefined;
      if (typeof token !== "string" || !token || token.length > 16384) {
        await this.consume(operation, "malformed", source, 20, res);
        return true; // Existing DTO validation rejects malformed input.
      }
      // Bound replay before signature verification. Changing tokens cannot evade
      // the verified-account budget below; random garbage remains source bounded.
      await this.consume(operation, "credential", token, 20, res);
      const identity = await this.google.verify(token);
      await this.consume(operation, "identity", identity.email, 20, res);
    } else {
      const email =
        body && typeof body === "object" && "email" in body
          ? body.email
          : undefined;
      if (typeof email !== "string" || !email.trim() || email.length > 320) {
        await this.consume(operation, "malformed", source, 20, res);
      } else {
        // Target-account brute-force protection, even across different IPs.
        await this.consume(
          operation,
          "identity",
          email.trim().toLowerCase(),
          20,
          res,
        );
      }
    }
    return true;
  }

  private async consume(
    operation: string,
    kind: string,
    value: string,
    limit: number,
    res: Response,
  ) {
    const digest = createHmac("sha256", this.secret)
      .update(value)
      .digest("hex");
    const result = await this.storage.increment(
      `identity:${operation}:${kind}:${digest}`,
      60000,
      limit,
      60000,
      "identity",
    );
    if (result.isBlocked) {
      // No email, token, source address or raw exception enters logs.
      this.logger.warn({
        event: "auth_rate_limited",
        operation,
        bucket: kind,
        identifier: digest,
        limit,
        windowMs: 60000,
      });
      res.setHeader("Retry-After", Math.max(1, result.timeToBlockExpire));
      throw new HttpException(
        {
          statusCode: 429,
          message: "Too many authentication attempts",
          error: "Too Many Requests",
        },
        429,
      );
    }
  }
}
