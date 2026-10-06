# ANTARA ERP v1.0.0 — Master Product, Architecture & Release Specification

**Status:** Frozen v1.0.0 target  
**Repository:** `https://github.com/Av0hM/ERP_ANTARA`  
**Production Web:** `https://erp.project-antara.space/`  
**Production API:** `https://antara-api-ev5f.onrender.com`  
**Primary stack:** Next.js 15 + NextAuth, NestJS, Prisma/PostgreSQL, Redis/BullMQ, Google Drive, S3-compatible storage, Ollama  
**Release philosophy:** v1.0.0 is a hardening and architecture release, not a feature-expansion release.

---

## 1. Purpose of this document

This document is the single source of truth for ANTARA ERP v1.0.0. It freezes the current product boundary, security model, subsystem model, storage model, AI model, authenticated application shell, deployment assumptions, release gates, and implementation sequence.

If code, an old planning note, an earlier prototype, or an agent suggestion conflicts with this document, this document wins unless the project owner explicitly changes the specification.

The goal of v1.0.0 is not to add every future ANTARA idea. The goal is to make the existing ERP secure, deterministic, maintainable, production-safe, and structurally ready for later upgrades.

### v1.0.0 success statement

At release, ANTARA ERP must provide a trustworthy internal project-operations platform in which:

- users authenticate through controlled onboarding and verified Google authentication;
- authorization is enforced server-side by role **and** subsystem scope;
- the system understands exactly five current subsystems;
- OWNER has global authority;
- ADMIN is the owner of only the subsystem(s) assigned to that ADMIN;
- MEMBER access is limited to appropriate assigned/collaborative scope;
- users can belong to one or multiple subsystems;
- files are indexed in PostgreSQL while binary data lives in Google Drive or S3-compatible storage;
- AI features use Ollama, not OpenAI, for v1 runtime inference;
- AI outages degrade honestly and can queue work for later processing;
- notifications, profile/logout, and dashboard switching live in the authenticated top-right application shell;
- production failures are surfaced as failures rather than silently replaced with fake data;
- the repository, migrations, deployment configuration, automated tests, and versioning are ready for a formal `v1.0.0` tag.

---

## 2. Frozen v1.0.0 product boundary

### Included in v1.0.0

1. Authentication and session management
2. Invitation onboarding
3. Verified Google OAuth with allowlist policy
4. OWNER / ADMIN / MEMBER authorization
5. Multi-subsystem user membership
6. Multi-admin subsystem ownership
7. Cross-functional users through explicit memberships
8. User activation/deactivation lifecycle
9. Role-aware dashboard routing
10. Dashboard/subsystem context switching
11. Tasks and task collaboration
12. Subsystems
13. Decisions
14. Resources
15. Meetings / Calendar
16. Files and file index
17. Google Drive storage
18. S3-compatible storage
19. Notifications
20. Reports
21. Audit logs
22. Role-scoped analytics
23. Ollama-backed AI features
24. Primary/fallback Ollama model behavior
25. Queued AI retry and completion notifications
26. Health, readiness and production observability
27. Deterministic database migrations and deployment
28. Security regression tests and end-to-end release gates
29. Formal versioning, release notes and release candidate process

### Explicitly deferred beyond v1.0.0

The following are intentionally **not** release blockers for v1.0.0:

- automatic Time Intelligence;
- passive work/activity detection;
- IDE/desktop activity agents;
- Git-based work attribution;
- multi-task weighted time attribution;
- employee/member time analytics redesign;
- multiple Ollama nodes / AI cluster routing;
- many specialized AI models;
- advanced AI privacy/redaction gateway;
- automatic sensitive-data classification before Ollama;
- multiple S3 buckets/containers by subsystem or file type;
- storage replication across providers;
- dedicated staging infrastructure;
- advanced predictive project forecasting;
- public website privacy policy / AI policy / broader legal documentation;
- native mobile or desktop applications.

Existing legacy worklog/timer functionality must not drive new v1 architecture. It may remain only where secured and non-blocking. The advanced timing system is a future product upgrade.

---

## 3. Canonical subsystem model

ANTARA ERP v1.0.0 has exactly five canonical subsystem groups:

| Key | Display name | Notes |
|---|---|---|
| `ADCS` | ADCS | Attitude Determination & Control System |
| `PAYLOAD` | Payload | Scientific payload work |
| `GROUND_COMMS` | Ground-Station & Comms | Ground station and communications are one subsystem in v1 |
| `SDM` | SDM — Sponsorship, Design & Media | Sponsorship, Design and Media are functions inside one subsystem |
| `MAIN_SATELLITE` | Main Satellite | Main spacecraft / integrated satellite work |

