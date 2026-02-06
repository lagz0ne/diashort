# Implementation Plan: Multi-Version Shortlinks

**ADR:** adr-20260206-multi-version-shortlinks
**Status:** ready

## Pre-execution Checklist

- [ ] Read and understand all affected source files
- [ ] Run existing tests to confirm green baseline: `bun test`
- [ ] Verify database schema by reading `src/atoms/diagram-store.ts`

## Implementation Order

Changes are ordered: schema → store → HTML generator → flows → embed flow → routes → tests → docs.

**Key dependency:** HTML generator interface (Step 3) must be defined before view flow (Step 5) references it. Embed flow (Step 6) must be done before server routes (Step 7) can wire up embed redirects.

---

### Step 1: Database Schema — Enable FK pragma + create `diagram_versions` table

**File:** `src/atoms/diagram-store.ts`

**Changes:**
1. Add `db.exec("PRAGMA foreign_keys = ON")` immediately after `new Database(config.dbPath)`
2. Add `CREATE TABLE IF NOT EXISTS diagram_versions (...)` to the schema initialization block
3. Add the index `idx_versions_diagram`

**Verify:** Run `bun test` — existing tests should still pass (schema is additive)

---

### Step 2: Diagram Store — Add version CRUD methods

**File:** `src/atoms/diagram-store.ts`

**Changes to `DiagramStore` interface:**
```typescript
// New methods
createVersion(diagramId: string, versionName: string | null, source: string): { versionName: string };
getVersionSource(diagramId: string, versionName: string): { source: string; format: DiagramFormat } | null;
listVersions(diagramId: string): Array<{ name: string; createdAt: number; auto: boolean }>;
getLatestVersionName(diagramId: string): string | null;
hasMultipleVersions(diagramId: string): boolean;
}
```

**Changes to `create()` method:**
- After inserting into `diagrams`, also insert `v1` into `diagram_versions` (is_auto=1)
- This ensures all new diagrams have at least one version row

**New `createVersion()` method — FULLY TRANSACTIONAL:**
All logic runs inside a single `db.transaction()`:
1. Check if diagram exists — throw if not
2. Check if any version rows exist for this diagram
3. **If no version rows (legacy diagram):** backfill current `diagrams.source` as `v1` (is_auto=1)
4. **Determine version name (INSIDE the transaction):**
   - If `versionName` is provided by caller: use it, check UNIQUE constraint
   - If `versionName` is null (auto): `SELECT MAX(CAST(SUBSTR(version_name, 2) AS INTEGER)) FROM diagram_versions WHERE diagram_id = ? AND is_auto = 1`, then `v{max+1}`
   - This runs AFTER backfill, so `v1` already exists and MAX returns at least 1
5. INSERT new version into `diagram_versions`
6. UPDATE `diagrams.source` to new version's source
7. Return `{ versionName }`

**Handling UNIQUE constraint violations:**
- If INSERT fails with UNIQUE constraint error on `(diagram_id, version_name)`, catch the SQLite error and throw a `ConflictError` (409)
- This is the primary 409 mechanism — no separate pre-check needed (avoids TOCTOU race)

**New `listVersions()` method:**
- First: `SELECT version_name, createdAt, is_auto FROM diagram_versions WHERE diagram_id = ? ORDER BY id ASC`
- If rows exist: return them
- If no rows (legacy): query `diagrams` table, return `[{ name: "v1", createdAt: diagram.createdAt, auto: true }]` (synthesized)

**New `getVersionSource()` method:**
- First try: `SELECT dv.source, d.format FROM diagram_versions dv JOIN diagrams d ON d.id = dv.diagram_id WHERE dv.diagram_id = ? AND dv.version_name = ?`
- If no row found AND versionName is `"v1"`: fall back to `SELECT source, format FROM diagrams WHERE id = ?` (legacy)
- Otherwise: return null

**New `getLatestVersionName()` method:**
- `SELECT version_name FROM diagram_versions WHERE diagram_id = ? ORDER BY id DESC LIMIT 1`
- If no rows: return `"v1"` (legacy diagrams have implicit v1)

**New `hasMultipleVersions()` method:**
- `SELECT COUNT(*) FROM diagram_versions WHERE diagram_id = ?`
- Returns `count > 1`

**`cleanup()` method — no change needed:**
- ON DELETE CASCADE handles version cleanup (FK pragma is now enabled)

**Verify:** Run `bun test` — existing tests should still pass

---

### Step 3: HTML Generator — Version picker + compare overlay

**File:** `src/atoms/html-generator.ts`

