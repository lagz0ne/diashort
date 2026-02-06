# ADR: Multi-Version Shortlinks

**Date:** 2026-02-06
**Status:** accepted
**Affects:** c3-112, c3-114, c3-116, c3-119, c3-101, c3-2

## Problem

Shortlinks are currently single-use: one shortlink = one diagram. Updating a diagram requires creating a new shortlink, losing the shared URL. Users need to iterate on diagrams while keeping the same shareable link, compare versions, and optionally name versions for clarity.

## Decision

Add versioned diagram storage so a single shortlink can hold multiple versions. The existing `/render` endpoint accepts an optional `shortlink` field to append a version to an existing link. Versions are always named — auto-generated as `v1`, `v2`, etc. when the user doesn't provide a name, or user-provided names for explicit labeling. **Versions are immutable once created** — no upsert or replacement. All versions of a shortlink must use the same diagram format.

### URL Scheme & Caching

| URL | Behavior | Cache |
|-----|----------|-------|
| `/d/:shortlink` | Always redirects (302) to `/d/:shortlink/:latestVersion` | `no-cache` |
| `/d/:shortlink/:versionName` | Serves specific version | `immutable, max-age=1yr` |
| `/e/:shortlink` | Redirects to `/e/:shortlink/:latestVersion` | `no-cache` |
| `/e/:shortlink/:versionName` | Serves specific version SVG embed | `immutable, max-age=1yr` |

**All bare shortlink URLs always redirect** — even for single-version diagrams. This ensures consistent caching behavior: bare URLs are always `no-cache` (the redirect target changes), versioned URLs are always immutable.

For new diagrams created without an explicit version name, the initial version is stored as `v1`, and `/d/:shortlink` redirects to `/d/:shortlink/v1`.

**Breaking change from current behavior**: Existing `/d/:shortlink` URLs that were cached as immutable will continue serving the old single-page content until cache expires. New visitors will get the redirect. This is an acceptable tradeoff — the cached content is still the correct (only) version of the diagram.

### API Changes

**POST /render** (extended):
```json
{
  "source": "graph TD; A-->B",
  "format": "mermaid",
  "shortlink": "abc123",     // optional: add version to existing link
  "version": "draft-1"       // optional: version name (must be unique)
}
```

**Response** (with version):
```json
{
  "shortlink": "abc123",
  "url": "https://.../d/abc123/draft-1",
  "embed": "https://.../e/abc123/draft-1",
  "version": "draft-1"
}
```

**Response** (new diagram, no explicit shortlink):
```json
{
  "shortlink": "abc123",
  "url": "https://.../d/abc123",
  "embed": "https://.../e/abc123",
  "version": "v1"
}
```

**Validation rules:**
- If `shortlink` is provided, it must exist — 404 otherwise
- If `shortlink` is provided, `format` must match the existing diagram's format — 400 otherwise
- If `version` is provided without `shortlink` — 400 ("version requires shortlink")
- If `version` name already exists for this shortlink — 409 Conflict (versions are immutable)
- If `version` is not provided (and `shortlink` is), auto-generated as `v1`, `v2`, etc.
- Version names must match `^[a-zA-Z][a-zA-Z0-9_-]*$`
- User-provided version names must NOT match `^v\d+$` (reserved for auto-naming) — 400 otherwise
- Auto-name generation: within the transaction, `SELECT MAX(CAST(SUBSTR(version_name, 2) AS INTEGER)) FROM diagram_versions WHERE diagram_id = ? AND is_auto = 1`, then use `v{max+1}`. Since user names cannot be `vN`, no collision is possible.

**GET /api/d/:shortlink/versions** (new, no auth):
```json
{
  "shortlink": "abc123",
  "format": "mermaid",
  "versions": [
    { "name": "v1", "createdAt": 1707177600000, "auto": true },
    { "name": "draft-1", "createdAt": 1707180000000, "auto": false },
    { "name": "v2", "createdAt": 1707184000000, "auto": true }
  ]
}
```

Returns single-element array for single-version diagrams (the `v1` from `diagram_versions`, or synthesized from `diagrams` table if no version rows exist yet).

**GET /api/d/:shortlink/versions/:versionName/source** (new, no auth):
Returns the raw source for a specific version. Used by the compare overlay to fetch sources.
```json
{
  "source": "graph TD; A-->B",
  "format": "mermaid"
}
```

### Database Schema

New table `diagram_versions`:
```sql
PRAGMA foreign_keys = ON;

CREATE TABLE diagram_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  diagram_id TEXT NOT NULL,
  version_name TEXT NOT NULL,
  source TEXT NOT NULL,
  is_auto INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  UNIQUE(diagram_id, version_name),
  FOREIGN KEY (diagram_id) REFERENCES diagrams(id) ON DELETE CASCADE
);
CREATE INDEX idx_versions_diagram ON diagram_versions(diagram_id);
```

**Important:** `PRAGMA foreign_keys = ON` must be set on every database connection (per-connection SQLite setting). Add this to the `DiagramStore` atom initialization.

The existing `diagrams` table retains `source` and `format`. The `format` column is the authoritative format for all versions. `diagrams.source` is updated to the latest version's source on each version creation (for backward compat with any direct reads).

### Viewer Changes

