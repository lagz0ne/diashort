# diashort

Diagram shortlink service - stores Mermaid and D2 diagram source and returns shareable shortlinks. Diagrams render client-side in the browser. Supports multiple versions per shortlink.

## Usage

Visit the root URL to see API documentation:

```bash
curl https://diashort.apps.quickable.co/
```

Or open in browser: https://diashort.apps.quickable.co/

## Features

- Store Mermaid and D2 diagram source with shareable shortlinks
- Multiple versions per shortlink with auto or custom naming
- Interactive viewer with zoom/pan, dark mode, text selection
- Version picker and side-by-side compare overlay
- SVG embed endpoint for markdown/docs
- Side-by-side diff view for comparing two diagrams
- Server-side rendering for D2 and Mermaid (SSR requires Chrome)

## Quick Start

### Using Docker (recommended)

```bash
docker run -p 3000:3000 ghcr.io/lagz0ne/diashort:main
```

### From Source

```bash
bun install
bun run dev
bun test
```

## API

### POST /render

Submit a diagram for storage. Optionally add a version to an existing shortlink.

**New diagram:**
```bash
curl -X POST https://diashort.apps.quickable.co/render \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B;", "format": "mermaid"}'
```

```json
{"shortlink": "abc12345", "url": "https://.../d/abc12345", "embed": "https://.../e/abc12345", "version": "v1"}
```

**Add version to existing shortlink:**
```bash
curl -X POST https://diashort.apps.quickable.co/render \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B-->C;", "format": "mermaid", "shortlink": "abc12345"}'
```

```json
{"shortlink": "abc12345", "url": "https://.../d/abc12345/v2", "embed": "https://.../e/abc12345/v2", "version": "v2"}
```

**Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `source` | Yes | Diagram source code |
| `format` | Yes | `"mermaid"` or `"d2"` |
| `shortlink` | No | Existing shortlink to add version to |
| `version` | No | Custom version name (requires `shortlink`) |

**Version naming:**
- Auto-generated as `v1`, `v2`, etc. when not specified
- Custom names must start with a letter (e.g. `draft-1`, `final`)
- Names matching `vN` (e.g. `v1`, `v2`) are reserved for auto-naming
- Versions are immutable once created (409 on duplicate)

### GET /d/:shortlink

Redirects (302) to the latest version: `/d/:shortlink/:latestVersion`

### GET /d/:shortlink/:version

View a specific version in an interactive HTML viewer with zoom/pan, dark mode, and text selection. When multiple versions exist, includes a version picker and compare overlay.

### GET /e/:shortlink

Redirects (302) to the latest version embed.

### GET /e/:shortlink/:version

Get raw SVG for a specific version. Use in markdown:

```markdown
![Diagram](https://diashort.apps.quickable.co/e/abc12345/v1)
```

Query parameters: `theme=light` (default) or `theme=dark`

### GET /api/d/:shortlink/versions

List all versions of a diagram.

```json
{"shortlink": "abc12345", "format": "mermaid", "versions": [{"name": "v1", "createdAt": 1707177600000, "auto": true}]}
```

### GET /api/d/:shortlink/versions/:version/source

Get the raw source of a specific version.

```json
{"source": "graph TD; A-->B;", "format": "mermaid"}
```

### POST /diff

Create a side-by-side comparison of two diagrams.

```bash
curl -X POST https://diashort.apps.quickable.co/diff \
  -H "Content-Type: application/json" \
  -d '{"format": "mermaid", "before": "graph TD; A-->B;", "after": "graph TD; A-->B-->C;"}'
```

### GET /diff/:shortlink

View the diff in an interactive HTML viewer with synced pan/zoom. Toggle between horizontal and vertical layouts.

Query parameters: `layout=horizontal` (default) or `layout=vertical`

### GET /health

Health check endpoint.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `LOG_LEVEL` | Log level (debug/info/warn/error) | `info` |
| `BASE_URL` | Base URL for generated links | (empty) |
| `DIAGRAM_DB_PATH` | SQLite database path | `./data/diagrams.db` |
| `DIAGRAM_RETENTION_DAYS` | Diagram retention in days | `30` |
| `CLEANUP_INTERVAL_MS` | Cleanup interval in ms | `86400000` |
| `CHROME_PATH` | Chrome executable for Mermaid SSR | (optional) |
| `MERMAID_POOL_SIZE` | Browser pool size for Mermaid SSR | `2` |
| `MERMAID_TIMEOUT` | Mermaid render timeout in ms | `30000` |

## Docker

### Using GHCR

```bash
docker pull ghcr.io/lagz0ne/diashort:main
docker run -p 3000:3000 ghcr.io/lagz0ne/diashort:main
```

### Building locally

```bash
docker build -t diashort .
docker run -p 3000:3000 diashort
```

### Persistent storage

Diagrams and diffs are stored in SQLite at `/app/data/`. Mount a volume to persist data:

```bash
docker run -p 3000:3000 -v diashort-data:/app/data diashort
```

## License

MIT
