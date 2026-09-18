# Environment Setup

## Local Requirements

- Node.js 22+
- npm 10+
- PostgreSQL 16
- Redis 7

## Setup Flow

1. Copy `.env.example` to `.env`
2. Start infrastructure with `docker compose -f infra/docker/docker-compose.yml up -d`
3. Install dependencies with `npm install`
4. Generate Prisma client with `npm run prisma:generate --workspace @orbitalops/api`
5. Run migrations with `npm run prisma:migrate --workspace @orbitalops/api`
6. Seed subsystem data with `npx prisma db seed --schema apps/api/prisma/schema.prisma`
7. Start both apps with `npm run dev`

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `NEXTAUTH_URL`: Web app public URL
- `NEXTAUTH_SECRET`: Auth.js signing secret
- `API_URL`: Backend base URL for frontend API access
- `OPENAI_API_KEY`: OpenAI integration key for orchestration services
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: Google OAuth and integration credentials
- `GOOGLE_CALENDAR_ID`: Calendar sync target
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`: Drive folder root for engineering docs
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: API token signing secrets
