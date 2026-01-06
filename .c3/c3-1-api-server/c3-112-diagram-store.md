---
id: c3-112
c3-version: 3
title: Diagram Store
type: component
category: feature
parent: c3-1
summary: SQLite CRUD for diagram source storage with retention-based cleanup
---

# Diagram Store

Provides CRUD operations for diagram source code. Diagrams are stored permanently until cleanup removes old entries based on last access time.

## Dependencies

```mermaid
graph LR
    DiagramStore["Diagram Store"] --> SQLite["SQLite (c3-2)"]
    DiagramStore --> Logger["Logger (c3-106)"]
    DiagramStore --> Config["Config Tags (c3-103)"]
```

## Interface

```typescript
interface DiagramStore {
  create(source: string, format: "mermaid" | "d2"): string;  // Returns shortlink
  get(id: string): { source: string; format: string } | null;
  touch(id: string): void;  // Update accessedAt
  cleanup(): void;          // Delete old diagrams
}
```

## Behavior

```mermaid
sequenceDiagram
    participant Flow as Create/View Flow
    participant Store as Diagram Store
    participant DB as SQLite

    alt Create
        Flow->>Store: create(source, format)
        Store->>DB: INSERT INTO diagrams
        Store-->>Flow: shortlink
    else View
        Flow->>Store: get(shortlink)
        Store->>DB: SELECT * FROM diagrams WHERE id = ?
        DB-->>Store: row
        Store->>Store: touch(shortlink)
        Store->>DB: UPDATE accessedAt
        Store-->>Flow: {source, format}
    else Cleanup
        Store->>DB: DELETE WHERE accessedAt < cutoff
    end
```

## References

- `diagramStoreAtom` - `src/atoms/diagram-store.ts`
- Schema creation - `src/atoms/diagram-store.ts`

## Testing Strategy

**Unit scope:**
- CRUD operations with in-memory SQLite
- Cleanup respects retention window
- Touch updates accessedAt

**Isolation:** Use `:memory:` database path for tests
