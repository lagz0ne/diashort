---
id: c3-123
c3-version: 3
title: Embed Flow
type: component
category: feature
parent: c3-1
summary: Render diagram to embeddable SVG via server-side rendering (D2 CLI or Mermaid browser farm)
---

# Embed Flow

Looks up diagram source by shortlink and renders it server-side to SVG for embedding in markdown, docs, or img tags.

## Dependencies

```mermaid
graph LR
    EmbedFlow["Embed Flow"] --> DiagramStore["Diagram Store (c3-112)"]
    EmbedFlow --> D2Renderer["D2 Renderer (c3-124)"]
    EmbedFlow --> MermaidRenderer["Mermaid Renderer (c3-122)"]
    EmbedFlow --> Logger["Logger (c3-106)"]
```

## Behavior

```mermaid
sequenceDiagram
    participant Client
    participant Flow as Embed Flow
    participant Store as Diagram Store
    participant D2 as D2 Renderer
    participant Mermaid as Mermaid Renderer

    Client->>+Flow: GET /e/:shortlink?theme=light
    Flow->>Store: get(shortlink)
    alt Found (D2)
        Store-->>Flow: {source, format: "d2"}
        Flow->>D2: render(source, theme)
        D2-->>Flow: svg
        Flow-->>Client: SVG (image/svg+xml)
    else Found (Mermaid)
        Store-->>Flow: {source, format: "mermaid"}
        alt SSR configured
            Flow->>Mermaid: render(source)
            Mermaid-->>Flow: svg
            Flow-->>Client: SVG (image/svg+xml)
        else SSR not configured
            Flow-->>Client: 404 EmbedNotSupportedError
        end
    else Not Found
        Flow-->>-Client: 404 NotFoundError
    end
```

## Input/Output

**Input:**
```typescript
interface EmbedInput {
  shortlink: string;
  theme?: "light" | "dark";  // D2 only, default "light"
}
```

**Output:**
```typescript
interface EmbedOutput {
  svg: string;
  contentType: "image/svg+xml";
}
```

## Error Mapping

| Error | Status | Trigger |
|-------|--------|---------|
| `NotFoundError` | 404 | Shortlink not in database |
| `EmbedNotSupportedError` | 404 | Mermaid without CHROME_PATH |
| `EmbedRenderError` | 400 | Forbidden content in source |
| `EmbedRenderError` | 503 | Queue full |
| `EmbedRenderError` | 504 | Render timeout |
| `EmbedRenderError` | 500 | Other render failure |

## References

- `embedFlow` - `src/flows/embed.ts:54`
- `EmbedNotSupportedError` - `src/flows/embed.ts:18`
- `EmbedRenderError` - `src/flows/embed.ts:26`

## Testing Strategy

**Unit scope:**
- D2 render delegation
- Mermaid render delegation
- Error mapping for render failures
- Missing mermaid renderer graceful handling

**Integration scope:**
- Full flow with real D2 CLI
- Mermaid SSR flow (requires Chromium)
