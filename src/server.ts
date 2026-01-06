import { createScope, type Lite, atom, tags } from "@pumped-fn/lite";
import { loadConfigTags, serverPortTag, authCredentialsTag, authEnabledTag, requestIdTag, diagramConfigTag, requestOriginTag } from "./config/tags";
import { AuthError } from "./extensions/auth";
import { createFlow, ValidationError } from "./flows/create";
import { viewFlow, NotFoundError } from "./flows/view";
import { loggerAtom } from "./atoms/logger";
import { diagramStoreAtom } from "./atoms/diagram-store";

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

  // Start cleanup interval
  const cleanupInterval = setInterval(() => {
    diagramStore.cleanup();
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

            return new Response(JSON.stringify({ shortlink: result.shortlink, url: result.url }), {
              status: 200,
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
              flow: viewFlow,
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

Stores Mermaid or D2 diagram source and returns a shareable shortlink.
Diagrams render client-side in the browser.

## Authentication

${authNote}

To enable: Set AUTH_ENABLED=true, AUTH_USER, and AUTH_PASS environment variables.

## Endpoints

### POST /render
Submit a diagram for storage.

Request:
  curl -X POST ${url.origin}/render \\${curlAuth}
    -H "Content-Type: application/json" \\
    -d '{"source": "graph TD; A-->B;", "format": "mermaid"}'

Response:
  {"shortlink": "abc12345", "url": "${url.origin}/d/abc12345"}

Parameters:
  - source: Diagram source code (required)
  - format: "mermaid" or "d2" (required)

### GET /d/:shortlink
View the diagram (returns HTML page that renders client-side).

Example:
  Open in browser: ${url.origin}/d/abc12345

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
