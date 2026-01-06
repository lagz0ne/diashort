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

Looks up diagram source by shortlink and generates an HTML page that renders the diagram client-side.

## Dependencies

```mermaid
graph LR
    ViewFlow["View Flow"] --> DiagramStore["Diagram Store (c3-112)"]
    ViewFlow --> HTMLGen["HTML Generator (c3-119)"]
    ViewFlow --> Logger["Logger (c3-106)"]
```

## Behavior

```mermaid
sequenceDiagram
    participant Client
    participant Flow as View Flow
    participant Store as Diagram Store
    participant Gen as HTML Generator

    Client->>+Flow: GET /d/:shortlink
    Flow->>Store: get(shortlink)
    alt Found
        Store-->>Flow: {source, format}
        Flow->>Store: touch(shortlink)
        Flow->>Gen: generate(source, format)
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
interface ViewResult {
  html: string;
  contentType: "text/html";
}
```

## References

- `viewFlow` - `src/flows/view.ts`
- NotFoundError - `src/flows/view.ts`

## Testing Strategy

**Unit scope:**
- Shortlink lookup
- NotFoundError on missing
- HTML generation delegation

**Integration scope:**
- Full flow with real store and generator
- HTML output contains diagram source