**Changes to interface:**
```typescript
export interface VersionInfo {
  shortlink: string;
  currentVersion: string;
  versionsApiUrl: string;  // /api/d/:shortlink/versions
  hasMultipleVersions: boolean;
  format: "mermaid" | "d2";
}

export interface HTMLGenerator {
  generateMermaid(source: string, shortlink: string, versionInfo?: VersionInfo): string;
  generateD2(lightSvg: string, darkSvg: string, shortlink: string, options?: HTMLGeneratorOptions & { versionInfo?: VersionInfo }): string;
}
```

**New UI elements (added when `versionInfo.hasMultipleVersions` is true):**

1. **Version picker dropdown** in the controls bar:
   - Fetches version list from `versionsApiUrl` on page load
   - Shows current version as selected
   - On selection change: `window.location.href = '/d/' + shortlink + '/' + selectedVersion`

2. **Compare button** in the controls bar:
   - Opens a full-screen overlay with:
     - Two dropdown selectors ("From" and "To" versions)
     - Side-by-side rendering panels
     - Synced zoom/pan controls (reuse existing viewport logic from diff-viewer)
     - Close button (X) to dismiss overlay
   - **Rendering strategy by format:**
     - **Mermaid:** Fetch raw source via `/api/d/:shortlink/versions/:name/source`, render client-side with `mermaid.render()` in each panel
     - **D2:** Fetch pre-rendered SVG via `/e/:shortlink/:versionName?theme=<current>`. The embed endpoint returns SVG directly. Use `fetch()` and insert SVG into each panel.
   - This approach means D2 compare works via existing embed infrastructure — no new rendering code needed.

3. **Mermaid localStorage cache key update:**
   - Change from `diagram-${shortlink}-${theme}` to `diagram-${shortlink}-${versionName}-${theme}`

**Verify:** Manual browser testing (unit test coverage via integration tests in Step 8)

---

### Step 4: Create Flow — Accept optional shortlink/version

**File:** `src/flows/create.ts`

**Changes to `CreateInput` interface:**
```typescript
export interface CreateInput {
  source: string;
  format: DiagramFormat;
  shortlink?: string;   // optional: add version to existing
  version?: string;     // optional: version name
}
```

**Changes to `parseCreateInput()`:**
- Accept optional `shortlink` (string)
- Accept optional `version` (string, validate format: `^[a-zA-Z][a-zA-Z0-9_-]*$`)
- Reject `version` names matching `^v\d+$` with 400 (reserved for auto-naming)
- Reject `version` provided without `shortlink` with 400 ("version requires shortlink")

**New error classes:**
```typescript
export class ConflictError extends Error {
  public readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
```

**Changes to `createFlow` factory:**
- **If `shortlink` is NOT provided** (existing behavior + version creation):
  1. Reject if `version` is provided without `shortlink` — 400
  2. Create new diagram via `diagramStore.create()` (this now auto-creates v1)
  3. Return `{ shortlink, url, embed, version: "v1" }`

- **If `shortlink` IS provided** (add version to existing):
  1. Verify diagram exists via `diagramStore.get()` — 404 if not
  2. Verify `format` matches the existing diagram's format — 400 if mismatch
  3. Call `diagramStore.createVersion(shortlink, input.version ?? null, input.source)`
     - Store handles: backfill, auto-naming, UNIQUE conflict → ConflictError
  4. Get the returned `versionName`
  5. Return `{ shortlink, url: .../d/shortlink/versionName, embed: .../e/shortlink/versionName, version: versionName }`

**Changes to `CreateResult`:**
```typescript
export interface CreateResult {
  shortlink: string;
  url: string;
  embed: string;
  version: string;  // always present now
}
```

**Verify:** Run `bun test` — existing tests may need minor updates to handle `version` in response

---

### Step 5: View Flow — Redirect bare shortlinks, serve versioned

**File:** `src/flows/view.ts`

**Changes to `ViewInput`:**
```typescript
export interface ViewInput {
  shortlink: string;
  versionName?: string;  // from URL path
}
```

**Changes to `ViewOutput`:**
```typescript
export interface ViewOutput {
  html: string;
  contentType: "text/html";
  redirect?: string;  // if set, server should 302 redirect instead
}
```

**Changes to `viewFlow` factory:**
- Add `diagramStoreAtom` dependency (already present)
- Get diagram from store
- If `versionName` is NOT provided:
  - Get latest version name via `diagramStore.getLatestVersionName(shortlink)`
  - Return `{ html: "", contentType: "text/html", redirect: "/d/{shortlink}/{latestVersionName}" }`
- If `versionName` IS provided:
  - Get version source via `diagramStore.getVersionSource(shortlink, versionName)` — 404 if null
  - Check if diagram has multiple versions via `diagramStore.hasMultipleVersions(shortlink)`
  - Build `VersionInfo` object for HTML generator
  - Use version source for rendering instead of `diagram.source`
  - Pass `VersionInfo` to HTML generator (using updated interface from Step 3)
  - Return HTML as before