No other subsystem should be silently introduced in v1 code, seeds, analytics, navigation, fixtures, or tests.

The subsystem model must still be implemented generically enough that the OWNER can add/change structure in a future version without a schema rewrite.

---

## 4. Identity, role and organizational-scope model

ANTARA must separate **authorization role** from **organizational scope**.

### System roles

- `OWNER`
- `ADMIN`
- `MEMBER`

### Organizational scope

Organizational scope is represented through subsystem membership, not through additional global security roles.

A user may belong to:

- one subsystem;
- several subsystems;
- all five subsystems, where their work is cross-functional.

Examples include SDM or sponsorship/media contributors who may work across project groups.

### Membership model

The target data model is many-to-many:

`User <-> SubsystemMembership <-> Subsystem`

A membership should support a subsystem-level access level, for example:

- `MEMBER`
- `ADMIN`

This allows a user to be:

- ADMIN of ADCS;
- MEMBER of Main Satellite;
- without becoming an administrator of Main Satellite.

### Multiple administrators

A subsystem may have multiple ADMIN users simultaneously.

---

## 5. Final authorization policy

### OWNER

OWNER has organization-wide authority.

OWNER may:

- see all five subsystems;
- create/invite MEMBER accounts;
- create/promote ADMIN accounts;
- create/promote OWNER accounts;
- assign and remove subsystem memberships;
- deactivate/reactivate users;
- manage all tasks, resources, files, subsystem decisions and global decisions;
- access global analytics and audit logs;
- override subsystem administration where necessary;
- manage release/system-level configuration where exposed in the application.

### ADMIN

ADMIN is **not** a junior global OWNER. ADMIN is the administrator of only explicitly assigned subsystem(s).

ADMIN may, within administered subsystem(s):

- create/invite MEMBER accounts into that subsystem;
- create, assign, edit and manage tasks;
- manage subsystem resources;
- manage subsystem-scoped decisions;
- manage subsystem files;
- view subsystem analytics;
- manage normal subsystem workflow.

ADMIN may not:

- create or promote OWNER accounts;
- create or promote ADMIN accounts in v1.0.0;
- manage users outside administered subsystem(s);
- alter OWNER/global decisions;
- change global ERP configuration;
- access unrelated subsystem administration;
- use global OWNER-only analytics/audit capabilities.

Only OWNER assigns/promotes ADMIN and OWNER roles in v1.0.0.

### MEMBER

MEMBER is a normal project contributor.

MEMBER may:

- access dashboards/scopes explicitly available through their memberships;
- work with tasks they are permitted to view or are assigned/collaborating on;
- add permitted comments, updates, files and collaboration data;
- read decisions/resources according to subsystem access policy.

MEMBER may not perform administrator-only actions simply by crafting direct API requests.

### Authorization rule

A role check alone is insufficient for ADMIN.

Every sensitive subsystem operation must answer both:

1. Is this actor permitted by system role?
2. Does this actor have sufficient access to the **target subsystem/object**?

OWNER bypasses subsystem scope. ADMIN does not.

---

## 6. Decision authority model

Decisions require explicit scope.

### Global / OWNER decisions

Global decisions are authoritative project-level decisions.

- OWNER may create/edit/supersede/delete according to policy.
- ADMIN may read but cannot mutate them.
- MEMBER may read if appropriate but cannot mutate authoritative state.

### Subsystem decisions

Subsystem decisions belong to one subsystem.

- OWNER may manage all.
- ADMIN may manage only decisions in administered subsystem(s).
- MEMBER may contribute only through allowed collaboration mechanisms, not authoritative decision mutation.

The API, frontend controls and tests must implement the same policy.

---

## 7. Authentication and onboarding

ANTARA v1 uses two controlled entry paths:

### Path A — Invitation onboarding

- OWNER may invite MEMBER, ADMIN or OWNER according to role policy.
- ADMIN may invite MEMBER only into subsystem(s) that ADMIN controls.
- Invitation tokens must expire and be revocable.
- Role and subsystem placement are server-controlled.

### Path B — Google sign-in with allowlist

Google authentication must be cryptographically verified by the backend. The backend must not trust a plain email posted by the client.

Flow:

1. User authenticates with Google.
2. Backend verifies the Google identity token / trusted provider result.
3. Verified email must satisfy the configured Google allowlist policy.
4. ERP user record determines role and memberships.
5. Existing role is preserved; frontend must never default every Google user to MEMBER when the DB says otherwise.
6. The user is redirected to the appropriate dashboard/context based on ERP authorization.

