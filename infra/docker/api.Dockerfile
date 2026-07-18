FROM node:22-alpine
WORKDIR /app
COPY package.json turbo.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
RUN npm install
RUN npm run build --workspace @orbitalops/contracts && npm run build --workspace @orbitalops/api
EXPOSE 4000
CMD ["npm", "run", "start:dev", "--workspace", "@orbitalops/api"]

