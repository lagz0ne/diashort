import { tag } from "@pumped-fn/lite";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface CacheConfig {
  ttlMs: number;
  gcIntervalMs: number;
}

export interface QueueConfig {
  maxConcurrent: number;
  maxWaiting: number;
}

export interface JobConfig {
  dbPath: string;
  pollIntervalMs: number;
  retentionMs: number;
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

export const cacheConfigTag = tag<CacheConfig>({
  label: "cache-config",
  default: { ttlMs: 300000, gcIntervalMs: 60000 },
});

export const queueConfigTag = tag<QueueConfig>({
  label: "queue-config",
  default: { maxConcurrent: 10, maxWaiting: 50 },
});

export const jobConfigTag = tag<JobConfig>({
  label: "job-config",
  default: {
    dbPath: "./data/jobs.db",
    pollIntervalMs: 100,
    retentionMs: 3600000,
    cleanupIntervalMs: 60000,
  },
});

export const browserPoolSizeTag = tag<number>({
  label: "browser-pool-size",
  default: 10,
});

export type SpawnFn = typeof Bun.spawn;

export const spawnFnTag = tag({
  label: "spawn-fn",
  default: Bun.spawn,
});

export const requestIdTag = tag<string>({
  label: "request-id",
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

  const cacheTtl = parseNumber(env, "CACHE_TTL", 300000);
  const cacheGcInterval = parseNumber(env, "CACHE_GC_INTERVAL", 60000);

  const queueMaxConcurrent = parseNumber(env, "QUEUE_MAX_CONCURRENT", 10);
  const queueMaxWaiting = parseNumber(env, "QUEUE_MAX_WAITING", 50);

  const browserPoolSize = parseNumber(env, "BROWSER_POOL_SIZE", queueMaxConcurrent);

  const jobDbPath = getEnv(env, "JOB_DB_PATH") ?? "./data/jobs.db";
  const jobPollInterval = parseNumber(env, "JOB_POLL_INTERVAL_MS", 100);
  const jobRetention = parseNumber(env, "JOB_RETENTION_MS", 3600000);
  const jobCleanupInterval = parseNumber(env, "JOB_CLEANUP_INTERVAL_MS", 60000);

  return [
    logLevelTag(logLevel),
    nodeEnvTag(nodeEnv),
    serverPortTag(serverPort),
    authEnabledTag(authEnabled),
    authCredentialsTag(authCredentials),
    cacheConfigTag({ ttlMs: cacheTtl, gcIntervalMs: cacheGcInterval }),
    queueConfigTag({ maxConcurrent: queueMaxConcurrent, maxWaiting: queueMaxWaiting }),
    browserPoolSizeTag(browserPoolSize),
    jobConfigTag({
      dbPath: jobDbPath,
      pollIntervalMs: jobPollInterval,
      retentionMs: jobRetention,
      cleanupIntervalMs: jobCleanupInterval,
    }),
  ];
}
