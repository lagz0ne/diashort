---
id: c3-124
c3-version: 3
title: D2 Renderer
type: component
category: feature
parent: c3-1
summary: Server-side D2 diagram rendering via d2 CLI subprocess
---

# D2 Renderer

Renders D2 diagram source to SVG by piping source through the `d2` CLI. Supports light and dark themes.

## Dependencies

```mermaid
graph LR
    D2Renderer["D2 Renderer"] --> D2CLI["d2 CLI"]
    D2Renderer --> Logger["Logger (c3-106)"]
```

## Interface

```typescript
interface D2Renderer {
  render(source: string, theme: "light" | "dark"): Promise<string>;  // Returns SVG
}
```

## Behavior

| Aspect | Implementation |
|--------|----------------|
| Execution | `echo $source \| d2 --theme=$id - -` via Bun.$ |
| Light theme | Theme ID `1` (Neutral Grey) |
| Dark theme | Theme ID `200` (Dark Mauve) |
| Validation | Checks SVG output contains `<svg` |
| Error handling | Wraps CLI errors with source preview |

## References

- `d2RendererAtom` - `src/atoms/d2-renderer.ts:9`
