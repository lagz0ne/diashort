import { describe, it, expect, test } from "bun:test";
import { createScope, type Lite } from "@pumped-fn/lite";
import {
  loadConfigTags,
  logLevelTag,
  nodeEnvTag,
  serverPortTag,
  authEnabledTag,
  authCredentialsTag,
  cacheConfigTag,
  queueConfigTag,
  browserPoolSizeTag,
  baseUrlTag,
  jobConfigTag,
} from "../config/tags";

describe("Config Tags", () => {
  describe("loadConfigTags", () => {
    it("parses valid env with auth enabled into typed config tags", () => {
      const env = {
        LOG_LEVEL: "debug",
        NODE_ENV: "production",
        PORT: "8080",
        AUTH_ENABLED: "true",
        AUTH_USER: "admin",
        AUTH_PASS: "secret",
        CACHE_TTL: "60000",
        CACHE_GC_INTERVAL: "10000",
        QUEUE_MAX_CONCURRENT: "5",
        QUEUE_MAX_WAITING: "20",
      };

      const tagged = loadConfigTags(env);

      expect(logLevelTag.find(tagged)).toBe("debug");
      expect(nodeEnvTag.find(tagged)).toBe("production");
      expect(serverPortTag.find(tagged)).toBe(8080);
      expect(authEnabledTag.find(tagged)).toBe(true);
      expect(authCredentialsTag.find(tagged)).toEqual({
        username: "admin",
        password: "secret",
      });
      expect(cacheConfigTag.find(tagged)).toEqual({
        ttlMs: 60000,
        gcIntervalMs: 10000,
      });
      expect(queueConfigTag.find(tagged)).toEqual({
        maxConcurrent: 5,
        maxWaiting: 20,
      });
    });

    it("auth disabled by default (no AUTH_ENABLED)", () => {
      const env = {};

      const tagged = loadConfigTags(env);

      expect(authEnabledTag.find(tagged)).toBe(false);
      expect(authCredentialsTag.find(tagged)).toBeNull();
    });

    it("throws on missing AUTH_USER when auth enabled", () => {
      const env = {
        AUTH_ENABLED: "true",
        AUTH_PASS: "secret",
      };

      expect(() => loadConfigTags(env)).toThrow("AUTH_USER is required");
    });

    it("throws on missing AUTH_PASS when auth enabled", () => {
      const env = {
        AUTH_ENABLED: "true",
        AUTH_USER: "admin",
      };

      expect(() => loadConfigTags(env)).toThrow("AUTH_PASS is required");
    });

    it("throws on invalid number (PORT=abc)", () => {
      const env = {
        PORT: "abc",
      };

      expect(() => loadConfigTags(env)).toThrow("PORT must be a valid number");
    });

    it("uses defaults when optional env missing", () => {
      const env = {};

      const tagged = loadConfigTags(env);

      expect(logLevelTag.find(tagged)).toBe("info");
      expect(nodeEnvTag.find(tagged)).toBe("development");
      expect(serverPortTag.find(tagged)).toBe(3000);
      expect(authEnabledTag.find(tagged)).toBe(false);
      expect(authCredentialsTag.find(tagged)).toBeNull();
      expect(cacheConfigTag.find(tagged)).toEqual({
        ttlMs: 300000,
        gcIntervalMs: 60000,
      });
      expect(queueConfigTag.find(tagged)).toEqual({
        maxConcurrent: 10,
        maxWaiting: 50,
      });
      expect(browserPoolSizeTag.find(tagged)).toBe(10);
    });

    it("treats empty string as missing", () => {
      const env = {
        LOG_LEVEL: "",
      };

      const tagged = loadConfigTags(env);

      expect(logLevelTag.find(tagged)).toBe("info");
    });

    it("uses default for invalid log level", () => {
      const env = {
        LOG_LEVEL: "verbose",
      };

      const tagged = loadConfigTags(env);

      expect(logLevelTag.find(tagged)).toBe("info");
    });

    it("parses BROWSER_POOL_SIZE from env", () => {
      const env = {
        BROWSER_POOL_SIZE: "5",
      };

      const tagged = loadConfigTags(env);
      expect(browserPoolSizeTag.find(tagged)).toBe(5);
    });

    it("defaults BROWSER_POOL_SIZE to QUEUE_MAX_CONCURRENT", () => {
      const env = {
        QUEUE_MAX_CONCURRENT: "8",
      };

      const tagged = loadConfigTags(env);
      expect(browserPoolSizeTag.find(tagged)).toBe(8);
    });

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
  });

  describe("job config", () => {
    test("uses defaults when env vars not set", () => {
      const tagged = loadConfigTags({});
      expect(jobConfigTag.find(tagged)).toEqual({
        dbPath: "./data/jobs.db",
        pollIntervalMs: 100,
        retentionMs: 3600000,
        cleanupIntervalMs: 60000,
      });
    });

    test("parses job config from env vars", () => {
      const tagged = loadConfigTags({
        JOB_DB_PATH: "/tmp/test.db",
        JOB_POLL_INTERVAL_MS: "200",
        JOB_RETENTION_MS: "7200000",
        JOB_CLEANUP_INTERVAL_MS: "120000",
      });
      expect(jobConfigTag.find(tagged)).toEqual({
        dbPath: "/tmp/test.db",
        pollIntervalMs: 200,
        retentionMs: 7200000,
        cleanupIntervalMs: 120000,
      });
    });
  });

  describe("tags are injectable in createScope", () => {
    it("tags can be retrieved in execution context", async () => {
      const scope = createScope({
        tags: [
          logLevelTag("debug"),
          cacheConfigTag({ ttlMs: 1000, gcIntervalMs: 500 }),
        ],
      });

      await scope.ready;

      const ctx = scope.createContext();
      expect(ctx.data.seekTag(logLevelTag)).toBe("debug");
      expect(ctx.data.seekTag(cacheConfigTag)).toEqual({
        ttlMs: 1000,
        gcIntervalMs: 500,
      });

      await ctx.close();
      await scope.dispose();
    });
  });
});