Safe v1 resolution for an allowlisted Google email that is not yet provisioned:

- create or represent it as a pending/limited MEMBER identity with no subsystem data access; or
- deny project access until provisioned.

In either case, an allowlisted email must **not** automatically gain arbitrary project data.

### Public registration

Unrestricted public registration must not allow role selection. If a registration endpoint remains, it must never accept or trust a caller-supplied privileged role.

---

## 8. Session and account lifecycle

### Deactivation

When a user is deactivated:

- mark account inactive rather than deleting history;
- immediately revoke active refresh sessions;
- reject new login;
- reject token refresh;
- preserve historical tasks, comments, files, decisions, audit records and authorship.

### Session revocation triggers

At minimum, revoke sessions when:

- user is deactivated;
- role is changed;
- security/password reset occurs;
- OWNER explicitly revokes sessions.

### Refresh-token storage

Do not store directly usable refresh tokens as plaintext database values. Store a safe hash/JTI/session representation suitable for revocation and rotation.

---

## 9. Authenticated application shell

The v1 authenticated application shell has a fixed separation of responsibility.

### Left / brand region

Show:

`[ANTARA LOGO]  ANTARA ERP`

When sidebar/navigation is collapsed, the logo may remain as the compact identity mark.

### Sidebar

The sidebar is for application navigation only. It should not contain logout or duplicate personal-account controls.

Typical navigation includes the modules available to the current role, such as Dashboard, Tasks, Decisions, Resources, Subsystems, Calendar/Meetings, Files and Reports.

### Top-right controls

The top-right authenticated header contains, in this order:

1. Dashboard / subsystem context switcher
2. Notification bell
3. User profile menu

Conceptual layout:

`[Context / Dashboard ▾]   [Bell]   [Avatar / User ▾]`

### Profile menu

At minimum:

- identity / role display;
- Profile entry (if implemented);
- Logout.

Logout must live here rather than as a sidebar navigation item.

---

## 10. Dashboard and subsystem switching

Dashboard switching belongs in the top-right context control.

### OWNER

May switch among:

- Global Dashboard;
- ADCS;
- Payload;
- Ground-Station & Comms;
- SDM;
- Main Satellite.

### ADMIN

May switch only among:

- an ADMIN summary/landing context if provided;
- subsystem dashboards for subsystem(s) they administer or otherwise have access to.

ADMIN must never receive a context option for a subsystem outside their memberships.

### MEMBER

May switch only among:

- personal/member dashboard;
- subsystem dashboard contexts explicitly allowed by their memberships.

### Single-subsystem user

The context control may remain visible for consistency, but it should not present invalid choices.

Context switching is a UI convenience, not an authorization mechanism. Every destination API remains server-authorized.

---

## 11. Notifications

v1.0.0 includes a top-right notification bell with persistent notification state.

Minimum capabilities:

- unread badge count;
- recent notifications dropdown;
- mark one as read;
- mark all as read;
- view all notifications;
- deep-link to relevant ERP object where possible.

Notification examples:

- task assigned or reassigned;
- task status/important update;
- decision update;
- invitation/account event;
- file/resource event where relevant;
- queued AI result completed;
- important system/admin event where appropriate.

Notifications must be scoped to recipients. Sensitive OWNER-only events must not be broadcast to all users.

---

## 12. Core module behavior

### Tasks

- creation/reassignment/deletion are permission-gated;
- actor identity comes from authenticated JWT/session, not caller-supplied author IDs;
- ADMIN task management is subsystem-scoped;
- MEMBER mutation scope is limited to allowed/assigned work;
- failed mutations surface real errors and preserve user input where appropriate.

### Subsystems

- exactly five canonical v1 subsystem records;
- multi-admin membership supported;
- multi-subsystem membership supported;
- subsystem slugs/keys are stable in seeds/tests.

### Resources

- OWNER: global;
- ADMIN: administered subsystem(s);
- MEMBER: permitted/read scope only;
- no global resource mutation by arbitrary ADMIN.

### Meetings / Calendar

- failures must be reported honestly;
- production must not fabricate a successful calendar event if external creation failed;
- provider-unavailable and not-configured states must be distinguishable.

### Reports

- reports must respect the same authorization scope as underlying data;
- no accidental cross-subsystem leakage in exports;
- report/export file storage follows storage routing rules.

### Analytics

- OWNER: global/organization-wide;
- ADMIN: only administered subsystem(s);
- MEMBER: personal/permitted scope;
- role-specific labels without role-specific data are not sufficient.

