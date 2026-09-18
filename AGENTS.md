# AGENTS.md — ANTARA ERP Monorepo

## Quick Commands

```bash
# Install & start (requires PostgreSQL + Redis running)
npm install
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d
npm run dev

# Build (order matters: contracts → shared-utils → ui → api → web)
npm run build

# Lint (typecheck only, no formatter)
npm run lint

# Test (runs all workspace tests)
npm run test

# Format
npm run format
```

## Monorepo Structure

```
apps/
  api/     NestJS backend (port 4000) — Prisma, Socket.IO, AI, auth, RBAC
  web/     Next.js 15 frontend (port 3000) — Auth.js, React 19, TanStack Query
packages/
  contracts/   Shared types, enums, DTOs (build first)
  ui/          Shared UI primitives (depends on contracts)
  shared-utils/  Pure utilities (no deps)
```

## Build Order (Critical)

1. `@antara/contracts` → 2. `@antara/shared-utils` → 3. `@antara/ui` → 4. `@antara/api` → 5. `@antara/web`

Turbo config enforces `dependsOn: ["^build"]` but root `package.json` build script manually sequences for safety.

## Key Conventions

- **TypeScript strict** everywhere; `lint` = `tsc --noEmit` (no ESLint)
- **No formatter** in CI — Prettier only via `npm run format` manually
- **Jest** for API (unit/integration), **Playwright** for web (E2E)
- **Prisma** in `apps/api` — run `npm run prisma:generate` after schema changes
- **Env** loaded via `@nestjs/config` (API) and Next.js (web); see `.env.example`
- **Demo auth fixtures** in `apps/api/src/modules/auth/demo-users.json` — `npm run rotate:demo-passwords` to refresh

## Testing

```bash
# API only (from root or apps/api)
npm run test --workspace @antara/api
# or
cd apps/api && npm test

# Web only (E2E)
cd apps/web && npm test
```

API tests use `--runInBand` (sequential) due to shared DB; module name mapper points `@orbitalops/contracts` to local packages/contracts.

## Docker / Local Infra

```bash
# Start Postgres + Redis
docker compose -f infra/docker/docker-compose.yml up -d

# Stop
docker compose -f infra/docker/docker-compose.yml down
```

API Dockerfile uses multi-stage build; web uses standalone Next.js output.

## API Module Map (apps/api/src/modules)

| Module | Purpose |
|--------|---------|
| auth | JWT + Google OAuth, demo users, RBAC guards |
| tasks | CRUD, comments, deps, Socket.IO gateway for realtime |
| worklogs | Timer + manual entry, sessions |
| calendar | Events, Google Calendar sync adapter |
| analytics | Snapshots, velocity, risk views |
| ai | OpenAI orchestration, insights, recommendations |
| notifications | In-app + realtime via Socket.IO |
| subsystems | Aerospace subsystem modeling |
| files | Attachments, Google Drive upload adapter |

## Database (Prisma)

- Schema: `apps/api/prisma/schema.prisma`
- Key enums: `Role` (OWNER/ADMIN/MEMBER), `TaskStatus`, `TaskPriority`, `NotificationType`
- Migrations: `npm run prisma:migrate` (dev) / `prisma migrate deploy` (prod)
- Generate client: `npm run prisma:generate` (required after schema changes)

## Common Gotchas

1. **Contracts must build first** — web/api import `@antara/contracts`; TS errors if dist missing
2. **API port 4000** — `NEXT_PUBLIC_API_URL` in web must match
3. **JWT secrets** — both `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` required
4. **Google service account** — optional; Calendar/Drive features degrade gracefully without
5. **Playwright** — needs built web (`npm run build --workspace @antara/web` first)
6. **Node 22+** — enforced in `package.json` engines and CI

## CI Pipeline (`.github/workflows/ci.yml`)

Runs on push/PR to main: `npm install → lint → build → test` (all `--if-present`)

## References

- `docs/architecture/system-architecture.md` — full system design
- `docs/architecture/phase-*.md` — delivery phases
- `turbo.json` — task pipeline config