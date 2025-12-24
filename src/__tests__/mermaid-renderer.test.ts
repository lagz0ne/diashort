import { describe, it, expect, mock } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { mermaidRendererAtom } from "../atoms/mermaid-renderer";
import { browserPoolSizeTag, logLevelTag, nodeEnvTag } from "../config/tags";
import { loggerAtom } from "../atoms/logger";
import { mockLoggerAtom } from "./helpers/mocks";

describe("Mermaid Renderer (c3-107 replacement)", () => {
  it("exports mermaidRendererAtom", async () => {
    expect(mermaidRendererAtom).toBeDefined();
  });
});
