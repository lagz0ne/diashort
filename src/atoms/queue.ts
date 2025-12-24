import { atom, tags } from "@pumped-fn/lite";
import { queueConfigTag } from "../config/tags";
import { loggerAtom } from "./logger";

export class BackpressureError extends Error {
  constructor() {
    super("Queue is full");
    this.name = "BackpressureError";
  }
}

export const queueAtom = atom({
  deps: {
    config: tags.required(queueConfigTag),
    logger: loggerAtom,
  },
  factory: (ctx, { config, logger }) => {
    let slots = config.maxConcurrent;
    const waiters: Array<{
      resolve: (release: () => void) => void;
      reject: (err: Error) => void;
    }> = [];

    const release = () => {
      if (waiters.length > 0) {
        const next = waiters.shift();
        if (next) {
          next.resolve(release);
        }
      } else {
        slots++;
      }
    };

    const acquire = () => {
      if (slots > 0) {
        slots--;
        return Promise.resolve(release);
      }

      if (waiters.length < config.maxWaiting) {
        return new Promise<() => void>((resolve, reject) => {
          waiters.push({ resolve, reject });
        });
      }

      logger.warn({
        maxWaiting: config.maxWaiting,
        currentWaiters: waiters.length,
      }, "Queue full, rejecting request");
      return Promise.reject(new BackpressureError());
    };

    ctx.cleanup(() => {
      const error = new Error("Queue destroyed");
      waiters.forEach((w) => w.reject(error));
      waiters.length = 0;
    });

    return { acquire };
  },
});