### Audit logs

Record privileged and security-significant operations including role changes, account deactivation, important resource changes, file deletion/restoration/purge, and other OWNER/ADMIN actions.

---

## 13. File and storage architecture

### Principle

PostgreSQL is the source of truth for file metadata, ownership, relationships and authorization. Google Drive or S3 stores the binary/object itself.

Users should normally discover and open files through ANTARA ERP, not by manually navigating provider dashboards.

### v1 storage routing

| Data category | Provider |
|---|---|
| Documents | Google Drive |
| Meeting reports | Google Drive |
| CAD binaries | S3 |
| Images | S3 |
| Exports | S3 |
| Simulation artifacts | S3 |
| Archives / miscellaneous binaries | S3 |
| Anything not explicitly routed to Drive | S3 |

### v1 S3 topology

Use one S3-compatible bucket/container for v1.0.0.

Use logical prefixes by subsystem and type, for example:

`payload/cad/...`

`adcs/simulation/...`

`ground-comms/images/...`

Future versions may split these into multiple buckets/containers without changing application contracts.

### File metadata index

Use a provider-neutral file record concept similar to:

- id
- displayName
- mimeType
- sizeBytes
- provider (`DRIVE` or `S3`)
- container/bucket identifier
- provider external ID / object key
- subsystemId
- optional taskId
- optional decision/resource/report relationship
- uploadedById
- createdAt
- deletedAt
- purgeAfter

No feature should need to know provider-specific implementation details beyond the storage abstraction.

### Opening files inside ERP

ERP remains the entry point:

1. client requests file by ERP ID;
2. backend authorizes actor against file/subsystem;
3. backend resolves provider metadata;
4. backend returns/streams an authorized preview, signed URL, or provider-backed view appropriate to the file type.

For types the browser cannot natively render, ERP provides an authorized download/open action. Users should not need S3 console or Drive administration access.

### Storage provider abstraction

Target interface concepts:

- `put`
- `open` / `getAuthorizedAccess`
- `download`
- `delete`
- `restore` where provider supports it
- `exists`
- `metadata`

Implementations:

- `GoogleDriveStorageProvider`
- `S3StorageProvider`

### Failure policy

Production must never create a fake `local://` attachment if remote storage failed unless a real durable local provider exists and is explicitly configured.

Storage failure -> request fails clearly -> database does not claim a valid uploaded asset.

---

## 14. File deletion and retention

v1 policy:

`soft delete -> retention period -> eventual hard delete`

Recommended default retention: **30 days**, configurable by environment.

### MEMBER

Cannot arbitrarily destroy historical project assets.

### ADMIN

May soft-delete files only in administered subsystem(s), subject to object policy.

### OWNER

May soft-delete across ERP, restore retained files, and perform explicit hard purge where policy permits.

### Background purge

A scheduled/background job permanently deletes provider objects after retention and records the action in audit logs.

---

## 15. Ollama AI architecture

### v1 provider decision

OpenAI is not the v1 runtime inference provider for ERP AI features. v1 uses **Ollama**.

Application code must depend on an internal AI abstraction, not on scattered Ollama HTTP calls.

Concept:

`AIProvider -> OllamaProvider`

This preserves future ability to use another Ollama node, specialized models, or another provider without rewriting feature modules.

### Deployment

Do not place Ollama inside the NestJS API process/container.

Preferred v1 topology:

- NestJS API remains application/service layer;
- AI work is executed through an AI service/worker path;
- Ollama runs as a separate service reachable by controlled/private networking where possible;
- exact compute host is configurable so Ollama can live on suitable Render infrastructure or a separate compute host without changing application code.

### Models

v1 keeps model routing simple:

- one PRIMARY model;
- optionally one FALLBACK model.

Configuration example concept:

- `OLLAMA_BASE_URL`
- `OLLAMA_PRIMARY_MODEL`
- `OLLAMA_FALLBACK_MODEL`

Multiple specialized models are deferred.

### AI privacy for v1

For v1, project context may be sent to the controlled Ollama service as required by the feature.

The advanced data-classification/redaction/privacy gateway is intentionally deferred, but the architecture should leave a clear insertion point for it later.

---

## 16. AI outage and queue behavior

AI must fail honestly.

Flow:

1. request reaches AI service;
2. try PRIMARY model;
3. if appropriate, try FALLBACK model;
4. if service/models unavailable, persist/queue retryable request;
5. UI informs user that AI is temporarily unavailable and request has been queued;
6. BullMQ/worker retries with controlled backoff;
7. when processing succeeds, result is persisted;
8. user receives a notification;
9. notification deep-links to the completed result.

