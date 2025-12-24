import { describe, it, expect } from "bun:test";
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
