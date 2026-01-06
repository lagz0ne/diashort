import { tag } from "@pumped-fn/lite";

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
  const baseUrl = getEnv(env, "BASE_URL") ?? "";

  const diagramDbPath = getEnv(env, "DIAGRAM_DB_PATH") ?? "./data/diagrams.db";
  const diagramRetentionDays = parseNumber(env, "DIAGRAM_RETENTION_DAYS", 30);
  const cleanupIntervalMs = parseNumber(env, "CLEANUP_INTERVAL_MS", 86400000);

  return [
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
}
