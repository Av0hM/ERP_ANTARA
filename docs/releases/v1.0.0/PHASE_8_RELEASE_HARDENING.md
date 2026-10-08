# Phase 8 — release hardening and RC evidence

Target: `v1.0.0-rc.1`. No tag, commit, push, deployment, production connection, live provider call, DNS change or production bootstrap was performed.

## Release decision

**READY WITH OPERATOR ACTIONS after Phase 8.1 local validation.** This is not final v1 approval. Local migration/bootstrap and offline security/browser evidence are available below. Live identity/storage/provider configuration and the actual production image must be verified before reopening traffic. AI may launch explicitly disabled.

Specific unresolved release risks:

1. The generic shared-proxy limiter code blocker is resolved by the Phase 8.1 amendment below: verified-account quota plus independent source/public bounds, with unchanged specialized auth limits and no forwarded-header trust. Production concurrency/capacity verification remains an operator gate. The rejected blanket increase was never applied.
2. Live Render operator settings require verification. Local Node22 Alpine API/web images now build and start successfully; this does not certify the live deployment plan capacity, Google console, DNS or cloud providers.
3. Dependency risk acceptance: no remaining critical advisory; remaining high findings are build/test/config-tool paths, detailed in the evidence artifact. Do not accept untrusted source/CSS/glob/YAML configuration into those tools. Major Jest/Tailwind/Prisma changes were deliberately deferred.
4. The reviewed release SHA does not yet exist: Phase 8.1 changes remain uncommitted by request. HEAD alone is not the tested release candidate. Review all changes, then separately authorize a commit/tag after gates and operator checklist.

## Exact source and runtime evidence

Starting HEAD: `28dfc1d66303d65f70197d87c50274007caea0f8` (main). Node `v24.18.0`, npm `11.16.0`; Docker/CI specify Node22/npm11.6.2; both actual Alpine release images were built locally and smoke-tested. Lockfile SHA and exact resolved package versions are in `evidence/phase8-dependency-audit.json` and `evidence/phase8-dependency-inventory.json`. Inventory is a lightweight lockfile inventory, not a certified SBOM. The full changed-file inventory separates Phase 8 from pre-existing approved work in `evidence/phase8-files.json`.

## Release-blocking defects corrected

- Removed redundant vulnerable direct `@auth/core`; NextAuth already depended on patched core. Applied compatible npm security updates, including Next 15.5.27, multer 2.4.0 and API socket.io-client 4.8.4. No force or broad major upgrade.
- API validates database/Redis URL syntax, production HTTPS origin and non-placeholder JWT secrets before module initialization; numeric port/limiter settings are parsed and bounded.
- Production web no longer falls back to a development NextAuth secret. Runtime instrumentation checks secret and API/auth URL syntax. Explicit loopback HTTP remains usable for isolated production-build tests; public production origins require HTTPS.
- Removed duplicate API CORS setup and the obsolete TypeScript suppression. Shutdown hooks now run. No forwarded header trust was enabled.
- Actual filesystem capacity replaces fabricated disk figures. Database/disk failure fails readiness; optional Redis failure degrades it. Health polling does not consume the general API bucket. Redis cache connection/command waits are bounded to three seconds.
- Unexpected server failures return a stable sanitized error and log only status/code; email provider exceptions are neither printed nor retained as raw queue failure messages.
- Web sends frame, nosniff, referrer and HTTPS HSTS protections. Its limited CSP protects framing/base/object content without pretending to be a nonce-based script policy. API CSP no longer allows arbitrary HTTPS/websocket destinations or eval. HSTS does not opt unrelated subdomains into preload.
- Render blueprint disables automatic deploys, fixes web origin to `https://erp.project-antara.space`, removes obsolete OpenAI variables and includes backend Google identity/allowlist configuration. Provider features default off until deliberately configured.
- Migration workflow is manual-only, requires an acknowledgement and `production` environment. Operator must configure required environment reviewers. Prisma advisory locking is no longer disabled.
- Standalone web Docker image includes `public` assets and explicit compiled API URL build arguments. Browser harness starts the real standalone layout rather than unsupported `next start`.
- Ordinary canonical seed refuses production; deliberate Phase 1C provisioning remains the operator path. Dummy seed/login production prohibitions remain intact. `.gitignore` covers environment variants and backup dumps.
- Offline temp cleanup requires stopped API writers, matching ANTARA-only directory names, same OS owner, non-symlink directories, and minimum age 24 hours. No automatic destructive scheduler.

## Migration audit and restored-copy rehearsal

No migration was modified or added in Phase 8. The chain is:

| Migration                               | SHA-256                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| 20260921000000_init                     | 83d550d1662edac027948bcf48a8a2b15be300ea1f518e187cf374a6e3b5db52 |
| 20261005000000_dummy_seed_marker        | ab3b732dd94327c491c711ab9b3a20270cde1aafb80d3ff65010bdf6531ec5c3 |
| 20261006000000_phase_1a_foundation      | 8df17a3a1c8d9358ca6fb035ea8b6c9ac6d0f97297f72c219d333441ebcda19d |
| 20261007000000_phase_2_session_security | 257086475948fd0cb6c96179188454eafc3c75e6fdcedfa52070864ef3afff92 |
| 20261008000000_phase_6_storage          | 06bf0aec051e336f14b01eceb481885d915a3636d1b257dcfc33fbc42a19c04f |
| 20261009000000_phase_7_ai_jobs          | cf8a9df4aa41346f526b37a28b2dc891327be4e0b9aad355717a7406548aa592 |

