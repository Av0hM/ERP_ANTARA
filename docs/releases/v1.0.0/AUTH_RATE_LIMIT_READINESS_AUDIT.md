# Authentication rate-limit production-readiness audit — 2026-10-18

## A. Verdict

**SAFE WITH MINOR NOTES for the current single-API-instance architecture**, after this audit's bounded-memory patch. The original 20-request shared-source Google/login bucket is removed, with cryptographically verified identity selection for Google. This is not a guarantee against deliberate distributed denial of service: source flood ceilings and capacity protection intentionally remain shared emergency limits. **Do not deploy multiple API replicas expecting a cluster-wide 20-attempt limit.** The secondary issuer incident is not resolved without production evidence.

No production connection, deployment, commit/push or environment configuration changes were made. Only disposable local test processes used explicit fixture configuration.

## B. Verified limits

All times below refer to the inspected installed `@nestjs/throttler` 6.7.0 implementation. All auth counters live in process memory, not Redis/PostgreSQL. Default store uses synchronous mutation before returning its promise.

`R` means: each counted request expires after **60,000 ms**; exceeding the limit starts an independent **60,000 ms block**. No clock-aligned fixed window. During a block, hits are not incremented and retries do not extend the block. At block expiry, the next increment resets remaining hits and consumes the first hit of the new budget. Idle cleanup may remove the record first, with equivalent admission behavior.

| Endpoint/layer                           | Tracker                                            |       Limit | Window/reset         | Storage/scope                                                  | Failure                                     |
| ---------------------------------------- | -------------------------------------------------- | ----------: | -------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| POST auth/google-callback identity       | Verified Google email, trim + lowercase            |          20 | R                    | Bounded IdentityThrottleStorage; per endpoint/account/instance | 429 + Retry-After                           |
| POST auth/google-callback repeated-token | HMAC of presented token, before verification       |          20 | R                    | Same store; per token/instance                                 | 429 + Retry-After                           |
| POST auth/login identity                 | Syntactically valid target email, trim + lowercase |          20 | R                    | Same store; per endpoint/account/instance                      | 429 + Retry-After                           |
| Login/Google malformed                   | Socket remoteAddress                               |          20 | R                    | Same store; separate per endpoint/source                       | 429 + Retry-After                           |
| Login/Google flood                       | Socket remoteAddress, ignoring forwarded headers   |        3000 | R                    | Same store; separate per endpoint/source                       | 429 + Retry-After                           |
| Identity-store capacity                  | All live keys in dedicated store                   | 50,000 keys | Idle sweep every 60s | Single instance, no eviction of live budgets                   | 503 + Retry-After: 60                       |
| POST auth/refresh credential/malformed   | HMAC token / req.ip for invalid token shape        |          20 | R                    | Existing default Nest store; instance-local                    | 429 + Retry-After                           |
| POST auth/refresh stable session         | HMAC of DB session ID after credential lookup      |          60 | R                    | Existing store; survives rotation, not restart                 | 429 + Retry-After                           |
| POST auth/refresh flood                  | HMAC req.ip                                        |        3000 | R                    | Existing store; per source                                     | 429 + Retry-After                           |
| Invitations (including acceptance)       | Normalized req.ip + controller/handler             |          20 | R                    | Existing default Nest store; endpoint/source                   | 429 + Retry-After; Nest X-RateLimit headers |
| Register/logout/me                       | Normalized req.ip + controller/handler             |          20 | R                    | Existing default Nest store; endpoint/source                   | 429 + Retry-After; Nest X-RateLimit headers |

The new custom guard returns Retry-After on 429, but does not publish X-RateLimit success headers. Capacity 503 remains infrastructure unavailability, not an account lockout. Existing generic guards have their own X-RateLimit headers. The general application limiter explicitly exempts these auth endpoints, so its 60-request public quota is not an additional hidden restriction.

Exact identity guard key:

`identity:<googleCallback|login>:<source|malformed|credential|identity>:<hex HMAC-SHA256(processRandom32Bytes, value)>`

The verified identity value is GoogleIdentityService's normalized verified email, not JWT `sub`, caller email, browser cookies or IP. This matches the ERP's email-keyed account model. Source/credential keys do not imply authenticated identity. Two tokens with different nonidentity claims still hit the same account budget. Random process keys prevent raw/guessable account identifiers appearing in limiter storage or logs; they are not durable across instances.

