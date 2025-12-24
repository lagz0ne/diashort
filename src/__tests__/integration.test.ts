import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer } from "../server";
import type { Lite } from "@pumped-fn/lite";

describe("Integration Tests", () => {
  let server: ReturnType<typeof Bun.serve>;
  let scope: Lite.Scope;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.AUTH_ENABLED = "true";
    process.env.AUTH_USER = "test";
    process.env.AUTH_PASS = "secret";
    process.env.PORT = "0";
    process.env.METRICS_PORT = "0";
    process.env.LOG_LEVEL = "error";
    process.env.NODE_ENV = "test";
    process.env.JOB_DB_PATH = "/tmp/integration-test-jobs.db";

    const result = await startServer();
    server = result.server;
    scope = result.scope;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    server.stop();
    await scope.dispose();
  });

  const authHeader = `Basic ${btoa("test:secret")}`;

  describe("Health endpoint", () => {
    it("GET /health returns 200", async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: "ok" });
    });
  });

  describe("Render endpoint", () => {
    it("POST /render without auth returns 401", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "graph TD; A-->B;", format: "mermaid" }),
      });
      expect(res.status).toBe(401);
    });

    it("POST /render with wrong credentials returns 401", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Basic ${btoa("wrong:creds")}`,
        },
        body: JSON.stringify({ source: "graph TD; A-->B;", format: "mermaid" }),
      });
      expect(res.status).toBe(401);
    });

    it("POST /render with missing source returns 400", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({ format: "mermaid" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("source");
    });

    it("POST /render with invalid format returns 400", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({ source: "test", format: "invalid" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("format");
    });

    it("mermaid render completes successfully with warmed pool", async () => {
      // Pool is warmed up in beforeAll, so browser launch is not needed
      const response = await fetch(`${baseUrl}/render?mode=sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; A-->B;",
          format: "mermaid",
          outputType: "svg",
        }),
      });

      expect(response.ok).toBe(true);
      const body = await response.json() as { shortlink: string; url: string };
      expect(body.shortlink).toBeDefined();
      expect(body.url).toMatch(/^\/d\//);
    }, 15000);
  });

  describe("Retrieve endpoint", () => {
    it("GET /d/nonexistent returns 404", async () => {
      const res = await fetch(`${baseUrl}/d/nonexistent`);
      expect(res.status).toBe(404);
    });
  });

  describe("Unknown routes", () => {
    it("GET /unknown returns 404", async () => {
      const res = await fetch(`${baseUrl}/unknown`);
      expect(res.status).toBe(404);
    });

    it("POST /unknown returns 404", async () => {
      const res = await fetch(`${baseUrl}/unknown`, { method: "POST" });
      expect(res.status).toBe(404);
    });
  });
});
