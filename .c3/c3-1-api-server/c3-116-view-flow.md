---
id: c3-116
c3-version: 3
title: View Flow
type: component
category: feature
parent: c3-1
summary: Lookup diagram source and generate HTML page for client-side rendering
---

# View Flow

Looks up diagram source by shortlink and generates an HTML page that renders the diagram client-side. D2 diagrams are pre-rendered server-side for both light/dark themes.

## Dependencies

```mermaid
graph LR
    ViewFlow["View Flow"] --> DiagramStore["Diagram Store (c3-112)"]
    ViewFlow --> HTMLGen["HTML Generator (c3-119)"]
    ViewFlow --> D2Renderer["D2 Renderer (c3-124)"]
    ViewFlow --> Logger["Logger (c3-106)"]
```

## Behavior

```mermaid
sequenceDiagram
    participant Client
    participant Flow as View Flow
    participant Store as Diagram Store
    participant D2 as D2 Renderer
    participant Gen as HTML Generator

    Client->>+Flow: GET /d/:shortlink
    Flow->>Store: get(shortlink)
    alt Found (D2)
        Store-->>Flow: {source, format: "d2"}
        Flow->>Store: touch(shortlink)
        Flow->>D2: render(source, "light") + render(source, "dark")
        D2-->>Flow: lightSvg, darkSvg
        Flow->>Gen: generateD2(lightSvg, darkSvg, shortlink)
        Gen-->>Flow: html
        Flow-->>Client: HTML page (text/html)
    else Found (Mermaid)
        Store-->>Flow: {source, format: "mermaid"}
        Flow->>Store: touch(shortlink)
        Flow->>Gen: generateMermaid(source, shortlink)
        Gen-->>Flow: html
        Flow-->>Client: HTML page (text/html)
    else Not Found
        Flow-->>-Client: 404 NotFoundError
    end
```

## Input/Output

**Input:**
```typescript
interface ViewInput {
  shortlink: string;  // From URL path
}
```

**Output:**
```typescript
interface ViewOutput {
  html: string;
  contentType: "text/html";
}
```

## References

- `viewFlow` - `src/flows/view.ts:39`
- `NotFoundError` - `src/flows/view.ts:8`

## Testing Strategy

**Unit scope:**
- Shortlink lookup
- NotFoundError on missing
- D2 pre-rendering delegation
- Mermaid client-side HTML generation

**Integration scope:**
- Full flow with real store, D2 renderer, and generator
- HTML output contains diagram source
