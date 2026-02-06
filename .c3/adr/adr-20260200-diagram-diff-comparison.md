---
id: adr-20260200-diagram-diff-comparison
c3-version: 3
title: Diagram Diff Comparison Feature
type: adr
status: implemented
date: 2026-02-01
affects: [c3-0, c3-1, c3-2]
---

# Diagram Diff Comparison Feature

## Status

**Implemented** - 2026-02-01

## Problem

| Situation | Impact |
|-----------|--------|
| No way to compare two diagram versions | Users must open two tabs and manually compare |
| D2/Mermaid syntax changes hard to visualize | Text diffs don't show structural differences |
| No shareable comparison links | Can't link "before vs after" in PRs or docs |

## Decision Drivers

- Enable visual comparison of diagram versions in PRs and documentation
- Maintain consistency with existing shortlink pattern
- Support both Mermaid and D2 formats
- Synchronized viewport for meaningful comparison

## Decision

**Add a diff feature with dedicated storage and viewer.**

1. **POST /diff** stores before/after source pair, returns shortlink
2. **GET /diff/:shortlink** returns HTML page with side-by-side comparison
3. **Synced viewport** - zoom/pan applied to both panels simultaneously
4. **Layout toggle** - horizontal (side-by-side) or vertical (top-to-bottom)

## Affected Layers

### Context (c3-0)
- Add diff endpoints to system overview

### Container c3-1 (API Server)
**Add:**
- c3-125 Diff Store (SQLite CRUD for diff pairs)
- c3-126 Diff Viewer (HTML page generation with synced viewport)
- c3-127 Diff Flow (create + view flows)

### Container c3-2 (SQLite Database)
**Add:**
- `diagram_diffs` table

## API

| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/diff` | POST | `{format, before, after}` | `{shortlink, url}` |
| `/diff/:shortlink` | GET | `?layout=horizontal\|vertical` | HTML page |

## Consequences

### Positive
- Visual diagram comparison via shareable link
- Consistent with existing shortlink UX
- Synced viewport for meaningful comparison
- D2 validates syntax on create (early error detection)

### Negative
- Additional storage for diff pairs
- D2 diffs require 4 SVG renders (before/after x light/dark)

## Verification

- [x] POST /diff stores diff and returns shortlink
- [x] GET /diff/:shortlink returns HTML comparison page
- [x] Mermaid diffs render client-side in both panels
- [x] D2 diffs pre-render with light/dark theme support
- [x] Synced zoom/pan works across panels
- [x] Layout toggle (horizontal/vertical) works
- [x] Theme toggle persists via localStorage
