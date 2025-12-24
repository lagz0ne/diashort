FROM oven/bun:1.3.3-debian AS base

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libgtk-3-0 \
    curl \
    ca-certificates \
    make \
    chafa \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://d2lang.com/install.sh | sh -s --

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

FROM base AS install

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM base AS release

COPY --from=install /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/data && \
    bun install -g @mermaid-js/mermaid-cli && \
    chmod 755 /root && \
    chmod -R 755 /root/.bun && \
    chown -R bun:bun /app

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER bun

CMD ["bun", "run", "src/server.ts"]
