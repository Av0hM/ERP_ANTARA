# Google authentication rate-limit investigation

## Conclusion

The reported production loop is **not reproduced by the checked-out source** under a quiet, single-request login. The production root cause and rejecting bucket cannot be established without the corresponding API `auth_rate_limited` log and deployed revision. Do not infer an identity bucket merely from the cooldown redirect: it means the web server received HTTP 429, potentially from a proxy or a different deployed limiter.

A concrete diagnostic/UX defect was found: `authenticateWithBackend` discarded `Retry-After`. The Google path now carries its deadline to the cooldown page, logs it without credentials, and waits at least the normal 90 seconds for a new cooldown, or longer if required. This does not explain a loop from the current 60-second limiter alone.

No API runtime change, limit increase, OAuth verification change, deployment, commit, or push was made. An API redeploy is not established as necessary; compare the deployed artifact to this source first. The web changes would require a future web deployment to take effect.

## Exchange trace and duplicate audit

Installed versions inspected locally: next-auth 5.0.0-beta.32, its nested @auth/core 0.41.3, @nestjs/throttler 6.7.0.

1. LoginForm's user click calls client `signIn("google")`. A synchronous ref blocks concurrent clicks in that form. The invitation form has a separate explicit Google button; neither form has an automatic Google sign-in effect.
2. Auth.js obtains and validates the OAuth response before calling `handleAuthorized` once in its OAuth callback branch (`node_modules/next-auth/node_modules/@auth/core/lib/actions/callback/index.js`). Its `callbacks.signIn` invokes `backendSignIn`.
3. `backendSignIn` invokes `authenticateWithBackend` once. It performs one fetch POST to `/auth/google-callback`, with no application retry.
4. With no adapter configured, Auth.js `handleLoginOrRegister` returns the same user. The JWT callback copies the backend identity/tokens; it does not exchange the Google token again.
5. Session reads call JWT/session callbacks, not signIn. JWT refresh calls `/auth/refresh` only. SessionProvider does not configure interval polling; focus/session events do not exchange Google credentials.
6. Middleware handles locale routing only at `/`, `/en`, `/hi`. Login's authenticated-session effect redirects to the destination; it does not authenticate. Returning a cooldown URL from signIn ends that callback before JWT creation.

Thus a normal successful OAuth transaction makes **one application backend exchange**. A second independently accepted OAuth callback would execute signIn again: there is no global memoization or cross-request deduplication. OAuth code/state validation precedes this point. Network-level proxy retries or fetch-followed HTTP redirects are outside this application call count; no backend redirect is configured in the inspected auth route. There is no claim that this source audit proves production traffic counts.

The production callbacks were moved unchanged into `lib/auth-callbacks.ts` so tests execute the actual signIn, JWT, and session implementations, including repeated session reads and access-token refresh.

## Error and cooldown state

All production BackendAuthError construction sites are in backend-auth.ts. Only a response with HTTP status 429 selects `rate_limited`; 401/403 select credentials, and other statuses, invalid payloads, network failures, and timeouts select backend_unavailable. Neither errors nor their classification are cached across calls. Tests cover 429 followed by a successful fresh attempt.

sessionStorage is used only by the client countdown helpers, never by server authentication or classification. Neither an active nor expired stored timestamp redirects `/login`. Expired timestamps are removed on login mount, starting a sign-in, or clicking Back to login. The cooldown page deliberately retains its expired timestamp while mounted/reloaded so a reload does not restart the timer; leaving for login removes it. This preserves the existing reload behavior.

## Limiter semantics and buckets

IdentityThrottleStorage only adds the 50,000-key admission bound; it delegates hit/block behavior to the installed Nest storage. The guard consumes source (3000), credential (20), then verified identity (20) for a valid Google token, each with 60,000ms TTL and block duration. A malformed token has a separate malformed bucket. The generic middleware exempts these POST auth routes and the controller skips the global throttler.

Nest increments hits only while unblocked and blocks on `totalHits > limit`: 20 is allowed, 21 is rejected. It sets `blockExpiresAt` only on the transition to blocked. Rejected requests do not add hits or change that deadline. At `timeToBlockExpire <= 0`, increment clears the blocked state, resets hits/timers, and counts the new request as hit one. The idle sweeper also removes expired, idle records. The returned timeToBlockExpire is in seconds; the guard correctly uses it for Retry-After.