Approved immutable input: `/home/sammo/antara-v1-backups/antara-prod-20261007-185820.dump`, 51,833 bytes, backup timestamp `2026-10-07 18:58:44.147922298 +0530`; source operator-attested ANTARA ERP production PostgreSQL/Neon. Original restore timestamp `2026-10-07T18:58:44+05:30`. Backup SHA-256 before/after: `bfd1633ecec62de4914bf259beed0ee69e6e4b140a072ee0923d7f88c9bea902`.

Phase 8 created a **new** database `antara_phase8_rehearsal_20261008` on local PostgreSQL `127.0.0.1:55461`; neither production nor the previous Phase 1C restore was changed. `pg_restore --no-owner --no-privileges` restored the immutable dump. Initial identity/counts and first four applied checksums matched exactly: one active MEMBER (`cmuvhzwq10001d301zl97hox6`), zero subsystems/memberships/tasks/decisions/invitations, one historical session.

Explicit local commands used (non-secret fixture URL only):

```sh
createdb -h 127.0.0.1 -p 55461 -U phase1a antara_phase8_rehearsal_20261008
pg_restore --no-owner --no-privileges --dbname=postgresql://phase1a@127.0.0.1:55461/antara_phase8_rehearsal_20261008 /home/sammo/antara-v1-backups/antara-prod-20261007-185820.dump
export DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase8_rehearsal_20261008
export DIRECT_URL="$DATABASE_URL"
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
export PHASE1C_DATABASE_URL="$DATABASE_URL"
npm run bootstrap:v1 --workspace @antara/api -- --action provision --mode local --user-id cmuvhzwq10001d301zl97hox6 --ack LOCAL_RESTORE_BOOTSTRAP
npm run bootstrap:v1-owner --workspace @antara/api -- --mode local --user-id cmuvhzwq10001d301zl97hox6 --ack LOCAL_RESTORE_BOOTSTRAP
npm run verify:release --workspace @antara/api -- --mode local --user-id cmuvhzwq10001d301zl97hox6 --ack LOCAL_RESTORE_BOOTSTRAP
```

Final verifier: same active/non-deleted user is global OWNER; five canonical subsystems; no fabricated memberships/tasks/decisions/invitations/files/AI jobs; zero role conflicts/invalid assignments; no unrevoked target sessions; one successful bootstrap audit. All six migration checksums match. API starts with providers disabled. Authenticated HTTP smoke covers health/context/subsystems/tasks/decisions/files/AI readiness and revocation; a short-lived **local synthetic session only** was removed afterward. The real account password was not changed and Google identity was not impersonated. Real credentials/browser behavior uses separate synthetic users in the isolated Phase 5 fixture, not this restored person.

The verifier reuses Phase 1C migration/catalog/authority checks, adds read-only file/job/OWNER checks, never repairs data, exits nonzero on failure, and does not use implicit `.env` URLs. Read-only snapshots are separate; run under stopped writers for release acceptance. Existing Phase 1A/6/7 integration suites cover clean installs, populated upgrades, historical evidence preservation and exact checksums. Reapplying the complete chain is also tested as a no-op.

## Dependency and secrets decisions

Audit before: 55 (2 critical, 44 high, 9 moderate). After compatible fixes: 45 (0 critical, 36 high, 9 moderate). Counts include propagated parent packages, not 45 independent exploit primitives. Every unresolved package/path/advisory/version and disposition is recorded in `evidence/phase8-dependency-audit.json`.

| Root issue                             | Application reachability / decision                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| braces stack exhaustion                | Jest/Tailwind/fast-glob source tooling. No user-controlled glob service. Defer major tooling migration; trusted builds only.                                        |
| deepmerge-ts recursion                 | Prisma CLI configuration merging; not Prisma query execution. No HTTP caller configuration. Defer breaking config dependency update.                                |
| PostCSS source-map/file disclosure/XSS | Next build CSS pipeline, no user CSS compilation/HTML injection surface. Patch Next within 15; defer major bundler change. Treat untrusted source builds as unsafe. |
| js-yaml, selector parser, sprintf-js   | Build/test/schema tooling inputs, not user-facing YAML/format processing. Keep surfaced; no silent audit suppression.                                               |

API image currently carries development dependencies; their presence is not claimed absent. Removing tooling from the runtime image is a separately reviewed optimization. No reachable unresolved critical was found. This is a reachability assessment, not a guarantee against unknown vulnerabilities.

History scan: 64 reachable commits/880 blobs and 392 current files, high-confidence private-key, credentialed database/Redis URL, AWS/Google/GitHub token patterns; sanitized evidence records only locations/types. Current worktree was additionally reviewed for environment/key/logging patterns. Local synthetic fixture passwords and placeholder examples are not production credentials; local `.env` was not printed. No confirmed committed live credential was identified by this bounded scan. Encoded secrets, unreachable git objects and external CI secret stores are outside this evidence; any independently discovered historical live credential requires rotation before release.

## Environment matrix

All values below are names/requirements, never real secrets. No production URL is used by tests.

