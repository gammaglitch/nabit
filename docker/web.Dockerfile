# syntax=docker/dockerfile:1.7

# --------------------------
# Build: install deps + build Next.js
# --------------------------
FROM oven/bun:1-alpine AS builder

RUN apk add --no-cache nodejs

WORKDIR /app

COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/trpc/package.json packages/trpc/
COPY packages/auth/package.json packages/auth/

RUN bun install

COPY packages/shared ./packages/shared
COPY packages/trpc ./packages/trpc
COPY packages/auth ./packages/auth
COPY apps/web ./apps/web

ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1

# NEXT_PUBLIC_* vars are inlined at build time by Next.js
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_AUTH_REQUIRED
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_AUTH_REQUIRED=${NEXT_PUBLIC_AUTH_REQUIRED}

WORKDIR /app/apps/web

# Supabase values are inlined into the client bundle here and cannot be
# supplied later, so an empty one silently ships a web image that can never
# sign anyone in. The check lives in the build rather than in compose
# interpolation because compose evaluates every file it is given, which made
# unrelated commands (`docker compose up -d api`) fail on hosts that only ever
# load prebuilt web images.
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" \
  || (echo "NEXT_PUBLIC_SUPABASE_URL is required to build the web image" >&2; exit 1)
RUN test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  || (echo "NEXT_PUBLIC_SUPABASE_ANON_KEY is required to build the web image" >&2; exit 1)

RUN bun run build

# --------------------------
# Runtime: minimal image
# --------------------------
FROM node:22-alpine AS runtime

RUN apk add --no-cache curl
RUN addgroup -S nodejs && adduser -S nextuser -G nodejs

WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD curl -fsS http://localhost:3000/ || exit 1

USER nextuser

CMD ["node", "apps/web/server.js"]
