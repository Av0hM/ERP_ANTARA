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

COPY apps/api/prisma ./apps/api/prisma
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

COPY packages/contracts packages/contracts
COPY apps/api apps/api

# contracts must be built on its own first: the compiled API's runtime
# require("@antara/contracts") resolves via the npm workspace symlink to
# packages/contracts/dist/index.js, NOT the raw TS source pulled in for
# type-checking during the api build below.
RUN npm run build --workspace @antara/contracts
RUN npm run build --workspace @antara/api

# ---- production runtime ----
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