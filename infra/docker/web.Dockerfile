# ---- deps + build ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/shared-utils/package.json packages/shared-utils/package.json

RUN npm ci

COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY packages/ui packages/ui

RUN npm run build --workspace @antara/web

# ---- production runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next.js standalone output nests under the app's path relative to
# outputFileTracingRoot (the monorepo root) -- verify this path after building.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
CMD ["node", "apps/web/server.js"]