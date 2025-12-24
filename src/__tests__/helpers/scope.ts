/**
 * Test helper: Creates a scope with test-friendly defaults
 * Allows overriding config tags for isolated testing
 */
import { createScope, type Lite } from "@pumped-fn/lite";

/**
 * Creates a test scope with optional tag overrides
 * Usage:
 *   const scope = createTestScope({ tags: [logLevelTag("debug")] })
 */
export function createTestScope(options?: {
  tags?: Lite.Tagged<unknown>[];
  presets?: Lite.Preset<unknown>[];
  extensions?: Lite.Extension[];
}): Lite.Scope {
  return createScope({
    tags: options?.tags ?? [],
    presets: options?.presets ?? [],
    extensions: options?.extensions ?? [],
  });
}

/**
 * Utility: Wait for scope to be ready and return it
 */
export async function createReadyTestScope(options?: {
  tags?: Lite.Tagged<unknown>[];
  presets?: Lite.Preset<unknown>[];
  extensions?: Lite.Extension[];
}): Promise<Lite.Scope> {
  const scope = createTestScope(options);
  await scope.ready;
  return scope;
}

/**
 * Utility: Create scope, run test, dispose
 * Ensures cleanup even if test fails
 */
export async function withTestScope<T>(
  options: {
    tags?: Lite.Tagged<unknown>[];
    presets?: Lite.Preset<unknown>[];
    extensions?: Lite.Extension[];
  },
  fn: (scope: Lite.Scope) => Promise<T>
): Promise<T> {
  const scope = await createReadyTestScope(options);
  try {
    return await fn(scope);
  } finally {
    await scope.dispose();
  }
}
