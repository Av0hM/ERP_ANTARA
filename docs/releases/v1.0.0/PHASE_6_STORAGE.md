# Phase 6 — provider-neutral storage and lifecycle

Authority: the complete frozen v1 specification (especially sections 13–14, 17–20), approved Phase 1A/1B/1C/2/3/4A/4B/5 records, and the Phase 6 task contract. No production/restored-copy database, Google Drive, R2 or other live storage was accessed. No deployment, bootstrap, commit, push, release tag, AI or Time Intelligence change is included.

## Architecture and implementation sequence

1. Extend the existing Attachment index additively; preserve legacy evidence and classify it as unverified.
2. Introduce explicit storage configuration, a provider interface, Drive/S3 adapters and deterministic routing.
3. Reuse current database actor and persisted object policies for upload/open/delete/restore/purge, with compensation and transactional audit.
4. Wire bounded multipart uploads and the existing Files UI, plus deliberate persistence of generated reports.
5. Verify clean/populated migrations, real PostgreSQL HTTP authorization/lifecycle/races, offline provider protocols, previous security gates and the real-backend browser shell.

`StorageProvider` exposes `put`, `open`, `remove`, `exists` and paginated `inventory`. `StorageRouter` selects providers and translates provider errors into sanitized 503 responses. Feature services do not call SDKs. The old Drive methods were removed from GoogleIntegrationService; its Calendar behavior remains unchanged.

| Category       | Provider |
| -------------- | -------- |
| DOCUMENT       | DRIVE    |
| MEETING_REPORT | DRIVE    |
| CAD            | S3       |
| IMAGE          | S3       |
| EXPORT         | S3       |
| OTHER          | S3       |

One configured S3 bucket serves all users/subsystems. Generated keys have the shape `antara-v1/<category>/<UUID>`, independent of filenames and authorization. No public ACL, public bucket, per-subsystem bucket or local durable-storage fallback is introduced.

## Authoritative metadata and migration

The least disruptive choice is to evolve `Attachment` into the provider-neutral file index rather than create a second competing FileAsset table. Existing IDs, task/uploader relationships, names, MIME types, sizes, tags, timestamps, Drive IDs and historical storageUrl evidence are preserved. No account or operational data is reseeded.

New migration: `20261008000000_phase_6_storage`. Earlier migration files are unchanged.

Adds:

- StorageProviderKind enum: DRIVE/S3;
- FileCategory enum: the six values above;
- FileProvenance enum: LEGACY_UNVERIFIED/VERIFIED;
- nullable provider/objectKey/bucket;
- category, provenance, updatedAt;
- scopeSubsystemIds for generated-artifact source provenance;
- deletedAt, purgeAfter, purgedAt, storageError;
- retention scan index and SQL CHECKs for complete verified metadata, category/provider consistency and coherent deletion timestamps;
- empty default for the deprecated storageUrl column so new writes need no provider URL.

Existing rows default to LEGACY_UNVERIFIED, OTHER, no invented provider identity. Their old URL/Drive ID remains evidence, not proof of accessible content. They may be listed under ordinary scope policy, but cannot open/restore/purge as verified assets. Reconciliation never silently adopts or deletes them.

The existing Task FK is the authoritative scope for task attachments. If that relationship disappears, the file becomes OWNER-only, never global-readable. Generated exports/meeting reports store their exact source subsystem IDs (not a frontend permission claim). They are immutable provenance, not additional subsystem memberships. There is no public endpoint accepting arbitrary source-scope arrays. Empty source scope means OWNER-only. Existing AttachmentUploader and Task FK behavior is retained; historical deletion does not erase file metadata automatically.

Normal file responses explicitly omit storageUrl, driveFileId, objectKey, bucket and internal error text; they include safe uploader projection and server-computed management hints. Signed access URLs are transient response data, never persisted in PostgreSQL or audits.

## Authorization and endpoints

All routes use current Phase 2 session validation. No JWT role/subsystem claim or key prefix is an object permission. Phase 1B/4 services load current authority each evaluation.

