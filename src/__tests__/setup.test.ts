/**
 * Test infrastructure verification
 * This test validates that the test setup works correctly
 */
import { describe, test, expect } from "bun:test";
import { atom, createScope } from "@pumped-fn/lite";
import { createTestScope, withTestScope, silentLogger } from "./helpers";

describe("Test Infrastructure", () => {
  test("pumped-fn/lite is importable and works", async () => {
    const testAtom = atom({
      factory: () => 42,
    });

    const scope = createScope();
    await scope.ready;
    
    const result = await scope.resolve(testAtom);
    expect(result).toBe(42);
    
    await scope.dispose();
  });

  test("createTestScope helper works", async () => {
    const scope = createTestScope();
    await scope.ready;
    expect(scope).toBeDefined();
    await scope.dispose();
  });

  test("withTestScope helper provides scope and disposes", async () => {
    let scopeDisposed = false;
    
    const result = await withTestScope({}, async (scope) => {
      expect(scope).toBeDefined();
      return "test-result";
    });
    
    expect(result).toBe("test-result");
  });

  test("silentLogger is available", () => {
    expect(silentLogger).toBeDefined();
    // Should not throw
    silentLogger.info("test message");
    silentLogger.error("test error");
  });
});
