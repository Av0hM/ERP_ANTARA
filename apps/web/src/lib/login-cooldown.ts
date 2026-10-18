export const loginCooldownKey = "antara.auth.rateLimitUntil";
export const loginCooldownMs = 90_000;

/** UX only. An expired timestamp is retained so reloading never restarts it. */
export function loginCooldownUntil(now: number): number {
  const fallback = now + loginCooldownMs;
  try {
    const stored = window.sessionStorage.getItem(loginCooldownKey);
    const timestamp = stored && /^\d+$/.test(stored) ? Number(stored) : NaN;
    if (
      Number.isSafeInteger(timestamp) &&
      timestamp > 0 &&
      timestamp <= fallback
    ) {
      return timestamp;
    }
    window.sessionStorage.setItem(loginCooldownKey, String(fallback));
  } catch {
    // Storage can be disabled; the mounted page still enforces its local timer.
  }
  return fallback;
}

/** A new user-initiated login may start a new cooldown if it receives another 429. */
export function clearExpiredLoginCooldown() {
  try {
    const timestamp = Number(window.sessionStorage.getItem(loginCooldownKey));
    if (timestamp <= Date.now())
      window.sessionStorage.removeItem(loginCooldownKey);
  } catch {
    // Storage is optional and must never prevent a fresh login.
  }
}
