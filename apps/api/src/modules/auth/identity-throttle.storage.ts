import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ThrottlerStorageService } from "@nestjs/throttler";

export const identityMaxKeys = 50_000;

/** Dedicated admission bound for unauthenticated, attacker-selected keys.
 * Keep Nest's existing hit expiry/block semantics and idle sweeper. Never evict
 * live budgets to admit new identities (that would permit limit bypass).
 * Single-process only, like the existing ThrottlerStorageService deployment.
 */
@Injectable()
export class IdentityThrottleStorage extends ThrottlerStorageService {
  override async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    // No await between admission and super.increment's synchronous mutation.
    if (!this.storage.has(key) && this.storage.size >= identityMaxKeys) {
      throw new ServiceUnavailableException(
        "Authentication protection at capacity",
      );
    }
    return super.increment(key, ttl, limit, blockDuration, throttlerName);
  }
}
