import { atom, tags } from "@pumped-fn/lite";
import { browserPoolSizeTag } from "../config/tags";
import { loggerAtom } from "./logger";
import type { Browser } from "puppeteer";

export interface BrowserPool {
  acquire(): Promise<Browser>;
  release(browser: Browser): void;
  warmUp(): Promise<void>;
  shutdown(): Promise<void>;
}

export const browserPoolAtom = atom({
  deps: {
    poolSize: tags.required(browserPoolSizeTag),
    logger: loggerAtom,
  },
  factory: (ctx, { poolSize, logger }): BrowserPool => {
    const pool: Browser[] = [];
    const waiting: Array<(browser: Browser) => void> = [];
    let launched = 0;

    const launchBrowser = async (): Promise<Browser> => {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      logger.debug("Launched new browser instance");
      return browser;
    };

    const acquire = async (): Promise<Browser> => {
      if (pool.length > 0) {
        const browser = pool.pop()!;
        logger.debug({ poolSize: pool.length }, "Acquired browser from pool");
        return browser;
      }

      if (launched < poolSize) {
        launched++;
        try {
          const browser = await launchBrowser();
          return browser;
        } catch (error) {
          launched--;
          throw error;
        }
      }

      return new Promise((resolve) => {
        waiting.push(resolve);
        logger.debug({ waitingCount: waiting.length }, "Waiting for browser");
      });
    };

    const release = (browser: Browser): void => {
      if (waiting.length > 0) {
        const next = waiting.shift()!;
        next(browser);
        logger.debug({ waitingCount: waiting.length }, "Handed browser to waiter");
      } else {
        pool.push(browser);
        logger.debug({ poolSize: pool.length }, "Released browser to pool");
      }
    };

    const warmUp = async (): Promise<void> => {
      logger.info({ poolSize }, "Warming up browser pool");
      const browsers = await Promise.all(
        Array.from({ length: poolSize }, () => launchBrowser())
      );
      launched = poolSize;
      pool.push(...browsers);
      logger.info({ poolSize }, "Browser pool warmed up");
    };

    const shutdown = async (): Promise<void> => {
      logger.info({ poolSize: pool.length }, "Shutting down browser pool");
      await Promise.all(pool.map((b) => b.close()));
      pool.length = 0;
      launched = 0;
      logger.info("Browser pool shut down");
    };

    ctx.cleanup(async () => {
      await shutdown();
    });

    return { acquire, release, warmUp, shutdown };
  },
});
