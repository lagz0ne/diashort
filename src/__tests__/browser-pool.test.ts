import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { browserPoolAtom } from "../atoms/browser-pool";
import { browserPoolSizeTag, logLevelTag, nodeEnvTag } from "../config/tags";
import { loggerAtom } from "../atoms/logger";
import { mockLoggerAtom } from "./helpers/mocks";

describe("Browser Pool (c3-113)", () => {
  it("exports browserPoolAtom", async () => {
    expect(browserPoolAtom).toBeDefined();
  });
});
