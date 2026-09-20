# ---- deps + prisma generate ----
FROM node:22-alpine AS builder
WORKDIR /app

# Copy manifests first so npm ci is cached unless a package.json changes
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/shared-utils/package.json packages/shared-utils/package.json

RUN npm ci

# Generate Prisma Client
COPY apps/api/prisma ./apps/api/prisma
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

# Build contracts package
COPY packages/contracts packages/contracts
RUN npm run build --workspace @antara/contracts

# ---- production runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy pre-built application (built locally with `npm run build`)
COPY apps/api/dist ./apps/api/dist
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/package.json ./apps/api/package.json

# Copy built contracts package to node_modules for module resolution
COPY --from=builder /app/packages/contracts/dist ./node_modules/@antara/contracts

# Install production dependencies only
WORKDIR /app/apps/api
RUN npm install --omit=dev --ignore-scripts

# Copy Prisma Client from builder (generated in builder stage)
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

WORKDIR /app
EXPOSE 4000
CMD ["node", "apps/api/dist/apps/api/src/main.js"]