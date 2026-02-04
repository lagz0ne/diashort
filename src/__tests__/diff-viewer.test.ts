// src/__tests__/diff-viewer.test.ts
import { describe, it, expect } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { diffViewerAtom } from "../atoms/diff-viewer";

describe("DiffViewer", () => {
  it("generates mermaid diff HTML with side-by-side layout", async () => {
    const scope = createScope({ tags: [] });
    const viewer = await scope.resolve(diffViewerAtom);

    const html = viewer.generateMermaidDiff({
      before: "graph TD; A-->B;",
      after: "graph TD; A-->B-->C;",
      shortlink: "abc12345",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Before");
    expect(html).toContain("After");
    expect(html).toContain("graph TD; A-->B;");
    expect(html).toContain("graph TD; A-->B-->C;");
    expect(html).toContain("syncedViewport");

    await scope.dispose();
  });

  it("generates D2 diff HTML with pre-rendered SVGs", async () => {
    const scope = createScope({ tags: [] });
    const viewer = await scope.resolve(diffViewerAtom);

    const html = viewer.generateD2Diff({
      beforeLightSvg: "<svg>before-light</svg>",
      beforeDarkSvg: "<svg>before-dark</svg>",
      afterLightSvg: "<svg>after-light</svg>",
      afterDarkSvg: "<svg>after-dark</svg>",
      shortlink: "xyz78901",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Before");
    expect(html).toContain("After");
    expect(html).toContain("before-light");
    expect(html).toContain("after-light");
    expect(html).toContain("syncedViewport");

    await scope.dispose();
  });

  it("includes layout toggle controls in mermaid diff", async () => {
    const scope = createScope({ tags: [] });
    const viewer = await scope.resolve(diffViewerAtom);

    const html = viewer.generateMermaidDiff({
      before: "graph TD; A-->B;",
      after: "graph TD; A-->B-->C;",
      shortlink: "abc12345",
    });

    // Layout toggle button
    expect(html).toContain('id="layout-toggle"');
    // Layout functions
    expect(html).toContain("getLayoutFromUrl");
    expect(html).toContain("toggleLayout");
    expect(html).toContain("initLayout");
    // CSS for vertical layout
    expect(html).toContain("layout-vertical");

    await scope.dispose();
  });

  it("includes layout toggle controls in D2 diff", async () => {
    const scope = createScope({ tags: [] });
    const viewer = await scope.resolve(diffViewerAtom);

    const html = viewer.generateD2Diff({
      beforeLightSvg: "<svg>before-light</svg>",
      beforeDarkSvg: "<svg>before-dark</svg>",
      afterLightSvg: "<svg>after-light</svg>",
      afterDarkSvg: "<svg>after-dark</svg>",
      shortlink: "xyz78901",
    });

    // Layout toggle button
    expect(html).toContain('id="layout-toggle"');
    // Layout functions
    expect(html).toContain("getLayoutFromUrl");
    expect(html).toContain("toggleLayout");
    expect(html).toContain("initLayout");
    // CSS for vertical layout
    expect(html).toContain("layout-vertical");

    await scope.dispose();
  });
});