| Variables                                                           | Location / secrecy                                 | Requirement / validation / default                                                                                                                                |
| ------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DATABASE_URL                                                        | API; secret                                        | Required PostgreSQL URL; pooled Neon runtime, TLS required operationally, explicit small connection budget. Syntax checked.                                       |
| DIRECT_URL                                                          | Prisma CLI; secret                                 | Direct/unpooled PostgreSQL URL for migrate; explicit for CLI. TLS required remotely. No localhost production fallback.                                            |
| PHASE1C_DATABASE_URL                                                | Operator; secret                                   | Explicit direct connection for bootstrap/verify; only sslmode URL parameter accepted; explicit mode/ack/user ID.                                                  |
| REDIS_URL                                                           | API/embedded workers; secret                       | Required production redis/rediss URL. TLS/auth for remote deployment; no forwarded trust. Provider outage differs from invalid syntax.                            |
| PORT                                                                | API/web; nonsecret                                 | API default 4000; integer 1–65535; Render supplies. Web standalone honors PORT/HOSTNAME.                                                                          |
| FRONTEND_URL                                                        | API; nonsecret                                     | Exact HTTPS origin, no path/credentials/wildcard in production. `https://erp.project-antara.space`.                                                               |
| API_URL                                                             | Web server; nonsecret                              | Approved API `/api` URL, runtime validated.                                                                                                                       |
| NEXT_PUBLIC_API_URL                                                 | Web build/browser; nonsecret                       | Same approved public API origin/path; compiled at build via Docker ARG. Rebuild to change.                                                                        |
| NEXTAUTH_URL                                                        | Web; nonsecret                                     | Exact HTTPS web origin; loopback HTTP only for local test runtime.                                                                                                |
| NEXTAUTH_SECRET                                                     | Web; secret                                        | Required non-placeholder ≥32 characters at runtime; stable across restart.                                                                                        |
| JWT_ACCESS_SECRET, JWT_REFRESH_SECRET                               | API; secret                                        | Production non-placeholder ≥32 characters. Access TTL 15m; opaque hashed refresh lifetime 7d. Refresh secret retained compatibility, not plaintext token storage. |
| GOOGLE_CLIENT_ID                                                    | API + web; nonsecret                               | Backend verification audience must equal frontend OAuth client. Missing backend configuration denies Google auth.                                                 |
| GOOGLE_CLIENT_SECRET                                                | Web; secret                                        | Required when Google enabled; never browser-public.                                                                                                               |
| GOOGLE_ALLOWED_EMAILS                                               | API authoritative, optional web UX; private config | Explicit allowlist; backend denies absent/unlisted email. Verified email/token required.                                                                          |
| GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_PROJECT_ID | API; key secret                                    | Service account integration; Drive required fields checked when enabled. No real values in source.                                                                |
| GOOGLE_DRIVE_ROOT_FOLDER_ID                                         | API; private config                                | Required Drive destination, least-privilege folder membership.                                                                                                    |
| GOOGLE_CALENDAR_ID                                                  | API; private config                                | Calendar integration optional; absence is truthful unavailable.                                                                                                   |
| STORAGE_DRIVE_ENABLED, STORAGE_S3_ENABLED                           | API; nonsecret                                     | Default false; deliberately enable after provider checks. Disabled storage is not a successful upload.                                                            |
| S3_ENDPOINT, S3_REGION, S3_BUCKET                                   | API; private topology                              | One private bucket; HTTPS endpoint, validated shape, required when S3 enabled.                                                                                    |
| S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY                              | API; secrets                                       | Required when enabled; scoped to managed bucket/prefix; never logged.                                                                                             |
| STORAGE_RETENTION_DAYS                                              | API; nonsecret                                     | Default30, range1–3650.                                                                                                                                           |
| STORAGE_SIGNED_URL_TTL_SECONDS                                      | API; nonsecret                                     | Default60, range10–300.                                                                                                                                           |
| STORAGE_MAX_UPLOAD_BYTES                                            | API; nonsecret                                     | Default104857600, max1073741824. Size enforced on actual bytes; disk-backed.                                                                                      |
| AI_ENABLED                                                          | API; nonsecret                                     | Defaultfalse, explicit boolean. Valid disabled launch.                                                                                                            |
| OLLAMA_BASE_URL, OLLAMA_MODEL                                       | API/worker; private topology                       | Required when enabled; protocol/URL/model syntax validated, no user override, no cloud fallback.                                                                  |
| OLLAMA_REQUEST_TIMEOUT_MS                                           | Worker; nonsecret                                  | Default60000, range1000–180000.                                                                                                                                   |
| AI_MAX_RETRIES                                                      | Worker; nonsecret                                  | Default2, range0–5; total attempts retries+1.                                                                                                                     |
| AI_RETRY_BASE_DELAY_MS                                              | Worker; nonsecret                                  | Default5000, range1000–60000, bounded backoff.                                                                                                                    |
| AI_WORKER_ENABLED                                                   | API; nonsecret                                     | Defaulttrue; one embedded generation worker with concurrency1 for v1. Do not horizontally scale workers without review.                                           |
| NOTIFICATIONS_EMAIL_ENABLED                                         | API; nonsecret                                     | Defaultfalse. Enabling requires verified sending configuration.                                                                                                   |
| RESEND_API_KEY, NOTIFICATIONS_FROM_EMAIL                            | API; key secret                                    | Email provider/operator verification; disabled email does not disable in-app notifications.                                                                       |
| RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS                       | API; nonsecret                                     | Retired in Phase 8.1; remove these variables. See explicit API_RATE_LIMIT settings in the amendment.                                                              |
| ENFORCE_DUMMY_ALLOWLIST                                             | Local only                                         | Production cannot enable dummy authentication. Never run dummy seed for deployment.                                                                               |

