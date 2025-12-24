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

  describe("async render", () => {
    it("POST /render returns 202 with jobId (or 200 if cached)", async () => {
      // Use a unique source to avoid cache hits from other tests
      const uniqueSource = `graph TD; Unique${Date.now()}-->Test;`;
      const response = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: uniqueSource,
          format: "mermaid",
          outputType: "svg",
        }),
      });

      // Can be 202 (new job) or 200 (cache hit from previous run)
      expect([200, 202]).toContain(response.status);
      const body = await response.json();

      if (response.status === 202) {
        expect(body.jobId).toMatch(/^job_[a-f0-9]{8}$/);
        expect(body.status).toBe("pending");
        expect(body.statusUrl).toBe(`/jobs/${body.jobId}`);
      } else {
        // Cache hit returns shortlink
        expect(body.shortlink).toBeDefined();
        expect(body.url).toMatch(/^\/d\//);
      }
    });

    it("POST /render?mode=sync returns 200 with shortlink", async () => {
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

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.shortlink).toBeDefined();
      expect(body.url).toBe(`/d/${body.shortlink}`);
    });

    it("GET /jobs/:id returns job status", async () => {
      // Create a job first
      const createResponse = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; X-->Y;",
          format: "mermaid",
          outputType: "svg",
        }),
      });
      const { jobId } = await createResponse.json();

      // Get status
      const statusResponse = await fetch(`${baseUrl}/jobs/${jobId}`);
      expect(statusResponse.status).toBe(200);

      const status = await statusResponse.json();
      expect(status.jobId).toBe(jobId);
      expect(["pending", "rendering", "completed", "failed"]).toContain(status.status);
    });

    it("GET /jobs/:id returns 404 for non-existent job", async () => {
      const response = await fetch(`${baseUrl}/jobs/job_notexist`);
      expect(response.status).toBe(404);
    });
  });

  describe("input caching", () => {
    it("duplicate input returns same shortlink without re-render", async () => {
      const input = {
        source: `graph TD; CacheTest${Date.now()}-->Check;`,
        format: "mermaid" as const,
        outputType: "svg" as const,
      };

      // First request
      const response1 = await fetch(`${baseUrl}/render?mode=sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify(input),
      });
      expect(response1.status).toBe(200);
      const body1 = await response1.json();
      expect(body1.shortlink).toBeDefined();

      // Second request with same input
      const response2 = await fetch(`${baseUrl}/render?mode=sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify(input),
      });
      expect(response2.status).toBe(200);
      const body2 = await response2.json();

      // Should return same shortlink and mark as cached
      expect(body1.shortlink).toBe(body2.shortlink);
      expect(body2.cached).toBe(true);
    }, 30000);
  });
});
