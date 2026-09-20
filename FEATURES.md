# ANTARA ERP — Feature Inventory

> **Status Legend**: ✅ Implemented & Tested | ⚠️ Partial | 🚧 In Progress | ❌ Not Started

---

## 1. Authentication & Authorization

| Feature | Status | Description |
|---------|--------|-------------|
| **Credential Login** | ✅ | Email/password with bcrypt hashing |
| **Google OAuth 2.0** | ✅ | One-click sign-in via Google |
| **JWT Access + Refresh** | ✅ | 15min access, 7d rotating refresh tokens |
| **RBAC Guards** | ✅ | `OWNER` / `ADMIN` / `MEMBER` roles with route-level protection |
| **Subsystem-Scoped Permissions** | ⚠️ | Basic role check; granular permissions planned |
| **WebSocket Auth** | ✅ | Handshake token validation (query + auth object) |
| **Demo User Fixtures** | ✅ | `npm run rotate:demo-passwords` for seeded accounts |
| **Audit Logging** | ✅ | All mutations logged with actor, entity, action, payload |

---

## 2. User & Team Management

| Feature | Status | Description |
|---------|--------|-------------|
| **User Profiles** | ✅ | Name, email, role, locale (EN/HI), subsystem association |
| **Availability Calendar** | ✅ | Weekly recurring availability windows per user |
| **Subsystem Membership** | ✅ | Users assigned to color-coded subsystems |
| **Role Assignment** | ✅ | OWNER/ADMIN/MEMBER with UI for management |
| **Invitation Flow** | ✅ | Email invite → token → password setup → role/subsystem assignment |
| **BullMQ Email Queue** | ✅ | Resend integration with retries/backoff |

---

## 3. Task & Subsystem Operations

| Feature | Status | Description |
|---------|--------|-------------|
| **Task CRUD** | ✅ | Create, read, update, delete, archive |
| **Task Statuses** | ✅ | `TODO` → `IN_PROGRESS` → `IN_REVIEW` → `BLOCKED` → `DONE` / `ARCHIVED` |
| **Task Priorities** | ✅ | `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` |
| **Task Dependencies** | ✅ | Array of dependency IDs, cycle detection |
| **Task Comments** | ✅ | Threaded discussion on tasks |
| **Task Attachments** | ✅ | File upload + metadata (Google Drive adapter) |
| **Drag-Drop Task Board** | ✅ | Kanban-style with optimistic updates |
| **Subsystem Modeling** | ✅ | Named, color-coded, slugged subsystems |
| **Cross-Subsystem Blockers** | ❌ | Planned: incoming/outgoing blocker view |

---

## 4. Real-time Collaboration

| Feature | Status | Description |
|---------|--------|-------------|
| **Presence System** | ✅ | Online users, join/leave events, snapshot broadcast |
| **Typing Indicators** | ✅ | Real-time "User is typing..." in task discussions |
| **Live Task Mutations** | ✅ | Create/update/delete broadcast to all subscribers |
| **Comment Real-time** | ✅ | New comments appear without refresh |
| **Socket.IO Gateway** | ✅ | Namespace `/collaboration`, JWT handshake auth |
| **Reconnection** | ✅ | Auto-reconnect with exponential backoff |
| **Offline Queue** | ❌ | Planned: queue mutations offline, sync on reconnect |

---

## 5. Worklogs & Time Tracking

| Feature | Status | Description |
|---------|--------|-------------|
| **Timer Mode** | ✅ | Start/stop timer with task association |
| **Manual Entry** | ✅ | Add/edit worklog with date, duration, description |
| **Worklog Sessions** | ✅ | Active session tracking with pause/resume |
| **Summaries** | ✅ | Per-user, per-task, per-subsystem aggregation |
| **Google Calendar Sync** | ⚠️ | Adapter exists; graceful degradation without creds |

---

## 6. Calendar & Scheduling

| Feature | Status | Description |
|---------|--------|-------------|
| **Event CRUD** | ✅ | Create, read, update, delete calendar events |
| **Subsystem Sync Events** | ✅ | Auto-generated recurring subsystem meetings |
| **Google Calendar Adapter** | ⚠️ | Two-way sync; degrades gracefully without service account |
| **Recurring Events** | ❌ | Planned: RRULE support |
| **Conflict Detection** | ❌ | Planned: overlap warnings |

---

## 7. Analytics & Intelligence