**Verify:** Run `bun test` — view tests will need updates for redirect behavior

---

### Step 6: Embed Flow — Support versioned embeds + redirect

**File:** `src/flows/embed.ts`

**Changes to `EmbedInput`:**
```typescript
export interface EmbedInput {
  shortlink: string;
  versionName?: string;  // from URL path
  theme?: "light" | "dark";
}
```

**Changes to `EmbedOutput`:**
```typescript
export interface EmbedOutput {
  svg: string;
  contentType: "image/svg+xml";
  redirect?: string;  // if set, 302 redirect to latest version
}
```

**Changes to factory:**
- If `versionName` not provided:
  - Get latest version name from store
  - Return `{ svg: "", contentType: "image/svg+xml", redirect: "/e/{shortlink}/{latestVersion}" }`
- If `versionName` provided:
  - Get version source from store — 404 if not found
  - Use version source instead of `diagram.source` for rendering
  - Rest of rendering logic unchanged

**Verify:** Run `bun test`

---

### Step 7: Server Routes — New versioned routes + redirects

**File:** `src/server.ts`

**Route parsing strategy:**
Parse path segments after the prefix. Use segment count to distinguish:
- `/d/abc12345` → 1 segment → bare shortlink (redirect)
- `/d/abc12345/v1` → 2 segments → shortlink + versionName
- `/api/d/abc12345/versions` → versions list
- `/api/d/abc12345/versions/v1/source` → version source

**New routes (no auth):**
1. `GET /api/d/:shortlink/versions` — resolve diagramStore, call `listVersions()`, return JSON
2. `GET /api/d/:shortlink/versions/:versionName/source` — resolve diagramStore, call `getVersionSource()`, return JSON

**Updated routes:**
1. `GET /d/:shortlink` and `GET /d/:shortlink/:versionName`:
   - Parse path to extract shortlink and optional versionName
   - Pass both to viewFlow
   - If result has `redirect`: return 302 with `Location` header, `Cache-Control: no-cache`
   - Otherwise: return HTML with appropriate cache (`immutable` for versioned)

2. `GET /e/:shortlink` and `GET /e/:shortlink/:versionName`:
   - Parse path to extract shortlink and optional versionName
   - Pass to embedFlow
   - If result has `redirect`: return 302 with `Location` header, `Cache-Control: no-cache`
   - Otherwise: return SVG with appropriate cache

3. `POST /render` — include `version` in response body

**New error handling in `mapErrorToResponse()`:**
- Add `ConflictError` → 409 response

**Cache headers:**
| Route | Cache |
|-------|-------|
| `/d/:shortlink` (302) | `no-cache` |
| `/d/:shortlink/:version` (200) | `public, max-age=31536000, immutable` |
| `/e/:shortlink` (302) | `no-cache` |
| `/e/:shortlink/:version` (200) | `public, max-age=31536000, immutable` |
| `/api/d/:shortlink/versions` | `no-cache` |
| `/api/d/:shortlink/versions/:name/source` | `public, max-age=31536000, immutable` |

**Update root `/` usage text** to document new endpoints.

**Verify:** Run `bun test` — tests need updates

---

### Step 8: Update Integration Tests

**File:** `src/__tests__/integration.test.ts`

**Updated existing tests:**
1. Create response tests: expect `version: "v1"` in response
2. View endpoint: bare `/d/:shortlink` now returns 302 redirect
   - Follow redirect to `/d/:shortlink/v1` to verify HTML content
3. View cache test: bare shortlink gets `no-cache`, versioned gets `immutable`

**New test suite: "Version management":**
1. POST /render returns `version: "v1"` for new diagrams
2. POST /render with `shortlink` adds version (response has version name)
3. POST /render with `shortlink` + named `version` works
4. POST /render with duplicate version name → 409
5. POST /render with mismatched format → 400
6. POST /render with reserved name `v3` → 400
7. POST /render with `version` but no `shortlink` → 400

**New test suite: "Versioned view endpoints":**
1. GET /d/:shortlink → 302 redirect to /d/:shortlink/v1 (with no-cache)
2. GET /d/:shortlink/v1 → 200 with immutable cache, HTML content
3. GET /d/:shortlink/nonexistent → 404

**New test suite: "Version API endpoints":**
1. GET /api/d/:shortlink/versions → JSON with version list (no auth)
2. GET /api/d/:shortlink/versions returns single v1 for new diagram
3. GET /api/d/:shortlink/versions returns multiple after adding versions
4. GET /api/d/:shortlink/versions/v1/source → JSON with source (no auth)
5. GET /api/d/nonexist/versions → 404

