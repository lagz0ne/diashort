---
id: c3-2
c3-version: 3
title: SQLite Database
type: container
parent: c3-0
summary: >
  Persistent storage for diagram source code. Single-file database accessed via
  Bun's native bun:sqlite module (in-process, no network).
---

# SQLite Database

Embedded SQLite database storing diagram source code. Accessed via `bun:sqlite` which provides synchronous, in-process database access without external dependencies.

## Overview

```mermaid
flowchart TB
    subgraph API["API Server (c3-1)"]
        DiagramStore["Diagram Store<br/>c3-112"]
    end

    subgraph SQLite["SQLite Database (c3-2)"]
        DB[("diagrams.db")]
        Diagrams["diagrams table"]
    end

    DiagramStore -->|"bun:sqlite"| DB
    DB --> Diagrams
```

## Schema

### diagrams table

```sql
CREATE TABLE diagrams (
  id TEXT PRIMARY KEY,           -- shortlink (8-char UUID)
  source TEXT NOT NULL,          -- diagram source code
  format TEXT NOT NULL,          -- 'mermaid' | 'd2'
  createdAt INTEGER NOT NULL,    -- Unix timestamp ms
  accessedAt INTEGER NOT NULL    -- Last access for cleanup
);

CREATE INDEX idx_diagrams_accessed ON diagrams(accessedAt);
```

## Access Patterns

| Operation | Query | Caller |
|-----------|-------|--------|
| Create diagram | `INSERT INTO diagrams ...` | Create Flow (c3-114) |
| Get diagram | `SELECT * FROM diagrams WHERE id = ?` | View Flow (c3-116) |
| Touch access | `UPDATE diagrams SET accessedAt = ? WHERE id = ?` | View Flow (c3-116) |
| Cleanup old | `DELETE FROM diagrams WHERE accessedAt < ?` | Cleanup job |

## Configuration

| Env Variable | Default | Purpose |
|--------------|---------|---------|
| `DIAGRAM_DB_PATH` | `./data/diagrams.db` | Database file location |
| `DIAGRAM_RETENTION_DAYS` | `30` | How long to keep diagrams |
| `CLEANUP_INTERVAL_MS` | `86400000` (daily) | How often to run cleanup |

## Constraints

- **Single writer:** Bun process is the only writer. No WAL mode needed.
- **In-process:** No network latency, synchronous queries are fast.
- **File-based:** Database file must be on persistent volume in containerized deployments.
- **No migrations:** Schema created on first access.

## Data Lifecycle

```mermaid
stateDiagram-v2
    [*] --> stored: POST /render
    stored --> accessed: GET /d/:id (updates accessedAt)
    accessed --> accessed: repeated views
    stored --> [*]: cleanup after retention
    accessed --> [*]: cleanup after retention
```

**Retention logic:** Diagrams deleted when `accessedAt` is older than retention period. Each view updates `accessedAt`, so actively viewed diagrams persist indefinitely.

## Testing Strategy

**Unit tests:**
- Diagram Store CRUD operations
- Cleanup retention logic
- Index usage verification

**Integration tests:**
- Lifecycle with real SQLite file
- Concurrent access patterns
