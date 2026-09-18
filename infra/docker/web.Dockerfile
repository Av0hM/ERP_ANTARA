FROM node:22-alpine
WORKDIR /app
COPY package.json turbo.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/contracts ./packages/contracts
COPY packages/ui ./packages/ui
RUN npm install
RUN npm run build --workspace @orbitalops/contracts && npm run build --workspace @orbitalops/ui && npm run build --workspace @orbitalops/web
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace", "@orbitalops/web"]

