# Stage 1: Download chrome-headless-shell for mermaid SSR
FROM alpine:3.19 AS chrome-downloader
RUN apk add --no-cache curl unzip
WORKDIR /chrome

ARG CHROME_VERSION=131.0.6778.204
RUN curl -fsSL "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-headless-shell-linux64.zip" \
    -o chrome.zip && unzip chrome.zip && rm chrome.zip

# Stage 2: Base with D2 binary
FROM oven/bun:1.3.3-debian AS base

WORKDIR /app

# Install D2 CLI for server-side D2 rendering
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    D2_VERSION="v0.7.1" && \
    curl -fsSL "https://github.com/terrastruct/d2/releases/download/${D2_VERSION}/d2-${D2_VERSION}-linux-amd64.tar.gz" -o /tmp/d2.tar.gz && \
    tar -xzf /tmp/d2.tar.gz -C /tmp && \
    mv /tmp/d2-${D2_VERSION}/bin/d2 /usr/local/bin/d2 && \
    chmod +x /usr/local/bin/d2 && \
    rm -rf /tmp/d2* && \
    apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Install Chrome dependencies for mermaid SSR
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Copy chrome-headless-shell binary
COPY --from=chrome-downloader /chrome/chrome-headless-shell-linux64 /opt/chrome

# Stage 3: Install dependencies
FROM base AS install

COPY package.json bun.lock* ./
# Skip puppeteer browser download - we use embedded chrome-headless-shell
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN bun install --frozen-lockfile --production

# Stage 4: Release
FROM base AS release

# Copy D2 binary from base
COPY --from=base /usr/local/bin/d2 /usr/local/bin/d2

# Copy chrome-headless-shell from base
COPY --from=base /opt/chrome /opt/chrome

COPY --from=install /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/data && \
    chown -R bun:bun /app

ENV NODE_ENV=production
ENV PORT=3000
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Mermaid SSR config
ENV CHROME_PATH=/opt/chrome/chrome-headless-shell
ENV MERMAID_DB_PATH=/app/data/mermaid-queue.db

EXPOSE 3000

USER bun

CMD ["bun", "run", "src/server.ts"]
