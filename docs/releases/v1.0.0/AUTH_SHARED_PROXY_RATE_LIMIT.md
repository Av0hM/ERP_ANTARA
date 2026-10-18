# Authentication behind shared server-side egress

## Incident and request trace

Google authorization returns to NextAuth's `/api/auth/callback/google`. Auth.js validates the OAuth response and obtains an ID token before calling the application's JWT callback. That callback calls `authenticateWithBackend(API_URL, "google-callback", { idToken })`, issuing **POST `${API_URL}/auth/google-callback`**. A backend 429 becomes `BackendAuthError: rate_limited`, which escapes the JWT callback as `CallbackRouteError`. This is not the refresh request: refresh runs on subsequent JWT callbacks without a new Google account.

Credentials login similarly calls POST `/auth/login`. Subsequent session refresh calls `/auth/refresh`; sign-out revokes through `/auth/logout`. The backend remains responsible for Google verification, allowlisting/onboarding, active account checks and token issuance.

Previously AuthController's Nest ThrottlerGuard imposed 20 requests/minute keyed by controller + handler + normalized Express `req.ip`. `main.ts` does not configure trust proxy, so this is the socket peer, not a forwarded browser address. The general application middleware explicitly exempts these auth routes. Requests from NextAuth sharing the same API-side network peer share the same endpoint bucket, irrespective of browser, cookies or incognito. Render may expose an internal proxy peer rather than the web instance itself; the exact deployed address is not verified by repository inspection. Either way the small budget is not user-specific.

## Patch and abuse protections

Login and Google callback now skip only the old generic quota and use IdentityThrottleGuard:

- Google: 20/minute per verified, normalized Google email, independent of token rotation; 20/minute per presented token bounds repeated use before verification (not single-use replay prevention). GoogleIdentityService verifies signatures/claims before selecting identity. AuthService retains its own verification and all existing account policy checks.
- Credentials: 20/minute per normalized target email, including failed password attempts across IPs. The bucket does not imply authentication or reveal account existence.
- Malformed input: 20/minute per socket source in a separate bucket; exhausting this does not exhaust valid identities.
- Each endpoint retains a 3000/minute source flood ceiling, matching the existing refresh guard's shared-infrastructure allowance. This is a last-resort capacity limit, not a replacement login quota. Large floods can still cause source-wide protection; arbitrary random identities/tokens cannot bypass this ceiling.
- Forwarded headers are never trusted. No browser-supplied user ID or decoded unverified Google claims select verified identity.
- Refresh retains its existing credential/session/source layers. Invitation acceptance retains its existing protection. Register/logout/me behavior is unchanged.

All keys use process-keyed HMACs. IdentityThrottleStorage now subclasses Nest's in-memory store with a 50,000-live-key admission cap; new keys at capacity receive 503 rather than evicting live budgets. Invalid email syntax uses the malformed bucket. This is compatible with the current single API instance. Multiple replicas would require shared limiter storage and a coordinated key-secret design before deployment.

API warnings identify operation, bucket type, opaque identifier and limit; web warnings identify exact auth endpoint and HTTP 429. Neither logs email, passwords, ID tokens, source addresses or backend response bodies. Account-level lockout is still possible for deliberately targeted password accounts; unrelated accounts no longer share the small quota.

## Secondary issuer error

The installed oauth4webapi throws `response parameter "iss" (issuer) missing` during `validateAuthResponse` when discovered `authorization_response_iss_parameter_supported` is true and the callback parameters lack `iss`. Auth.js calls this before the application's JWT callback. It is not caused by Nest's 429 and is distinct from the ID token's issuer verification in GoogleIdentityService.

The Google provider uses the standard accounts.google.com issuer. Repository locale middleware excludes `/api`; no custom callback query stripping or issuer override was found. No issuer/state/PKCE validation was disabled. To establish the production-specific cause, capture only callback parameter **names**, discovered issuer-support boolean, resolved provider ID, deployed Auth.js/oauth4webapi versions and redirect URI. Do not capture code/state/token values. Investigate callback URL rewriting or a provider/discovery mismatch using that evidence; repository inspection alone cannot prove which happened.

## Deployment and verification

Deploy the compatible API patch; the web diagnostic can deploy independently. No new environment variables, migrations, proxy-trust changes or production data operations are required. Existing single-instance in-memory buckets reset on restart as before. Verify two distinct accounts can authenticate while one account hits its own 429 budget. Do not intentionally flood production.

Offline tests cover identity isolation, token rotation/replay, forged forwarding headers, malformed input, source flood limits, expiry, sanitized logs and actual Nest controller HTTP routing. Existing Google signature validation and refresh tests remain authoritative. No production services were contacted for this patch.

## 2026-10-18 production-readiness audit

The exact limiter is a per-hit 60,000 ms expiry counter plus a separate 60,000 ms penalty on exceeding the quota, not a fixed window. Request 20 passes; request 21 starts the block. Retry-After is the ceiling of remaining block seconds. Blocked retries do not extend the block. See `AUTH_RATE_LIMIT_READINESS_AUDIT.md` for measured boundaries, storage/memory limitations, full tests and the conditional single-instance deployment verdict.
