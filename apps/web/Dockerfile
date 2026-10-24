# Build context is the repo root (pnpm workspace).
FROM node:24.21.0-alpine AS build
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter @flowboard/web...
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter @flowboard/web build

# Static files only: nginx serves the app and proxies the API on the same origin (no CORS).
FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
