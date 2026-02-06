import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import { startServer } from "../server";
import type { Lite } from "@pumped-fn/lite";

interface CreateResponse {
  shortlink: string;
  url: string;
  embed: string;
  version: string;
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
    // Clean up test database
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
      expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
      const body = await res.text();
      expect(body).toContain("Diashort");
      expect(body).toContain("POST /render");
      expect(body).toContain("/d/:id");
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

    it("POST /render with mermaid source returns shortlink with version", async () => {
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
      expect(body.version).toBe("v1");
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

    it("GET /d/:shortlink redirects (302) to latest version", async () => {
      const res = await fetch(`${baseUrl}/d/${createdShortlink}`, { redirect: "manual" });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(`/d/${createdShortlink}/v1`);
      expect(res.headers.get("Cache-Control")).toBe("no-cache");
    });

    it("GET /d/:shortlink/:version returns HTML page", async () => {
      const res = await fetch(`${baseUrl}/d/${createdShortlink}/v1`);

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/html");

      const html = await res.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("mermaid");
      expect(html).toContain("ViewTest-->Diagram");
    });

    it("GET /d/:shortlink/:version has immutable cache headers", async () => {
      const res = await fetch(`${baseUrl}/d/${createdShortlink}/v1`);

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    });

    it("GET /d/:shortlink (following redirect) returns HTML page", async () => {
      const res = await fetch(`${baseUrl}/d/${createdShortlink}`);

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("ViewTest-->Diagram");
    });

    it("GET /d/:shortlink includes X-Request-Id", async () => {
      const res = await fetch(`${baseUrl}/d/${createdShortlink}/v1`);
      expect(res.headers.get("X-Request-Id")).toBeDefined();
    });

    it("GET /d/nonexistent returns 404", async () => {
      const res = await fetch(`${baseUrl}/d/nonexistent`, { redirect: "manual" });
      expect(res.status).toBe(404);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("not found");
    });

    it("GET /d/:shortlink/nonexistent returns 404", async () => {
      const res = await fetch(`${baseUrl}/d/${createdShortlink}/nonexistent`);
      expect(res.status).toBe(404);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("not found");
    });
  });

  describe("D2 diagram viewing", () => {
    it("GET /d/:shortlink for D2 returns HTML with SVG via redirect", async () => {
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

      // Following redirect automatically
      const viewRes = await fetch(`${baseUrl}/d/${createBody.shortlink}`);

      expect(viewRes.status).toBe(200);
      const html = await viewRes.text();
      expect(html).toContain("<svg");
      expect(html).toContain("server");
      expect(html).toContain("database");
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

  describe("Version management", () => {
    let shortlink: string;

    beforeAll(async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; Step1-->Step2;",
          format: "mermaid",
        }),
      });
      const body = await res.json() as CreateResponse;
      shortlink = body.shortlink;
    });

    it("POST /render with shortlink adds auto-versioned v2", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; Step1-->Step2-->Step3;",
          format: "mermaid",
          shortlink,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as CreateResponse;
      expect(body.shortlink).toBe(shortlink);
      expect(body.version).toBe("v2");
      expect(body.url).toBe(`${baseUrl}/d/${shortlink}/v2`);
      expect(body.embed).toBe(`${baseUrl}/e/${shortlink}/v2`);
    });

