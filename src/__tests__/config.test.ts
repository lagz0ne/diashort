import { describe, it, expect, test } from "bun:test";
import { createScope, type Lite } from "@pumped-fn/lite";
import {
  loadConfigTags,
  logLevelTag,
  nodeEnvTag,
  serverPortTag,
  authEnabledTag,
  authCredentialsTag,
  baseUrlTag,
  diagramConfigTag,
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

  describe("diagram config", () => {
    test("uses defaults when env vars not set", () => {
      const tagged = loadConfigTags({});
      expect(diagramConfigTag.find(tagged)).toEqual({
        dbPath: "./data/diagrams.db",
        retentionDays: 30,
        cleanupIntervalMs: 86400000,
      });
    });

    test("parses diagram config from env vars", () => {
      const tagged = loadConfigTags({
        DIAGRAM_DB_PATH: "/tmp/test.db",
        DIAGRAM_RETENTION_DAYS: "7",
        CLEANUP_INTERVAL_MS: "3600000",
      });
      expect(diagramConfigTag.find(tagged)).toEqual({
        dbPath: "/tmp/test.db",
        retentionDays: 7,
        cleanupIntervalMs: 3600000,
      });
    });
  });

  describe("tags are injectable in createScope", () => {
    it("tags can be retrieved in execution context", async () => {
      const scope = createScope({
        tags: [
          logLevelTag("debug"),
          diagramConfigTag({ dbPath: ":memory:", retentionDays: 7, cleanupIntervalMs: 1000 }),
        ],
      });

      await scope.ready;

      const ctx = scope.createContext();
      expect(ctx.data.seekTag(logLevelTag)).toBe("debug");
      expect(ctx.data.seekTag(diagramConfigTag)).toEqual({
        dbPath: ":memory:",
        retentionDays: 7,
        cleanupIntervalMs: 1000,
      });

      await ctx.close();
      await scope.dispose();
    });
  });
});