The regression fixture uses distinct tokens for one verified account, proving its rejection is specifically the **identity** bucket, not credential or source. This is a test finding, not identification of the production bucket. Continuing traffic can exhaust a new window after expiry, especially the shared source bucket; a quiet 90-second wait is not equivalent to a quiet shared source.

## Validation and limits

- API storage/guard/HTTP suites: boundary tests for request 20/21, rejection at 59s without deadline extension, admission at exactly 60s and at 90s, and idle cleanup.
- HTTP integration: actual Nest AuthController + IdentityThrottleGuard + IdentityThrottleStorage, with mocked Google verification/session issuance; calls the actual web backendSignIn helper. Exhausts verified identity, receives 429, advances the clock 90s, asserts success (true, not a redirect) and exactly one fetch. This is not a live Google OAuth/browser end-to-end test.
- Web callback tests: actual configured callback implementations, repeated session reads, refresh endpoint isolation, error classification and no cross-attempt error persistence.
- Browser tests: countdown boundaries/reload/storage failure, expired-key removal, stored-state non-redirection, and a 180-second backend deadline surviving reload.
- Retry-After parser tests: seconds, HTTP dates, missing/invalid/past values. Google redirects preserve the deadline; the credentials form's existing rate-limit path remains a fixed cooldown.

Production follow-up: correlate the failed attempt's timestamp with `backend_auth_rate_limited` (endpoint/status/deadline) and API `auth_rate_limited` (operation/bucket), inspect ingress/proxy 429s if no API match, and compare deployed API/web revisions. Those observations are needed before naming an exact production cause or prescribing API redeployment.

## Files changed

- `apps/web/src/auth.ts`: wires the extracted callbacks.
- `apps/web/src/lib/auth-callbacks.ts`: same production callbacks, now directly testable.
- `apps/web/src/lib/backend-auth.ts`: parse/log/retain Retry-After for HTTP 429.
- `apps/web/src/lib/backend-sign-in.ts`: preserve the Google retry deadline in the cooldown redirect.
- `apps/web/src/lib/login-cooldown.ts`: preserve backend deadlines across reloads.
- `apps/web/src/components/auth/login-cooldown.tsx`: consume the deadline and describe the variable countdown.
- `apps/web/src/app/(auth)/login/rate-limited/page.tsx`: validate the numeric deadline query.
- `apps/web/src/components/auth/login-form.tsx`: remove expired cooldown state on mount.
- `apps/web/tests/backend-auth.spec.ts`: Retry-After parser regression.
- `apps/web/tests/backend-sign-in.spec.ts`: real callback sequence and fresh-attempt isolation.
- `apps/web/tests/login-cooldown.spec.ts`: longer deadlines and stored-state non-redirection/removal.
- `apps/api/src/modules/auth/identity-throttle.storage.spec.ts`: exact expiry boundaries and fixed block deadline.
- `apps/api/src/modules/auth/identity-throttle.http.spec.ts`: web helper plus Nest HTTP recovery regression.
- `docs/investigations/google-auth-rate-limit-loop.md`: this evidence and limitations report.

## Recorded results

- `npm run test --workspace @antara/api -- --runTestsByPath src/modules/auth/identity-throttle.storage.spec.ts src/modules/auth/identity-throttle.http.spec.ts src/modules/auth/identity-throttle.guard.spec.ts`: **20 passed**, three suites. Local listener required running outside the sandbox.
- `npx playwright test --config playwright.auth.config.ts` (apps/web): **34 passed**, one existing OAuth error-page navigation test exceeded its 30-second total timeout.
- `npx playwright test --config playwright.auth.config.ts auth-feedback.spec.ts login-cooldown.spec.ts --timeout=60000`: **11 passed**, including that navigation test (31.2 seconds) and two newly added storage-state tests. Across these runs all **37 distinct web auth tests** passed; the initial timeout is retained here for transparency.
- `npm run lint --workspace @antara/web`: passed after all code changes.
- `git diff --check`: passed.
