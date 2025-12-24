import { atom, tags } from "@pumped-fn/lite";
import { cacheConfigTag } from "../config/tags";
import { loggerAtom } from "./logger";

interface CacheEntry {
  data: string;
  contentType: string;
  storedAt: number;
}

interface InputHashEntry {
  shortlink: string;
  storedAt: number;
}

export interface CacheService {
  store(data: string, contentType: string): string;
  get(shortlink: string): { data: string; contentType: string } | undefined;
  storeInputHash(inputHash: string, shortlink: string): void;
  getByInputHash(inputHash: string): string | undefined;
}

export const cacheAtom = atom({
  deps: {
    config: tags.required(cacheConfigTag),
    logger: loggerAtom,
  },
  factory: (ctx, { config, logger }): CacheService => {
    const cache = new Map<string, CacheEntry>();
    const inputHashes = new Map<string, InputHashEntry>();

    const store = (data: string, contentType: string): string => {
      const shortlink = crypto.randomUUID().slice(0, 8);
      cache.set(shortlink, {
        data,
        contentType,
        storedAt: Date.now(),
      });
      logger.debug({ shortlink }, "Stored new cache entry");
      return shortlink;
    };

    const get = (shortlink: string): { data: string; contentType: string } | undefined => {
      const entry = cache.get(shortlink);

      if (!entry) {
        return undefined;
      }

      const isExpired = Date.now() - entry.storedAt > config.ttlMs;
      if (isExpired) {
        logger.debug({ shortlink }, "Cache entry expired on access");
        cache.delete(shortlink);
        return undefined;
      }

      return {
        data: entry.data,
        contentType: entry.contentType,
      };
    };

    const storeInputHash = (inputHash: string, shortlink: string): void => {
      inputHashes.set(inputHash, {
        shortlink,
        storedAt: Date.now(),
      });
      logger.debug({ inputHash, shortlink }, "Stored input hash mapping");
    };

    const getByInputHash = (inputHash: string): string | undefined => {
      const entry = inputHashes.get(inputHash);

      if (!entry) {
        return undefined;
      }

      const isExpired = Date.now() - entry.storedAt > config.ttlMs;
      if (isExpired) {
        logger.debug({ inputHash }, "Input hash entry expired on access");
        inputHashes.delete(inputHash);
        return undefined;
      }

      return entry.shortlink;
    };

    const runGc = () => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [key, entry] of cache.entries()) {
        if (now - entry.storedAt > config.ttlMs) {
          cache.delete(key);
          cleanedCount++;
        }
      }

      for (const [key, entry] of inputHashes.entries()) {
        if (now - entry.storedAt > config.ttlMs) {
          inputHashes.delete(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug({ cleanedCount }, "GC cleanup finished");
      }
    };

    const gcInterval = setInterval(runGc, config.gcIntervalMs);

    ctx.cleanup(() => {
      clearInterval(gcInterval);
      logger.debug("Cache GC stopped");
    });

    return { store, get, storeInputHash, getByInputHash };
  },
});