## HTTP/session/AI boundaries

API CORS permits one configured web origin with credentials. CORS is not authentication. Express proxy trust stays disabled; spoofed X-Forwarded-For is not a limiter identity. Render/Cloudflare must terminate HTTPS and restrict ingress; NextAuth `trustHost` assumes the platform supplies the correct host, so operators must reject attacker-controlled Host/forwarded-host at the edge and configure NEXTAUTH_URL. Secure/HttpOnly/SameSite=Lax Auth.js defaults apply on HTTPS; no insecure custom cookie override. Refresh tokens stay encrypted in the server-owned Auth.js cookie, not public session JSON; backend stores only digests. Logout and current-session checks revoke access; inactive/deleted accounts denied. Production Google redirects must be tested on the actual domain.

Login/Google/public acceptance remain20/minute. Refresh:20/minute per presented credential,60/minute per stable session,3000/minute source flood bound; malformed credentials20/minute/source. HMAC keys avoid raw credentials in limiter state. Health is exempt; refresh does not consume the generic shared-IP bucket. Phase 8.1 replaces the generic shared-IP quota; operator capacity validation remains pending.

AI prompt/source bounds, pre-query current authorization, requester-only reads, source version checks, publication reauthorization and generic exactly-once terminal notification remain intact. No prompts, model output or provider topology in normal logs/responses. AI cannot mutate privileged ERP state. Redis/queue reconciliation remains explicit read-only and never auto-replays ambiguous history. Core health never invokes Ollama or cloud storage.

## Provider/manual smoke matrix (NOT executed here)

| Provider        | Prerequisite                                                                              | Action / expected                                                                                                                                                                                                                                                  | Cleanup                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Google identity | Consent app configured; audience/client match; backend allowlist                          | Authorized origin `https://erp.project-antara.space`; callback `https://erp.project-antara.space/api/auth/callback/google`. Sign in allowlisted verified user; preserve DB role; unlisted denied without account creation. Confirm secure cookie and API identity. | Logout, confirm backend revocation. No live Google console changes in Phase8.                                                                 |
| Drive           | Service account can create/read/delete only target folder/shared drive; no public sharing | Enable Drive; OWNER upload DOCUMENT then open ERP stream; provider ID/appProperties preserved; unauthorized ERP actor denied.                                                                                                                                      | Soft-delete, restore, then controlled purge after retention or dedicated disposable test fixture policy. Do not delete unknown Drive objects. |
| R2/S3           | Single private bucket, HTTPS endpoint, minimum list/get/put/delete scope                  | Upload IMAGE/CAD; signed URL TTL; unauthenticated bucket GET denied; authorized ERP open works; reconciliation sees managed prefix.                                                                                                                                | Soft-delete/restore; retention purge separately. No public ACL or permanent URL.                                                              |
| Redis/BullMQ    | Dedicated production instance/namespace, TLS, no unrelated queue consumers                | Check readiness/backlog, invitation and generic notification delivery; queue failure surfaced; restart worker without duplicate terminal result.                                                                                                                   | Remove only dedicated smoke jobs using safe operator review, never FLUSH production.                                                          |
| Ollama          | Private backend reachability, approved model provisioned                                  | Explicit AI enablement, bounded summary; timeout/failure, retry and one terminal notification; current-scope read. Measure concurrency1 cold/warm latency and host RAM/disk.                                                                                       | Cancel queued smoke job if needed; retain audit/provenance. Or keep AI_ENABLED=false for launch.                                              |

Ollama runs on separately operator-provisioned private infrastructure, not implicitly inside the free API container. Exact hardware depends on model and quantization; no invented RAM/GPU promise. Benchmark cold start, model disk size, sustained concurrency1, restart and timeout with bounded non-sensitive input before enabling. API/worker currently share one API process; graceful shutdown enabled; proposed Render API shutdown grace is 240s for the bounded 180s inference timeout. An interrupted RUNNING job requires reconciliation, not automatic replay. The cache remains best-effort and an initial failed cache connection requires restart to reconnect. Queue names are `notification-email`, `invitation-email`, `ai-generation` with BullMQ default `bull` prefix. Use a dedicated Redis instance and DB0 for v1: legacy email/cache URL parsers do not honor a nonzero URL database index (AI does). Do not share that namespace with another deployment. Email queues use existing BullMQ processors; Redis is execution infrastructure, PostgreSQL is durable AI state. Core storage/auth/task paths must remain usable during optional inference outage.

## Storage/temp and observability operations

Multipart uses OS temp directories `antara-multipart-*` (mkdtemp private directory), bounded files/parts/bytes, and finally cleanup. Crashes can leave temporary files. Render ephemeral disk is not durable storage. Monitor disk usage and concurrent uploads; max-file-size is not total disk quota. After stopping writers, run `node infra/scripts/cleanup-upload-temp.mjs --ack API_WRITERS_STOPPED`; only owned matching directories older than24h are removed. Do not run generic `/tmp` deletion.