| Feature | Status | Description |
|---------|--------|-------------|
| **Velocity Tracking** | ✅ | Completed story points/tasks per sprint per subsystem |
| **Heatmap Grid** | ✅ | Activity density by day/hour |
| **Completion Rate** | ✅ | % done vs planned per subsystem |
| **Burn Risk Score** | ✅ | Heuristic: overdue + blocked + deadline pressure |
| **Subsystem Breakdown** | ✅ | Per-subsystem metrics with member drill-down |
| **AI Insights** | ✅ | OpenAI function calling: risk flags, suggestions |
| **Schedule Risk (AI)** | ✅ | Monte Carlo simulation (P50/P90) on critical path |
| **Workload Balancing** | ✅ | AI suggestion: reassign from overloaded → available |
| **Snapshot Caching** | ✅ | Redis 5-min TTL for dashboard reads |

---

## 8. AI Orchestration

| Feature | Status | Description |
|---------|--------|-------------|
| **OpenAI Function Calling** | ✅ | Structured output with deterministic fallback |
| **Risk Flag Generation** | ✅ | "Subsystem X is 3 deps deep and behind schedule" |
| **Smart Reminders** | ✅ | Context-aware notifications for stale tasks |
| **Scheduling Assistant** | ✅ | Suggests optimal meeting times based on availability |
| **Workload Rebalancing** | ✅ | "Move Task X from Person A to Person B" |
| **Manual Regenerate** | ✅ | `/ai/regenerate` endpoint for on-demand refresh |
| **Caching** | ✅ | Redis 5-min TTL, fallback to heuristics on failure |

---

## 8. Notifications & Communication

| Feature | Status | Description |
|---------|--------|-------------|
| **In-App Notifications** | ✅ | Bell icon, unread count, mark read/dismiss |
| **Email Notifications** | ✅ | Resend + BullMQ with retries/backoff |
| **Realtime Alerts** | ✅ | Socket.IO broadcast for urgent events |
| **AI-Triggered Warnings** | ✅ | "Critical path task overdue" auto-notification |
| **Notification Preferences** | ❌ | Planned: per-user channel/topic opt-in/out |

---

## 9. Files & Attachments

| Feature | Status | Description |
|---------|--------|-------------|
| **Attachment Upload** | ✅ | Multipart upload, metadata stored in DB |
| **Google Drive Adapter** | ⚠️ | Upload to Drive, store link/metadata; degrades without creds |
| **Secure Previews** | ✅ | Signed URLs for images/PDFs |
| **Attachment Indexing** | ✅ | Searchable by filename, task, uploader |

---

## 10. Resources & Allocation

| Feature | Status | Description |
|---------|--------|-------------|
| **Allocation Board** | ✅ | Drag-drop People × Subsystems × Weeks |
| **Capacity Visualization** | ✅ | Weekly capacity hours per person |
| **Conflict Highlighting** | ✅ | Red flags for overallocation |
| **AI Suggested Moves** | ✅ | "Move Task X from A to B" based on skills/capacity |

---

## 11. Meetings & Automation

| Feature | Status | Description |
|---------|--------|-------------|
| **Sync Event Generation** | ✅ | Auto-create recurring subsystem syncs |
| **Auto-Agenda** | ✅ | Blockers, decisions needed, upcoming deadlines |
| **Action Items → Tasks** | ⚠️ | Partial: meeting notes can create tasks |

---

## 12. Decisions & Institutional Memory

| Feature | Status | Description |
|---------|--------|-------------|
| **ADR-Lite Decision Log** | ✅ | Title, context, decision, rationale, alternatives, status |
| **Decision Filtering** | ✅ | By subsystem, status (proposed/accepted/superseded) |
| **Link from Comments** | ✅ | "Convert to decision" action in task comments |
| **Handoff Package Generator** | ✅ | PDF/Markdown export: subsystem summaries, risks, decisions, velocity |

---

## 11. Reports & Exports

| Feature | Status | Description |
|---------|--------|-------------|
| **Sponsor Report** | ✅ | Branded PDF: club health, subsystem status, risk register |
| **Weekly Digest** | ⚠️ | Email opt-in; template exists, scheduler pending |
| **Handoff Package** | ✅ | One-click download for leadership transition |
| **Trend Export** | ❌ | Planned: CSV/Excel export of analytics trends |

---

## 12. Internationalization (i18n)

| Feature | Status | Description |
|---------|--------|-------------|
| **Locale Detection** | ✅ | Browser header + cookie + URL prefix |
| **English (en)** | ✅ | Complete |
| **Hindi (hi)** | ✅ | Complete (via next-intl) |
| **Extensible** | ✅ | Add new locales via `messages/*.json` |

