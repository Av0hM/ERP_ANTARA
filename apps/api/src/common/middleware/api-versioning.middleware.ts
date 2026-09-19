import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

export interface ApiVersion {
  major: number;
  minor: number;
  patch: number;
  deprecated?: boolean;
  sunsetDate?: string;
}

const API_VERSIONS: Record<string, ApiVersion> = {
  "1": { major: 1, minor: 0, patch: 0 },
  "2": { major: 2, minor: 0, patch: 0, deprecated: true, sunsetDate: "2025-12-31" },
};

const DEFAULT_VERSION = "1";
const SUPPORTED_VERSIONS = Object.keys(API_VERSIONS) as string[];

function extractVersion(path: string): string {
  const match = path.match(/^\/api\/v(\d+)\//);
  if (match && match[1]) {
    return match[1];
  }
  return DEFAULT_VERSION;
}

function isSupportedVersion(version: string): version is keyof typeof API_VERSIONS {
  return SUPPORTED_VERSIONS.includes(version);
}

export class ApiVersioningMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Extract version from URL path (/api/v1/..., /api/v2/...)
    let version = extractVersion(req.path);

    // Validate version
    if (!isSupportedVersion(version)) {
      version = DEFAULT_VERSION;
      // Rewrite URL to use default version
      req.url = req.url.replace(/^\/api\/v\d+\//, `/api/v${DEFAULT_VERSION}/`);
    }

    // We know version is now a valid key because of isSupportedVersion check
    const versionInfo = API_VERSIONS[version]!;

    // Set version headers
    res.setHeader("X-API-Version", version);
    res.setHeader("X-API-Deprecated", versionInfo.deprecated?.toString() || "false");
    if (versionInfo.sunsetDate) {
      res.setHeader("X-API-Sunset-Date", versionInfo.sunsetDate);
    }

    // Add deprecation warning header if deprecated
    if (versionInfo.deprecated) {
      res.setHeader("Warning", `299 - "API version ${version} is deprecated. Sunset date: ${versionInfo.sunsetDate}"`);
    }

    // Attach version info to request for downstream use
    (req as any).apiVersion = version;
    (req as any).apiVersionInfo = versionInfo;

    next();
  }
}

export function getApiVersion(req: Request): string {
  return (req as any).apiVersion || DEFAULT_VERSION;
}

export function getApiVersionInfo(req: Request): ApiVersion {
  return (req as any).apiVersionInfo || API_VERSIONS[DEFAULT_VERSION];
}

export function isVersionDeprecated(version: string): boolean {
  return API_VERSIONS[version]?.deprecated ?? false;
}

export function getSupportedVersions(): string[] {
  return SUPPORTED_VERSIONS;
}