| Endpoint (under /api)                                     | Policy / behavior                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET /files/attachments                                    | Current readable task/source scopes; OWNER all; normal rows exclude soft-deleted/purged files                |
| GET /files/attachments?deleted=true                       | Retained deleted files only where actor may manage                                                           |
| POST /files/upload                                        | Multipart; OWNER or exact task ADMIN; unlinked OWNER-only                                                    |
| POST /files/attachments                                   | Bounded small-file compatibility adapter; same routing/policies/lifecycle                                    |
| GET /files/:id/open                                       | Current persisted scope, verified provenance, not deleted/purged, provider exists; then signed access/stream |
| DELETE /files/attachments/:id                             | Authorized soft delete; never ordinary immediate provider destruction                                        |
| POST /files/:id/restore                                   | OWNER/exact management, within retention, provider existence verified                                        |
| POST /files/:id/purge                                     | OWNER only; soft-deleted and retention expired; explicit operator action                                     |
| GET /files/reconciliation?cursor=...                      | OWNER read-only DB/provider inventory, 100 records/page                                                      |
| GET /files/reconciliation/orphans/DRIVE or /S3?cursor=... | OWNER read-only tagged/prefixed provider candidates, no automatic deletion                                   |
| POST /files/outputs/handoff                               | OWNER global/selected or ADMIN explicit administered subsystem; persisted EXPORT                             |
| POST /files/outputs/meeting-report                        | OWNER/exact ADMIN subsystem; persists current generated meeting-agenda Markdown as MEETING_REPORT            |

MEMBER uploads remain prohibited, preserving the current Phase 4B collaboration policy. MEMBER may open readable task/meeting-report files, but not administrative exports. EXPORT requires management of every recorded source scope even for read access. ADMIN cannot manage a MEMBER-only scope. Unlinked files without explicit safe source provenance remain OWNER-only.

The list retains a bounded window (200 records); reconciliation has cursor pagination. A larger end-user history browser can be added separately. Empty scope never yields an unfiltered query.

## Providers and open/download

Google Drive uses the existing service-account configuration through Google's supported auth library. Upload starts a resumable session with a dedicated configured parent folder and an `antaraStorage=v1` app-property marker, then streams the temporary file. It verifies returned ID and byte size. No sharing/permission creation or permanent webViewLink is used. Opening checks metadata then streams `alt=media` through the authenticated ERP API. Download disposition and nosniff prevent uploaded HTML/SVG from becoming an active API-origin page. Service-account tokens never reach clients.

S3 uses the AWS SDK v3 with explicit endpoint, region, credentials, path-style addressing and the one configured bucket. Uploads stream from disk with actual ContentLength. Downloads use presigned GET with attachment disposition, default **60 seconds**, configurable **10–300 seconds**. The browser receives that URL only after current ERP authorization and provider existence checking. Possessing an ERP ID or provider path grants no ERP access.

A signed URL is necessarily a temporary bearer credential: revocation/soft deletion blocks every new ERP open immediately, but a previously issued URL can remain usable until its short TTL expires. Drive streams are authorized when opened; bytes already delivered cannot be recalled. Do not log response signed URLs or place them in analytics. Existing historical public links cannot be retroactively revoked by this database migration; provider ACL review remains a release/operator responsibility.

