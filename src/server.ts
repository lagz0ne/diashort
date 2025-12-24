import { createScope, type Lite, atom, tags } from "@pumped-fn/lite";
import { loadConfigTags, serverPortTag, authCredentialsTag, authEnabledTag, requestIdTag, baseUrlTag } from "./config/tags";
import { AuthError } from "./extensions/auth";
import { renderFlow, ValidationError, BackpressureError, RenderError } from "./flows/render";
import { retrieveFlow, NotFoundError } from "./flows/retrieve";
import { asyncRenderFlow } from "./flows/render-async";
import { jobStatusFlow, JobNotFoundError } from "./flows/job-status";
import { loggerAtom } from "./atoms/logger";
import { browserPoolAtom } from "./atoms/browser-pool";
import { jobProcessorAtom } from "./atoms/job-processor";

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

  if (error instanceof NotFoundError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (error instanceof JobNotFoundError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (error instanceof BackpressureError) {
    return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "5" },
    });
  }

  if (error instanceof RenderError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
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

  // Extract baseUrl using seekTag for consistency with flows
  const tempCtx = scope.createContext();
  const baseUrl = tempCtx.data.seekTag(baseUrlTag) ?? "";
  await tempCtx.close();

  // Warm up browser pool for fast first requests
  const browserPool = await scope.resolve(browserPoolAtom);
  logger.info("Warming up browser pool...");
  await browserPool.warmUp();
  logger.info("Browser pool ready");

  // Start job processor
  const jobProcessor = await scope.resolve(jobProcessorAtom);
  logger.info("Job processor started");

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
          const mode = url.searchParams.get("mode");

          const ctx = scope.createContext({ tags: [requestIdTag(requestId)] });

          try {
            // Sync mode: use renderFlow for blocking render
            if (mode === "sync") {
              const result = await ctx.exec({
                flow: renderFlow,
                rawInput: body,
              });

              return new Response(JSON.stringify({ shortlink: result.shortlink, url: `${baseUrl}/d/${result.shortlink}`, cached: result.cached }), {
                status: 200,
                headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
              });
            }

            // Async mode (default): use asyncRenderFlow
            const result = await ctx.exec({
              flow: asyncRenderFlow,
              rawInput: body,
            });

            // Cache hit - return 200 with shortlink
            if (result.mode === "sync") {
              return new Response(JSON.stringify({ shortlink: result.shortlink, url: `${baseUrl}/d/${result.shortlink}`, cached: result.cached }), {
                status: 200,
                headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
              });
            }

            // Job created - return 202 with job info
            return new Response(JSON.stringify({
              jobId: result.jobId,
              status: result.status,
              statusUrl: result.statusUrl,
            }), {
              status: 202,
              headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
            });
          } finally {
            await ctx.close();
          }
        }

        if (req.method === "GET" && url.pathname.startsWith("/d/")) {
          const shortlink = url.pathname.slice(3);

          const ctx = scope.createContext({ tags: [requestIdTag(requestId)] });

          try {
            const result = await ctx.exec({
              flow: retrieveFlow,
              input: { shortlink },
            });

            return new Response(result.data, {
              status: 200,
              headers: {
                "Content-Type": result.contentType,
                "X-Request-Id": requestId,
                "Cache-Control": "public, max-age=300",
              },
            });
          } finally {
            await ctx.close();
          }
        }

        if (req.method === "GET" && url.pathname.startsWith("/jobs/")) {
          const jobId = url.pathname.slice(6);

          const ctx = scope.createContext({ tags: [requestIdTag(requestId)] });

          try {
            const result = await ctx.exec({
              flow: jobStatusFlow,
              rawInput: { jobId },
            });

            return new Response(JSON.stringify(result), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-Request-Id": requestId,
              },
            });
          } finally {
            await ctx.close();
          }
        }

        if (req.method === "GET" && url.pathname === "/health") {
          return new Response(JSON.stringify({ status: "ok" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (req.method === "GET" && url.pathname === "/") {
          const authNote = authConfig.enabled
            ? `Authentication is ENABLED. Include -u "username:password" in requests.`
            : `Authentication is DISABLED. No credentials required.`;
          const curlAuth = authConfig.enabled ? `\n    -u "username:password" \\` : "";

          const usage = `# Diashort - Diagram Shortlink Service

Render Mermaid or D2 diagrams and get a shareable shortlink.

## Authentication

${authNote}

To enable: Set AUTH_ENABLED=true, AUTH_USER, and AUTH_PASS environment variables.

## Endpoints

### POST /render
Render a diagram and get a shortlink.

Request:
  curl -X POST ${url.origin}/render \\${curlAuth}
    -H "Content-Type: application/json" \\
    -d '{"source": "graph TD; A-->B;", "format": "mermaid", "outputType": "svg"}'

Response:
  {"shortlink": "abc12345", "url": "/d/abc12345"}

Parameters:
  - source: Diagram source code (required)
  - format: "mermaid" or "d2" (required)
  - outputType: "svg" or "png" (default: "svg")

### GET /d/:shortlink
Retrieve a rendered diagram by its shortlink.

Example:
  curl ${url.origin}/d/abc12345

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