No fabricated AI result should be shown as though inference succeeded.

Queue design must include idempotency/deduplication so repeated retry does not create duplicate results.

---

## 17. Security and data-integrity hardening requirements

These are v1.0.0 release blockers.

### Authentication

- backend verifies Google identity; plain email is not sufficient;
- role is never trusted from public/self-service registration input;
- inactive users cannot log in or refresh;
- refresh/session handling supports revocation;
- privileged role transitions obey OWNER-only policy.

### Role escalation

- ADMIN cannot create/promote OWNER;
- ADMIN cannot create/promote ADMIN in v1;
- ADMIN MEMBER creation is restricted to administered subsystem(s);
- invitation endpoints enforce the same hierarchy.

### User data exposure

Never return raw Prisma `User` objects where they contain sensitive internal fields such as password hashes or session/security attributes.

Use a shared safe-user projection/DTO.

### Authenticated actor identity

Where JWT/session already proves the actor, do not accept trusted identity fields from the request body for actions such as:

- authorId;
- assignedById;
- uploader/user worklog ownership;
- other creator/auditor fields.

Derive them server-side.

### Real failure behavior

Production mutations must not catch database/provider failures and return synthetic success objects.

Differentiate:

- no data;
- provider not configured;
- provider unavailable;
- authorization failure;
- validation failure;
- database/internal failure.

### Metrics/operational endpoints

Review access to metrics and operational internals. Public health endpoints may remain minimal; sensitive metrics should be protected or network-restricted.

---

## 18. Environment model

v1 maintains exactly two operational environments:

### Local development

- local Next.js;
- local NestJS;
- local/container PostgreSQL;
- local/container Redis;
- local or explicitly configured Ollama;
- development S3 bucket/container or isolated prefix;
- isolated Google Drive development folder/configuration.

### Production

- `erp.project-antara.space` web;
- production API;
- production PostgreSQL;
- production Redis;
- production Drive/S3;
- production Ollama service.

Local development must never silently point to production DB/storage because an environment variable was omitted.

Use explicit environment identity (for example `APP_ENV=local|production`) plus boot-time validation.

A staging environment is deferred beyond v1.

---

## 19. Production deployment and migration policy

The repository must describe production reality.

### Render / deployment configuration

- checked-in deployment configuration must use current production domains/URLs;
- do not leave stale `antara-web.onrender.com`-style auth URLs when the canonical web origin is `https://erp.project-antara.space`;
- API URL must match the live deployed service/configuration;
- secrets remain in environment management, never repository history.

### Prisma migrations

Use one authoritative production migration path.

Recommended deployment sequence:

`build -> prisma migrate deploy -> start application`

Migration failure must block deployment rather than starting an application against an incompatible schema.

Never use destructive reset as a normal production migration strategy.

---

## 20. Testing and release gates

A `v1.0.0` tag requires more than successful compilation.

### Required gates

1. lint
2. typecheck
3. unit tests
4. PostgreSQL-backed integration tests
5. Redis-backed tests where relevant
6. Prisma migration-from-clean test
7. API authorization/security regression tests
8. Playwright end-to-end critical flows
9. production web build
10. production API build

### Security regression cases

At minimum prove:

- public/self-service request cannot choose OWNER;
- fake/unverified Google identity is rejected;
- ADMIN cannot create/promote OWNER;
- ADMIN cannot manage unrelated subsystem;
- MEMBER cannot invoke privileged API by bypassing hidden UI;
- passwordHash/sensitive user fields do not appear in normal API JSON;
- inactive user cannot login;
- inactive user cannot refresh;
- role change revokes/invalidates sessions according to policy;
- failed DB/storage mutation returns failure, not fake success;
- report/export access does not cross subsystem boundaries.

### Role matrix E2E

Test representative OWNER, ADMIN and MEMBER accounts against real backend JWT/RBAC behavior.

---

## 21. Release engineering

Before final release align versioning and documentation.

Target:

- root `package.json`: `1.0.0`
- API package: `1.0.0`
- web package: `1.0.0`
- API/Swagger version metadata: `1.0.0`
- Git tag: `v1.0.0`
- GitHub Release: `ANTARA ERP v1.0.0`

Repository release documentation should include or update:

- `CHANGELOG.md`
- `SECURITY.md`
- `LICENSE` as applicable
- `README.md`
- release checklist/runbook
- operations/recovery documentation

### Candidate process

