import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { browserPoolAtom } from "../atoms/browser-pool";
import { browserPoolSizeTag, logLevelTag, nodeEnvTag } from "../config/tags";
import { loggerAtom } from "../atoms/logger";
import { mockLoggerAtom } from "./helpers/mocks";

// Mock puppeteer at top of file
const mockBrowser = {
  close: mock(() => Promise.resolve()),
  newPage: mock(() => Promise.resolve({})),
};

const mockPuppeteer = {
  default: {
    launch: mock(() => Promise.resolve(mockBrowser)),
  },
};

// Mock the import
mock.module("puppeteer", () => mockPuppeteer);

describe("Browser Pool (c3-113)", () => {
  const createTestScope = () => {
    return createScope({
      tags: [
        browserPoolSizeTag(2),
        logLevelTag("info"),
        nodeEnvTag("test"),
      ],
      presets: [[loggerAtom, mockLoggerAtom]] as any,
    });
  };

  beforeEach(() => {
    mockPuppeteer.default.launch.mockClear();
    mockBrowser.close.mockClear();
  });

  it("exports browserPoolAtom", async () => {
    expect(browserPoolAtom).toBeDefined();
  });

  it("acquire() launches browser when pool is empty", async () => {
    const scope = createTestScope();
    const pool = await scope.resolve(browserPoolAtom);

    const browser = await pool.acquire();

    expect(browser).toBeDefined();
    expect(mockPuppeteer.default.launch).toHaveBeenCalledTimes(1);

    await scope.dispose();
  });

  it("release() returns browser to pool for reuse", async () => {
    const scope = createTestScope();
    const pool = await scope.resolve(browserPoolAtom);

    const browser1 = await pool.acquire();
    pool.release(browser1);
    const browser2 = await pool.acquire();

    expect(browser1).toBe(browser2);
    expect(mockPuppeteer.default.launch).toHaveBeenCalledTimes(1);

    await scope.dispose();
  });

  it("warmUp() pre-launches poolSize browsers", async () => {
    const scope = createTestScope();
    const pool = await scope.resolve(browserPoolAtom);

    await pool.warmUp();

    expect(mockPuppeteer.default.launch).toHaveBeenCalledTimes(2);

    await scope.dispose();
  });

  it("shutdown() closes all browsers", async () => {
    const scope = createTestScope();
    const pool = await scope.resolve(browserPoolAtom);

    await pool.warmUp();
    await pool.shutdown();

    expect(mockBrowser.close).toHaveBeenCalledTimes(2);

    await scope.dispose();
  });
});
