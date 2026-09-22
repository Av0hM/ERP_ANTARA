# ============================================================
# BUILD STAGE
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Keep Docker npm aligned with the repo packageManager.
RUN npm install -g npm@11.6.2


# ------------------------------------------------------------
# COPY WORKSPACE MANIFESTS FIRST
#
# This keeps dependency installation cacheable.
# ------------------------------------------------------------
COPY package.json package-lock.json turbo.json tsconfig.base.json ./

COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/shared-utils/package.json packages/shared-utils/package.json


# ------------------------------------------------------------
# INSTALL DEPENDENCIES
# ------------------------------------------------------------
RUN npm ci


# ------------------------------------------------------------
# PRISMA
# ------------------------------------------------------------
COPY apps/api/prisma ./apps/api/prisma

RUN npx prisma generate --schema apps/api/prisma/schema.prisma


# ------------------------------------------------------------
# COPY SOURCE
# ------------------------------------------------------------
COPY packages/contracts ./packages/contracts
COPY packages/shared-utils ./packages/shared-utils
COPY apps/api ./apps/api


# ------------------------------------------------------------
# BUILD INTERNAL WORKSPACE PACKAGES
#
# @antara/contracts must be compiled because the API's emitted
# JavaScript still contains:
#
# require("@antara/contracts")
#
# Node resolves this through npm's workspace symlink.
# ------------------------------------------------------------
RUN npm run build --workspace @antara/contracts

RUN npm run build --workspace @antara/shared-utils

RUN npm run build --workspace @antara/api



# ============================================================
# PRODUCTION RUNTIME
# ============================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production


# ------------------------------------------------------------
# NODE MODULES
#
# npm workspaces create symlinks such as:
#
# node_modules/@antara/contracts
#     -> ../../packages/contracts
#
# Therefore the corresponding workspace package directories
# MUST exist in the runtime image.
# ------------------------------------------------------------
COPY --from=builder /app/node_modules ./node_modules


# ------------------------------------------------------------
# INTERNAL WORKSPACE PACKAGE: @antara/contracts
#
# IMPORTANT:
# Copy BOTH package.json and dist.
#
# package.json contains:
#   "main": "dist/index.js"
#
# Without package.json Node cannot resolve:
#   require("@antara/contracts")
# ------------------------------------------------------------
COPY --from=builder /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist


# ------------------------------------------------------------
# INTERNAL WORKSPACE PACKAGE: @antara/shared-utils
#
# Copy this too so we don't hit the exact same runtime problem
# if the API imports it now or later.
# ------------------------------------------------------------
COPY --from=builder /app/packages/shared-utils/package.json ./packages/shared-utils/package.json
COPY --from=builder /app/packages/shared-utils/dist ./packages/shared-utils/dist


# ------------------------------------------------------------
# API BUILD
# ------------------------------------------------------------
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json


# ------------------------------------------------------------
# SERVER
# ------------------------------------------------------------
EXPOSE 4000


# ------------------------------------------------------------
# START
#
# Prisma migrations run first.
# If successful, NestJS starts.
# ------------------------------------------------------------
CMD ["node", "apps/api/dist/apps/api/src/main.js"]