Provider API references: [AWS SDK S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html), [Cloudflare R2 SDK configuration](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/), [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [Drive media download](https://developers.google.com/workspace/drive/api/guides/manage-downloads).

## Upload safety and truthful persistence

Multipart uses disk-backed Multer inside a private per-request temporary directory. Guards run first; limits cover bytes, file/field counts and field sizes. Validation and all success/failure paths remove the request directory. API memory does not hold arbitrary CAD/base64 bodies. A process crash can leave private temporary files; host temp-volume cleanup/quotas remain operational hardening.

Default maximum: **100 MiB**, configurable up to 1 GiB. Actual filesystem size is enforced again before provider I/O. Names strip traversal/path components and control characters, are normalized and bounded, and never determine object keys. MIME syntax is validated with application/octet-stream fallback; this is content handling, not a claim of deep type identification or malware scanning. Browser downloads are attachments. CAD/S3 downloads go directly to the short-lived signed endpoint; Drive browser download buffers a bounded document blob.

The legacy JSON endpoint remains only for small existing clients: base64 input is bounded to roughly 1 MiB and uses the same temporary-file/provider workflow. Caller size/uploader identity is never trusted. The Files UI exclusively uses multipart.

Upload order: current actor/object authorization, provider upload, fresh actor lock + object lock + authorization, metadata/audit insert, commit. If final authority changed or database/audit persistence fails, provider cleanup is attempted and the API fails. A failed cleanup emits only `STORAGE_COMPENSATION_FAILED: provider inventory reconciliation required`, not credentials/provider exception text. Tagged Drive objects/generated S3 prefixes allow later orphan review. A timeout/crash can leave an ambiguous remote object; there is no distributed-transaction claim or fake-success fallback.

## Delete, restore, purge and races

Soft delete sets deletedAt and a frozen purgeAfter deadline using the configured retention (default **30 days**), writes FILE_SOFT_DELETE audit atomically, and retains provider data. Rerunning does not extend retention. Changing configuration later does not retroactively shorten recorded deadlines.

Restore holds current actor/file/task locks, checks retention and provider existence, clears deletion state and audits atomically. Purge is OWNER-only and holds the same file lock while deleting provider data, then tombstones metadata with purgedAt and FILE_PURGE audit. It never drops the historical index row. Restore and purge cannot race to resurrect missing content. Provider deletion treats already-missing content idempotently. Failure persists PURGE_FAILED plus audit before returning 409; retries remain explicit.

The account-before-Attachment-before-Task locking order preserves Phase 4 rules. Membership writers must continue locking the target account first. Upload provider I/O happens outside DB locks followed by locked reauthorization. Open/restore/purge hold their transaction through provider access to prevent concurrent relationship/lifecycle mutation from invalidating the check. Those bounded provider operations use an extended 180-second transaction timeout; avoid adding slow/unbounded work inside it. Direct SQL/old writers must honor the established protocol.

If provider deletion succeeds but the final database/audit commit fails, the retained soft-deleted row may refer to missing content. Reconciliation detects that state; restore refuses it and an idempotent purge can finalize the tombstone. No inverse operation recreates bytes or plaintext credentials.

Scheduling is deliberately deferred: the explicit OWNER purge endpoint is the controlled operator path permitted by this phase. A later scheduler can enumerate RETENTION_EXPIRED rows and invoke the same service after selecting an approved operator identity. No startup sweep, automatic ambiguous orphan deletion or new queue architecture runs.

## Reconciliation

Read-only inventory statuses: PRESENT, PROVIDER_MISSING, LEGACY_OR_MALFORMED, PROVIDER_UNAVAILABLE, RETENTION_EXPIRED, PURGE_FAILED and PURGED. Orphan scans return ORPHAN_CANDIDATE_REVIEW_ONLY. Drive scans only application-marked objects visible to the configured identity; S3 scans only the managed prefix in its single bucket. Old unmarked Drive files/provider objects outside that namespace cannot be exhaustively discovered by this tooling.

No reconcile route mutates rows or provider objects. Owner output includes stable file IDs; orphan review includes opaque provider object identifiers, never credentials, signed URLs, raw database exceptions or user secrets. Review in-flight uploads, legacy references and provider provenance before taking an explicit deletion action. No backfill/adoption executor is added.

Operator sequence (documented, not run against a real provider): authenticate as OWNER; paginate GET /files/reconciliation; investigate missing/legacy/provider-unavailable findings; review expired rows; POST /files/<reviewed-id>/purge when appropriate; recheck. Use the orphan inventory separately, without automatic deletion.

## Frontend and report integration

The existing Files surface now shows safe ERP metadata, category/provider and explicit historical-review state. Task choices remain manageable server-authorized tasks. Selected shell context narrows presentation only; all API checks remain authoritative. Upload has pending/error states; open uses authenticated fetch; normal deletion is soft; an authorized retained-files view exposes restore. MEMBER sees no upload/delete controls. No provider path copy button or permanent URL anchor remains.

Generated handoff persistence is opt-in, not a change to every existing dynamic report view. OWNER may persist a global handoff (OWNER-only file); ADMIN must select one exact administered subsystem for a persisted export. This avoids ambiguous aggregate provenance while the existing multi-scope dynamic reports remain available. Meeting-report persistence saves the existing generated agenda Markdown, not invented minutes or fabricated meeting results. Both use the same file index, storage routing, compensation and audit. No new meeting schedule is invented.

## Environment and deployment implications

`.env.example` documents placeholders only:

| Variables                                                                     | Meaning                                                                                                    |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| STORAGE_DRIVE_ENABLED                                                         | Explicit true enables Drive and requires its configuration                                                 |
| GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_DRIVE_ROOT_FOLDER_ID | Dedicated permitted Drive identity/folder; validate create/read/delete permissions before release          |
| STORAGE_S3_ENABLED                                                            | Explicit true enables S3 and requires all five S3 settings                                                 |
| S3_ENDPOINT, S3_REGION, S3_BUCKET                                             | HTTPS endpoint (loopback HTTP allowed only outside production), region (`auto` for R2), one private bucket |
| S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY                                        | Explicit private credentials; no ambient AWS credential-chain fallback                                     |
| STORAGE_RETENTION_DAYS                                                        | Default 30, range 1–3650                                                                                   |
| STORAGE_SIGNED_URL_TTL_SECONDS                                                | Default 60, range 10–300                                                                                   |
| STORAGE_MAX_UPLOAD_BYTES                                                      | Default 104857600, maximum 1073741824                                                                      |

StorageConfig validates enabled-provider requirements and numeric limits at API construction. Disabled providers return an explicit unavailable/not-configured response; they do not store locally. API boot does not contact providers. Normal temporary disk buffering is not a durable storage fallback. No secret or database URL is written to the release record.

Deploy the additive migration with compatible API/web together through a separately approved release. Stop old file writers: they would create new unverified rows or bypass soft deletion. The prior Phase 1C verifier derives expected migration history from the repository, so a database lacking this newly approved migration intentionally fails readiness until migrated. Do not alter or mark historical migrations. Roll back via compatible code/fix-forward; do not drop preserved metadata or resurrect expired sessions. Changing the configured bucket/provider identity requires reviewed data reconciliation, not silent remapping.

## Validation

All database execution uses explicit loopback port 55461 test URLs, unique schemas and synthetic accounts. The Phase 6 harness requires `STORAGE_TEST_DATABASE_URL` with database name `antara_phase6_test`; it rejects remote hosts and never uses DATABASE_URL as a fallback. Provider tests are offline doubles; browser tests use the real authentication/session/authorization stack with an explicit in-memory provider boundary. Production/restored-copy data is never fixture state.

Tests cover all six routes, projection/actor integrity, active membership authorization, spoofed fields, actual/oversized uploads, provider/database/audit failures and compensation, retained deletion/restore/purge, missing content, orphan review, shared bucket, membership revocation after upload, persisted task-scope races, export privacy and revoked sessions. Provider tests verify real offline S3 signing/TTL, Drive resumable/media request contracts, trusted upload origin and missing/trashed objects. Clean and populated upgrade schemas deploy the real migration chain; historical attachment evidence and every applied migration checksum are verified.

Commands run:

```sh
npm run prisma:generate --workspace @antara/api
node_modules/.bin/prisma format --schema apps/api/prisma/schema.prisma
DATABASE_URL=<explicit-loopback-test-url> DIRECT_URL=<explicit-loopback-test-url> node_modules/.bin/prisma validate --schema apps/api/prisma/schema.prisma
STORAGE_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase6_test npm run test:storage --workspace @antara/api
npm run test --workspace @antara/api
npm run lint --workspace @antara/api
npm run build --workspace @antara/api
npm run lint --workspace @antara/web
API_URL=http://127.0.0.1:4105/api NEXT_PUBLIC_API_URL=http://127.0.0.1:4105/api NEXTAUTH_URL=http://127.0.0.1:3105 NEXTAUTH_SECRET=<local-fixture-secret> NEXT_TELEMETRY_DISABLED=1 GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= npm run build --workspace @antara/web
PHASE5_TEST_DATABASE_URL=postgresql://phase1a@127.0.0.1:55461/antara_phase5_test npm run test:shell --workspace @antara/web
git diff --check
```

The complete API command supplies STORAGE_TEST_DATABASE_URL plus the existing PHASE1A_TEST_DATABASE_URL, AUTHORIZATION_TEST_DATABASE_URL, PHASE1C_TEST_DATABASE_URL, AUTH_TEST_DATABASE_URL, PRIVACY_TEST_DATABASE_URL, CORE_TEST_DATABASE_URL and REMAINING_TEST_DATABASE_URL, each targeting its dedicated `antara_phase*` test database on the same isolated port 55461. No integration suite is skipped. Prisma validation may read configuration syntax from the repository environment, but its database URLs were explicitly overridden to loopback and validation establishes no production connection.

Results: the full regression run passed **654 API tests across 37 suites**. Six additional generated-output policy tests also passed, for **660 distinct API tests**. The consolidated storage gate includes 70 of those tests. Prior Phase 1A/1B/1C/2/2.1/3/4A/4B and Phase 5 UI-context tests remain green. API lint/typecheck/build/postbuild, web typecheck/optimized build, Prisma generation/format/validation and focused formatting passed. The final optimized-build browser gate passed **16 tests**: all 14 Phase 5 regressions plus the file upload/open/delete/restore/context flow and MEMBER read-only presentation. Combined non-overlapping total: **676 passing tests**.

Earlier failures were fixture compatibility updates (the auth fixture's pinned four-migration deployment, restored Jest provider spies, old Drive-specific cleanup assertions), an exact-label selector that prompted explicit field accessible names, and a browser-found stale active/retained file-list cache after restore. Lifecycle/upload success now invalidates all file-list variants before subsequent view selection. No failed security assertion was removed. Existing dependency versions were not upgraded; pinned S3 SDK/multipart dependencies were added. The package installer reported 45 dependency advisories (7 moderate, 38 high); broad dependency remediation remains release hardening, not silently applied here. Existing BullMQ duplicate generated/source mock and Next standalone/start warnings remain. The sandboxed web build could not fetch its existing Google Font; the approved rerun succeeded with all ERP URLs loopback.

## Remaining Phase 7 / release work

No Phase 6 implementation depends on a live provider for its automated gate. Real configured Drive/R2 smoke tests, provider ACL/private-bucket verification, credential provisioning, host upload-temp quotas/crash cleanup, operational purge scheduling and release backup/restore exercises remain explicit release tasks. Malware scanning/content conversion is not implemented. Old unverified attachments need deliberate provenance review; none is automatically adopted. Phase 7 owns Ollama; no AI queue or Time Intelligence work was started.

## Exact file inventory (38 files)

```text
apps/api/prisma/migrations/20261008000000_phase_6_storage/migration.sql
apps/api/src/common/storage/google-drive-storage.provider.ts
apps/api/src/common/storage/s3-storage.provider.ts
apps/api/src/common/storage/storage.config.ts
apps/api/src/common/storage/storage.module.ts
apps/api/src/common/storage/storage.providers.spec.ts
apps/api/src/common/storage/storage.router.ts
apps/api/src/common/storage/storage.types.ts
apps/api/src/common/storage/upload-safety.ts
apps/api/src/modules/files/dto/upload-file.dto.ts
apps/api/src/modules/files/file-outputs.module.ts
apps/api/src/modules/files/file-outputs.spec.ts
apps/api/src/modules/files/storage.integration.spec.ts
apps/api/src/modules/files/upload.interceptor.ts
apps/api/test/storage.fixture.ts
docs/releases/v1.0.0/PHASE_6_STORAGE.md
.env.example
apps/api/package.json
apps/api/prisma/schema.prisma
apps/api/src/app.module.ts
apps/api/src/common/authorization/remaining.integration.spec.ts
apps/api/src/common/integrations/google.integration.service.ts
apps/api/src/common/privacy/privacy.integration.spec.ts
apps/api/src/common/privacy/privacy.spec.ts
apps/api/src/modules/auth/auth.integration.spec.ts
apps/api/src/modules/files/dto/create-attachment.dto.ts
apps/api/src/modules/files/files.controller.spec.ts
apps/api/src/modules/files/files.controller.ts
apps/api/src/modules/files/files.module.ts
apps/api/src/modules/files/files.service.spec.ts
apps/api/src/modules/files/files.service.ts
apps/api/test/phase5-server.ts
apps/web/src/components/files/attachment-vault.tsx
apps/web/src/hooks/use-operations.ts
apps/web/src/lib/operations-api.ts
apps/web/src/lib/operations-types.ts
apps/web/tests/shell.spec.ts
package-lock.json
```
