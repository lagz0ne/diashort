import { createScope, type Lite } from "@pumped-fn/lite";
import { logLevelTag, nodeEnvTag, diagramConfigTag } from "../config/tags";
import pino from "pino";

export function createTestScope(tags: Lite.Tagged<unknown>[] = []): Lite.Scope {
  return createScope({
    tags: [
      logLevelTag("error"),
      nodeEnvTag("test"),
      diagramConfigTag({
        dbPath: ":memory:",
        retentionDays: 1,
        cleanupIntervalMs: 86400000,
      }),
      ...tags,
    ],
  });
}

export async function withTestScope<T>(
  config: { tags?: Lite.Tagged<unknown>[] },
  fn: (scope: Lite.Scope) => Promise<T>
): Promise<T> {
  const scope = createTestScope(config.tags ?? []);
  await scope.ready;
  try {
    return await fn(scope);
  } finally {
    await scope.dispose();
  }
}

export const silentLogger = pino({ level: "silent" });
