# syntax=docker/dockerfile:1.7

FROM oven/bun:1-alpine

RUN apk add --no-cache curl
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/ingestors/package.json packages/ingestors/
COPY packages/shared/package.json packages/shared/
COPY packages/trpc/package.json packages/trpc/
COPY packages/auth/package.json packages/auth/

RUN bun install

COPY packages/ingestors ./packages/ingestors
COPY packages/shared ./packages/shared
COPY packages/trpc ./packages/trpc
COPY packages/auth ./packages/auth
COPY apps/api ./apps/api

WORKDIR /app/apps/api

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD curl -fsS http://localhost:3001/healthz || exit 1

USER appuser

CMD ["bun", "src/index.ts"]
