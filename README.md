# diashort

Diagram shortlink service - render Mermaid and D2 diagrams to images and get shareable shortlinks.

## Features

- Render Mermaid and D2 diagrams to SVG or PNG
- Async job-based rendering with polling
- Terminal output via chafa for CLI display (symbols, sixels, kitty, iterm)
- Cache rendered diagrams with configurable TTL
- Optional basic auth protection
- Backpressure handling with configurable queue limits
- Browser pool for fast Mermaid rendering

## Quick Start

### Using Docker (recommended)

```bash
docker run -p 3000:3000 ghcr.io/lagz0ne/diashort:main
```

### From Source

```bash
# Install dependencies
bun install

# Run in development
bun run dev

# Run tests
bun test
```

## API

### POST /render

Submit a diagram for async rendering.

**Request:**
```json
{
  "source": "graph TD; A-->B;",
  "format": "mermaid",
  "outputType": "svg"
}
```

**Response:**
```json
{
  "jobId": "job_abc123",
  "status": "pending",
  "statusUrl": "/jobs/job_abc123"
}
```

### GET /jobs/:jobId

Check job status and get the shortlink when complete.

**Response (pending):**
```json
{
  "jobId": "job_abc123",
  "status": "pending",
  "shortlink": null,
  "error": null,
  "url": null
}
```

**Response (completed):**
```json
{
  "jobId": "job_abc123",
  "status": "completed",
  "shortlink": "abc123",
  "error": null,
  "url": "/d/abc123"
}
```

### POST /render/terminal

Render a diagram and convert to terminal output via chafa.

**Request:**
```json
{
  "source": "graph TD; A-->B;",
  "format": "mermaid",
  "width": 80,
  "scale": 2,
  "output": "symbols"
}
```

**Parameters:**
- `source`: Diagram source code (required)
- `format`: "mermaid" or "d2" (required)
- `width`: Terminal width in columns (default: 80)
- `scale`: PNG render scale 1-4 for quality (default: 2)
- `output`: Terminal format - "symbols", "sixels", "kitty", "iterm" (default: symbols)

**Response:** Terminal graphics output (ANSI escape sequences or native protocol).

### GET /d/:shortlink

Retrieve a rendered diagram by shortlink.

**Response:** The rendered image (SVG or PNG)

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `LOG_LEVEL` | Log level (debug/info/warn/error) | info |
| `AUTH_ENABLED` | Enable basic auth | false |
| `AUTH_USER` | Basic auth username | (required if auth enabled) |
| `AUTH_PASS` | Basic auth password | (required if auth enabled) |
| `CACHE_TTL` | Cache TTL in ms | 300000 |
| `CACHE_GC_INTERVAL` | Cache GC interval in ms | 60000 |
| `QUEUE_MAX_CONCURRENT` | Max concurrent renders | 10 |
| `QUEUE_MAX_WAITING` | Max queued renders | 50 |
| `BROWSER_POOL_SIZE` | Puppeteer browser pool size | 10 |
| `JOB_DB_PATH` | SQLite database path | ./data/jobs.db |
| `JOB_RETENTION_MS` | Job record retention | 3600000 |
| `BASE_URL` | Base URL for generated links | (empty) |
| `CHAFA_PATH` | Path to chafa binary | chafa |

## Docker

### Using GHCR

```bash
docker pull ghcr.io/lagz0ne/diashort:main

docker run -p 3000:3000 ghcr.io/lagz0ne/diashort:main
```

### With auth enabled

```bash
docker run -p 3000:3000 \
  -e AUTH_ENABLED=true \
  -e AUTH_USER=admin \
  -e AUTH_PASS=secret \
  ghcr.io/lagz0ne/diashort:main
```

### Building locally

```bash
docker build -t diashort .
docker run -p 3000:3000 diashort
```

## License

MIT