1. feature freeze;
2. complete release-hardening phases;
3. tag/deploy `v1.0.0-rc.1`;
4. run production smoke tests with OWNER/ADMIN/MEMBER;
5. fix only release defects;
6. repeat RC only if necessary;
7. tag/publish `v1.0.0`.

After `rc.1`, do not add unrelated features.

---

## 22. Operations, backup and recovery minimum

v1 needs an operator-readable recovery document covering:

- database backup owner/provider;
- backup frequency/retention;
- how to restore PostgreSQL;
- what to do before a destructive/high-risk migration;
- how to roll back web/API release;
- how Drive/S3 objects are recovered or retained;
- Redis loss expectations;
- Ollama outage expectations;
- emergency session revocation;
- minimum health/metrics checks.

The goal is not enterprise bureaucracy; it is knowing how to recover the project if production breaks.

---

## 23. Implementation roadmap

### Phase 0 — Freeze and baseline

Deliverables:

- place this specification in the repo;
- create/update root `AGENTS.md` to reference it;
- establish implementation-plan format;
- record clean baseline test/build results;
- freeze unrelated feature development.

Exit criteria:

- team/agents have one source of truth;
- current failures are documented before changes begin.

### Phase 1 — Data model and scoped authorization foundation

Work:

- canonical five subsystem seeds;
- many-to-many subsystem memberships;
- subsystem-level MEMBER/ADMIN access;
- multiple admins per subsystem;
- decision scope model;
- shared authorization helpers/policies.

Exit criteria:

- object-aware subsystem authorization can be tested independently.

### Phase 2 — Authentication and account hardening

Work:

- invitation-only/controlled onboarding;
- verified Google identity;
- allowlist enforcement;
- DB-driven role/membership;
- session revocation;
- inactive account behavior;
- safe refresh-token/session storage;
- privileged role transition rules.

Exit criteria:

- all auth security regression tests pass.

### Phase 3 — API privacy and data integrity

Work:

- safe user DTO/projection;
- remove caller-trusted actor IDs;
- audit raw Prisma relation exposure;
- remove fake-success fallbacks;
- align error contracts;
- protect metrics/operational data where required.

Exit criteria:

- normal API never leaks sensitive user fields;
- failed mutations fail honestly.

### Phase 4 — Role/subsystem behavior across core modules

Work:

- tasks;
- decisions;
- resources;
- files;
- reports;
- analytics;
- meetings/calendar;
- admin scope enforcement.

Exit criteria:

- OWNER/global, ADMIN/subsystem and MEMBER/permitted behavior match the matrix server-side.

### Phase 5 — Application shell and notifications

Work:

- ANTARA logo + `ANTARA ERP` branding;
- authenticated top header;
- top-right context/dashboard switcher;
- notification bell/dropdown/unread state;
- profile menu;
- logout only in profile menu;
- responsive equivalent;
- remove stale/duplicate user controls.

Exit criteria:

- all roles see only valid contexts and controls;
- switching context never bypasses backend authorization.

### Phase 6 — Storage redesign

Work:

- provider-neutral file metadata;
- Drive provider;
- S3 provider;
- storage router;
- one v1 S3 bucket/container;
- ERP file index/open flow;
- soft delete + retention + purge;
- remove fake/local fallback behavior.

Exit criteria:

- upload/open/delete lifecycle works end-to-end for representative Drive and S3 file types.

### Phase 7 — Ollama migration

Work:

- internal AI provider abstraction;
- Ollama implementation;
- remove OpenAI as v1 inference dependency;
- configurable base URL;
- primary/fallback model;
- normalize AI error handling.

Exit criteria:

- all current v1 AI features operate against Ollama.

### Phase 8 — AI resilience

Work:

- BullMQ AI job queue;
- retry/backoff;
- idempotency;
- result persistence;
- queued/unavailable UI state;
- completion notification.

Exit criteria:

- simulated Ollama outage does not lose requests or fabricate results.

### Phase 9 — Production hardening

Work:

- environment validation;
- correct Render URLs/config;
- migration deployment path;
- health/readiness/metrics review;
- backup/recovery documentation;
- startup safeguards.

Exit criteria:

- production can be recreated from repository + secret configuration without hidden manual knowledge.

### Phase 10 — Release test suite and documentation

Work:

- security regression suite;
- database/Redis integration suite;
- Playwright role flows;
- storage tests;
- AI failure/retry tests;
- README/security/changelog/release checklist;
- version alignment.

Exit criteria:

- CI is the v1 release gate.

### Phase 11 — Release candidate

Deploy `v1.0.0-rc.1` and smoke-test:

