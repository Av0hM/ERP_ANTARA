import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  NestMiddleware,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomBytes } from "node:crypto";

export const applicationRateLimits = {
  windowMs: 60_000,
  user: 180,
  publicSource: 60,
  sourceFlood: 3600,
  maxKeys: 50_000,
} as const;

// Only server code can enter this WeakMap. No request JSON/header supplies identity.
// The JWT guard consumes after Passport signature/expiry AND current DB session checks.
const pending = new WeakMap<Request, (verifiedUserId?: string) => void>();
export function limitVerifiedApplicationRequest(req: Request, userId?: string) {
  const consume = pending.get(req);
  pending.delete(req);
  consume?.(userId);
}

@Injectable()
export class ApplicationRateLimitInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    // Public handlers without JWT authentication retain a source-based quota.
    limitVerifiedApplicationRequest(
      context.switchToHttp().getRequest<Request>(),
    );
    return next.handle();
  }
}

function exempt(req: Request): boolean {
  return (
    (req.method === "GET" &&
      /^\/api\/health(?:\/(?:live|ready))?\/?$/i.test(req.path)) ||
    // These controllers already enforce their own endpoint policies, including
    // the independent refresh source/credential/session layers. No double quota.
    (req.method === "POST" &&
      /^\/api\/auth\/(?:register|login|google-callback|refresh|logout)\/?$/i.test(
        req.path,
      )) ||
    (req.method === "GET" && /^\/api\/auth\/me\/?$/i.test(req.path)) ||
    (["GET", "POST"].includes(req.method) &&
      /^\/api\/invitations\/?$/i.test(req.path)) ||
    (req.method === "POST" &&
      /^\/api\/invitations\/(?:accept|accept-existing|[^/]+\/revoke)\/?$/i.test(
        req.path,
      )) ||
    (req.method === "GET" &&
      /^\/api\/invitations\/validate\/[^/]+\/?$/i.test(req.path))
  );
}

@Injectable()
export class RateLimitingMiddleware implements NestMiddleware {
  private readonly store = new Map<
    string,
    { count: number; resetTime: number }
  >();
  private readonly secret = randomBytes(32);
  private readonly windowMs: number;
  private readonly userLimit: number;
  private readonly publicLimit: number;
  private readonly sourceLimit: number;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(config: ConfigService) {
    this.windowMs = Number(
      config.get("API_RATE_LIMIT_WINDOW_MS") ?? applicationRateLimits.windowMs,
    );
    this.userLimit = Number(
      config.get("API_RATE_LIMIT_USER_MAX") ?? applicationRateLimits.user,
    );
    this.publicLimit = Number(
      config.get("API_RATE_LIMIT_PUBLIC_SOURCE_MAX") ??
        applicationRateLimits.publicSource,
    );
    this.sourceLimit = Number(
      config.get("API_RATE_LIMIT_SOURCE_FLOOD_MAX") ??
        applicationRateLimits.sourceFlood,
    );
    this.cleanupInterval = setInterval(() => this.cleanup(), this.windowMs);
    this.cleanupInterval.unref();
  }

  use(req: Request, res: Response, next: NextFunction) {
    if (exempt(req)) return next();
    // Socket address deliberately ignores all forwarding headers and trust-proxy settings.
    const source = req.socket.remoteAddress || "unknown";
    try {
      this.consume("source", source, this.sourceLimit, res);
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      return res.status(error.getStatus()).json(error.getResponse());
    }
    pending.set(req, (userId) => {
      this.consume(
        userId ? "user" : "public",
        userId || source,
        userId ? this.userLimit : this.publicLimit,
        res,
      );
    });
    next();
  }

  private consume(
    kind: string,
    identity: string,
    limit: number,
    res: Response,
  ) {
    const key = `${kind}:${createHmac("sha256", this.secret).update(identity).digest("hex")}`;
    const now = Date.now();
    let record = this.store.get(key);
    if (!record || record.resetTime <= now) {
      if (!record && this.store.size >= applicationRateLimits.maxKeys) {
        this.cleanup();
        if (this.store.size >= applicationRateLimits.maxKeys) {
          // Bounded memory; never evict live budgets to admit a flood or fail open.
          res.setHeader("Retry-After", Math.ceil(this.windowMs / 1000));
          throw new ServiceUnavailableException(
            "Request protection temporarily unavailable",
          );
        }
      }
      record = { count: 0, resetTime: now + this.windowMs };
      this.store.set(key, record);
    }
    const retryAfter = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader(
      "X-RateLimit-Remaining",
      Math.max(0, limit - record.count - 1),
    );
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));
    if (record.count >= limit) {
      res.setHeader("Retry-After", retryAfter);
      throw new HttpException(
        {
          statusCode: 429,
          error: "Too Many Requests",
          message: "Too many requests, please try again later.",
          retryAfter,
        },
        429,
      );
    }
    record.count++;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store) {
      if (record.resetTime <= now) this.store.delete(key);
    }
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
  }
}
