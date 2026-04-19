FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile

COPY . .

RUN addgroup -S botuser && adduser -S botuser -G botuser && \
    chown -R botuser:botuser /app

USER botuser

CMD ["bun", "run", "index.ts"]
