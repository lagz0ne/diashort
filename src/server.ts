import { createScope, type Lite, atom, tags } from "@pumped-fn/lite";
import { loadConfigTags, serverPortTag, authCredentialsTag, authEnabledTag, requestIdTag, diagramConfigTag, requestOriginTag } from "./config/tags";
import { optionalMermaidRendererAtom } from "./atoms/mermaid-renderer";
import { AuthError } from "./extensions/auth";
import { createFlow, ValidationError, ConflictError } from "./flows/create";
import { viewFlow, NotFoundError } from "./flows/view";
import { embedFlow, EmbedNotSupportedError, EmbedRenderError } from "./flows/embed";
import { createDiffFlow, viewDiffFlow, DiffValidationError, DiffNotFoundError } from "./flows/diff";
import { loggerAtom } from "./atoms/logger";
import { diagramStoreAtom, DiagramNotFoundError } from "./atoms/diagram-store";
import { diffStoreAtom } from "./atoms/diff-store";

const serverConfigAtom = atom({
  deps: {
    serverPort: tags.required(serverPortTag),
  },
  factory: (_ctx, { serverPort }) => serverPort,
});

const authConfigAtom = atom({
  deps: {
    enabled: tags.required(authEnabledTag),
    credentials: tags.required(authCredentialsTag),
  },
  factory: (_ctx, { enabled, credentials }) => ({ enabled, credentials }),
});

function checkBasicAuth(
  authHeader: string | null,
  expectedUsername: string,
  expectedPassword: string
): string {
  if (!authHeader) {
    throw new AuthError("Missing Authorization header");
  }

  if (!authHeader.startsWith("Basic ")) {
    throw new AuthError("Invalid authorization scheme");
  }

  const base64Credentials = authHeader.slice(6);
  let decoded: string;
  try {
    decoded = atob(base64Credentials);
  } catch {
    throw new AuthError("Invalid base64 encoding");
  }

  const colonIndex = decoded.indexOf(":");
  if (colonIndex === -1) {
    throw new AuthError("Invalid credentials format");
  }

  const username = decoded.slice(0, colonIndex);
  const password = decoded.slice(colonIndex + 1);

  if (username !== expectedUsername || password !== expectedPassword) {
    throw new AuthError("Invalid credentials");
  }

  return username;
}

function mapErrorToResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 401,
      headers: { "Content-Type": "application/json", "WWW-Authenticate": "Basic realm=\"diashort\"" },
    });
  }

  if (error instanceof ConflictError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (error instanceof ValidationError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parseError = error as { name?: string; cause?: { statusCode?: number; message?: string } };
  if (parseError.name === "ParseError" && parseError.cause?.statusCode) {
    return new Response(JSON.stringify({ error: parseError.cause.message ?? "Invalid input" }), {
      status: parseError.cause.statusCode,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (error instanceof NotFoundError || error instanceof DiagramNotFoundError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (error instanceof EmbedNotSupportedError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (error instanceof EmbedRenderError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.statusCode,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (error instanceof DiffValidationError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (error instanceof DiffNotFoundError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

export async function startServer(): Promise<{ server: ReturnType<typeof Bun.serve>; scope: Lite.Scope }> {
  const configTags = loadConfigTags(process.env);

  const scope = createScope({
    tags: configTags,
  });

  const port = await scope.resolve(serverConfigAtom);
  const logger = await scope.resolve(loggerAtom);
  const authConfig = await scope.resolve(authConfigAtom);
  const diagramConfig = await scope.resolve(atom({
    deps: { config: tags.required(diagramConfigTag) },
    factory: (_ctx, { config }) => config,
  }));

  // Resolve diagram store to initialize DB
  const diagramStore = await scope.resolve(diagramStoreAtom);
  const diffStore = await scope.resolve(diffStoreAtom);

  // Resolve mermaid renderer if configured (fail-fast check)
  // Uses optionalMermaidRendererAtom which is the same atom used by embedFlow
  const mermaidRenderer = await scope.resolve(optionalMermaidRendererAtom);
  if (mermaidRenderer) {
    logger.info("Mermaid SSR enabled");
  }

  // Start cleanup interval
  const cleanupInterval = setInterval(() => {
    diagramStore.cleanup();
    diffStore.cleanup();
  }, diagramConfig.cleanupIntervalMs);

  logger.info({ port }, "Starting server");

  const server = Bun.serve({
    port,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const requestId = crypto.randomUUID();

      try {
        if (req.method === "POST" && url.pathname === "/render") {
          if (authConfig.enabled && authConfig.credentials) {
            const authHeader = req.headers.get("authorization");
            checkBasicAuth(authHeader, authConfig.credentials.username, authConfig.credentials.password);
          }

          const body = await req.json();

          const ctx = scope.createContext({ tags: [requestIdTag(requestId), requestOriginTag(url.origin)] });

          try {
            const result = await ctx.exec({
              flow: createFlow,
              rawInput: body,
            });

            const responseBody: Record<string, string> = {
              shortlink: result.shortlink,
              url: result.url,
              version: result.version,
            };
            if (result.embed) {
              responseBody.embed = result.embed;
            }

            return new Response(JSON.stringify(responseBody), {
              status: 200,
              headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
            });
          } finally {
            await ctx.close();
          }
        }

        if (req.method === "POST" && url.pathname === "/diff") {
          if (authConfig.enabled && authConfig.credentials) {
            const authHeader = req.headers.get("authorization");
            checkBasicAuth(authHeader, authConfig.credentials.username, authConfig.credentials.password);
          }

          const body = await req.json();

          const ctx = scope.createContext({ tags: [requestIdTag(requestId), requestOriginTag(url.origin)] });

          try {
            const result = await ctx.exec({
              flow: createDiffFlow,
              rawInput: body,
            });

            return new Response(JSON.stringify({ shortlink: result.shortlink, url: result.url }), {
              status: 200,
              headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
            });
          } finally {
            await ctx.close();
          }
        }

        if (req.method === "GET" && url.pathname.startsWith("/d/")) {
          const pathAfter = url.pathname.slice(3); // e.g. "abc123" or "abc123/v1"
          const slashIndex = pathAfter.indexOf("/");
          const shortlink = slashIndex === -1 ? pathAfter : pathAfter.slice(0, slashIndex);
          const versionName = slashIndex === -1 ? undefined : pathAfter.slice(slashIndex + 1);

          const ctx = scope.createContext({ tags: [requestIdTag(requestId), requestOriginTag(url.origin)] });

          try {
            const result = await ctx.exec({
              flow: viewFlow,
              input: { shortlink, versionName },
            });

            if (result.redirect) {
              return new Response(null, {
                status: 302,
                headers: {
                  "Location": result.redirect,
                  "Cache-Control": "no-cache",
                  "X-Request-Id": requestId,
                },
              });
            }

            return new Response(result.html, {
              status: 200,
              headers: {
                "Content-Type": result.contentType,
                "X-Request-Id": requestId,
                "Cache-Control": "public, max-age=31536000, immutable",
              },
            });
          } finally {
            await ctx.close();
          }
        }

        if (req.method === "GET" && url.pathname.startsWith("/e/")) {
          const pathAfter = url.pathname.slice(3);
          const slashIndex = pathAfter.indexOf("/");
          const shortlink = slashIndex === -1 ? pathAfter : pathAfter.slice(0, slashIndex);
          const versionName = slashIndex === -1 ? undefined : pathAfter.slice(slashIndex + 1);
          const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";

          const ctx = scope.createContext({ tags: [requestIdTag(requestId)] });

          try {
            const result = await ctx.exec({
              flow: embedFlow,
              input: { shortlink, versionName, theme },
            });

            if (result.redirect) {
              return new Response(null, {
                status: 302,
                headers: {
                  "Location": result.redirect,
                  "Cache-Control": "no-cache",
                  "X-Request-Id": requestId,
                },
              });
            }

            return new Response(result.svg, {
              status: 200,
              headers: {
                "Content-Type": result.contentType,
                "X-Request-Id": requestId,
                "Cache-Control": "public, max-age=31536000, immutable",
              },
            });
          } finally {
            await ctx.close();
          }
        }

        if (req.method === "GET" && url.pathname.startsWith("/diff/")) {
          const shortlink = url.pathname.slice(6);

          const ctx = scope.createContext({ tags: [requestIdTag(requestId), requestOriginTag(url.origin)] });

          try {
            const result = await ctx.exec({
              flow: viewDiffFlow,
              input: { shortlink },
            });

            return new Response(result.html, {
              status: 200,
              headers: {
                "Content-Type": result.contentType,
                "X-Request-Id": requestId,
                "Cache-Control": "public, max-age=31536000, immutable",
              },
            });
          } finally {
            await ctx.close();
          }
        }

        // Version API endpoints (no auth required)
        if (req.method === "GET" && url.pathname.startsWith("/api/d/")) {
          const pathAfter = url.pathname.slice(7); // after "/api/d/"

          // /api/d/:shortlink/versions/:versionName/source
          const sourceMatch = pathAfter.match(/^([^/]+)\/versions\/([^/]+)\/source$/);
          if (sourceMatch) {
            const shortlink = sourceMatch[1]!;
            const versionName = sourceMatch[2]!;
            const versionData = diagramStore.getVersionSource(shortlink, versionName);
            if (!versionData) {
              return new Response(JSON.stringify({ error: "Version not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
              });
            }
            return new Response(JSON.stringify({ source: versionData.source, format: versionData.format }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-Request-Id": requestId,
                "Cache-Control": "public, max-age=31536000, immutable",
              },
            });
          }

          // /api/d/:shortlink/versions
          const versionsMatch = pathAfter.match(/^([^/]+)\/versions$/);
          if (versionsMatch) {
            const shortlink = versionsMatch[1]!;
            const diagram = diagramStore.get(shortlink);
            if (!diagram) {
              return new Response(JSON.stringify({ error: "Diagram not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
              });
            }
            const versions = diagramStore.listVersions(shortlink);
            return new Response(JSON.stringify({ shortlink, format: diagram.format, versions }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-Request-Id": requestId,
                "Cache-Control": "no-cache",
              },
            });
          }
        }

        if (req.method === "GET" && url.pathname === "/health") {
          return new Response(JSON.stringify({ status: "ok" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (req.method === "GET" && url.pathname === "/") {
          const usage = `# Diashort - Diagram Shortlink Service

Stores Mermaid or D2 diagram source and returns a shareable shortlink.
Diagrams render client-side in the browser. Supports multiple versions per shortlink.

## Endpoints

### POST /render
Submit a diagram for storage. Optionally add a version to an existing shortlink.

Request (new diagram):
  curl -X POST ${url.origin}/render \\
    -H "Content-Type: application/json" \\
    -d '{"source": "A -> B -> C", "format": "d2"}'

Response:
  {"shortlink": "abc12345", "url": "${url.origin}/d/abc12345", "embed": "${url.origin}/e/abc12345", "version": "v1"}

Request (add version to existing):
  curl -X POST ${url.origin}/render \\
    -H "Content-Type: application/json" \\
    -d '{"source": "A -> B -> C -> D", "format": "d2", "shortlink": "abc12345"}'

Response:
  {"shortlink": "abc12345", "url": "${url.origin}/d/abc12345/v2", "embed": "${url.origin}/e/abc12345/v2", "version": "v2"}

Parameters:
  - source: Diagram source code (required)
  - format: "mermaid" or "d2" (required)
  - shortlink: Existing shortlink to add version to (optional)
  - version: Custom version name (optional, requires shortlink)

Version naming:
  - Auto-generated as v1, v2, etc. when not specified
  - Custom names must start with a letter (e.g. "draft-1", "final")
  - Names matching vN (e.g. v1, v2) are reserved for auto-naming
  - Versions are immutable once created (409 on duplicate)

### GET /d/:shortlink
Redirects (302) to the latest version: /d/:shortlink/:latestVersion

### GET /d/:shortlink/:version
View a specific version (returns HTML page with interactive viewer).
Includes version picker and compare overlay when multiple versions exist.

Example:
  Open in browser: ${url.origin}/d/abc12345/v1

### GET /e/:shortlink
Redirects (302) to the latest version embed.

### GET /e/:shortlink/:version
Get raw SVG for a specific version (D2 and Mermaid).

Use in markdown:
  ![Diagram](${url.origin}/e/abc12345/v1)

Query parameters:
  - theme: "light" (default) or "dark" (D2 only, mermaid uses default theme)

Note: Mermaid SSR requires CHROME_PATH to be configured.

### GET /api/d/:shortlink/versions
List all versions of a diagram.

Response:
  {"shortlink": "abc12345", "format": "d2", "versions": [{"name": "v1", "createdAt": 1707177600000, "auto": true}]}

### GET /api/d/:shortlink/versions/:version/source
Get the raw source of a specific version.

Response:
  {"source": "A -> B -> C", "format": "d2"}

### POST /diff
Create a side-by-side comparison of two diagrams.

Request:
  curl -X POST ${url.origin}/diff \\
    -H "Content-Type: application/json" \\
    -d '{"format": "mermaid", "before": "graph TD; A-->B;", "after": "graph TD; A-->B-->C;"}'

Response:
  {"shortlink": "xyz78901", "url": "${url.origin}/diff/xyz78901"}

Parameters:
  - format: "mermaid" or "d2" (required)
  - before: Source code for the "before" diagram (required)
  - after: Source code for the "after" diagram (required)

### GET /diff/:shortlink
View the side-by-side comparison with synced zoom/pan.

Example:
  Open in browser: ${url.origin}/diff/xyz78901

Query parameters:
  - layout: "horizontal" (default, side-by-side) or "vertical" (top-to-bottom)

Example with vertical layout:
  ${url.origin}/diff/xyz78901?layout=vertical

### GET /health
Health check endpoint.

Example:
  curl ${url.origin}/health
`;
          return new Response(usage, {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }

        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        logger.error({ error, requestId, path: url.pathname }, "Request error");
        return mapErrorToResponse(error);
      }
    },
  });

  logger.info({ port }, "Server started");

  return { server, scope };
}

async function main(): Promise<void> {
  const { server, scope } = await startServer();

  const shutdown = async () => {
    console.log("Shutting down...");
    server.stop();
    await scope.dispose();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}
