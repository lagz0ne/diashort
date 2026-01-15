import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { diffStoreAtom } from "../atoms/diff-store";
import { diagramConfigTag } from "../config/tags";
import { existsSync, unlinkSync } from "fs";

describe("DiffStore", () => {
  const testDbPath = "/tmp/diff-store-test.db";

  afterAll(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  it("creates and retrieves a diff", async () => {
    const scope = createScope({
      tags: [
        diagramConfigTag({
          dbPath: testDbPath,
          retentionDays: 30,
          cleanupIntervalMs: 3600000,
        }),
      ],
    });

    const store = await scope.resolve(diffStoreAtom);

    const id = store.create({
      format: "mermaid",
      before: "graph TD; A-->B;",
      after: "graph TD; A-->B-->C;",
    });

    expect(id).toMatch(/^[a-f0-9]{8}$/);

    const retrieved = store.get(id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.format).toBe("mermaid");
    expect(retrieved!.before).toBe("graph TD; A-->B;");
    expect(retrieved!.after).toBe("graph TD; A-->B-->C;");

    await scope.dispose();
  });

  it("returns null for non-existent diff", async () => {
    const scope = createScope({
      tags: [
        diagramConfigTag({
          dbPath: testDbPath,
          retentionDays: 30,
          cleanupIntervalMs: 3600000,
        }),
      ],
    });

    const store = await scope.resolve(diffStoreAtom);
    const result = store.get("nonexist");
    expect(result).toBeNull();

    await scope.dispose();
  });

  it("touch updates accessedAt", async () => {
    const scope = createScope({
      tags: [
        diagramConfigTag({
          dbPath: testDbPath,
          retentionDays: 30,
          cleanupIntervalMs: 3600000,
        }),
      ],
    });

    const store = await scope.resolve(diffStoreAtom);

    const id = store.create({
      format: "d2",
      before: "a -> b",
      after: "a -> b -> c",
    });

    // Touch should not throw
    store.touch(id);

    await scope.dispose();
  });
});