Explicit OWNER purge remains v1 policy: review due-deleted files weekly, call existing authenticated `POST /api/files/:id/purge` for reviewed IDs, inspect reconciliation after failures. No destructive scheduled job was added. Retention remains30d default. Missing objects, malformed/legacy metadata, orphan objects and failed compensation require operator review; no automatic ambiguous deletion.

Minimum launch monitoring: public `/api/health` and `/api/health/ready` (no topology), process `/api/health/live`; protected OWNER metrics; 5xx code counts, login/refresh denials, DB latency, Redis errors/backlog, stale AI RUNNING jobs, failed/attempt-exhausted jobs, storage compensation/purge errors, reconciliation findings, temp/disk pressure. Alert on sustained core readiness failure, exhausted disk, growing queue backlog or unexplained auth failures. Do not log bodies/cookies/token headers/signed URLs/private prompts. Unexpected errors log fixed code/status; no large observability platform added.

## Deployment topology and compatibility

Intended web: `erp.project-antara.space`; API remains approved `antara-api-ev5f.onrender.com/api`. No DNS change. Render Docker API starts compiled main; web starts standalone server on0.0.0.0 and Render PORT. Public web assets are copied. Render supplies environment build args; never bake provider secrets into images. The free plan has not been capacity-certified; background work/sleep/disk limits require operator decision. Automatic deployment is off in the proposed blueprint, not changed live.

**Stop all old API/web writers before migration.** Old session writers cannot coexist safely with hashed sessions; old file writers produce unverified metadata; old decisions lack authoritative metadata; role-only task/membership/invitation writers violate v1 invariants; old AI writers lack durable provenance. No rolling mixed-version cutover. Maintenance is operational: serve a static503/Retry-After at the edge, suspend old API and workers and old web/auth handlers, verify direct API host cannot still accept writes, then migrate. Readiness of deliberately stopped services is expected down; do not let automatic deploy/health recovery resurrect old writers. Reopen only after authorized new-instance smoke.

## Ordered future production runbook — DOCUMENTATION ONLY

Never run the following against production without separate approval. Use a reviewed checkout/tool environment, secret manager or protected environment injection; no secrets in shell history, screenshots or evidence. `$RELEASE_DIRECT_PG_URL` must be libpq-compatible (no Prisma-only schema/connection_limit parameters). `$DIRECT_URL` is Prisma-compatible direct URL; `$DATABASE_URL` pooled API URL. Bootstrap accepts only a plain direct URL plus optional sslmode.

1. Review release SHA, all evidence, dependency decision log, image build and operator checklist. **STOP** on failing gate, unreviewed change, reachable critical vulnerability, secret leak, missing runtime configuration or unapproved rate-limit capacity.
2. Disable all automatic deploy/migration triggers; configure required GitHub production reviewers if workflow is used. Enable maintenance, stop API/web/queue writers and confirm direct-host writes are blocked. Record time/actor. Do not rely on DNS propagation to stop writes.
3. Take immutable custom backup using protected connection environment; never echo it:

   ```sh
   umask 077
   pg_dump --dbname="$RELEASE_DIRECT_PG_URL" --format=custom --file="$RELEASE_BACKUP_PATH"
   pg_restore --list "$RELEASE_BACKUP_PATH" > "$RELEASE_BACKUP_PATH.list"
   sha256sum "$RELEASE_BACKUP_PATH" > "$RELEASE_BACKUP_PATH.sha256"
   ```

   Record filename/creation time/source/size/checksum separately without URL. Copy securely off the application host. Restore into a fresh isolated local database and verify counts/migrations. **STOP** if backup validation or restore fails.

4. Read production counts and migration checksum identities under PostgreSQL READ ONLY. Compare exactly with approved pre-bootstrap snapshot: one reviewed active MEMBER ID, no OWNER/subsystems/memberships/tasks/decisions/invitations, one historical session, first four migration hashes. Include files/AI history and unexpected users. **STOP on any drift**, even apparently beneficial OWNER/subsystem changes; obtain a revised reviewed plan. Do not use final-schema verifier before pending tables exist.
5. Apply migrations in one approved path only (operator CLI **or** manual guarded workflow, never both):

   ```sh
   npx prisma migrate status --schema apps/api/prisma/schema.prisma
   npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
   npx prisma migrate status --schema apps/api/prisma/schema.prisma
   ```

   Advisory locking stays enabled. Check all six applied checksums, no failed/rolled-back rows. **STOP** on mismatch/failure; never edit/resolve history blindly.

6. Set explicit `PHASE1C_DATABASE_URL` from protected direct URL. Provision only after reviewing the displayed database identity:

   ```sh
   npm run bootstrap:v1 --workspace @antara/api -- --action provision --mode production --user-id cmuvhzwq10001d301zl97hox6 --ack PRODUCTION_BOOTSTRAP
   ```

   **STOP** unless exactly five approved keys/names/slugs and no unexpected rows. This command does not create people.

7. Deliberately bootstrap the single reviewed ID:

   ```sh
   npm run bootstrap:v1-owner --workspace @antara/api -- --mode production --user-id cmuvhzwq10001d301zl97hox6 --ack PRODUCTION_BOOTSTRAP
   npm run verify:release --workspace @antara/api -- --mode production --user-id cmuvhzwq10001d301zl97hox6 --ack PRODUCTION_BOOTSTRAP
   ```

   **STOP** unless same active/non-deleted account is OWNER, zero fabricated memberships, revoked sessions, privileged audit, exact catalog, no assignment/role/file/job invariants broken. No application startup bootstrap, ordinary seed or dummy seed.

