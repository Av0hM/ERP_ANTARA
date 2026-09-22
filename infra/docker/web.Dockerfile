# ---- deps + build ----
FROM node:22-alpine AS builder
WORKDIR /app

# IMPORTANT:
# The repository lockfile is generated using npm 11.6.2.
# Keep Render/Docker on the exact same npm version.
RUN npm install -g npm@11.6.2

COPY package.json package-lock.json turbo.json tsconfig.base.json ./

COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/shared-utils/package.json packages/shared-utils/package.json

# Reproducible dependency installation
RUN npm ci

# Web source + local workspace packages required during build
COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY packages/ui packages/ui

# Build Next.js production bundle
RUN npm run build --workspace @antara/web


# ============================================================
# Production runtime
# ============================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

# Next.js standalone output is generated relative to the
# monorepo tracing root.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

CMD ["node", "apps/web/server.js"]