- OWNER;
- single-subsystem ADMIN;
- multi-subsystem ADMIN;
- single-subsystem MEMBER;
- multi-subsystem MEMBER;
- Google login;
- invitation flow;
- notification flow;
- Drive/S3 flow;
- Ollama success and outage flow.

### Phase 12 — Stable v1.0.0

Only when all mandatory gates are green:

- version to `1.0.0`;
- tag `v1.0.0`;
- create GitHub Release;
- deploy the tagged release;
- run final smoke test;
- archive release notes and operational state.

---

## 24. How to implement this with ChatGPT + Codex

Use the two tools for different jobs.

### Use ChatGPT as the architect/reviewer

Bring ChatGPT:

- the current phase;
- Codex plan/diff;
- failing logs/tests;
- Prisma migration changes;
- screenshots for UI review;
- security-sensitive code paths before merge.

Use ChatGPT to:

- refine requirements;
- produce a narrowly scoped Codex prompt;
- review the proposed architecture;
- inspect diffs and test evidence;
- identify missed RBAC/security cases;
- decide whether the phase acceptance criteria are actually met;
- prepare the next phase.

Do not ask ChatGPT and Codex to independently redesign the whole system every turn. This document is the design authority.

### Use Codex as the repository implementation agent

Give Codex the repository and one bounded implementation goal at a time.

Codex should:

1. read this master specification;
2. read repository `AGENTS.md` and any phase plan;
3. inspect existing implementation before editing;
4. preserve already-approved behavior outside task scope;
5. make the smallest coherent set of changes that completes the task;
6. add/update tests in the same task;
7. run relevant tests/build/typecheck;
8. report files changed, migration impact, tests run, remaining risk;
9. not commit/push unless explicitly instructed.

For complex phases, create an execution plan before edits rather than giving Codex one enormous “implement v1” prompt.

### Recommended repo files for agent workflow

Create:

- `/AGENTS.md`
- `/docs/releases/v1.0.0/ANTARA_ERP_V1_SPEC.md` (this file)
- `/.agent/PLANS.md`
- `/.agent/plans/v1-phase-01-rbac.md`, etc. as phases progress

`AGENTS.md` should explicitly tell Codex that this v1 specification is authoritative and that significant refactors/features require a phase execution plan.

---

## 25. Codex task contract

Every Codex implementation prompt should contain five things.

### 1. Goal

A narrow, observable outcome.

Example:

“Implement subsystem-scoped membership and ADMIN authorization for the five canonical ANTARA subsystems.”

### 2. Source of truth

Tell Codex to read this spec first and cite the relevant sections in its plan/report.

### 3. Constraints

Examples:

- no unrelated redesign;
- no TypeScript weakening;
- no production secrets;
- migrations must be forward-safe;
- do not break existing production URLs;
- no commit/push unless asked;
- update tests with code.

### 4. Acceptance criteria

Use concrete pass/fail behavior.

Example:

- ADCS ADMIN can manage ADCS task;
- same ADMIN receives 403 for Payload task;
- OWNER can manage both;
- multi-subsystem ADMIN can manage exactly assigned subsystems;
- MEMBER cannot call privileged mutation directly;
- tests prove every case.

### 5. Verification report

Require:

- files changed;
- schema/migration changes;
- commands/tests run;
- before/after behavior;
- unresolved risk;
- no unsupported claims.

---

## 26. Recommended first Codex run

Do **not** start by asking Codex to implement all twelve phases.

Start with a read-only release baseline and Phase 1 plan.

### First prompt to Codex

> You are working on the ANTARA ERP repository for the v1.0.0 hardening release. Read `docs/releases/v1.0.0/ANTARA_ERP_V1_SPEC.md` completely and treat it as the source of truth. Also read the repository `AGENTS.md`, Prisma schema, auth/RBAC code, subsystem-related services/controllers, analytics scoping, tests, and current migrations. Do not modify code yet. Produce a detailed implementation plan for **Phase 1 — Data model and scoped authorization foundation** only. The plan must identify the current schema/authorization shape, exact files likely to change, proposed forward-safe Prisma migration(s), how existing user/subsystem data will be preserved or backfilled, shared authorization helpers/policies to add, API compatibility risks, and the exact unit/integration/E2E tests required. Canonical subsystems are exactly ADCS, Payload, Ground-Station & Comms, SDM (Sponsorship, Design & Media), and Main Satellite. ADMIN authorization must be subsystem-scoped and a user may be ADMIN in one subsystem and MEMBER in another. Multiple ADMINs per subsystem are allowed. OWNER is global. Do not commit or push. End with a checklist that can be reviewed before implementation begins.

