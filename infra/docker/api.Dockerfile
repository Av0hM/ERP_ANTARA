# ---- production runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy pre-built application (built locally with `npm run build`)
COPY apps/api/dist ./apps/api/dist
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/package.json ./apps/api/package.json

# Copy built contracts package
COPY packages/contracts/dist ./node_modules/@antara/contracts

# Install production dependencies and generate Prisma Client
WORKDIR /app/apps/api
RUN npm install --omit=dev --ignore-scripts && npx prisma generate --schema ./prisma/schema.prisma

WORKDIR /app
EXPOSE 4000
CMD ["node", "apps/api/dist/apps/api/src/main.js"]