import { describe, it, expect } from "bun:test";
import { createScope, type Lite } from "@pumped-fn/lite";
import { loggerAtom } from "../atoms/logger";
import { logLevelTag, nodeEnvTag } from "../config/tags";

describe("Logger Atom (c3-106)", () => {
  it("resolves to pino instance", async () => {
    const scope = createScope({
      tags: [
        logLevelTag("info"),
        nodeEnvTag("development"),
      ],
    });

    const logger = await scope.resolve(loggerAtom);

    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.child).toBe("function");

    await scope.dispose();
  });

  it("respects logLevelTag (debug vs info)", async () => {
    const debugScope = createScope({
      tags: [
        logLevelTag("debug"),
        nodeEnvTag("production"),
      ],
    });

    const debugLogger = await debugScope.resolve(loggerAtom);
    expect(debugLogger.level).toBe("debug");

    await debugScope.dispose();

    const infoScope = createScope({
      tags: [
        logLevelTag("info"),
        nodeEnvTag("production"),
      ],
    });

    const infoLogger = await infoScope.resolve(loggerAtom);
    expect(infoLogger.level).toBe("info");

    await infoScope.dispose();
  });

  it("child logger inherits level", async () => {
    const scope = createScope({
      tags: [
        logLevelTag("warn"),
        nodeEnvTag("production"),
      ],
    });

    const logger = await scope.resolve(loggerAtom);
    const child = logger.child({ requestId: "test-123" });

    expect(child.level).toBe("warn");

    await scope.dispose();
  });

  it("uses tag defaults when not explicitly provided", async () => {
    const scope = createScope({
      tags: [],
    });

    const logger = await scope.resolve(loggerAtom);

    expect(logger.level).toBe("info");

    await scope.dispose();
  });
});