**New test suite: "Embed versioned":**
1. GET /e/:shortlink → 302 redirect (with no-cache)
2. GET /e/:shortlink/v1 → 200 with immutable cache (D2 only, mermaid needs CHROME_PATH)

**New test suite: "Legacy diagram compatibility":**
1. Create diagram (old-style, no versions in DB yet)
2. View it — should work as before (redirect → v1)
3. Add a version — backfill should create v1 automatically
4. List versions — should show v1 + new version

**Verify:** `bun test` should be fully green

---

### Step 9: Update Root `/` Endpoint Usage Text

**File:** `src/server.ts`

Add documentation for:
- `POST /render` with optional `shortlink` and `version` params
- `GET /d/:shortlink` → redirects to latest version
- `GET /d/:shortlink/:version` — versioned view
- `GET /e/:shortlink` → redirects to latest version
- `GET /e/:shortlink/:version` — versioned embed
- `GET /api/d/:shortlink/versions` — list versions (no auth)
- `GET /api/d/:shortlink/versions/:name/source` — get version source (no auth)

---

### Step 10: Update C3 Component Docs

**Files:**
- `.c3/c3-1-api-server/c3-112-diagram-store.md` — document new version methods, FK pragma
- `.c3/c3-1-api-server/c3-114-create-flow.md` — document extended input/validation, new error codes
- `.c3/c3-1-api-server/c3-116-view-flow.md` — document redirect + versioned viewing
- `.c3/c3-1-api-server/c3-119-html-generator.md` — document version picker + compare overlay
- `.c3/c3-1-api-server/c3-101-bun-server.md` — document new routes, cache strategy
- `.c3/c3-2-sqlite-db/README.md` — document `diagram_versions` table, FK pragma
- `.c3/c3-1-api-server/README.md` — update container overview
- `.c3/TOC.md` — update component count

---

### Step 11: Mark ADR as Implemented

**File:** `.c3/adr/adr-20260206-multi-version-shortlinks.md`

- Change status from `proposed` to `accepted` (then `implemented` after tests pass)
- Check off all verification items

---

## Verification Commands

```bash
# Run all tests
bun test

# Manual verification
# 1. Start server
bun run src/server.ts

# 2. Create diagram (new-style, gets v1 automatically)
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B;", "format": "mermaid"}'
# Response: {"shortlink":"abc123","url":"...","embed":"...","version":"v1"}

# 3. Add version to existing shortlink
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B-->C;", "format": "mermaid", "shortlink": "abc123"}'
# Response: {"shortlink":"abc123","url":".../d/abc123/v2","embed":".../e/abc123/v2","version":"v2"}

# 4. Add named version
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B-->C-->D;", "format": "mermaid", "shortlink": "abc123", "version": "final"}'
# Response: {"shortlink":"abc123","url":".../d/abc123/final","embed":".../e/abc123/final","version":"final"}

# 5. List versions
curl http://localhost:3000/api/d/abc123/versions
# Response: {"shortlink":"abc123","format":"mermaid","versions":[{"name":"v1",...},{"name":"v2",...},{"name":"final",...}]}

# 6. Get version source
curl http://localhost:3000/api/d/abc123/versions/v1/source
# Response: {"source":"graph TD; A-->B;","format":"mermaid"}

# 7. Check redirect
curl -v http://localhost:3000/d/abc123
# Should 302 → /d/abc123/final (latest)

# 8. View specific version
curl http://localhost:3000/d/abc123/v1
# Should return HTML with version picker

# 9. Duplicate version name
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"source": "...", "format": "mermaid", "shortlink": "abc123", "version": "final"}'
# Should return 409

# 10. Reserved name
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"source": "...", "format": "mermaid", "shortlink": "abc123", "version": "v99"}'
# Should return 400
```

## Risk Areas

1. **Route parsing** — `/d/:shortlink` vs `/d/:shortlink/:version` disambiguation. Use path segment count (split on `/`). Shortlinks are 8 hex chars; version names start with a letter. Segment count is the reliable discriminator.
2. **D2 compare rendering** — Uses `/e/:shortlink/:version?theme=...` to fetch pre-rendered SVG. Works because embed flow already handles D2 rendering. Requires the embed redirect + versioned embed to be implemented first (Step 6 before Step 3's UI is usable).
3. **Existing test breakage** — View endpoint tests expect 200, will now get 302. Fix by either following redirects in tests or explicitly testing redirect + versioned endpoint separately.
4. **HTML generator complexity** — The version picker and compare overlay add significant client-side JavaScript. Consider extracting compare overlay code into a separate function for readability.
5. **Transaction safety** — `createVersion()` uses `db.transaction()` which holds SQLite's write lock. Long-running transactions could block other writes. Keep transaction body minimal (SQL only, no I/O).