## C–G. Exact operational answers

**What happens at 20 Google attempts?** All 20 pass the limiter (authentication can still fail account policy). If another arrives before enough hits expire, it is rejected and starts a 60-second block on the exceeded layer. If hits were at t=0 and rejection at t=10s, the earliest retry is t=70s, not t=60s. A retry at t=69.999s gets Retry-After: 1. At t=70s it is admitted, assuming no other layer is blocked and identity/account remains valid. If no violating request is made, capacity returns as individual hits reach 60s. Timer scheduling can delay expirations under event-loop load; Retry-After and service health govern actual retries. A new token cannot evade a blocked verified-identity layer. Waiting on one layer does not override another layer's block.

**Can one user lock everyone out?** Not by consuming the ordinary 20-attempt identity quota. Yes, a malicious source that sends more than 3000 exchanges inside the live 60s hit interval can trigger the shared emergency block; a distributed attack can force capacity fail-closed responses. This residual denial-of-service possibility is explicit and not equivalent to normal users sharing a tiny budget. Do not advertise absolute outage immunity.

**Can 50 users log in together?** Yes within these limits. One ordinary Google sign-in calls the backend once; the backend verifies twice (guard and service), which is not two API exchanges. Fifty sign-ins use 50/3000 = 1.67% of the source quota. Even 20 attempts each is 1000/3000. Repeated stale retries, callback loops or malicious requests count too; 3001 rapidly arriving requests from a common peer trip the flood block. Existing HTTP tests prove 50 distinct identities pass after an abusive account is denied. There is no automatic backend-auth retry loop in NextAuth's new-account JWT path. Subsequent JWT callbacks refresh separately only when access expiry requires it.

**Restart/redeploy?** Counters, block state, token fingerprints and HMAC key are lost. Users receive fresh budgets; restart is not a security remedy. Authentication/session DB state remains enforced. The tests explicitly prove a fresh instance accepts after another is blocked.

**Multiple instances?** Each independently allows its quota; a load-balanced attacker can obtain up to N times the intended attempt capacity and evade a particular instance's repeated-token block. Sharing only Redis would not fix this while HMAC secrets differ. A future cluster deployment needs coordinated key derivation and an atomic shared store. No Redis or DB architecture change was made in this audit.

## H. Findings by severity

- **Critical:** none found in inspected scope.
- **High, conditional:** multiple API instances defeat a cluster-wide interpretation of limits. Deployment must remain single-instance until explicitly redesigned/tested. Current Render replica topology was not accessed or independently verified.
- **Medium, fixed:** new identity/credential keys previously had no hard live-key cap. Idle cleanup existed, but many simultaneous distributed sources could grow memory. A dedicated IdentityThrottleStorage retains Nest semantics/sweeping and refuses NEW keys at 50,000 with 503, without evicting live budgets. Existing keys remain usable when otherwise permitted. Invalid email syntax now goes to a shared malformed bucket, not unique account buckets. The capacity is an admission bound, not a raised rate limit.
- **Medium, residual:** shared source flood blocking, in-memory restart/replica limitations, and targeted password account lockout remain. Before verification, distinct bad Google token strings can reach the verifier until the 3000/source ceiling; this is bounded, not zero-cost. Valid exchanges verify twice. Review inference-free authentication CPU/network saturation at the edge; no arbitrary forwarded-IP trust is introduced.
- **Medium, terminology corrected:** the token layer is repeated-use throttling, **not one-time replay prevention**. It stores only an HMAC fingerprint before verification. It permits up to 20 uses and expires/blocks as R. A lost successful response can be retried; a second success creates another backend session because session issuance is not idempotent. A stolen valid audience-bound ID token remains a bearer credential until expiry; the fingerprint is not a revocation list. Adding single-use nonce/idempotency semantics would be an auth protocol change, not a safe incidental limiter patch.
- **Low:** Google backend failures still reach Auth.js's generic CallbackRouteError/configuration page. Password UI distinguishes rate-limited from unavailable. Backend helper correctly distinguishes 401/403, 429 and 500/503/timeout; the Google page is a UX limitation, not incorrect backend classification. No OAuth checks were bypassed to change the error screen.
- **Low:** per-rejection warnings can be noisy under attack. Aggregate by operation/bucket, not identifier as a metric label. Existing invitation/logout/me shared 20/source quotas were deliberately preserved and can constrain those workflows independently; they do not consume Google/login identity quotas.

