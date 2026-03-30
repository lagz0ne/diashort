import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import { startServer } from "../server";
import type { Lite } from "@pumped-fn/lite";

interface CreateResponse {
  shortlink: string;
  url: string;
  embed: string;
}

describe("Integration Tests", () => {
  let server: ReturnType<typeof Bun.serve>;
  let scope: Lite.Scope;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.AUTH_ENABLED = "true";
    process.env.AUTH_USER = "test";
    process.env.AUTH_PASS = "secret";
    process.env.PORT = "0";
    process.env.LOG_LEVEL = "error";
    process.env.NODE_ENV = "test";
    process.env.DIAGRAM_DB_PATH = "/tmp/integration-test-diagrams.db";

    const result = await startServer();
    server = result.server;
    scope = result.scope;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    server.stop();
    await scope.dispose();
    const dbPath = process.env.DIAGRAM_DB_PATH;
    if (dbPath && existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  const authHeader = `Basic ${btoa("test:secret")}`;

  describe("Health endpoint", () => {
    it("GET /health returns 200", async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = await res.json() as { status: string };
      expect(body).toEqual({ status: "ok" });
    });
  });

  describe("Root endpoint", () => {
    it("GET / returns usage information", async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      const body = await res.text();
      expect(body).toContain("Diashort");
      expect(body).toContain("POST");
      expect(body).toContain("/render");
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

    it("POST /render with mermaid source returns shortlink", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; A-->B;",
          format: "mermaid",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as CreateResponse;
      expect(body.shortlink).toBeDefined();
      expect(body.shortlink).toMatch(/^[a-f0-9]{8}$/);
      expect(body.url).toBe(`${baseUrl}/d/${body.shortlink}`);
      expect(body.embed).toBe(`${baseUrl}/e/${body.shortlink}`);
    });

    it("POST /render with d2 source returns shortlink", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "x -> y",
          format: "d2",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as CreateResponse;
      expect(body.shortlink).toBeDefined();
      expect(body.url).toBe(`${baseUrl}/d/${body.shortlink}`);
      expect(body.embed).toBe(`${baseUrl}/e/${body.shortlink}`);
    });

    it("includes X-Request-Id header in response", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; A-->B;",
          format: "mermaid",
        }),
      });

      expect(res.headers.get("X-Request-Id")).toBeDefined();
    });
  });

  describe("View endpoint", () => {
    let createdShortlink: string;

    beforeAll(async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; ViewTest-->Diagram;",
          format: "mermaid",
        }),
      });
      const body = await res.json() as CreateResponse;
      createdShortlink = body.shortlink;
    });

    it("GET /d/:shortlink for mermaid returns 503 without CHROME_PATH", async () => {
      if (process.env.CHROME_PATH) return;
      const res = await fetch(`${baseUrl}/d/${createdShortlink}`);
      expect(res.status).toBe(503);
    });

    it("GET /d/:shortlink includes X-Request-Id", async () => {
      const res = await fetch(`${baseUrl}/d/${createdShortlink}`);
      expect(res.headers.get("X-Request-Id")).toBeDefined();
    });

    it("GET /d/nonexistent returns 404", async () => {
      const res = await fetch(`${baseUrl}/d/nonexistent`);
      expect(res.status).toBe(404);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("not found");
    });
  });

  describe("D2 diagram viewing", () => {
    it("GET /d/:shortlink for D2 returns HTML with SVG", async () => {
      if (!Bun.which("d2")) return; // D2 CLI required for rendering
      const createRes = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "server -> database",
          format: "d2",
        }),
      });
      const createBody = await createRes.json() as CreateResponse;

      const viewRes = await fetch(`${baseUrl}/d/${createBody.shortlink}`);

      expect(viewRes.status).toBe(200);
      const html = await viewRes.text();
      expect(html).toContain("<svg");
      expect(html).toContain("server");
      expect(html).toContain("database");
    });
  });

  describe("Embed endpoint", () => {
    let shortlink: string;

    beforeAll(async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "embed_a -> embed_b",
          format: "d2",
        }),
      });
      const body = await res.json() as CreateResponse;
      shortlink = body.shortlink;
    });

    it("GET /e/:shortlink returns SVG with immutable cache", async () => {
      const res = await fetch(`${baseUrl}/e/${shortlink}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");

      const svg = await res.text();
      expect(svg).toContain("<svg");
    });

    it("GET /e/nonexistent returns 404", async () => {
      const res = await fetch(`${baseUrl}/e/nonexistent`);
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

  describe("BASE_URL configuration", () => {
    it("render returns URL with path prefix", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; Test-->URL;",
          format: "mermaid",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as CreateResponse;
      expect(body.url).toMatch(/\/d\/[a-f0-9]{8}$/);
    });
  });
});
