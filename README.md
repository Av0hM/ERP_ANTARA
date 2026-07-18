# ORBITALOPS ERP

AI-powered operations and collaboration platform for satellite engineering clubs, aerospace organizations, and multidisciplinary technical teams.

## Product Positioning

OrbitalOps ERP is a domain-specialized engineering operations platform focused on subsystem coordination, technical execution, real-time collaboration, work intelligence, and operational analytics. It is designed for student satellite teams that need startup-grade software without losing aerospace context.

## Monorepo Layout

```text
apps/
  api/        NestJS backend, Prisma schema, Socket.IO gateways, AI orchestration
  web/        Next.js 15 frontend, Auth.js integration, role-aware dashboards
packages/
  contracts/  Shared types, enums, DTO contracts, analytics models
  ui/         Shared UI primitives and visualization wrappers
docs/
  architecture/  ADR-style docs, roadmap, API and domain design
infra/
  docker/     Container definitions and local stack support
```

## Phase Delivery

1. Phase 1: Architecture, schema, auth, RBAC, platform shell
2. Phase 2: Task workflow, collaboration, calendar, and worklog operator surfaces
3. Phase 3: Analytics, AI orchestration interfaces, notifications, and intelligence dashboards
4. Phase 4: Test hardening, optimization, deployment readiness

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

## Demo Credentials

- Email: `owner@orbitalops.club`
- Password: `antara123erp`

These credentials work after seeding the database with `apps/api/prisma/seed.ts`.
Always provide a real `NEXTAUTH_SECRET`, and only set `AUTH_ALLOW_JSON_CREDENTIALS=true` when you intentionally want the API to verify demo users from the JSON fixture. The web login can fall back to the demo fixture when the API is unavailable, which is useful for local development and E2E runs.

## Core Stack

- Next.js 15 + React + TypeScript
- TailwindCSS + shadcn/ui-inspired primitives + Framer Motion
- NestJS + Prisma + PostgreSQL
- Redis + Socket.IO
- Auth.js for web auth integration
- OpenAI API orchestration layer
- Google Calendar and Drive adapters
- Optional Google service-account sync for calendar events and Drive uploads

## Architecture Highlights

- Role-aware dashboards for `OWNER`, `ADMIN`, and `MEMBER`
- Aerospace-specific subsystem modeling
- Shared contracts package to keep frontend and backend aligned
- Modular backend services for AI, analytics, notifications, worklogs, and scheduling
- Design system tuned for a futuristic aerospace operator experience
- Realtime collaboration namespace for presence, typing, comments, and task mutation broadcasts
- Calendar and worklog workspaces with API-backed creation flows and resilient fallbacks
- Live integration hooks for OpenAI text summaries, Google Calendar sync, and Google Drive uploads when credentials are configured
- Analytics and AI workspaces with recommendations, risk views, and productivity surfaces

See [System Architecture](docs/architecture/system-architecture.md) and [Phase 1 Plan](docs/architecture/phase-1-plan.md).
