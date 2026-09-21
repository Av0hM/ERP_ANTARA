# ANTARA ERP — Architecture & Data Flow

## Overview

ANTARA ERP is a modular monorepo implementing an AI-powered operations and collaboration platform for satellite engineering clubs and aerospace organizations. The system follows a modular monorepo architecture with a clear separation between frontend, backend, and shared packages.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ANTARA ERP MONOREPO                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  apps/web    │  │  apps/api    │  │ packages/    │  │ packages/    │   │
│  │  (Next.js 15)│  │  (NestJS 11) │  │ contracts    │  │ ui           │   │
│  │              │  │              │  │ shared-utils │  │              │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │                 │           │
│         └─────────────────┼─────────────────┼─────────────────┘           │
│                           │                 │                             │
│                    ┌──────▼─────────────────▼──────┐                       │
│                    │     SHARED CONTRACTS LAYER    │                       │
│                    │  (@antara/contracts)          │                       │
│                    │  Types, Enums, DTOs, Interfaces│                      │
│                    └───────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. High-Level Components

### 1.1 Frontend — `apps/web` (Next.js 15)

**Technology Stack:**
- Next.js 15 with App Router
- React 19 + TypeScript
- TailwindCSS + shadcn/ui-inspired primitives
- Framer Motion for animations
- Auth.js (NextAuth v5) for authentication
- TanStack Query for server state management
- next-intl for internationalization (EN/HI)

**Key Architectural Patterns:**
- **Route Groups**: `(platform)` for authenticated pages, `(auth)` for login, `[locale]` for i18n
- **Server Components by Default**: Data fetching at route level, client components for interactivity
- **Middleware**: Auth protection, locale detection, route rewriting
- **Component Composition**: Reusable UI primitives from `@antara/ui`

### 1.2 Backend — `apps/api` (NestJS 11)

**Technology Stack:**
- NestJS 11 with modular architecture
- Prisma ORM + PostgreSQL 16
- Socket.IO for realtime communication
- Redis 7 + BullMQ for queues/caching
- OpenAI API orchestration
- Passport + JWT for authentication

**Module Architecture:**
```
apps/api/src/modules/
├── auth/           # Authentication, JWT, Google OAuth, RBAC guards
├── tasks/          # Task CRUD, dependencies, comments, realtime
├── worklogs/       # Timer, manual entry, summaries, sessions
├── calendar/       # Events, Google Calendar sync adapter
├── analytics/      # Velocity, heatmap, risk, snapshots
├── ai/             # Insights, schedule risk, workload balancing
├── notifications/  # In-app + email (Resend + BullMQ)
├── files/          # Attachments, Google Drive upload adapter
├── subsystems/     # Subsystem modeling, health, members
├── users/          # User management, roles, availability
├── resources/      # Allocation board, drag-drop reassignment
├── meetings/       # Sync automation, agendas
├── decisions/      # ADR-lite decision log
├── reports/        # Handoff packages, sponsor reports
├── audit/          # Audit logging for sensitive actions
└── health/         # Health checks, readiness probes
```

### 1.3 Shared Packages

| Package | Purpose | Key Exports |
|---------|---------|-------------|
| `@antara/contracts` | Shared types, enums, DTOs | Enums, Interfaces, DTOs for all domains |
| `@antara/ui` | Shared UI primitives | Button, Panel, Toast, ErrorBoundary, Chart wrappers |
| `@antara/shared-utils` | Pure utilities | Date formatting, validation helpers, constants |

---

## 2. Data Flow

### 2.1 Authentication Flow

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ Browser │────▶│ Next.js App  │────▶│ Auth.js     │────▶│ NestJS API   │
│         │     │ Middleware   │     │ (NextAuth)  │     │ /auth/login  │
└─────────┘     └──────────────┘     └─────────────┘     └──────┬───────┘
                                                                  │
                                              ┌───────────────────┘
                                              ▼
                                       ┌─────────────┐
                                       │ PostgreSQL  │
                                       │ (Users,     │
                                       │  Sessions)  │
                                       └─────────────┘
                                              │
                                              ▼
                                       ┌─────────────┐
                                       │ JWT Tokens  │
                                       │ Access +    │
                                       │ Refresh     │
                                       └─────────────┘
```

**Key Points:**
- Frontend uses Auth.js (NextAuth v5) with credentials + Google OAuth
- API validates credentials, issues signed JWT (access: 15min, refresh: 7d)
- Refresh tokens stored in DB with rotation; access tokens in memory/cookies
- RBAC guards on API routes: `OWNER` > `ADMIN` > `MEMBER`
- WebSocket auth via handshake token (query or auth object)

### 2.2 Dashboard Hydration Flow

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────┐
│ Browser │────▶│ Next.js RSC  │────▶│ NestJS API  │────▶│ PostgreSQL  │
│         │     │ (Server Comp)│     │ REST Endpoints     │ + Redis    │
└─────────┘     └──────┬───────┘     └─────────────┘     └─────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ TanStack Query  │
              │ (Client Cache)  │
              └─────────────────┘
```

