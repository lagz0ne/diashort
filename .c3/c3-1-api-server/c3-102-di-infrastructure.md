---
id: c3-102
title: DI Infrastructure
type: component
category: foundation
parent: c3-1
goal: Provide the dependency injection backbone: atoms for singleton services, tags for configuration, flows for request-scoped logic, and scopes/contexts for lifecycle management across all components.
---

# DI Infrastructure

All components use `@pumped-fn/lite` for dependency injection. Atoms define services with their dependencies, tags carry configuration, flows define request-scoped business logic, and scopes manage lifecycle.

## Goal

Provide the dependency injection backbone: atoms for singleton services, tags for configuration, flows for request-scoped logic, and scopes/contexts for lifecycle management across all components.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Tag values from environment config | c3-103 |
| OUT | Scope and context creation to server | c3-101 |
| OUT | Atom/flow/tag primitives to all components | c3-1 |
## Contract

**Provides:**

- `atom()` - Define singleton services resolved once per scope
- `tag()` - Define typed configuration values injected at scope creation
- `flow()` - Define request-scoped business logic with parsing and deps
- `createScope()` - Create DI scope with tag values
- `scope.createContext()` - Create per-request execution context with additional tags
**Expects:**

- Tags populated via `loadConfigTags()` at startup
- Atoms resolved eagerly in `startServer()` for fail-fast
- Contexts closed after each request (`ctx.close()`)
## Patterns

| Pattern | Implementation |
| --- | --- |
| Singleton atoms | Resolved once per scope, shared across requests |
| Request context | scope.createContext({ tags: [...] }) per request |
| Tag injection | tags.required() / tags.optional() in atom deps |
| Cleanup hooks | ctx.cleanup(() => ...) for resource disposal |
| Flow execution | ctx.exec({ flow, rawInput }) or ctx.exec({ flow, input }) |
## References

- `createScope()` usage - `src/server.ts:132`
- `scope.createContext()` - `src/server.ts:178`
- `ctx.exec()` - `src/server.ts:181`
- `atom()` examples - `src/atoms/*.ts`
- `flow()` examples - `src/flows/*.ts`
- `tag()` definitions - `src/config/tags.ts`
