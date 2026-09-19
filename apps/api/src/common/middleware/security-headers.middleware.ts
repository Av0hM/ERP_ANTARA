import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

interface SecurityHeadersConfig {
  contentSecurityPolicy?: string | false;
  hsts?: { maxAge: number; includeSubDomains: boolean; preload: boolean } | false;
  xFrameOptions?: "DENY" | "SAMEORIGIN" | false;
  xContentTypeOptions?: boolean;
  xXssProtection?: boolean;
  referrerPolicy?: string | false;
  permissionsPolicy?: string | false;
  crossOriginEmbedderPolicy?: boolean;
  crossOriginOpenerPolicy?: boolean;
  crossOriginResourcePolicy?: "same-origin" | "same-site" | "cross-origin" | false;
}

const DEFAULT_CONFIG: Required<SecurityHeadersConfig> = {
  contentSecurityPolicy:
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  xFrameOptions: "DENY",
  xContentTypeOptions: true,
  xXssProtection: true,
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy: "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: "same-origin",
};

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  private config: Required<SecurityHeadersConfig>;

  constructor(config?: Partial<SecurityHeadersConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Content Security Policy
    if (this.config.contentSecurityPolicy) {
      res.setHeader("Content-Security-Policy", this.config.contentSecurityPolicy);
    }

    // Strict Transport Security
    if (this.config.hsts) {
      const { maxAge, includeSubDomains, preload } = this.config.hsts;
      let hstsValue = `max-age=${maxAge}`;
      if (includeSubDomains) hstsValue += "; includeSubDomains";
      if (preload) hstsValue += "; preload";
      res.setHeader("Strict-Transport-Security", hstsValue);
    }

    // X-Frame-Options
    if (this.config.xFrameOptions) {
      res.setHeader("X-Frame-Options", this.config.xFrameOptions);
    }

    // X-Content-Type-Options
    if (this.config.xContentTypeOptions) {
      res.setHeader("X-Content-Type-Options", "nosniff");
    }

    // X-XSS-Protection
    if (this.config.xXssProtection) {
      res.setHeader("X-XSS-Protection", "1; mode=block");
    }

    // Referrer Policy
    if (this.config.referrerPolicy) {
      res.setHeader("Referrer-Policy", this.config.referrerPolicy);
    }

    // Permissions Policy
    if (this.config.permissionsPolicy) {
      res.setHeader("Permissions-Policy", this.config.permissionsPolicy);
    }

    // Cross-Origin Embedder Policy
    if (this.config.crossOriginEmbedderPolicy) {
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    }

    // Cross-Origin Opener Policy
    if (this.config.crossOriginOpenerPolicy) {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    }

    // Cross-Origin Resource Policy
    if (this.config.crossOriginResourcePolicy) {
      res.setHeader("Cross-Origin-Resource-Policy", this.config.crossOriginResourcePolicy);
    }

    // Remove server header
    res.removeHeader("X-Powered-By");

    next();
  }
}