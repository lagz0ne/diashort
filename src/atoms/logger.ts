import { atom, tags } from "@pumped-fn/lite";
import pino, { type Logger } from "pino";
import { logLevelTag, nodeEnvTag } from "../config/tags";

export const loggerAtom = atom({
  deps: {
    level: tags.required(logLevelTag),
    env: tags.required(nodeEnvTag),
  },
  factory: (_ctx, { level, env }): Logger => {
    const isPretty = env === "development";

    if (isPretty) {
      return pino({
        level,
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      });
    }

    return pino({ level });
  },
});