**Key Points:**
- Server Components fetch initial data at route level
- TanStack Query manages client-side caching, invalidation, optimistic updates
- Role-scoped endpoints: `OWNER/ADMIN` see all, `MEMBER` sees subsystem-scoped data

### 2.3 Realtime Collaboration Flow (Socket.IO)

```
┌─────────┐                              ┌─────────────┐
│ Client A│◀────── WebSocket ───────────▶│ NestJS API  │
│         │  Presence, Typing,           │ Socket.IO   │
│         │  Comments, Mutations         │ Gateway     │
└─────────┘                              └──────┬──────┘
                                                │
                        ┌───────────────────────┼───────────────────────┐
                        ▼                       ▼                       ▼
                  ┌───────────┐           ┌───────────┐           ┌───────────┐
                  │ PostgreSQL│           │ Redis     │           │ Client B  │
                  │ (Persist) │           │ (Pub/Sub) │           │ (Receive) │
                  └───────────┘           └───────────┘           └───────────┘
```

**Events:**
- `presence.connected` / `presence.disconnected` / `presence.snapshot`
- `discussion.typing` / `discussion.comment`
- `task.created` / `task.updated` / `task.deleted`
- `task.dependency.added` / `task.dependency.removed`

### 2.4 Async Processing (BullMQ + Redis)

```
┌──────────────┐     ┌─────────┐     ┌─────────────────┐     ┌──────────────┐
│ API Request  │────▶│ BullMQ  │────▶│ Worker Process  │────▶│ External     │
│ (Mutation)   │     │ Queue   │     │ (Processor)     │     │ Services     │
└──────────────┘     └─────────┘     └─────────────────┘     └──────────────┘
                           │
                    ┌──────┴──────┐
                    ▼             ▼
              ┌───────────┐ ┌───────────┐
              │ Resend    │ │ OpenAI    │
              │ (Email)   │ │ (AI)      │
              └───────────┘ └───────────┘
```

**Queues:**
- `invitation-email` → Resend email delivery
- `notification-email` → Resend email delivery
- `ai-insights` → OpenAI function calling
- `calendar-sync` → Google Calendar API
- `drive-upload` → Google Drive API

### 2.5 Analytics & AI Pipeline

```
┌──────────────┐     ┌─────────┐     ┌─────────────────┐     ┌──────────────┐
│ Scheduled    │────▶│ Prisma  │────▶│ Analytics       │────▶│ Redis Cache  │
│ Job / Event  │     │ Query   │     │ Service         │     │ (5-min TTL)  │
└──────────────┘     └─────────┘     └────────┬────────┘     └──────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
              ┌───────────┐            ┌─────────────┐           ┌───────────┐
              │ AI Bundle │            │ Dashboard   │           │ Snapshot  │
              │ (OpenAI)  │            │ API         │           │ Persistence│
              └───────────┘            └─────────────┘           └───────────┘
```

---

## 3. Domain Models (Prisma Schema Overview)

### Core Entities

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  passwordHash  String?
  role          Role      @default(MEMBER)
  locale        String    @default("en")
  subsystemId   String?
  availability  Json?     // { dayOfWeek: { start, end } }
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  // Relations
  subsystem     Subsystem?    @relation(fields: [subsystemId], references: [id])
  tasks         Task[]        @relation("TaskAssignee")
  worklogs      WorkLog[]
  decisions     Decision[]
}

model Task {
  id            String       @id @default(cuid())
  title         String
  description   String?
  status        TaskStatus   @default(TODO)
  priority      TaskPriority @default(MEDIUM)
  subsystemId   String
  assigneeId    String?
  reporterId    String
  dependencyIds String[]     // Array of task IDs
  estimatedHours Float?
  deadline      DateTime?
  startedAt     DateTime?
  completedAt   DateTime?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  deletedAt     DateTime?
  
  // Relations
  subsystem     Subsystem    @relation(fields: [subsystemId], references: [id])
  assignee      User?        @relation("TaskAssignee", fields: [assigneeId], references: [id])
  reporter      User         @relation("TaskReporter", fields: [reporterId], references: [id])
  comments      Comment[]
  worklogs      WorkLog[]
  attachments   Attachment[]
}

model Subsystem {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  color       String   @default("#3B82F6")
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relations
  tasks       Task[]
  members     User[]
  decisions   Decision[]
}

model WorkLog {
  id          String   @id @default(cuid())
  userId      String
  taskId      String?
  description String?
  startedAt   DateTime
  endedAt     DateTime?
  duration    Int?     // Minutes
  isManual    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relations
  user        User     @relation(fields: [userId], references: [id])
  task        Task?    @relation(fields: [taskId], references: [id])
}

