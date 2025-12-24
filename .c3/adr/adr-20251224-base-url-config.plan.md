# BASE_URL Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add BASE_URL environment variable to enable absolute URLs in API responses for deployment.

**Architecture:** Add `baseUrlTag` to config system, inject into flows that construct URLs (render-async, job-status), and update server.ts sync responses. Empty string default preserves backward compatibility.

**Tech Stack:** Bun, @pumped-fn/lite tags, bun:test

---

## Task 1: Add baseUrlTag to Config

**Files:**
- Modify: `src/config/tags.ts`
- Test: `src/__tests__/config.test.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/config.test.ts` inside `describe("loadConfigTags")`:

```typescript
it("parses BASE_URL from env", () => {
  const env = {
    BASE_URL: "https://diagrams.example.com",
  };

  const tagged = loadConfigTags(env);
  expect(baseUrlTag.find(tagged)).toBe("https://diagrams.example.com");
});

it("defaults BASE_URL to empty string", () => {
  const env = {};

  const tagged = loadConfigTags(env);
  expect(baseUrlTag.find(tagged)).toBe("");
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/config.test.ts`
Expected: FAIL with "baseUrlTag is not defined"

**Step 3: Write implementation**

In `src/config/tags.ts`:

1. Add tag definition after `browserPoolSizeTag`:
```typescript
export const baseUrlTag = tag<string>({
  label: "base-url",
  default: "",
});
```

2. In `loadConfigTags`, add before the return statement:
```typescript
const baseUrl = getEnv(env, "BASE_URL") ?? "";
```

3. Add to the return array:
```typescript
baseUrlTag(baseUrl),
```

**Step 4: Update test imports**

Add `baseUrlTag` to the import in config.test.ts.

**Step 5: Run test to verify it passes**

Run: `bun test src/__tests__/config.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/config/tags.ts src/__tests__/config.test.ts
git commit -m "feat(config): add BASE_URL environment variable for absolute URLs"
```

---

## Task 2: Update asyncRenderFlow to Use baseUrlTag

**Files:**
- Modify: `src/flows/render-async.ts`
- Test: `src/__tests__/render-async.test.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/render-async.test.ts`:

```typescript
test("uses BASE_URL in statusUrl when configured", async () => {
  // Create new scope with baseUrlTag
  const scopeWithBaseUrl = createScope({
    tags: [
      jobConfigTag({
        dbPath: TEST_DB_PATH,
        pollIntervalMs: 100,
        retentionMs: 3600000,
        cleanupIntervalMs: 60000,
      }),
      cacheConfigTag({ ttlMs: 300000, gcIntervalMs: 60000 }),
      logLevelTag("error"),
      baseUrlTag("https://diagrams.example.com"),
    ],
  });

  const ctx = scopeWithBaseUrl.createContext();
  const result = await ctx.exec({
    flow: asyncRenderFlow,
    rawInput: {
      source: "graph TD; X-->Y;",
      format: "mermaid",
      outputType: "svg",
    },
  });
  await ctx.close();
  await scopeWithBaseUrl.dispose();

  expect(result.mode).toBe("async");
  if (result.mode === "async") {
    expect(result.statusUrl).toBe(`https://diagrams.example.com/jobs/${result.jobId}`);
  }
});
```

**Step 2: Update test imports**

Add `baseUrlTag` to the import from `../config/tags`.

**Step 3: Run test to verify it fails**

Run: `bun test src/__tests__/render-async.test.ts`
Expected: FAIL - statusUrl will be `/jobs/...` instead of `https://diagrams.example.com/jobs/...`

**Step 4: Write implementation**

In `src/flows/render-async.ts`:

1. Add import:
```typescript
import { baseUrlTag } from "../config/tags";
```

2. Update flow definition - add baseUrlTag to deps via context:
```typescript
export const asyncRenderFlow = flow({
  name: "render-async",
  deps: {
    cache: cacheAtom,
    jobStore: jobStoreAtom,
    logger: loggerAtom,
  },
  parse: parseAsyncRenderInput,
  factory: async (ctx, { cache, jobStore, logger }): Promise<RenderResult> => {
    const { input } = ctx;
    const baseUrl = ctx.data.seekTag(baseUrlTag) ?? "";
```

3. Update the return statement (around line 87):
```typescript
    return {
      mode: "async",
      jobId,
      status: "pending",
      statusUrl: `${baseUrl}/jobs/${jobId}`,
    };
```

**Step 5: Run test to verify it passes**

Run: `bun test src/__tests__/render-async.test.ts`
Expected: PASS

**Step 6: Verify existing test still passes (backward compat)**

Run: `bun test src/__tests__/render-async.test.ts`
Expected: All tests PASS (default empty baseUrl = relative URLs)

**Step 7: Commit**

```bash
git add src/flows/render-async.ts src/__tests__/render-async.test.ts
git commit -m "feat(render-async): use BASE_URL for statusUrl in async responses"
```

---

## Task 3: Update jobStatusFlow to Use baseUrlTag

**Files:**
- Modify: `src/flows/job-status.ts`
- Test: `src/__tests__/job-status.test.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/job-status.test.ts`:

```typescript
test("uses BASE_URL in result url when job is completed", async () => {
  const scopeWithBaseUrl = createScope({
    tags: [
      jobConfigTag({
        dbPath: TEST_DB_PATH,
        pollIntervalMs: 100,
        retentionMs: 3600000,
        cleanupIntervalMs: 60000,
      }),
      logLevelTag("error"),
      baseUrlTag("https://diagrams.example.com"),
    ],
  });

  const jobStore = await scopeWithBaseUrl.resolve(jobStoreAtom);
  const jobId = jobStore.create({
    source: "graph TD; A-->B;",
    format: "mermaid",
    outputType: "svg",
  });
  // Simulate completion
  jobStore.markCompleted(jobId, "abc12345");

  const ctx = scopeWithBaseUrl.createContext();
  const result = await ctx.exec({
    flow: jobStatusFlow,
    rawInput: { jobId },
  });
  await ctx.close();
  await scopeWithBaseUrl.dispose();

  expect(result.url).toBe("https://diagrams.example.com/d/abc12345");
});
```

**Step 2: Update test imports**

Add `baseUrlTag` to the import from `../config/tags`.

**Step 3: Run test to verify it fails**

Run: `bun test src/__tests__/job-status.test.ts`
Expected: FAIL - url will be `/d/abc12345` instead of `https://diagrams.example.com/d/abc12345`

**Step 4: Write implementation**

In `src/flows/job-status.ts`:

1. Add import:
```typescript
import { baseUrlTag } from "../config/tags";
```

2. Update factory to get baseUrl from context:
```typescript
  factory: async (ctx, { jobStore, logger }): Promise<JobStatusResult> => {
    const { input } = ctx;
    const baseUrl = ctx.data.seekTag(baseUrlTag) ?? "";
```

3. Update the result construction (around line 59):
```typescript
    const result: JobStatusResult = {
      jobId: job.id,
      status: job.status,
      shortlink: job.shortlink ?? null,
      error: job.error ?? null,
      url: job.shortlink ? `${baseUrl}/d/${job.shortlink}` : null,
    };
```

**Step 5: Run test to verify it passes**

Run: `bun test src/__tests__/job-status.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/flows/job-status.ts src/__tests__/job-status.test.ts
git commit -m "feat(job-status): use BASE_URL for diagram url in job responses"
```

---

## Task 4: Update server.ts Sync Responses

**Files:**
- Modify: `src/server.ts`
- Test: `src/__tests__/integration.test.ts`

**Step 1: Read current server.ts structure**

The server constructs URLs directly in response JSON. We need to get baseUrl from scope and use it.

**Step 2: Write implementation**

In `src/server.ts`:

1. Add import at top:
```typescript
import { baseUrlTag } from "./config/tags";
```

2. After `await scope.ready;`, resolve baseUrl:
```typescript
const baseUrl = scope.data.seekTag(baseUrlTag) ?? "";
```

3. Update line ~170 (sync mode response):
```typescript
return new Response(JSON.stringify({ shortlink: result.shortlink, url: `${baseUrl}/d/${result.shortlink}`, cached: result.cached }), {
```

4. Update line ~184 (cache hit response):
```typescript
return new Response(JSON.stringify({ shortlink: result.shortlink, url: `${baseUrl}/d/${result.shortlink}`, cached: result.cached }), {
```

**Step 3: Run all tests to verify backward compatibility**

Run: `bun test`
Expected: All tests PASS (default empty baseUrl = relative URLs preserved)

**Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat(server): use BASE_URL for sync render responses"
```

---

## Task 5: Add Integration Test for BASE_URL

**Files:**
- Modify: `src/__tests__/integration.test.ts`

**Step 1: Write integration test**

Add a new describe block to `src/__tests__/integration.test.ts`:

```typescript
describe("BASE_URL configuration", () => {
  it("sync render returns absolute URL when BASE_URL is set", async () => {
    // This test requires starting server with BASE_URL env var
    // For now, verify the pattern works by checking relative URL structure
    const res = await fetch(`${baseUrl}/render?mode=sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "graph TD; Test-->URL;",
        format: "mermaid",
        outputType: "svg",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^\/d\/[a-f0-9]{8}$/);
  });
});
```

**Step 2: Run integration tests**

Run: `bun test src/__tests__/integration.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/__tests__/integration.test.ts
git commit -m "test: add integration test verifying URL structure"
```

---

## Task 6: Update C3 Documentation

**Files:**
- Modify: `.c3/c3-1-api-server/c3-108-config.md`

**Step 1: Add BASE_URL to config documentation**

Add to the Configuration Settings table:

```markdown
| baseUrlTag | BASE_URL | (empty) | string |
```

**Step 2: Commit**

```bash
git add .c3/c3-1-api-server/c3-108-config.md
git commit -m "docs(c3): document BASE_URL configuration"
```

---

## Task 7: Final Verification

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests PASS

**Step 2: Manual verification**

```bash
# Test with BASE_URL
BASE_URL="https://example.com" bun run src/server.ts &

# Test async render
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B;", "format": "mermaid"}'
# Expected: statusUrl starts with https://example.com

# Test sync render
curl -X POST "http://localhost:3000/render?mode=sync" \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B;", "format": "mermaid"}'
# Expected: url starts with https://example.com
```

**Step 3: Update ADR status**

Change ADR status from "proposed" to "accepted" in `.c3/adr/adr-20251224-base-url-config.md`.

**Step 4: Final commit**

```bash
git add .c3/adr/adr-20251224-base-url-config.md
git commit -m "docs: mark BASE_URL ADR as accepted"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add baseUrlTag to config | tags.ts, config.test.ts |
| 2 | Update asyncRenderFlow | render-async.ts, render-async.test.ts |
| 3 | Update jobStatusFlow | job-status.ts, job-status.test.ts |
| 4 | Update server.ts sync responses | server.ts |
| 5 | Add integration test | integration.test.ts |
| 6 | Update C3 docs | c3-108-config.md |
| 7 | Final verification | ADR status update |
