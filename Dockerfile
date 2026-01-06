FROM oven/bun:1.3.3-alpine AS base

WORKDIR /app

# Install D2 CLI for server-side D2 rendering
RUN apk add --no-cache curl && \
    curl -fsSL https://d2lang.com/install.sh | sh -s -- --dry-run && \
    curl -fsSL https://d2lang.com/install.sh | sh

FROM base AS install

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM base AS release

# Copy D2 binary from base
COPY --from=base /root/.local/bin/d2 /usr/local/bin/d2

COPY --from=install /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/data && \
    chown -R bun:bun /app

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER bun

CMD ["bun", "run", "src/server.ts"]