enum Role {
  OWNER
  ADMIN
  MEMBER
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  BLOCKED
  DONE
  ARCHIVED
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}
```

---

## 4. Security Architecture

| Layer | Implementation |
|-------|----------------|
| **Transport** | HTTPS in production, secure cookies, CORS configured |
| **Authentication** | JWT (RS256) with short-lived access + rotating refresh tokens |
| **Authorization** | Route-level RBAC guards (`@Roles(OWNER, ADMIN)`), subsystem-scoped policies |
| **Input Validation** | `class-validator` DTOs with `whitelist: true`, `forbidNonWhitelisted: true` |
| **SQL Injection** | Prisma parameterized queries (no raw SQL in app code) |
| **Rate Limiting** | Per-IP + per-user throttling via NestJS Throttler |
| **Audit Logging** | All mutations logged with actor, entity, action, payload |
| **Secrets** | Environment variables only, no secrets in code |

---

## 5. Deployment Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION DEPLOYMENT                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐    │
│  │  CDN/    │────▶│  Web     │     │  API     │     │  DB/     │    │
│  │  Edge    │     │  (Next.js)│     │  (NestJS)│     │  Cache   │    │
│  └──────────┘     └──────────┘     └────┬─────┘     └────┬─────┘    │
│                                          │                │           │
│                              ┌───────────┴───────────┐   │           │
│                              │                       │   │           │
│                        ┌─────▼─────┐           ┌─────▼─────┐       │
│                        │ PostgreSQL│           │   Redis   │       │
│                        │  (Primary)│           │ (Cache/Q) │       │
│                        └───────────┘           └───────────┘       │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

**Docker Compose Services:**
- `postgres:16-alpine` — Primary database
- `redis:7-alpine` — Cache + BullMQ queues
- `api` — NestJS backend (multi-stage build)
- `web` — Next.js standalone output (multi-stage build)

**Environment Variables (Production):**
- `DATABASE_URL`, `REDIS_URL`
- `NEXTAUTH_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- Google OAuth + Service Account credentials

---

## 6. Development Workflow

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Start infrastructure
docker compose -f infra/docker/docker-compose.yml up -d

# 3. Run migrations
cd apps/api && npm run prisma:migrate

# 4. Start dev servers
npm run dev
# Frontend: http://localhost:3000
# API: http://localhost:4000/api
```

### Testing
```bash
# All tests
npm run test

# API only (Jest)
npm run test --workspace @antara/api

# Web E2E (Playwright)
cd apps/web && npm test

# Lint (TypeScript strict)
npm run lint

# Build all
npm run build
```

### CI Pipeline (`.github/workflows/ci.yml`)
1. `npm install` with caching
2. `npm run lint` — TypeScript strict mode (`tsc --noEmit`)
3. `npm run build` — Turbo orchestrated build order

---

## 7. Key Architectural Decisions

| Decision | Rationale | ADR |
|----------|-----------|-----|
| **PostgreSQL** | ACID, JSONB, GIN indexes for dependency arrays, mature ecosystem | [ADR 001](docs/adr/001-use-postgresql.md) |
| **NestJS** | Modular DI, first-class WebSocket, OpenAPI, testing utilities | [ADR 002](docs/adr/002-use-nestjs.md) |
| **Next.js 15** | App Router, RSC, Server Actions, built-in i18n, image optimization | [ADR 003](docs/adr/003-use-nextjs.md) |
| **Prisma** | Type-safe queries, migrations, no N+1 with `include`, safe composition | — |
| **Socket.IO** | Auto-reconnect, rooms, fallbacks, presence built-in | — |
| **BullMQ** | Redis-backed, retries, delayed jobs, priorities, metrics | — |
| **Auth.js v5** | Edge-compatible, JWT rotation, Google OAuth, TypeScript first | — |

---

## 8. Observability & Operations

| Concern | Tooling |
|---------|---------|
| **Logging** | Pino structured JSON logs (request ID correlation) |
| **Metrics** | Prometheus client (`prom-client`), `/metrics` endpoint |
| **Health** | `/health` (liveness), `/health/ready` (readiness) |
| **Error Tracking** | NestJS exception filters → structured error responses |
| **Audit Trail** | `AuditService` logs all mutations to `AuditLog` table |

---

## 9. Scaling Considerations

| Component | Strategy |
|-----------|----------|
| **API** | Horizontal scaling via container replicas; stateless (Redis for session/cache) |
| **WebSocket** | Redis adapter for multi-instance pub/sub (`@nestjs/platform-socket.io` + `ioredis`) |
| **Database** | Read replicas for analytics; connection pooling via Prisma |
| **Queue Workers** | Separate consumer processes; auto-scale based on queue depth |
| **Frontend** | Static export where possible; ISR for dynamic pages; CDN caching |

---

*Last Updated: September 2026 | Version: Phase 1-3 Complete | TypeScript strict mode: Prisma enums/decimals used at DB layer, contract enums at DTO boundaries*