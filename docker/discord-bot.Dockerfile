# syntax=docker/dockerfile:1.7

FROM oven/bun:1-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Root context so the install resolves against the repo lockfile rather than
# floating to whatever discord.js is newest at build time. Only the bot's
# package.json is copied, so `bun install` never pulls the api/web trees.
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/discord-bot/package.json apps/discord-bot/

RUN bun install

COPY apps/discord-bot ./apps/discord-bot

WORKDIR /app/apps/discord-bot

# No EXPOSE/HEALTHCHECK: the bot holds an outbound gateway websocket and
# serves nothing, so there is no port to probe and nothing depends on it.

USER appuser

CMD ["bun", "index.ts"]
