# ORBITALOPS ERP System Architecture

## 1. Product Architecture

OrbitalOps ERP uses a modular monorepo with a web application, API platform, and shared contracts/UI packages. The system is optimized for role-aware operations, subsystem-level execution, and AI-assisted engineering coordination.

## 2. High-Level Components

- `apps/web`: Next.js app-router frontend with Auth.js, protected layouts, dashboards, task operations, and analytics surfaces.
- `apps/api`: NestJS modular backend with REST endpoints, Prisma persistence, Socket.IO gateways, Redis-backed caching/pubsub, and AI orchestration services.
- `packages/contracts`: Shared DTOs, enums, role models, subsystem definitions, and analytics interfaces.
- `packages/ui`: Shared presentational primitives and chart wrappers to reduce frontend duplication.
- `infra/docker`: Local development and deployment support for PostgreSQL, Redis, frontend, and backend containers.

## 3. Domain Modules

- `auth`: credential login, Google OAuth, JWT access/refresh strategy, RBAC guards
- `users`: membership, profile, availability, role assignments, subsystem associations
- `tasks`: full task lifecycle, dependencies, comments, attachments, automation hooks
- `calendar`: milestone planning, recurring events, Google Calendar sync
- `worklogs`: timers, manual logs, productivity aggregation
- `notifications`: in-app, email, realtime alerts, AI-triggered warnings
- `analytics`: subsystem velocity, completion rates, burn risk, club health
- `ai`: summarization, smart reminders, scheduling, workload balancing, risk predictions
- `files`: Google Drive metadata, attachment indexing, secure previews

## 4. Data Flow

1. Frontend authenticates via Auth.js and exchanges credentials with the API auth module.
2. NestJS auth module issues signed access and refresh tokens and persists session metadata.
3. Web dashboards hydrate via role-scoped API endpoints.
4. Task and worklog mutations emit domain events and websocket broadcasts.
5. Analytics snapshots and AI insights are generated asynchronously and cached in Redis for fast reads.

## 5. Security Posture

- Password hashing with `bcrypt`
- Short-lived access tokens plus rotating refresh tokens
- Route-level RBAC guards
- DTO validation with `class-validator`
- API rate limiting and structured exception filters
- Audit logging for sensitive actions
- Prisma for safe query composition and SQL injection resistance

## 6. Frontend Experience Principles

- Futuristic aerospace visual language
- Dense but legible control surfaces
- Dashboard-first navigation
- Mobile-responsive with role-aware quick actions
- Optimistic interactions for task and worklog flows

## 7. Delivery Strategy

- Phase 1: platform skeleton, auth, RBAC, schema, protected UX shell
- Phase 2: dashboards, tasks, realtime collaboration
- Phase 3: AI orchestration, analytics, notifications
- Phase 4: testing, performance, deployment, observability

