# diashort

Diagram shortlink service - render Mermaid and D2 diagrams to images and get shareable shortlinks.

## Features

- Render Mermaid and D2 diagrams to SVG or PNG
- Cache rendered diagrams with configurable TTL
- Basic auth protection for render endpoint
- Backpressure handling with configurable queue limits

## Quick Start

```bash
# Install dependencies
bun install

# Copy env and configure
cp .env.example .env

# Run in development
bun run dev

# Run tests
bun test
```

## API

### POST /render

Render a diagram and get a shortlink.

**Headers:**
- `Authorization: Basic <base64(user:pass)>` (required)
- `Content-Type: application/json`

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
  "shortlink": "abc123",
  "url": "/d/abc123"
}
```

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
| `AUTH_USER` | Basic auth username | (required) |
| `AUTH_PASS` | Basic auth password | (required) |
| `PORT` | Server port | 3000 |
| `LOG_LEVEL` | Log level (debug/info/warn/error) | info |
| `CACHE_TTL` | Cache TTL in ms | 300000 |
| `CACHE_GC_INTERVAL` | Cache GC interval in ms | 60000 |
| `QUEUE_MAX_CONCURRENT` | Max concurrent renders | 10 |
| `QUEUE_MAX_WAITING` | Max queued renders | 50 |

## Docker

```bash
# Build
docker build -t diashort .

# Run
docker run -p 3000:3000 \
  -e AUTH_USER=admin \
  -e AUTH_PASS=secret \
  diashort
```

## License

MIT
