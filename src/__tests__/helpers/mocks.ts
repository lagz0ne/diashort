/**
 * Test helper: Common mocks for testing
 */
import { atom } from "@pumped-fn/lite";
import pino from "pino";

/**
 * Silent logger for tests - no output
 */
export const silentLogger = pino({ level: "silent" });

/**
 * Mock logger atom - returns silent logger
 * Use as preset: preset(loggerAtom, mockLoggerAtom)
 */
export const mockLoggerAtom = atom({
  factory: () => silentLogger,
});

/**
 * Capture logs for assertion
 */
export function createCapturingLogger() {
  const logs: { level: string; msg: string; [key: string]: unknown }[] = [];
  
  const logger = {
    debug: (obj: unknown, msg?: string) => logs.push({ level: "debug", msg: msg ?? String(obj), ...((typeof obj === 'object' && obj) || {}) }),
    info: (obj: unknown, msg?: string) => logs.push({ level: "info", msg: msg ?? String(obj), ...((typeof obj === 'object' && obj) || {}) }),
    warn: (obj: unknown, msg?: string) => logs.push({ level: "warn", msg: msg ?? String(obj), ...((typeof obj === 'object' && obj) || {}) }),
    error: (obj: unknown, msg?: string) => logs.push({ level: "error", msg: msg ?? String(obj), ...((typeof obj === 'object' && obj) || {}) }),
    child: () => logger,
    level: "debug",
  };

  return { logger, logs };
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 1000,
  intervalMs = 10
): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Delay helper
 */
export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
