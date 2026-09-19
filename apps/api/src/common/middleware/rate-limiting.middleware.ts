import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { ConfigService } from "@nestjs/config";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
  statusCode?: number;
  headers?: boolean;
  skip?: (req: Request) => boolean;
}

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

const DEFAULT_CONFIG: Required<RateLimitConfig> = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
  keyGenerator: (req: Request) => req.ip || "unknown",
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  message: "Too many requests, please try again later.",
  statusCode: 429,
  headers: true,
  skip: () => false,
};

interface RateLimitStore {
  [key: string]: RateLimitInfo;
}

@Injectable()
export class RateLimitingMiddleware implements NestMiddleware {
  private config: Required<RateLimitConfig>;
  private store: RateLimitStore = {};
  private cleanupInterval: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      ...DEFAULT_CONFIG,
      windowMs: configService.get<number>("RATE_LIMIT_WINDOW_MS") ?? DEFAULT_CONFIG.windowMs,
      maxRequests: configService.get<number>("RATE_LIMIT_MAX_REQUESTS") ?? DEFAULT_CONFIG.maxRequests,
    };

    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    this.cleanupInterval.unref();
  }

  use(req: Request, res: Response, next: NextFunction) {
    if (this.config.skip(req)) {
      return next();
    }

    const key = this.config.keyGenerator(req);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Clean old entries for this key
    if (!this.store[key]) {
      this.store[key] = { count: 0, resetTime: now + this.config.windowMs };
    }

    const record = this.store[key];

    // Reset if window has passed
    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + this.config.windowMs;
    }

    // Check if limit exceeded
    if (record.count >= this.config.maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);

      if (this.config.headers) {
        res.setHeader("X-RateLimit-Limit", this.config.maxRequests);
        res.setHeader("X-RateLimit-Remaining", 0);
        res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));
        res.setHeader("Retry-After", retryAfter);
      }

      return res.status(this.config.statusCode).json({
        error: "Too Many Requests",
        message: this.config.message,
        retryAfter,
      });
    }

    // Increment counter
    record.count++;

    // Set headers
    if (this.config.headers) {
      res.setHeader("X-RateLimit-Limit", this.config.maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, this.config.maxRequests - record.count));
      res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));
    }

    next();
  }

  private cleanup() {
    const now = Date.now();
    for (const key of Object.keys(this.store)) {
      const record = this.store[key];
      if (record && record.resetTime < now) {
        delete this.store[key];
      }
    }
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Stricter rate limiting for auth endpoints
export function createAuthRateLimiter(configService: ConfigService): NestMiddleware {
  return new RateLimitingMiddleware(configService);
}

// Lenient rate limiting for API endpoints
export function createApiRateLimiter(configService: ConfigService): NestMiddleware {
  const config = new ConfigService();
  return new RateLimitingMiddleware(configService);
}