Bring that plan back to ChatGPT for review before telling Codex to edit the schema.

---

## 27. Day-to-day implementation loop

Use this loop for every phase:

1. **You -> ChatGPT:** “We are starting Phase N; here is current repo status.”
2. **ChatGPT:** produces/refines a bounded Codex prompt and acceptance checklist.
3. **You -> Codex:** run the prompt in the repository.
4. **Codex:** inspects, plans, implements, tests and returns a verification report.
5. **You -> ChatGPT:** paste the report/diff/test output.
6. **ChatGPT:** performs architecture/security review and identifies any missing cases.
7. **Codex:** applies only the review fixes.
8. **Tests:** rerun the phase gate.
9. **Commit:** only after the phase is green.
10. Move to the next phase.

This keeps Codex productive without letting one long autonomous run silently redefine the product.

---

## 28. Branching recommendation

Keep Git workflow simple.

Possible sequence:

- `feat/v1-rbac-foundation`
- `feat/v1-auth-hardening`
- `feat/v1-api-integrity`
- `feat/v1-app-shell-notifications`
- `feat/v1-storage`
- `feat/v1-ollama`
- `chore/v1-production-hardening`
- `chore/v1-release`

Merge reviewed green phases into `main`.

Avoid a heavy GitFlow model unless the team grows enough to need it.

---

## 29. Definition of Done for v1.0.0

ANTARA ERP may be called `v1.0.0` only when all of the following are true.

### Product

- five canonical subsystem model implemented;
- OWNER/ADMIN/MEMBER behavior matches this document;
- multi-subsystem users and multi-admin subsystem ownership work;
- top-right context switcher works;
- notification bell works;
- profile menu and logout work;
- ANTARA logo + ANTARA ERP branding present;
- core modules are usable for intended roles.

### Security

- Google identity verified;
- role escalation closed;
- subsystem scope enforced server-side;
- inactive session/login behavior correct;
- sensitive User fields not leaked;
- actor identity server-derived;
- privileged operations audited.

### Data integrity

- no fake-success DB/provider fallbacks in production;
- migrations are deterministic;
- file metadata and provider state do not silently diverge;
- Drive and S3 failure behavior is explicit.

### AI

- v1 AI uses Ollama provider abstraction;
- primary model works;
- fallback behavior works if configured;
- full service outage queues or clearly marks work unavailable;
- successful queued result notifies user;
- no OpenAI runtime dependency required for normal v1 AI features.

### Storage

- documents/meeting reports route to Drive;
- CAD/images/exports/other binary categories route to S3;
- one v1 S3 container/bucket supported;
- ERP file index can authorize and open/download assets;
- soft-delete retention and purge lifecycle works.

### Operations

- production URLs/configuration match reality;
- production migration path proven;
- backup/recovery runbook exists;
- health/readiness checks work;
- secrets are not committed.

### Quality

- lint/typecheck/build green;
- unit/integration/E2E gates green;
- OWNER/ADMIN/MEMBER regression suite green;
- release candidate production smoke test green;
- no known P0/P1 release blocker remains.

### Release

- version metadata aligned to 1.0.0;
- changelog/security/readme updated;
- `v1.0.0` Git tag created from reviewed release commit;
- GitHub Release published;
- deployed release passes final smoke test.

---

## 30. Post-v1 roadmap book

Keep these explicitly documented for later rather than sneaking them into v1 scope.

### Time Intelligence upgrade

- automatic work detection;
- activity event ingestion;
- sessionization;
- task/domain attribution;
- multi-task weighted attribution;
- owner-only effort intelligence;
- Git/IDE/engineering-tool integrations;
- anomaly and estimation models.

### AI platform upgrade

- privacy/context classification;
- redaction gateway;
- multiple Ollama nodes;
- specialized model routing;
- advanced AI observability/evaluation.

### Storage platform upgrade

- multiple S3 buckets/containers;
- per-subsystem/per-data-type routing;
- replication/archival tiers;
- richer preview/conversion pipeline.

### Environment/platform upgrade

- dedicated staging environment;
- more advanced deployment promotion;
- deeper disaster-recovery automation.

These are future increments, not excuses to delay a stable v1.0.0.

---

## 31. Final implementation principle

For v1.0.0, prefer **correctness, authorization, data integrity, observability and recoverability** over adding another feature.

The release should feel boring in the best possible way: users know what they can access, the backend enforces it, files go where the ERP says they went, AI either works or reports/queues failure honestly, deployments reproduce the same system, and the release can be recovered if something breaks.

That is the definition of ANTARA ERP v1.0.0.
