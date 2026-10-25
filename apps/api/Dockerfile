# Build context is the repo root (pnpm workspace).
FROM node:24.21.0-alpine AS base
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/

# All dependencies plus sources: used to run the tests.
FROM base AS test
RUN pnpm install --frozen-lockfile --filter @flowboard/api...
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
# The shared validator's unit tests run here too.
CMD ["pnpm", "--filter", "@flowboard/contracts", "--filter", "@flowboard/api", "test"]

# Production dependencies only. Node runs the TypeScript sources directly (decision D-26).
FROM base AS prod
RUN pnpm install --frozen-lockfile --prod --filter @flowboard/api...
COPY packages/contracts/src packages/contracts/src
COPY apps/api/src apps/api/src

FROM node:24.21.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "src/server.ts"]
