---
id: adr-20260223-mermaid-viewer-server-rendering
c3-version: 3
title: Server-Side Rendering for Mermaid Viewer and Diff
type: adr
status: implemented
date: 2026-02-23
affects: [c3-1]
approved-files:
  - src/flows/view.ts
  - src/atoms/html-generator.ts
  - src/flows/diff.ts
  - src/atoms/diff-viewer.ts
  - src/__tests__/integration.test.ts
  - src/__tests__/diff-viewer.test.ts
  - .c3/c3-1-api-server/c3-116-view-flow.md
  - .c3/c3-1-api-server/c3-119-html-generator.md
  - .c3/c3-1-api-server/c3-126-diff-viewer.md
---

# Server-Side Rendering for Mermaid Viewer and Diff

## Status

**Accepted** - 2026-02-23

## Problem

| Situation | Impact |
|-----------|--------|
| Mermaid viewer (`/d/:id`) renders client-side via CDN mermaid.js | Inconsistent with D2 which server-renders SVGs |
| localStorage caches client-rendered SVG | Stale cache, unnecessary since SSR infrastructure exists |
| Diff viewer (`/diff/:id`) also renders mermaid client-side | Same inconsistency |
| Compare overlay fetches source and renders client-side for mermaid | D2 compare already uses `/e/` endpoint |
| Server-side mermaid renderer (browser-farm) only serves `/e/` endpoint | Underutilized infrastructure |

### Current State

| Endpoint | D2 | Mermaid |
|----------|-----|---------|
| `/e/:id` (embed) | Server-rendered SVG | Server-rendered SVG (browser-farm) |
| `/d/:id` (viewer) | Server-rendered SVG inlined in HTML | Client-side CDN mermaid.js + localStorage cache |
| `/diff/:id` (diff) | Server-rendered 4 SVG variants | Client-side CDN mermaid.js |
| Compare overlay | Fetches from `/e/` | Fetches source, renders client-side |

## Decision

**Move all mermaid rendering to server-side, matching D2's pattern.**

### Target State

| Endpoint | D2 | Mermaid |
|----------|-----|---------|
| `/e/:id` | Server-rendered SVG | Server-rendered SVG (unchanged) |
| `/d/:id` | Server-rendered light+dark SVGs | Server-rendered single SVG, CSS filter for dark |
| `/diff/:id` | Server-rendered 4 SVGs | Server-rendered before+after SVGs |
| Compare overlay | Fetches from `/e/` | Fetches from `/e/` (unified path) |

### Dark Mode Strategy

- **D2**: Renders both light and dark variants server-side (D2 has distinct themes)
- **Mermaid**: Renders once, uses CSS `filter: invert(1) hue-rotate(180deg)` for dark mode (already in place)
- This avoids doubling render cost for mermaid

### Fallback when CHROME_PATH not set

- `optionalMermaidRendererAtom` returns `undefined` when not configured
- View and diff flows throw a descriptive error (matching embed flow behavior)
- In production, CHROME_PATH is always set; this only affects local dev without Chrome

## Changes

### 1. View Flow (`src/flows/view.ts`)

- Add `optionalMermaidRendererAtom` dependency
- Server-render mermaid SVG before passing to HTML generator
- Error when SSR not available

### 2. HTML Generator (`src/atoms/html-generator.ts`)

- Change `generateMermaid(source, shortlink)` → `generateMermaid(svg, shortlink)`
- Accept pre-rendered SVG instead of source code
- Remove CDN `<script>` tag for mermaid.js
- Remove localStorage SVG cache
- Remove client-side `mermaid.render()` call
- Inline SVG directly (matching D2 pattern)
- Compare overlay: switch mermaid path to fetch from `/e/` (same as D2)

### 3. Diff Flow (`src/flows/diff.ts`)

- Add `optionalMermaidRendererAtom` dependency
- Server-render before/after mermaid SVGs

### 4. Diff Viewer (`src/atoms/diff-viewer.ts`)

- Change `generateMermaidDiff({before, after})` → accept pre-rendered SVGs
- Remove CDN `<script>` tag
- Remove client-side rendering
- Inline SVGs directly

## Rationale

| Consideration | Decision |
|---------------|----------|
| Why not keep client-side fallback? | Two rendering paths = more code, stale cache bugs |
| Why single SVG + CSS filter? | Mermaid dark theme via CSS inversion already works, avoids double render cost |
| Why error when no CHROME_PATH? | Matches embed endpoint behavior, fail-fast is better than silent degradation |
| Why switch compare overlay? | `/e/` already server-renders mermaid, removes CDN dependency entirely |

## Verification

- [x] `GET /d/:shortlink/:version` returns HTML with inlined mermaid SVG (no CDN script)
- [x] `GET /diff/:shortlink` returns HTML with inlined before/after mermaid SVGs
- [x] Dark mode works via CSS filter inversion
- [x] Compare overlay fetches from `/e/` for mermaid
- [x] No localStorage usage for SVG caching
- [x] Theme-preference localStorage still works
- [x] All existing tests pass (updated for new signatures)
- [x] D2 rendering unchanged