### Storage, cleanup and concurrency details

Nest schedules one expiry timeout per counted hit, and an unref'ed 60s idle sweep. A blocked request does not add another hit/timeout. Idle records are removed once there are no pending hits, no active block and record expiry has passed. For an idle key, cleanup is within roughly 120s of last activity (plus scheduling delay); continuously active keys can remain indefinitely. Existing refresh/invitation default storage has idle cleanup but no new global hard cap from this patch.

The dedicated key cap and synchronous admission/increment prevent concurrent admission from exceeding the bound. Hit increment/check contains no await or external I/O; 19 prior identity hits plus 10 concurrent calls admit exactly one. Google verification awaits before consuming identity, but consumption itself is synchronous. These are process-level guarantees, not distributed atomicity. Timers/storage still consume resources up to the configured bounds; rate limiting is not a replacement for perimeter DDoS protection.

## I. Code inspected (not just prior incident notes)

Backend:

- `apps/api/src/modules/auth/{auth.controller.ts,auth.module.ts,auth.service.ts,google-identity.service.ts,identity-throttle.guard.ts,refresh-throttle.guard.ts}` and their focused tests.
- Auth DTOs `login.dto.ts`, `google-callback.dto.ts`.
- `apps/api/src/main.ts`, `apps/api/src/app.module.ts`.
- `apps/api/src/common/middleware/{rate-limiting.middleware.ts,api-versioning.middleware.ts}`.
- `apps/api/src/common/errors/safe-exception.filter.ts`.
- `apps/api/src/common/sessions/session.service.ts`.
- `apps/api/src/modules/invitations/invitations.controller.ts`.
- `apps/api/src/modules/users/{account-lifecycle.service.ts,owner-quorum.ts}`.
- `apps/api/src/common/guards/roles.guard.ts`.
- Installed `@nestjs/throttler/dist/{throttler.guard.js,throttler.service.js,throttler.service.d.ts}`.

Web:

- `apps/web/src/auth.ts`, `apps/web/src/lib/backend-auth.ts`, backend-auth tests.
- `apps/web/src/app/api/auth/[...nextauth]/route.ts`, `apps/web/src/middleware.ts`, `apps/web/next.config.ts`, `apps/web/src/components/auth/login-form.tsx`.
- Installed Auth.js OAuth callback, general callback, Google provider, provider normalization, authorization URL and logger implementations; oauth4webapi `validateAuthResponse`.
- Local installed versions: NextAuth 5.0.0-beta.32; oauth4webapi 3.8.8; Nest throttler 6.7.0. Production installed versions were not assumed identical.

The old default tracker is normalized req.ip; default key is SHA256(controllerName-handlerName-throttlerName-tracker). Express's default proxy trust is false and the API does not enable it. Therefore shared server-to-server requests can share an API network peer even if browsers differ. The exact Render peer address is unknown without deployment telemetry. New identity guard uses socket.remoteAddress directly. X-Forwarded-For cannot select any new identity/source bucket. NextAuth trustHost handles host URLs; it does not enable Express proxy trust.

## J–K. Audit changes and regression coverage

Changed: auth.module.ts (dedicated bounded storage registration), identity-throttle.guard.ts (storage injection/capacity response and email syntax gate), identity-throttle.guard.spec.ts (precise timing, cross-IP/browser identity, concurrency, retry/restart and malformed key tests), identity-throttle.http.spec.ts (bounded provider registration and 50 independent identities), google-identity.service.spec.ts (real offline cryptographic verification linked to guard), web backend-auth.spec.ts (503 and timeout mapping), prior incident note (corrected storage/replay/reset claims).

Created: identity-throttle.storage.ts, identity-throttle.storage.spec.ts, web oauth-issuer.spec.ts, this audit report. No production auth/session/OAuth policy was changed. Test doubles simulate Google certificate retrieval, not signature verification in the cryptographic regression. HTTP tests use the real controller/guards with fixture services; PostgreSQL tests separately exercise real user/session/role transactions.

## L. Validation commands/results

