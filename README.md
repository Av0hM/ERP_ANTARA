# ANTARA ERP

AI-powered operations and collaboration platform for satellite engineering clubs, aerospace organizations, and multidisciplinary technical teams.

## Product Positioning

ANTARA ERP is a domain-specialized engineering operations platform focused on subsystem coordination, technical execution, real-time collaboration, work intelligence, and operational analytics. It is designed for student satellite teams that need startup-grade software without losing aerospace context.

## Monorepo Layout

```text
apps/
  api/        NestJS backend, Prisma schema, Socket.IO gateways, AI orchestration
  web/        Next.js 15 frontend, Auth.js integration, role-aware dashboards
packages/
  contracts/  Shared types, enums, DTO contracts, analytics models
  ui/         Shared UI primitives and visualization wrappers
  shared-utils/  Pure utilities (no deps)
docs/
  architecture/  ADR-style docs, roadmap, API and domain design
  adr/         Architecture Decision Records
infra/
  docker/     Container definitions and local stack support
```

## Phase Delivery

1. **Phase 1**: Architecture, schema, auth, RBAC, platform shell
2. **Phase 2**: Task workflow, collaboration, calendar, and worklog operator surfaces
3. **Phase 3**: Analytics, AI orchestration interfaces, notifications, and intelligence dashboards
4. **Phase 4**: Program manager features (resource allocation, meeting automation, reports)
5. **Phase 5**: Polish & adoption (invite flow, mobile optimization, performance, docs)

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Start infrastructure (PostgreSQL + Redis)
docker compose -f infra/docker/docker-compose.yml up -d

# Run database migrations
cd apps/api && npm run prisma:migrate

# Start development servers
npm run dev
```

### Access Points
- **Frontend**: http://localhost:3000
- **API**: http://localhost:4000/api
- **Health Check**: http://localhost:4000/health
- **API Docs**: http://localhost:4000/api/docs (when enabled)

## Core Stack

- **Frontend**: Next.js 15 + React 19 + TypeScript
- **Styling**: TailwindCSS + shadcn/ui-inspired primitives + Framer Motion
- **Backend**: NestJS 11 + Prisma + PostgreSQL 16
- **Cache/Queue**: Redis 7 + BullMQ
- **Realtime**: Socket.IO
- **Auth**: Auth.js (NextAuth v5) with JWT + Google OAuth
- **AI**: OpenAI API orchestration layer
- **Integrations**: Google Calendar & Drive adapters

## Architecture Highlights

- **Role-aware dashboards** for `OWNER`, `ADMIN`, and `MEMBER`
- **Aerospace-specific subsystem modeling** with color-coded visualization
- **Shared contracts package** (`@antara/contracts`) keeping frontend/backend aligned
- **Modular backend services** for AI, analytics, notifications, worklogs, scheduling
- **Design system** tuned for futuristic aerospace operator experience
- **Realtime collaboration** via Socket.IO (presence, typing, comments, task mutations)
- **Calendar & worklog workspaces** with API-backed creation flows
- **AI orchestration** with OpenAI function calling + deterministic fallbacks
- **Resource allocation board** with drag-and-drop task reassignment
- **Meeting automation** with auto-generated agendas and sync events
- **Handoff package generator** for sponsor/faculty reports

## Development

### Prerequisites
- Node.js 22+
- npm 10+
- PostgreSQL 16+
- Redis 7+ (optional)
- Docker & Docker Compose (for local infra)

### Commands

```bash
# Install dependencies
npm install

# Start infrastructure
docker compose -f infra/docker/docker-compose.yml up -d

# Run all tests
npm run test

# Type checking
npm run lint

# Format code
npm run format

# Build all packages
npm run build

# Development servers
npm run dev
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/antaraerp?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here"
JWT_ACCESS_SECRET="your-access-secret"
JWT_REFRESH_SECRET="your-refresh-secret"

# API
API_URL="http://localhost:4000/api"
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
FRONTEND_URL="http://localhost:3000"

# AI (optional)
OPENAI_API_KEY="your-openai-key"
OPENAI_MODEL="gpt-4.1-mini"

# Google OAuth (optional)
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"

# Google Service Account (optional)
GOOGLE_PROJECT_ID="your-project"
GOOGLE_SERVICE_ACCOUNT_EMAIL="your-service-account"
GOOGLE_PRIVATE_KEY="your-private-key"
```

## Project Structure

```
apps/api/src/modules/
├── auth/           # Authentication, JWT, Google OAuth
├── tasks/          # Task CRUD, dependencies, comments
├── worklogs/       # Timer, manual entry, summaries
├── calendar/       # Events, Google Calendar sync
├── analytics/      # Velocity, heatmap, velocity trends
├── ai/             # Insights, schedule risk, workload balancing
├── notifications/  # In-app + email (Resend + BullMQ)
├── files/          # Attachments, Google Drive upload
├── subsystems/     # Subsystem modeling
├── users/          # User management, roles
├── resources/      # Allocation board, drag-drop
├── meetings/       # Sync automation, agendas
├── decisions/      # ADR-lite decision log
├── reports/        # Handoff packages, sponsor reports
├── audit/          # Audit logging
└── health/         # Health checks

apps/web/src/app/(platform)/
├── dashboard/      # Role-aware mission control
├── tasks/          # Task board with drag-drop
├── resources/      # Allocation visualization
├── analytics/      # AI insights, velocity, heatmap
├── calendar/       # Events, subsystem syncs
├── worklogs/       # Timer + manual entry
├── decisions/      # Decision log (ADR-lite)
└── reports/        # Handoff package download
```

## Testing

```bash
# Run all tests
npm run test

# API tests only
npm run test --workspace @antara/api

# Web E2E tests
cd apps/web && npm test

# Coverage
npm run test -- --coverage
```

## Deployment

### Docker

```bash
# Build images
docker compose -f infra/docker/docker-compose.yml build

# Start production stack
docker compose -f infra/docker/docker-compose.yml up -d

# Run migrations
docker compose exec api npm run prisma:migrate deploy
```

### Environment Variables (Production)

Ensure all secrets are set:
- `NEXTAUTH_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `DATABASE_URL` (PostgreSQL connection string)
- `REDIS_URL`
- `OPENAI_API_KEY` (for AI features)
- Google OAuth credentials
- Google Service Account credentials (for Calendar/Drive)

### Database Migrations

```bash
# Development
npm run prisma:migrate

# Production
npx prisma migrate deploy
```

## Architecture Decisions

See [Architecture Decision Records](docs/adr/) for key technical decisions:

- [ADR 001: Use PostgreSQL](docs/adr/001-use-postgresql.md)
- [ADR 002: Use NestJS](docs/adr/002-use-nestjs.md)
- [ADR 003: Use Next.js](docs/adr/003-use-nextjs.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Development workflow
- Code style
- Testing requirements
- Pull request process
- Release process

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/antara-erp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/antara-erp/discussions)
- **Security**: Report vulnerabilities to security@your-org.com