8. Deploy reviewed API image once, then compatible web image (correct compiled NEXT_PUBLIC_API_URL). One API/embedded-worker instance for v1. Verify health and shutdown behavior. **STOP** on core unhealthy or migration/runtime mismatch. No old instance may resume writing.
9. Sign in again using verified Google or existing credentials. Do not restore old refresh credentials. Validate OWNER global and all five contexts, empty initial lists. Execute provider smoke table. Storage can remain explicitly unavailable during maintenance, but intended file feature launch requires Drive/R2 readiness; AI may deliberately stay disabled.
10. Only after smoke passes, use normal invitations/verified Google onboarding for real approved members; verify MEMBER and mixed ADMIN membership semantics, task/decision/file visibility, notifications and logout. No SQL-inserted future team or dummy production users.
11. Reopen traffic; monitor errors/readiness/queues/disk. **STOP/reenter maintenance** on unexpected privilege leak, zero OWNER, public bucket, broken live Google/auth or severe provider/integrity error. Keep backup/provenance immutable.

## Rollback and disaster recovery

Prefer fix-forward with maintenance. Migration failure before bootstrap: keep writers stopped, inspect failed migration safely, restore the new backup to a **separate** database for analysis; do not rewrite history. Bootstrap failure rolls back role/session/audit atomically; verify before retry. Provider configuration failure: keep feature disabled/maintenance, correct configuration; no schema rollback needed. Postdeployment failure: stop new writes and fix compatible code; old role-only/session/file code is not a safe downgrade. Catastrophic DB corruption: authorized restore to a clean database from immutable backup, verify, reapply approved migrations/bootstrap as reviewed, revoke restored sessions before reopening. Account for any postbackup writes/provider objects via reconciliation. Never resurrect plaintext refresh tokens or destructively downgrade preserved file history.

## Gates and acceptance

Exact test results and command summaries are recorded below after final execution. Full API gates use isolated PostgreSQL for every Phase1A/1B/1C/2/2.1/3/4A/4B/5/6/7 suite and local Redis for real BullMQ. No security suite is intentionally skipped. Browser full suite uses real backend role/membership fixtures and offline provider doubles; compact `npm run test:release --workspace @antara/web` selects representative cases including a new real task/decision persistence and direct-object denial case. Selected tests rerun in smoke are not counted as additional distinct tests.

RC acceptance requires all local gates green, reviewed final source/lock/images, no unaccepted reachable critical/high issue, backup/rehearsal complete, production configuration and maintenance plan approved, general proxy-bucket policy resolved, required live provider smoke passed (AI may be disabled), and reviewed cutover. No tag created here.

Final v1.0.0 additionally requires successful live login and OWNER access, real authorized onboarding, task/decision/storage/notification/logout flows, no severe production errors, adequate observed resource capacity, verified backup and known recovery path. Observe until these operational criteria are demonstrated; no arbitrary elapsed-time promise replaces them. Time Intelligence and new product work remain excluded.

## External reference checks

