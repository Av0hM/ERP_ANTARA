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

# Prisma
COPY apps/api/prisma ./apps/api/prisma
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

# Source required for API compilation
COPY packages/contracts packages/contracts
COPY apps/api apps/api

# Contracts must be built first because the compiled API runtime
# resolves @antara/contracts through the npm workspace package.
RUN npm run build --workspace @antara/contracts

# Build NestJS API
RUN npm run build --workspace @antara/api


# ============================================================
# Production runtime
# ============================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

EXPOSE 4000

CMD ["node", "apps/api/dist/apps/api/src/main.js"]