---

## 13. Developer Experience & Tooling

| Feature | Status | Description |
|---------|--------|-------------|
| **TypeScript Strict** | ✅ | `tsc --noEmit` in CI, no `any` in production code |
| **Shared Contracts** | ✅ | `@antara/contracts` aligns frontend/backend |
| **Turbo Build** | ✅ | Ordered: contracts → shared-utils → ui → api → web |
| **Jest (API)** | ✅ | Unit + integration, `--runInBand` for DB tests |
| **Playwright (Web)** | ✅ | E2E tests for auth, critical flows |
| **ESLint** | ❌ | Replaced by `tsc --noEmit`; Prettier via `npm run format` |
| **Docker** | ✅ | Multi-stage builds for api/web; docker-compose for local |

---

## 14. Infrastructure & DevOps

| Feature | Status | Description |
|---------|--------|-------------|
| **PostgreSQL 16** | ✅ | Primary DB with Prisma migrations |
| **Redis 7** | ✅ | Cache, BullMQ queues, Socket.IO adapter |
| **Docker Compose** | ✅ | Local dev: `postgres`, `redis`, `api`, `web` |
| **Multi-stage Builds** | ✅ | API: distroless; Web: Next.js standalone |
| **Health Endpoints** | ✅ | `/health` (liveness), `/health/ready` (readiness) |
| **Prometheus Metrics** | ✅ | `/metrics` endpoint with custom counters |

---

## 15. Testing Coverage

| Area | Coverage | Notes |
|-------|----------|-------|
| **API Unit Tests** | ✅ 70 tests | Jest, `--runInBand`, mocks for Prisma/Queue |
| **WebSocket E2E** | ✅ 4 tests | Real Socket.IO connection, JWT handshake |
| **Auth Guards** | ✅ | JWT + RBAC + WS auth |
| **Analytics Service** | ✅ | Snapshot, velocity, risk computation |
| **AI Service** | ✅ | Mocked OpenAI, fallback verification |
| **Web E2E** | ⚠️ | Playwright configured; auth flow tests |

---

## 16. Technical Debt & Known Gaps

| Area | Issue | Planned Fix |
|-------|-------|-------------|
| **Contracts** | `@orbitalops/contracts` alias in jest config vs `@antara/contracts` | Fix module mapper, publish properly |
| **Prisma** | No migration strategy in CI | Add `prisma migrate deploy` to deploy pipeline |
| **Docker** | API Dockerfile had `next` as dep | Fixed: removed, multi-stage corrected |
| **Tests** | ESM/CommonJS mismatch | Fixed: `transformIgnorePatterns` for `@nestjs/bullmq` |
| **WebSocket CI** | E2E tests need DB | Skip in CI, run locally with `docker compose up` |
| **Rate Limiting** | Basic per-IP | Enhance: per-user + per-endpoint tiers |

---

## 17. Feature Completion by Phase

| Phase | Theme | Completion |
|-------|-------|------------|
| **Phase 1** | Architecture, Schema, Auth, RBAC, Platform Shell | **100%** |
| **Phase 2** | Task Workflow, Collaboration, Calendar, Worklogs | **90%** |
| **Phase 3** | Analytics, AI, Notifications, Intelligence | **85%** |
| **Phase 4** | Resource Allocation, Meetings, Decisions, Reports | **70%** |
| **Phase 5** | Invite Flow, Mobile, Performance, Docs | **40%** |

---

## 18. Quick Feature Lookup by Module

| Module | Key Features |
|--------|--------------|
| `auth` | Login, OAuth, JWT, RBAC, demo users |
| `tasks` | CRUD, deps, comments, attachments, realtime |
| `worklogs` | Timer, manual, summaries, sessions |
| `calendar` | Events, sync, Google adapter |
| `analytics` | Velocity, heatmap, risk, snapshots |
| `ai` | Insights, risk, schedule, workload |
| `notifications` | In-app, email, realtime, AI alerts |
| `files` | Upload, Drive, previews |
| `subsystems` | Modeling, health, members |
| `users` | Profiles, roles, availability |
| `resources` | Allocation board, drag-drop |
| `meetings` | Sync, agendas, action items |
| `decisions` | ADR-lite, handoff export |
| `reports` | Sponsor PDF, weekly digest |
| `audit` | Mutation logging |

---

*Total: 70+ distinct features across 18 categories*  
*Last Updated: September 2025 | Build: Phase 1-3 Complete*