Render manual auto-deploy/build-argument semantics were checked against [Blueprint reference](https://render.com/docs/blueprint-spec) and [Docker configuration](https://render.com/docs/docker). Standalone public/static asset handling follows [Next.js output documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/output). These references do not certify the current live service configuration.

## Final local validation ledger

- Full API: **741 passed / 43 suites**, no skipped security suites. Baseline723 plus14 configuration cases,2 safe-error cases and2 disk cases. Earlier failures were corrected filesystem mocks and obsolete optional-Redis expectations; DB failure still fails readiness.
- Full browser: **20 passed** against optimized standalone output, including OWNER/ADMIN/MEMBER, membership revocation, keyboard/mobile layout, notification isolation, real-session logout, offline storage/AI and new task/decision persistence/direct-object denial.
- Compact release smoke: **13 passed**, selected from the full browser cases; not counted twice. Combined distinct total: **761**.
- Isolated `npm ci --ignore-scripts --no-audit`: passed; lockfile consistent. Prisma generate/validate, contracts/shared-utils/UI/API builds, API/web typechecks and optimized web build passed.
- Complete migration regression: clean install and populated Phase6/7 upgrades passed; restored approved production copy upgrade and repeated migrate-deploy no-op passed. All historical checksums unchanged.
- Restored-copy built API: health/context/subsystems/tasks/decisions/files/AI readiness200; six OWNER contexts; secret-field absence; revoked session401;105healthpolls remain200. Temporary test session removed. No real password reset or live Google impersonation.
- Temp cleanup without acknowledgement correctly exits1 without deleting anything.
- Remaining benign warnings: FORCE_COLOR/NO_COLOR in browser harness; deprecated build-tool packages are included in dependency review. BullMQ duplicate mock warning remains fixed; unsupported `next start` standalone warning eliminated.
- Logs are local `/tmp/phase8-*`; durable sanitized counts, lock inventory and decisions are in `evidence/phase8-*.json`. No secret-bearing raw dump, auth payload or environment export is included.

Deviation/limits: restored-account credentials were intentionally not reset; real interactive login uses isolated synthetic browser fixtures. No live provider smoke or production drift check was performed. The rejected rate-limit increase remains unapplied; the separately authorized Phase 8.1 amendment below resolves the code policy. Maintenance is operational, not a new application feature; no automated purge scheduler or new product scope was added.

### Container rehearsal follow-up

Local builds: `docker build -f infra/docker/api.Dockerfile -t antara-api-phase8-local .` and `docker build -f infra/docker/web.Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:4108/api --build-arg API_URL=http://127.0.0.1:4108/api -t antara-web-phase8-local .`. These images are **local test artifacts**, not production release images (web URL is intentionally loopback).

Production-mode API container on4109 passed authenticated reads, current-session revocation and health polling. Web image on loopback3108 served login and `antara-badge.png`. Restored OWNER shell/six contexts passed with a temporary encrypted local Auth.js fixture cookie and API image in explicit test mode for plaintext loopback CORS. The production HTTPS-origin guard was not relaxed; HTTPS/Secure-cookie/live OAuth remain live operator smoke obligations. Temporary sessions were removed afterward.

The missing-secret negative startup test exposed Next.js swallowing the instrumentation exception while keeping the process alive. Instrumentation now logs only the fixed configuration field error and exits1 explicitly. This is a release correctness fix, not a new feature. Final web image `3e2fe6742b1e` passed missing-secret exit1 and valid restored-OWNER browser checks. API image `090af08bf586` passed production-mode HTTP smoke. Both were built with Node22 Alpine/npm11.6.2. Local services were stopped after verification; the restored database and immutable backup are retained.

## Phase 8.1 amendment — shared-source general API limiter

This amendment supersedes the old generic-limiter blocker and its rejected blanket-increase proposal. It changes only application throttling, configuration, its authentication hook and test wiring. No migration, proxy trust change, production/provider access or deployment is involved. Phase 8.1 starts from approved HEAD `b321c8a1d86062616f90d0e87b00c237b462dcf0`; earlier Phase 8 evidence remains historical evidence, not a claim that the old images contain this patch.

### Enforcement and identity boundary

1. Before authentication, `RateLimitingMiddleware` consumes a coarse source ceiling using **`req.socket.remoteAddress`**. No forwarding header participates, even if a later caller changes Express settings.
2. A private request-keyed WeakMap carries a one-shot server callback. `JwtAuthGuard` first runs the existing Passport JWT signature/expiry check and `SessionService.authenticateAccess` current database account/session validation. Only then does it consume the **verified user ID** budget. No JWT decoding shortcut, duplicate authorization implementation, raw-token key or request-body identity exists.
3. Failed JWT/session validation consumes the public-source quota and still denies access (401, or429 when that quota is exhausted). Valid users behind that source retain their own budgets until the coarse ceiling is reached.
4. A global interceptor consumes the public-source quota for ordinary public Nest handlers without JWT guards. The one-shot callback prevents double consumption for authenticated requests. Framework-served Swagger assets/unmatched routes remain subject to the coarse source ceiling; they do not execute ERP feature handlers.
5. Exact existing auth/invitation route patterns bypass both new layers because their controller guards already supply the specialized limits below. Unknown paths merely beginning with `/auth` or `/invitations` do not acquire an exemption. Health GET routes retain their exemption.

An account shares its application quota across devices, new login sessions, refresh rotation, role changes, membership changes and context selection. The limiter does not cache authentication: revoked/expired/logged-out sessions and inactive/deleted accounts cannot keep a previously verified identity on the next request. Object authorization remains independently current-database backed.

### Defaults and capacity evidence

All general windows are fixed windows of **60,000ms**, started at the first request for that key:

| Dimension                       | Default               | Purpose                                                     |
| ------------------------------- | --------------------- | ----------------------------------------------------------- |
| Verified account                | 180 requests/minute   | Normal application quota; stable across sessions            |
| Unauthenticated ordinary source | 60 requests/minute    | Public-handler/invalid-auth abuse protection                |
| Coarse connection source        | 3,600 requests/minute | Infrastructure flood ceiling, checked before authentication |

The source default budgets **20 simultaneously busy accounts ×180/minute**. Twenty is a conservative planning assumption, not a measured production concurrency claim. Operators must confirm expected concurrent viewers and API/DB capacity before launch; raising this bound requires measured justification. No arbitrary10,000 limit was installed.

The deterministic shell fixture models a deliberately busy minute: initial shell/dashboard12 requests; periodic context/notifications/AI readiness/history6; two context switches12; three focus revalidations18; task/file navigation and mutations24; one pending AI job at five-second polling12. Total **84 requests/account/minute**, leaving96 requests of headroom. Twenty such users produce1,680 requests, below3,600. Actual source references are `app-shell.tsx` and `use-operations.ts` (60-second foreground context/notification polling) and `ai-summary-panel.tsx` (60-second readiness/history and five-second pending-job polling). This is a deterministic request budget, not a load/latency benchmark. The optimized browser gate runs the real limiter with default capacities, without a test-only quota increase.

### Specialized controls preserved

| Route/dimension                                                  | Unchanged policy         |
| ---------------------------------------------------------------- | ------------------------ |
| Credentials login, Google callback, public invitation acceptance | 20/minute/source/handler |
| Refresh credential                                               | 20/minute                |
| Refresh stable session across rotation                           | 60/minute                |
| Malformed refresh                                                | 20/minute/source         |
| All refresh attempts                                             | 3,000/minute/source      |

Existing auth `/me`, logout, rejected registration and invitation management/validation routes retain their existing controller20/minute/handler policy too. Their exemption is deliberate; this patch does not broaden those existing policies. General application requests cannot consume these independent auth counters. `RefreshThrottleGuard` is unchanged.

### State, failures and configuration

The existing process-local general limiter remains process-local; no Redis dependency or new datastore is introduced. Domain-prefixed HMAC-SHA256 keys use a random process-lifetime key. Stored values are counts and reset times only; raw tokens, refresh credentials, emails, IP addresses and user IDs are absent from keys/state/logs. Request callbacks use WeakMap lifetime rather than a persistent identity cache. Fixed expiry plus interval cleanup bounds lifetime; the map has a50,000-live-key hard bound. Saturation returns sanitized503 with Retry-After rather than evicting active budgets or bypassing protection. Unexpected storage/code failure propagates as failure, never authenticated success. Normal exhaustion returns sanitized429, Retry-After and quota headers, without keys or identity details.

There is no Redis storage failure mode for the general limiter. Existing specialized Nest throttler storage remains process-local and unchanged. Process restart resets budgets; scale-out requires a separately reviewed shared atomic store and coordinated HMAC key before multiple API replicas are enabled. This patch neither introduces Redis fail-open behavior nor claims distributed flood protection.

New explicit `.env.example` settings:

```dotenv
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_USER_MAX=180
API_RATE_LIMIT_PUBLIC_SOURCE_MAX=60
API_RATE_LIMIT_SOURCE_FLOOD_MAX=3600
```

Boot validation requires positive safe integers; maxima are900,000ms for the window,1,000 for account/public quotas and100,000 for the operator source ceiling. These are configuration validation bounds, **not defaults**. Old `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` are rejected with a fixed actionable startup error instead of silently reinterpreted. Remove retired settings before cutover. No frontend change/rebuild is required for this API policy.

### Phase 8.1 validation and remaining operator gates

Final results:

- Focused middleware/configuration/unchanged refresh guard: **49 passed /3 suites**.
- Full API regression: **772 passed /44 suites**, with all isolated PostgreSQL suites and local Redis enabled; no skipped suites. Includes31 additional tests:23 limiter cases,6 configuration cases and2 PostgreSQL/HTTP account-budget cases. Prior security assertions are retained.
- Optimized standalone browser: **20 passed**, with default limiter installed in the real-session fixture; roles, memberships, logout, notifications, storage and AI states remain green.
- Compact release smoke: **13 passed**, a subset rerun, not13 additional distinct cases. Combined API/browser distinct total: **792**.
- API lint/typecheck and build/postbuild passed. Focused formatting and `git diff --check` passed. No web source/contracts changed; browser tests reused the approved optimized web output, so no redundant web rebuild/typecheck was needed.
- Migration files, dependencies, auth-specific guards/limits and production settings are unchanged. No live provider calls occurred. Existing browser FORCE_COLOR/NO_COLOR warnings remain benign.

Commands: `npm run test --workspace @antara/api` with all existing explicit loopback fixture variables (`PHASE1A_TEST_DATABASE_URL`, `AUTHORIZATION_TEST_DATABASE_URL`, `PHASE1C_TEST_DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, `PRIVACY_TEST_DATABASE_URL`, `CORE_TEST_DATABASE_URL`, `REMAINING_TEST_DATABASE_URL`, `STORAGE_TEST_DATABASE_URL`, `AI_TEST_DATABASE_URL`, `AI_TEST_REDIS_URL`); `npm run test:shell --workspace @antara/web` and `npm run test:release --workspace @antara/web` with explicit `PHASE5_TEST_DATABASE_URL`; `npm run lint --workspace @antara/api`; `npm run build --workspace @antara/api`; Prettier on the exact changed TS/Markdown files; `git diff --check`. PostgreSQL used127.0.0.1:55461 dedicated test databases, Redis127.0.0.1:55462/15. No restored person or production connection supplied fixture state. Logs remain `/tmp/phase81-{focused-final,regression,browser,smoke,lint-final,build}.log`.

The initial sandbox-only HTTP attempt could not bind loopback (EPERM); the approved local-listener rerun passed. The expiry test uses a deterministic clock, not a short timing-sensitive sleep. No assertion was removed to obtain passing results.

Exact Phase 8.1 file inventory:

```text
.env.example
apps/api/src/common/config/validate-environment.ts
apps/api/src/common/config/validate-environment.spec.ts
apps/api/src/common/middleware/rate-limiting.middleware.ts
apps/api/src/common/middleware/rate-limiting.middleware.spec.ts (new)
apps/api/src/main.ts
apps/api/src/modules/auth/guards/jwt-auth.guard.ts
apps/api/src/modules/auth/auth.integration.spec.ts
apps/api/test/phase5-server.ts
docs/releases/v1.0.0/PHASE_8_RELEASE_HARDENING.md
docs/releases/v1.0.0/V1_RELEASE_CHECKLIST.md
```

Live Google OAuth, Drive, R2/S3, production Redis, Render settings, exact release-image review, concurrency/capacity verification, maintenance/backup and cutover remain **unperformed operator gates**. No provider checkbox is satisfied by offline tests. No production data was read or changed; no commit, push, tag or deployment was made.
