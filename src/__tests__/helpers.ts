import { createScope, type Lite } from "@pumped-fn/lite";
import { logLevelTag, nodeEnvTag, diagramConfigTag } from "../config/tags";
import pino from "pino";

const defaultTags: Lite.Tagged<any>[] = [
  logLevelTag("error"),
  nodeEnvTag("test"),
  diagramConfigTag({
    dbPath: ":memory:",
    retentionDays: 1,
    cleanupIntervalMs: 86400000,
  }),
];

export function createTestScope(tags: Lite.Tagged<any>[] = []): Lite.Scope {
  return createScope({ tags: [...defaultTags, ...tags] });
}

export async function withTestScope<T>(
  config: { tags?: Lite.Tagged<any>[]; presets?: Lite.Preset<any>[] },
  fn: (scope: Lite.Scope) => Promise<T>
): Promise<T> {
  const scope = createScope({
    tags: [...defaultTags, ...(config.tags ?? [])],
    presets: config.presets ?? [],
  });
  await scope.ready;
  try {
    return await fn(scope);
  } finally {
    await scope.dispose();
  }
}

export const silentLogger = pino({ level: "silent" });
