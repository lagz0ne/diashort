---
id: c3-114
c3-version: 3
title: Create Flow
type: component
category: feature
parent: c3-1
summary: Validate input, store diagram source, return shortlink
---

# Create Flow

Validates diagram input, stores source code in SQLite, and returns a shortlink for viewing.

## Dependencies

```mermaid
graph LR
    CreateFlow["Create Flow"] --> DiagramStore["Diagram Store (c3-112)"]
    CreateFlow --> Logger["Logger (c3-106)"]
```

## Behavior

```mermaid
sequenceDiagram
    participant Client
    participant Flow as Create Flow
    participant Store as Diagram Store

    Client->>+Flow: POST /render {source, format}
    Flow->>Flow: parseInput(body)
    Flow->>Store: create(source, format)
    Store-->>Flow: shortlink
    Flow-->>-Client: {shortlink, url}
```

## Input/Output

**Input (parsed from JSON body):**
```typescript
interface CreateInput {
  source: string;              // Diagram source code (required)
  format: "mermaid" | "d2";    // Diagram format (required)
}
```

**Output:**
```typescript
interface CreateResult {
  shortlink: string;  // 8-char UUID
  url: string;        // Full URL to view page
}
```

## References

- `createFlow` - `src/flows/create.ts`
- `parseCreateInput()` - `src/flows/create.ts`

## Testing Strategy

**Unit scope:**
- Input validation (missing source, invalid format)
- Shortlink generation
- URL construction with baseUrl

**Integration scope:**
- Full flow with real diagram store
