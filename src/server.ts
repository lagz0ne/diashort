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
          const usage = `Diashort — Diagram shortlink service (Mermaid & D2)

POST /render  Create diagram or add version to existing shortlink
  {"source": "...", "format": "mermaid|d2", "shortlink?": "...", "version?": "..."}
  -> {"shortlink", "url", "embed", "version"}
  Versions auto-name as v1, v2... or use custom names (must start with letter, vN reserved)

GET  /d/:id            302 -> /d/:id/:latest
GET  /d/:id/:version   View diagram (HTML viewer with zoom/pan, version picker, compare)
GET  /e/:id            302 -> /e/:id/:latest
GET  /e/:id/:version   Raw SVG embed (?theme=light|dark)

GET  /api/d/:id/versions              List versions (JSON)
GET  /api/d/:id/versions/:v/source    Get version source (JSON)

POST /diff  Compare two diagrams side-by-side
  {"format": "mermaid|d2", "before": "...", "after": "..."}
GET  /diff/:id  View diff (?layout=horizontal|vertical)

GET  /health

Try it:
  curl -X POST ${url.origin}/render -H "Content-Type: application/json" -d '{"source":"graph TD; A-->B","format":"mermaid"}'
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
