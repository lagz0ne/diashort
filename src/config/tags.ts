import { tag, type Lite } from "@pumped-fn/lite";
import { z } from "zod";

// Schema for validating BASE_URL - must be a valid URL without trailing slash
const baseUrlSchema = z
  .string()
  .url("BASE_URL must be a valid URL")
  .refine((url) => !url.endsWith("/"), {
    message: "BASE_URL must not end with a trailing slash",
  })
  .refine((url) => url.startsWith("http://") || url.startsWith("https://"), {
    message: "BASE_URL must start with http:// or https://",
  });

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface DiagramConfig {
  dbPath: string;
  retentionDays: number;
  cleanupIntervalMs: number;
}

export interface MermaidConfig {
  executablePath: string;
  dbPath: string;
  poolSize?: number;
  timeout?: number;
  /** Enable --no-sandbox for containerized environments. SECURITY: Opt-in only */
  noSandbox?: boolean;
  maxQueueSize?: number;
}

export const logLevelTag = tag<LogLevel>({
  label: "log-level",
  default: "info",
});

export const nodeEnvTag = tag<string>({
  label: "node-env",
  default: "development",
});

export const serverPortTag = tag<number>({
  label: "server-port",
  default: 3000,
});

export const authEnabledTag = tag<boolean>({
  label: "auth-enabled",
  default: false,
});

export const authCredentialsTag = tag<AuthCredentials | null>({
  label: "auth-credentials",
  default: null,
});

export const baseUrlTag = tag<string>({
  label: "base-url",
  default: "",
});

export const diagramConfigTag = tag<DiagramConfig>({
  label: "diagram-config",
  default: {
    dbPath: "./data/diagrams.db",
    retentionDays: 30,
    cleanupIntervalMs: 86400000, // daily
  },
});

export const mermaidConfigTag = tag<MermaidConfig>({
  label: "mermaid-config",
});

export const requestIdTag = tag<string>({
  label: "request-id",
});

export const requestOriginTag = tag<string>({
  label: "request-origin",
  default: "",
});

function getEnv(
  env: Record<string, string | undefined>,
  key: string
): string | undefined {
  const value = env[key];
  return value === "" ? undefined : value;
}

function requireEnv(
  env: Record<string, string | undefined>,
  key: string
): string {
  const value = getEnv(env, key);
  if (value === undefined) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function parseNumber(
  env: Record<string, string | undefined>,
  key: string,
  defaultValue: number
): number {
  const value = getEnv(env, key);
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`${key} must be a valid number`);
  }
  return parsed;
}

function parseLogLevel(env: Record<string, string | undefined>): LogLevel {
  const value = getEnv(env, "LOG_LEVEL");
  if (value === undefined) {
    return "info";
  }
  if (!["debug", "info", "warn", "error"].includes(value)) {
    return "info";
  }
  return value as LogLevel;
}

function parseBool(
  env: Record<string, string | undefined>,
  key: string,
  defaultValue: boolean
): boolean {
  const value = getEnv(env, key);
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === "true" || value === "1";
}

export function loadConfigTags(
  env: Record<string, string | undefined>
) {
  const authEnabled = parseBool(env, "AUTH_ENABLED", false);

  let authCredentials: AuthCredentials | null = null;
  if (authEnabled) {
    const username = requireEnv(env, "AUTH_USER");
    const password = requireEnv(env, "AUTH_PASS");
    authCredentials = { username, password };
  }

  const logLevel = parseLogLevel(env);
  const nodeEnv = getEnv(env, "NODE_ENV") ?? "development";
  const serverPort = parseNumber(env, "PORT", 3000);

  // Validate BASE_URL if provided
  let baseUrl = "";
  const rawBaseUrl = getEnv(env, "BASE_URL");
  if (rawBaseUrl) {
    const result = baseUrlSchema.safeParse(rawBaseUrl);
    if (!result.success) {
      const issues = result.error.issues;
      throw new Error(`Invalid BASE_URL: ${issues[0]?.message ?? "validation failed"}`);
    }
    baseUrl = result.data;
  }

  const diagramDbPath = getEnv(env, "DIAGRAM_DB_PATH") ?? "./data/diagrams.db";
  const diagramRetentionDays = parseNumber(env, "DIAGRAM_RETENTION_DAYS", 30);
  const cleanupIntervalMs = parseNumber(env, "CLEANUP_INTERVAL_MS", 86400000);

  // Mermaid renderer config (optional - only needed for mermaid SSR)
  const chromePath = getEnv(env, "CHROME_PATH");
  const mermaidConfig: MermaidConfig | undefined = chromePath ? {
    executablePath: chromePath,
    dbPath: getEnv(env, "MERMAID_DB_PATH") ?? "./data/mermaid-queue.db",
    poolSize: parseNumber(env, "MERMAID_POOL_SIZE", 2),
    timeout: parseNumber(env, "MERMAID_TIMEOUT", 30000),
    noSandbox: parseBool(env, "MERMAID_NO_SANDBOX", true),
    maxQueueSize: parseNumber(env, "MERMAID_MAX_QUEUE", 1000),
  } : undefined;

  const tags: Lite.Tagged<any>[] = [
    logLevelTag(logLevel),
    nodeEnvTag(nodeEnv),
    serverPortTag(serverPort),
    authEnabledTag(authEnabled),
    authCredentialsTag(authCredentials),
    baseUrlTag(baseUrl),
    diagramConfigTag({
      dbPath: diagramDbPath,
      retentionDays: diagramRetentionDays,
      cleanupIntervalMs,
    }),
  ];

  // Only add mermaid config if Chrome is available
  if (mermaidConfig) {
    tags.push(mermaidConfigTag(mermaidConfig));
  }

  return tags;
}