- `npm run test --workspace @antara/api -- --runTestsByPath src/modules/auth/identity-throttle.guard.spec.ts src/modules/auth/identity-throttle.storage.spec.ts` — 2 suites, **15 passed**.
- `npm run test --workspace @antara/api -- --runTestsByPath src/modules/auth/identity-throttle.http.spec.ts src/common/middleware/rate-limiting.middleware.spec.ts` — 2 suites, **25 passed**, loopback HTTP listeners.
- `npm run test:auth --workspace @antara/api` — 6 suites, **54 passed**, including real offline Google signature checks and refresh/invitation regressions.
- `AUTH_TEST_DATABASE_URL=postgresql://auth_audit@127.0.0.1:55471/antara_phase2_test_rate_audit npm run test:auth:integration --workspace @antara/api` — **58 passed**, fresh isolated PostgreSQL, full migration/session/rotation/quorum/deactivation/invitation tests. Initial fixture name `auth_audit` was rejected by the safety check; rerun used the required test-only name. No assertions were removed.
- `npm run test:authorization --workspace @antara/api` — 2 suites, **196 passed**.
- `npm run lint --workspace @antara/api` — passed (`tsc --noEmit`).
- `npm run build --workspace @antara/api` — passed (including postbuild).
- `npm run lint --workspace @antara/web` — passed (`tsc --noEmit`).
- From apps/web: `../../node_modules/.bin/playwright test --config playwright.auth-audit.config.ts` — **13 passed** (backend-auth and offline OAuth parser). Temporary config selected only these tests with no web server/browser requirement; removed afterward. These are Playwright-run boundary tests, not a live Google browser smoke test.
- Prettier checks on audit-modified files and `git diff --check` — recorded in final verification. No broad unrelated formatting.

## M–N. Production smoke test and monitoring (not executed)

1. Confirm the intended API deployment is a single instance and uses the reviewed package lock/runtime.
2. Deploy only through the normal approved process. No migration/new environment variables are required by this patch.
3. Sign in two approved accounts from the same Web service; verify backend session creation and protected reads.
4. In a controlled test environment, consume one account's 20 attempts, observe 429 with Retry-After, verify another account still succeeds, and retry after the block. Do not deliberately flood production or lock real team accounts.
5. Verify inactive/non-allowlisted accounts remain denied, refresh rotates, logout revokes; confirm Google/provider failures are not counted as completed sessions.
6. Watch `backend_auth_rate_limited` by endpoint and `auth_rate_limited` by operation/bucket. Alert on source floods, sustained identity 429s, capacity 503s, abnormal callback frequency, verification latency and auth session failure rates.
7. Logs contain HMAC bucket identifiers for within-instance correlation, never raw email, password, token, code or forwarded IP. Do not enable Auth.js debug logging in production: its installed debug paths include callback parameters/provider responses. Do not put opaque IDs in unbounded metric labels.
8. Record rollout/restart times since they reset rate budgets; a redeploy clearing the symptom is not evidence of a durable fix.

## O. Issuer error: established mechanism, unknown production cause

The installed Auth.js Google provider is OIDC with issuer `https://accounts.google.com`. No custom response_mode is configured. Callback parsing uses query parameters by default, body only for explicit form_post. App route handlers pass the Request unchanged; locale middleware excludes /api, and Next config has no callback rewrite. Auth.js discovers metadata, then invokes oauth4webapi.validateAuthResponse before JWT callback/backend exchange. Missing `iss` is rejected exactly when discovery advertises `authorization_response_iss_parameter_supported=true`. Tests reproduce this offline and reject wrong issuer/state as well.

Normal browser refresh/replay of an intact callback URL does not itself remove iss, although it can later fail code/PKCE consumption. A truncated/bookmarked/rewritten callback or wrong response_mode could omit it; these are hypotheses, not established production facts. Cloudflare/Render rewrite rules and actual callback/discovery metadata were not accessed. The installed default checks are PKCE, with state added by Auth.js when redirectProxyUrl is configured; this audit does not claim an explicit state override exists in the app, and changes none of these settings.

Capture next time: timestamp/correlation ID, provider ID, deployed dependency versions, HTTP method, response_mode, callback path and parameter **names only**, presence flags for iss/state/code, expected issuer and issuer-support boolean from discovery, whether received iss matches expected, and non-secret redirect URI origin/path before/after proxy. Never capture full query/body, authorization code, state value, ID token, cookie, client secret or bearer credential. Preserve issuer/state/PKCE validation. Evidence is insufficient to attribute the production iss incident to a specific proxy or provider action.