    it("POST /render with shortlink + named version works", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; Final-->Version;",
          format: "mermaid",
          shortlink,
          version: "final",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as CreateResponse;
      expect(body.version).toBe("final");
    });

    it("POST /render with duplicate version name returns 409", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; Duplicate;",
          format: "mermaid",
          shortlink,
          version: "final",
        }),
      });

      expect(res.status).toBe(409);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("already exists");
    });

    it("POST /render with mismatched format returns 400", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "a -> b",
          format: "d2",
          shortlink,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("Format mismatch");
    });

    it("POST /render with reserved name v3 returns 400", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; A;",
          format: "mermaid",
          shortlink,
          version: "v3",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("reserved");
    });

    it("POST /render with version but no shortlink returns 400", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; A;",
          format: "mermaid",
          version: "test",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("version requires shortlink");
    });

    it("POST /render with nonexistent shortlink returns 404", async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; A;",
          format: "mermaid",
          shortlink: "nonexist",
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("not found");
    });

    it("bare shortlink redirects to latest version (named)", async () => {
      // After adding v1, v2, "final" — latest should be "final"
      const res = await fetch(`${baseUrl}/d/${shortlink}`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(`/d/${shortlink}/final`);
    });

    it("versioned view shows version picker for multi-version diagram", async () => {
      const res = await fetch(`${baseUrl}/d/${shortlink}/v1`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("version-picker");
      expect(html).toContain("compare-btn");
    });
  });

  describe("Version API endpoints", () => {
    let shortlink: string;

    beforeAll(async () => {
      const res = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; API1-->API2;",
          format: "mermaid",
        }),
      });
      const body = await res.json() as CreateResponse;
      shortlink = body.shortlink;

      // Add a second version
      await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          source: "graph TD; API1-->API2-->API3;",
          format: "mermaid",
          shortlink,
        }),
      });
    });

    it("GET /api/d/:shortlink/versions returns version list", async () => {
      const res = await fetch(`${baseUrl}/api/d/${shortlink}/versions`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-cache");

      const body = await res.json() as { shortlink: string; format: string; versions: Array<{ name: string; auto: boolean }> };
      expect(body.shortlink).toBe(shortlink);
      expect(body.format).toBe("mermaid");
      expect(body.versions).toHaveLength(2);
      expect(body.versions[0].name).toBe("v1");
      expect(body.versions[0].auto).toBe(true);
      expect(body.versions[1].name).toBe("v2");
    });

    it("GET /api/d/:shortlink/versions does not require auth", async () => {
      const res = await fetch(`${baseUrl}/api/d/${shortlink}/versions`);
      expect(res.status).toBe(200);
    });

    it("GET /api/d/:shortlink/versions/v1/source returns source", async () => {
      const res = await fetch(`${baseUrl}/api/d/${shortlink}/versions/v1/source`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");

      const body = await res.json() as { source: string; format: string };
      expect(body.source).toBe("graph TD; API1-->API2;");
      expect(body.format).toBe("mermaid");
    });

    it("GET /api/d/nonexist/versions returns 404", async () => {
      const res = await fetch(`${baseUrl}/api/d/nonexist/versions`);
      expect(res.status).toBe(404);
    });

    it("GET /api/d/:shortlink/versions/nonexist/source returns 404", async () => {
      const res = await fetch(`${baseUrl}/api/d/${shortlink}/versions/nonexist/source`);
      expect(res.status).toBe(404);
    });
  });

  describe("Embed versioned", () => {
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

    it("GET /e/:shortlink redirects to latest version", async () => {
      const res = await fetch(`${baseUrl}/e/${shortlink}`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(`/e/${shortlink}/v1`);
      expect(res.headers.get("Cache-Control")).toBe("no-cache");
    });

    it("GET /e/:shortlink/:version returns SVG with immutable cache", async () => {
      const res = await fetch(`${baseUrl}/e/${shortlink}/v1`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");

      const svg = await res.text();
      expect(svg).toContain("<svg");
    });
  });

  describe("Diff endpoints", () => {
    it("POST /diff without auth returns 401", async () => {
      const res = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "mermaid",
          before: "graph TD; A-->B;",
          after: "graph TD; A-->B-->C;",
        }),
      });
      expect(res.status).toBe(401);
    });

    it("POST /diff with missing before returns 400", async () => {
      const res = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          format: "mermaid",
          after: "graph TD; A-->B;",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("before");
    });

    it("POST /diff with missing after returns 400", async () => {
      const res = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          format: "mermaid",
          before: "graph TD; A-->B;",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("after");
    });

    it("POST /diff creates mermaid diff and returns shortlink", async () => {
      const res = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          format: "mermaid",
          before: "graph TD; A-->B;",
          after: "graph TD; A-->B-->C;",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { shortlink: string; url: string };
      expect(body.shortlink).toMatch(/^[a-f0-9]{8}$/);
      expect(body.url).toBe(`${baseUrl}/diff/${body.shortlink}`);
    });

    it("GET /diff/:shortlink returns HTML with side-by-side view", async () => {
      // Create a diff first
      const createRes = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          format: "mermaid",
          before: "graph TD; X-->Y;",
          after: "graph TD; X-->Y-->Z;",
        }),
      });
      const createBody = await createRes.json() as { shortlink: string };

      // View the diff
      const viewRes = await fetch(`${baseUrl}/diff/${createBody.shortlink}`);

      expect(viewRes.status).toBe(200);
      expect(viewRes.headers.get("Content-Type")).toBe("text/html");

      const html = await viewRes.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Before");
      expect(html).toContain("After");
      expect(html).toContain("diff-container");
    });

    it("GET /diff/:shortlink has cache headers", async () => {
      const createRes = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          format: "mermaid",
          before: "graph TD; Cache-->Test;",
          after: "graph TD; Cache-->Test-->Done;",
        }),
      });
      const createBody = await createRes.json() as { shortlink: string };

      const viewRes = await fetch(`${baseUrl}/diff/${createBody.shortlink}`);

      expect(viewRes.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    });

    it("GET /diff/nonexistent returns 404", async () => {
      const res = await fetch(`${baseUrl}/diff/nonexist`);
      expect(res.status).toBe(404);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("not found");
    });

    it("POST /diff with d2 format validates syntax", async () => {
      const res = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          format: "d2",
          before: "a -> b",
          after: "a -> b -> c",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { shortlink: string; url: string };
      expect(body.shortlink).toMatch(/^[a-f0-9]{8}$/);
    });
  });
});