The toolbar gains a **version picker** when a shortlink has multiple versions:
- **Version dropdown**: Lists all versions (e.g., "v1", "draft-1", "v2"). Selecting navigates to `/d/:shortlink/:versionName`
- **Compare button**: Opens a full-screen overlay (not iframe). User picks "from" and "to" versions from dropdowns. Rendering strategy depends on format:
  - **Mermaid:** Fetch raw source via `/api/d/:shortlink/versions/:versionName/source`, render client-side with `mermaid.render()` in each panel
  - **D2:** Fetch pre-rendered SVG via `/e/:shortlink/:versionName?theme=<current>` (embed endpoint returns SVG directly)
  Both panels use synced zoom/pan (reusing the diff viewer's rendering logic). No POST /diff call, no auth requirement. Dismiss overlay to return to single-diagram view.
- Version list loaded via **GET /api/d/:shortlink/versions** on page load (no auth)
- For single-version diagrams (only v1): version picker hidden

### Migration Strategy

No data migration needed. The `diagram_versions` table is created empty alongside the existing `diagrams` table.

**New diagrams** (created after this change): Always get a `v1` row in `diagram_versions`.

**Existing diagrams** (created before this change): Have no rows in `diagram_versions`. When viewed, the versions API synthesizes a response from the `diagrams` table. When a new version is added, a transaction backfills:
1. BEGIN TRANSACTION
2. INSERT the existing `diagrams.source` as `v1` (is_auto=1) into `diagram_versions`
3. Determine next auto-name: `SELECT MAX(CAST(SUBSTR(version_name, 2) AS INTEGER)) FROM diagram_versions WHERE diagram_id = ? AND is_auto = 1`, then `v{max+1}`
4. INSERT new version into `diagram_versions`
5. UPDATE `diagrams.source` to new version's source
6. COMMIT

SQLite's write lock serializes concurrent writes naturally, preventing race conditions.

## Rationale

- **Always redirect bare shortlinks**: Consistent caching — bare URLs always `no-cache`, versioned URLs always immutable. Avoids the impossible cache transition problem.
- **No upsert**: Versions are immutable once created. Essential for cache correctness — a URL always returns the same content.
- **Reserved `vN` names**: User-provided names cannot be `v1`, `v2` etc. This completely eliminates auto-name collisions.
- **Same `/render` endpoint**: Keeps API simple; `shortlink` param is optional so existing integrations don't break.
- **Client-side compare (no iframe/POST /diff)**: For Mermaid, fetches sources via read-only API and renders client-side. For D2, fetches pre-rendered SVG from embed endpoint. No auth complications. Simpler than iframe + POST /diff.
- **Same format enforced**: Simplifies diffing and rendering — no cross-format comparison needed.
- **ON DELETE CASCADE + PRAGMA**: Cleanup of expired diagrams automatically removes their versions — no orphans.
- **Transactional backfill with SQLite write lock**: Prevents race conditions when first version is appended.

## Affected Components

| Component | Change |
|-----------|--------|
| c3-112 Diagram Store | Add version CRUD: `createVersion()`, `getVersion()`, `getVersionSource()`, `listVersions()`, backfill logic. Enable FK pragma. |
| c3-114 Create Flow | Accept optional `shortlink`/`version`, validate format match, validate version name format, 409 on duplicate, 400 on reserved `vN` name |
| c3-116 View Flow | Always redirect bare shortlinks to latest version. Resolve version from URL path. |
| c3-119 HTML Generator | Version picker dropdown (hidden for single-version), compare button, side-by-side overlay with synced zoom/pan |
| c3-101 Bun Server | New routes: `/d/:shortlink/:versionName`, `/e/:shortlink/:versionName`, `/api/d/:shortlink/versions`, `/api/d/:shortlink/versions/:versionName/source`. Update existing `/d/:shortlink` and `/e/:shortlink` to redirect. |
| c3-2 SQLite DB | New `diagram_versions` table with FK cascade, FK pragma enabled |

## Verification

- [ ] New diagrams get `v1` row in `diagram_versions` automatically
- [ ] POST /render without shortlink creates new diagram with `version: "v1"` in response
- [ ] POST /render with shortlink adds version (transactional backfill of v1 for legacy diagrams)
- [ ] POST /render with duplicate version name returns 409
- [ ] POST /render with mismatched format returns 400
- [ ] POST /render with reserved name `v3` returns 400
- [ ] Auto-generated version names increment correctly (v1, v2, v3...)
- [ ] `/d/:shortlink` always redirects (302) to `/d/:shortlink/:latestVersion`
- [ ] `/d/:shortlink/:versionName` serves specific version with immutable cache
- [ ] `/api/d/:shortlink/versions` returns version list (no auth required)
- [ ] `/api/d/:shortlink/versions/:versionName/source` returns source (no auth required)
- [ ] Viewer shows version picker when versions > 1
- [ ] Compare overlay renders both diagrams side-by-side (no auth, no /diff POST)
- [ ] `/e/:shortlink` redirects to latest version embed
- [ ] Cleanup of expired diagrams cascades to version rows (FK pragma enabled)
- [ ] Mermaid localStorage cache keyed by shortlink+versionName (no stale cache)
- [ ] Concurrent version creation serialized correctly via SQLite write lock
- [ ] Legacy diagrams (no version rows) still viewable via synthesized version list
