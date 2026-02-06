---
id: c3-126
c3-version: 3
title: Diff Viewer
type: component
category: feature
parent: c3-1
summary: Generate HTML pages for side-by-side diagram comparison with synced zoom/pan
---

# Diff Viewer

Generates complete HTML pages for comparing two diagrams side-by-side. Supports both Mermaid (client-side rendered) and D2 (pre-rendered SVG) formats with synchronized viewport controls.

## Interface

```typescript
interface DiffViewer {
  generateMermaidDiff(input: MermaidDiffInput): string;  // Returns HTML
  generateD2Diff(input: D2DiffInput): string;            // Returns HTML
}
```

## Features

| Feature | Implementation |
|---------|----------------|
| Synced zoom/pan | Shared viewport state across both panels |
| Layout toggle | Horizontal (side-by-side) or vertical (top-to-bottom) |
| Theme toggle | Light/dark with localStorage persistence |
| Text selection | Toggle mode for selecting text in SVGs |
| Touch support | Pinch-to-zoom, drag-to-pan |
| Responsive | Adapts to viewport size |

## Behavior

| Format | Rendering |
|--------|-----------|
| Mermaid | Client-side via Mermaid.js CDN, re-renders on theme change |
| D2 | Pre-rendered SVG (4 variants: before/after x light/dark), swaps on theme change |

## References

- `diffViewerAtom` - `src/atoms/diff-viewer.ts:471`
