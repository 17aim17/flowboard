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

# `make test`: component tests, then the browser tests against the running `web` service.
# The Playwright image has the browsers for this exact Playwright version (and Node 24).
FROM mcr.microsoft.com/playwright:v1.64.0-noble AS test
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter @flowboard/web...
COPY packages/contracts packages/contracts
COPY apps/web apps/web
WORKDIR /app/apps/web
ENV BASE_URL=http://web
CMD ["sh", "-c", "pnpm test && pnpm e2e"]

# Static files only: nginx serves the app and proxies the API on the same origin (no CORS).
FROM nginx:1.29-alpine
# Where /v1 goes. A host other than Docker Compose sets its own (Railway: api.railway.internal:3000).
ENV API_UPSTREAM=api:3000
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
