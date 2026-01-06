FROM oven/bun:1.3.3-alpine AS base

WORKDIR /app

# Install D2 CLI for server-side D2 rendering
# Download pre-built binary directly (install.sh requires make)
RUN apk add --no-cache curl && \
    D2_VERSION="v0.7.1" && \
    curl -fsSL "https://github.com/terrastruct/d2/releases/download/${D2_VERSION}/d2-${D2_VERSION}-linux-amd64.tar.gz" -o /tmp/d2.tar.gz && \
    tar -xzf /tmp/d2.tar.gz -C /tmp && \
    mv /tmp/d2-${D2_VERSION}/bin/d2 /usr/local/bin/d2 && \
    chmod +x /usr/local/bin/d2 && \
    rm -rf /tmp/d2* && \
    apk del curl

FROM base AS install

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM base AS release

# Copy D2 binary from base
COPY --from=base /usr/local/bin/d2 /usr/local/bin/d2

COPY --from=install /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/data && \
    chown -R bun:bun /app

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER bun

CMD ["bun", "run", "src/server.ts"]
