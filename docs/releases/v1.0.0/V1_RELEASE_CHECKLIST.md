# v1.0.0-rc.1 operator checklist

Status: **READY WITH OPERATOR ACTIONS** after Phase 8.1 local validation. The remaining release risks and operator gates in [Phase 8](PHASE_8_RELEASE_HARDENING.md) must still be resolved. No production work is authorized by this document alone.

## Before scheduling cutover

- [ ] Review exact release SHA/worktree, lockfile checksum and all Phase 8 evidence; obtain commit/RC authorization separately.
- [ ] Full API security suites, optimized browser regression, compact release smoke, lint/typecheck/build/format/diff gates green.
- [ ] Build/run actual Node22 Alpine API/web images; verify compiled API URL and public logo/assets.
- [x] Phase 8.1 code blocker resolved: verified-user180/minute, public-source60/minute and coarse-source3,600/minute; no forwarding trust or auth-limit weakening.772 API/20 browser/13 smoke tests pass.
- [ ] Remove retired RATE_LIMIT settings; review explicit API_RATE_LIMIT settings, expected concurrency and measured API/DB capacity (default planning assumption:20 busy accounts per apparent source).
- [ ] Accept/document remaining build-tool advisories; no unresolved reachable critical/high runtime defect.
- [ ] Review secret scan; rotate any independently identified historical live credential.
- [ ] Configure protected production environment approvals; disable automatic Render deployment and automatic migration execution.
- [ ] Verify explicit pooled/direct/libpq database URLs and TLS; budget connections.
- [ ] Configure API HTTPS CORS origin, web URLs, strong secrets, correct secure cookies/host trust.
- [ ] Google OAuth audience/secret/verified-email allowlist, consent app and exact callback configured.
- [ ] Drive service account/folder permissions reviewed; no unintended sharing.
- [ ] One private S3/R2 bucket, least-privilege credentials, endpoint/region and signed URL TTL configured.
- [ ] Redis TLS/connectivity/namespace and single-instance embedded-worker plan approved.
- [ ] Decide AI_ENABLED=false or validate private Ollama/model/cold-start/capacity before enabling.
- [ ] Storage limits/30-day retention/temp-disk monitoring and weekly explicit purge owner assigned.
- [ ] Email enabled only with validated sender/key; in-app notifications independently verified.

## Maintenance and database — STOP at any mismatch

- [ ] Maintenance shows503/Retry-After; stop old API/web/auth handlers/workers, including direct API-host access.
- [ ] Immutable custom-format backup complete; pg_restore --list, checksum/provenance and isolated restore verified.
- [ ] READ ONLY drift check matches approved one-MEMBER/no-operational-data snapshot and first four migration hashes.
- [ ] Any additional user/OWNER/subsystem/membership/task/decision/invitation/file/history requires STOP and revised plan.
- [ ] Run migrations through exactly one reviewed path; keep Prisma advisory lock enabled.
- [ ] All six migration hashes match; no failed/rolled-back migration rows.
- [ ] Explicit canonical provision command succeeds with exactly five keys; no seed/demo accounts.
- [ ] Explicit initial OWNER command targets only `cmuvhzwq10001d301zl97hox6`.
- [ ] Read-only release verification passes; same active user, zero fake memberships, all old sessions revoked, privileged audit.

## Application/providers — before reopening

- [ ] Start reviewed compatible API/worker then web; no old writers restart.
- [ ] Core health/readiness, HTTPS/security headers, API CORS and assets correct.
- [ ] Sign in again; Global Dashboard/all five contexts work with zero OWNER memberships.
- [ ] Google allowlisted login succeeds; non-allowlisted denies; logout revokes.
- [ ] Drive and R2 upload/open/deny/delete/restore behave correctly; no public object access.
- [ ] Redis queue and reconciliation healthy; AI succeeds/fails truthfully or explicitly disabled.
- [ ] Normal invitations onboard approved real members; MEMBER/mixed ADMIN scope and profile ownership correct.
- [ ] Tasks/decisions/files/notifications work; forbidden direct objects deny; no protected data flash.
- [ ] No server 5xx/secret logs/integrity findings; resource capacity acceptable.
- [ ] Recovery/fix-forward owner available; immutable backup retained.
- [ ] Reopen traffic and monitor; reenter maintenance on hard stop.

## Promotion

- [ ] RC acceptance reviewed and separately authorized; no tag made by Phase8 tooling.
- [ ] Live operational criteria demonstrated before final v1.0.0: login, OWNER, onboarding, task/decision, providerstorage, notifications, logout, monitoring, backup/recovery.
- [ ] No arbitrary time window substitutes for working flows; no Time Intelligence/new features in release hardening.

Exact commands, stop conditions, provider smoke cleanup and rollback boundaries are in [Phase 8](PHASE_8_RELEASE_HARDENING.md).

## Approved People management follow-up

[People management and invitation onboarding](./PEOPLE_USER_MANAGEMENT.md) records the approved seventh migration, scoped People UI, multi-subsystem grants, hashed new invitation tokens, and pending Google onboarding state. Its backend eligibility matrix supersedes the earlier allowlist-only Google policy; normal existing active accounts and eligible invitations no longer require routine environment allowlist edits. Deploy matching API/web/worker code with the migration, and complete the documented live OAuth/email smoke checks. Existing quorum, session and object authorization remain authoritative.
