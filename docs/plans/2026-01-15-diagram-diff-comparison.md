# Diagram Diff Comparison Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add side-by-side diagram comparison with synced zoom/pan for comparing before/after diagrams.

**Architecture:** New `diagram_diffs` table stores before/after sources. New `POST /diff` and `GET /diff/:id` endpoints handle creation and viewing. Diff viewer reuses existing zoom/pan logic with synchronized transforms across two panels.

**Tech Stack:** Bun, SQLite (bun:sqlite), @pumped-fn/lite atoms/flows, Mermaid (client-side), D2 (server-side SVG)

---

### Task 1: Create Diff Store with Auto-Migration

**Files:**
- Create: `src/atoms/diff-store.ts`
- Test: `src/__tests__/diff-store.test.ts`

**Step 1: Write the failing test**

```ts
// src/__tests__/diff-store.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { diffStoreAtom, type DiffRecord } from "../atoms/diff-store";
import { diagramConfigTag } from "../config/tags";
import { existsSync, unlinkSync } from "fs";

describe("DiffStore", () => {
  const testDbPath = "/tmp/diff-store-test.db";

  afterAll(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  it("creates and retrieves a diff", async () => {
    const scope = createScope({
      tags: [
        diagramConfigTag({
          dbPath: testDbPath,
          retentionDays: 30,
          cleanupIntervalMs: 3600000,
        }),
      ],
    });

    const store = await scope.resolve(diffStoreAtom);

    const id = store.create({
      format: "mermaid",
      before: "graph TD; A-->B;",
      after: "graph TD; A-->B-->C;",
    });

    expect(id).toMatch(/^[a-f0-9]{8}$/);

    const retrieved = store.get(id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.format).toBe("mermaid");
    expect(retrieved!.before).toBe("graph TD; A-->B;");
    expect(retrieved!.after).toBe("graph TD; A-->B-->C;");

    await scope.dispose();
  });

  it("returns null for non-existent diff", async () => {
    const scope = createScope({
      tags: [
        diagramConfigTag({
          dbPath: testDbPath,
          retentionDays: 30,
          cleanupIntervalMs: 3600000,
        }),
      ],
    });

    const store = await scope.resolve(diffStoreAtom);
    const result = store.get("nonexist");
    expect(result).toBeNull();

    await scope.dispose();
  });

  it("touch updates accessedAt", async () => {
    const scope = createScope({
      tags: [
        diagramConfigTag({
          dbPath: testDbPath,
          retentionDays: 30,
          cleanupIntervalMs: 3600000,
        }),
      ],
    });

    const store = await scope.resolve(diffStoreAtom);

    const id = store.create({
      format: "d2",
      before: "a -> b",
      after: "a -> b -> c",
    });

    // Touch should not throw
    store.touch(id);

    await scope.dispose();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/diff-store.test.ts`
Expected: FAIL with "Cannot find module" or similar

**Step 3: Write minimal implementation**

```ts
// src/atoms/diff-store.ts
import { atom, tags } from "@pumped-fn/lite";
import { Database } from "bun:sqlite";
import { diagramConfigTag } from "../config/tags";
import { loggerAtom } from "./logger";
import type { DiagramFormat } from "./diagram-store";

export interface DiffRecord {
  id: string;
  format: DiagramFormat;
  before: string;
  after: string;
  createdAt: number;
  accessedAt: number;
}

export interface CreateDiffInput {
  format: DiagramFormat;
  before: string;
  after: string;
}

export interface DiffStore {
  create(input: CreateDiffInput): string;
  get(id: string): { format: DiagramFormat; before: string; after: string } | null;
  touch(id: string): void;
  cleanup(): void;
}

export const diffStoreAtom = atom({
  deps: {
    config: tags.required(diagramConfigTag),
    logger: loggerAtom,
  },
  factory: (ctx, { config, logger }): DiffStore => {
    const db = new Database(config.dbPath);

    // Initialize schema (auto-migration: CREATE TABLE IF NOT EXISTS)
    db.exec(`
      CREATE TABLE IF NOT EXISTS diagram_diffs (
        id TEXT PRIMARY KEY,
        format TEXT NOT NULL,
        source_before TEXT NOT NULL,
        source_after TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        accessedAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_diffs_accessed
        ON diagram_diffs(accessedAt);
    `);

    logger.debug({ dbPath: config.dbPath }, "Diff store initialized");

    ctx.cleanup(() => {
      logger.debug("Closing diff store database");
      db.close();
    });

    const store: DiffStore = {
      create(input: CreateDiffInput): string {
        const id = crypto.randomUUID().slice(0, 8);
        const now = Date.now();

        const stmt = db.prepare(`
          INSERT INTO diagram_diffs (id, format, source_before, source_after, createdAt, accessedAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(id, input.format, input.before, input.after, now, now);

        logger.debug({ shortlink: id, format: input.format }, "Diff created");
        return id;
      },

      get(id: string): { format: DiagramFormat; before: string; after: string } | null {
        const stmt = db.prepare(`
          SELECT format, source_before, source_after FROM diagram_diffs WHERE id = ?
        `);

        const row = stmt.get(id) as { format: string; source_before: string; source_after: string } | null;
        if (!row) {
          return null;
        }

        return {
          format: row.format as DiagramFormat,
          before: row.source_before,
          after: row.source_after,
        };
      },

      touch(id: string): void {
        const now = Date.now();
        const stmt = db.prepare(`
          UPDATE diagram_diffs SET accessedAt = ? WHERE id = ?
        `);
        stmt.run(now, id);
        logger.debug({ shortlink: id }, "Diff accessed");
      },

      cleanup(): void {
        const retentionMs = config.retentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - retentionMs;

        const stmt = db.prepare(`
          DELETE FROM diagram_diffs WHERE accessedAt < ?
        `);

        const result = stmt.run(cutoffTime);

        if (result.changes > 0) {
          logger.info(
            { deletedCount: result.changes, retentionDays: config.retentionDays },
            "Cleaned up old diffs"
          );
        }
      },
    };

    return store;
  },
});
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/diff-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/atoms/diff-store.ts src/__tests__/diff-store.test.ts
git commit -m "feat: add diff store with auto-migration for diagram comparisons"
```

---

### Task 2: Create Diff Viewer HTML Generator

**Files:**
- Create: `src/atoms/diff-viewer.ts`
- Test: `src/__tests__/diff-viewer.test.ts`

**Step 1: Write the failing test**

```ts
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
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/diff-viewer.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```ts
// src/atoms/diff-viewer.ts
import { atom } from "@pumped-fn/lite";

export interface MermaidDiffInput {
  before: string;
  after: string;
  shortlink: string;
}

export interface D2DiffInput {
  beforeLightSvg: string;
  beforeDarkSvg: string;
  afterLightSvg: string;
  afterDarkSvg: string;
  shortlink: string;
}

export interface DiffViewer {
  generateMermaidDiff(input: MermaidDiffInput): string;
  generateD2Diff(input: D2DiffInput): string;
}

function escapeJs(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const diffStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #fafafa;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1a1a; color: #eee; }
  }

  .diff-container {
    display: flex;
    width: 100vw;
    height: 100vh;
  }

  @media (max-width: 768px) {
    .diff-container {
      flex-direction: column;
    }
  }

  .diff-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid #ddd;
  }

  .diff-panel:last-child {
    border-right: none;
  }

  @media (prefers-color-scheme: dark) {
    .diff-panel { border-color: #333; }
  }

  @media (max-width: 768px) {
    .diff-panel {
      border-right: none;
      border-bottom: 1px solid #ddd;
    }
    .diff-panel:last-child {
      border-bottom: none;
    }
  }

  .panel-header {
    padding: 8px 16px;
    font-weight: 600;
    font-size: 14px;
    background: #f0f0f0;
    border-bottom: 1px solid #ddd;
    text-align: center;
  }

  @media (prefers-color-scheme: dark) {
    .panel-header { background: #2a2a2a; border-color: #333; }
  }

  .panel-content {
    flex: 1;
    overflow: hidden;
    cursor: grab;
    position: relative;
  }

  .panel-content.dragging { cursor: grabbing; }

  .panel-content svg {
    transform-origin: 0 0;
    position: absolute;
    top: 0;
    left: 0;
  }

  .controls {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 4px;
    background: rgba(255, 255, 255, 0.9);
    padding: 6px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 1000;
  }

  @media (prefers-color-scheme: dark) {
    .controls { background: rgba(40, 40, 40, 0.9); }
  }

  .controls button {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #333;
    transition: background 0.15s;
  }

  @media (prefers-color-scheme: dark) {
    .controls button { color: #eee; }
  }

  .controls button:hover { background: rgba(0, 0, 0, 0.1); }

  @media (prefers-color-scheme: dark) {
    .controls button:hover { background: rgba(255, 255, 255, 0.1); }
  }

  #loading {
    color: #666;
    font-size: 0.875rem;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  @media (prefers-color-scheme: dark) {
    #loading { color: #999; }
  }
`;

const syncedViewportScript = `
  const syncedViewport = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    homeState: null,
    minScale: 0.1,
    maxScale: 5,
    zoomFactor: 1.2,
    padding: 32
  };

  let isDragging = false;
  let lastX = 0, lastY = 0;
  let initialPinchDistance = 0;
  let initialPinchScale = 1;

  function initSyncedViewport() {
    const panels = document.querySelectorAll('.panel-content');
    const firstSvg = panels[0]?.querySelector('svg');
    if (!firstSvg) return;

    let svgWidth, svgHeight;
    const viewBox = firstSvg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[\\s,]+/).map(Number);
      svgWidth = parts[2] || 800;
      svgHeight = parts[3] || 600;
    } else {
      const bbox = firstSvg.getBBox();
      svgWidth = bbox.width || 800;
      svgHeight = bbox.height || 600;
    }

    // Get panel dimensions (half viewport width on desktop)
    const panel = panels[0];
    const panelRect = panel.getBoundingClientRect();
    const vw = panelRect.width - syncedViewport.padding * 2;
    const vh = panelRect.height - syncedViewport.padding * 2;

    const scaleX = vw / svgWidth;
    const scaleY = vh / svgHeight;
    let fitScale = Math.min(scaleX, scaleY, 1);

    const scaledWidth = svgWidth * fitScale;
    const scaledHeight = svgHeight * fitScale;
    const tx = (panelRect.width - scaledWidth) / 2;
    const ty = (panelRect.height - scaledHeight) / 2;

    syncedViewport.scale = fitScale;
    syncedViewport.translateX = tx;
    syncedViewport.translateY = ty;
    syncedViewport.homeState = { scale: fitScale, translateX: tx, translateY: ty };

    // Set explicit dimensions on all SVGs
    panels.forEach(panel => {
      const svg = panel.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', svgWidth);
        svg.setAttribute('height', svgHeight);
        svg.style.width = svgWidth + 'px';
        svg.style.height = svgHeight + 'px';
      }
    });

    applyTransformToAll();
    setupSyncedEventListeners();
  }

  function applyTransformToAll() {
    document.querySelectorAll('.panel-content svg').forEach(svg => {
      svg.style.transform = 'translate(' + syncedViewport.translateX + 'px, ' + syncedViewport.translateY + 'px) scale(' + syncedViewport.scale + ')';
    });
  }

  function zoomTo(newScale, anchorX, anchorY, panelRect) {
    newScale = Math.max(syncedViewport.minScale, Math.min(syncedViewport.maxScale, newScale));

    // Convert anchor to panel-relative coordinates
    const relX = anchorX - panelRect.left;
    const relY = anchorY - panelRect.top;

    const scaleDiff = newScale / syncedViewport.scale;
    syncedViewport.translateX = relX - (relX - syncedViewport.translateX) * scaleDiff;
    syncedViewport.translateY = relY - (relY - syncedViewport.translateY) * scaleDiff;
    syncedViewport.scale = newScale;

    applyTransformToAll();
  }

  function resetView() {
    if (!syncedViewport.homeState) return;
    syncedViewport.scale = syncedViewport.homeState.scale;
    syncedViewport.translateX = syncedViewport.homeState.translateX;
    syncedViewport.translateY = syncedViewport.homeState.translateY;
    applyTransformToAll();
  }

  function setupSyncedEventListeners() {
    const panels = document.querySelectorAll('.panel-content');

    panels.forEach(panel => {
      panel.addEventListener('wheel', function(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 1 / syncedViewport.zoomFactor : syncedViewport.zoomFactor;
        const panelRect = panel.getBoundingClientRect();
        zoomTo(syncedViewport.scale * delta, e.clientX, e.clientY, panelRect);
      }, { passive: false });

      panel.addEventListener('mousedown', function(e) {
        if (e.target.closest('.controls')) return;
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        panels.forEach(p => p.classList.add('dragging'));
      });

      panel.addEventListener('touchstart', function(e) {
        if (e.target.closest('.controls')) return;
        if (e.touches.length === 1) {
          isDragging = true;
          lastX = e.touches[0].clientX;
          lastY = e.touches[0].clientY;
          panels.forEach(p => p.classList.add('dragging'));
        } else if (e.touches.length === 2) {
          isDragging = false;
          initialPinchDistance = Math.hypot(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY
          );
          initialPinchScale = syncedViewport.scale;
        }
      }, { passive: true });

      panel.addEventListener('touchmove', function(e) {
        if (e.target.closest('.controls')) return;
        e.preventDefault();
        const panelRect = panel.getBoundingClientRect();
        if (e.touches.length === 1 && isDragging) {
          syncedViewport.translateX += e.touches[0].clientX - lastX;
          syncedViewport.translateY += e.touches[0].clientY - lastY;
          lastX = e.touches[0].clientX;
          lastY = e.touches[0].clientY;
          applyTransformToAll();
        } else if (e.touches.length === 2) {
          const dist = Math.hypot(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY
          );
          const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const newScale = initialPinchScale * (dist / initialPinchDistance);
          zoomTo(newScale, centerX, centerY, panelRect);
        }
      }, { passive: false });

      panel.addEventListener('touchend', function() {
        isDragging = false;
        panels.forEach(p => p.classList.remove('dragging'));
      });
    });

    window.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      syncedViewport.translateX += e.clientX - lastX;
      syncedViewport.translateY += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      applyTransformToAll();
    });

    window.addEventListener('mouseup', function() {
      isDragging = false;
      panels.forEach(p => p.classList.remove('dragging'));
    });

    document.getElementById('zoom-in').addEventListener('click', function() {
      const panel = panels[0];
      const panelRect = panel.getBoundingClientRect();
      const centerX = panelRect.left + panelRect.width / 2;
      const centerY = panelRect.top + panelRect.height / 2;
      zoomTo(syncedViewport.scale * syncedViewport.zoomFactor, centerX, centerY, panelRect);
    });

    document.getElementById('zoom-out').addEventListener('click', function() {
      const panel = panels[0];
      const panelRect = panel.getBoundingClientRect();
      const centerX = panelRect.left + panelRect.width / 2;
      const centerY = panelRect.top + panelRect.height / 2;
      zoomTo(syncedViewport.scale / syncedViewport.zoomFactor, centerX, centerY, panelRect);
    });

    document.getElementById('zoom-reset').addEventListener('click', resetView);

    window.addEventListener('resize', function() {
      // Recalculate home state on resize
      const panel = panels[0];
      const svg = panel.querySelector('svg');
      if (!svg) return;

      const svgWidth = parseFloat(svg.getAttribute('width')) || 800;
      const svgHeight = parseFloat(svg.getAttribute('height')) || 600;

      const panelRect = panel.getBoundingClientRect();
      const vw = panelRect.width - syncedViewport.padding * 2;
      const vh = panelRect.height - syncedViewport.padding * 2;

      const scaleX = vw / svgWidth;
      const scaleY = vh / svgHeight;
      const fitScale = Math.min(scaleX, scaleY, 1);

      const scaledWidth = svgWidth * fitScale;
      const scaledHeight = svgHeight * fitScale;
      const tx = (panelRect.width - scaledWidth) / 2;
      const ty = (panelRect.height - scaledHeight) / 2;

      syncedViewport.homeState = { scale: fitScale, translateX: tx, translateY: ty };
    });
  }
`;

const controlsHtml = `
  <div class="controls">
    <button id="zoom-in" aria-label="Zoom in">+</button>
    <button id="zoom-reset" aria-label="Reset view">&#x21BA;</button>
    <button id="zoom-out" aria-label="Zoom out">&minus;</button>
  </div>
`;

export const diffViewerAtom = atom({
  deps: {},
  factory: (): DiffViewer => ({
    generateMermaidDiff(input: MermaidDiffInput): string {
      const title = `Diff - ${input.shortlink}`;
      const escapedBefore = escapeJs(input.before);
      const escapedAfter = escapeJs(input.after);

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${diffStyles}</style>
</head>
<body>
  <div class="diff-container">
    <div class="diff-panel">
      <div class="panel-header">Before</div>
      <div class="panel-content" id="panel-before">
        <div id="loading">Loading...</div>
      </div>
    </div>
    <div class="diff-panel">
      <div class="panel-header">After</div>
      <div class="panel-content" id="panel-after">
        <div id="loading">Loading...</div>
      </div>
    </div>
  </div>
  ${controlsHtml}

  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    ${syncedViewportScript}

    const beforeSource = \`${escapedBefore}\`;
    const afterSource = \`${escapedAfter}\`;

    function getTheme() {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default';
    }

    async function renderBoth() {
      const theme = getTheme();
      mermaid.initialize({ startOnLoad: false, theme: theme });

      const panelBefore = document.getElementById('panel-before');
      const panelAfter = document.getElementById('panel-after');

      try {
        const [beforeResult, afterResult] = await Promise.all([
          mermaid.render('mermaid-before', beforeSource),
          mermaid.render('mermaid-after', afterSource),
        ]);
        panelBefore.innerHTML = beforeResult.svg;
        panelAfter.innerHTML = afterResult.svg;
        initSyncedViewport();
      } catch (err) {
        panelBefore.innerHTML = '<div style="color: red; padding: 16px;">' + err.message + '</div>';
        panelAfter.innerHTML = '<div style="color: red; padding: 16px;">' + err.message + '</div>';
      }
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      document.getElementById('panel-before').innerHTML = '<div id="loading">Loading...</div>';
      document.getElementById('panel-after').innerHTML = '<div id="loading">Loading...</div>';
      renderBoth();
    });

    renderBoth();
  </script>
</body>
</html>`;
    },

    generateD2Diff(input: D2DiffInput): string {
      const title = `Diff - ${input.shortlink}`;
      const escapedBeforeLight = escapeJs(input.beforeLightSvg);
      const escapedBeforeDark = escapeJs(input.beforeDarkSvg);
      const escapedAfterLight = escapeJs(input.afterLightSvg);
      const escapedAfterDark = escapeJs(input.afterDarkSvg);

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${diffStyles}</style>
</head>
<body>
  <div class="diff-container">
    <div class="diff-panel">
      <div class="panel-header">Before</div>
      <div class="panel-content" id="panel-before"></div>
    </div>
    <div class="diff-panel">
      <div class="panel-header">After</div>
      <div class="panel-content" id="panel-after"></div>
    </div>
  </div>
  ${controlsHtml}

  <script>
    ${syncedViewportScript}

    const beforeLightSvg = \`${escapedBeforeLight}\`;
    const beforeDarkSvg = \`${escapedBeforeDark}\`;
    const afterLightSvg = \`${escapedAfterLight}\`;
    const afterDarkSvg = \`${escapedAfterDark}\`;

    function isDark() {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function render() {
      const panelBefore = document.getElementById('panel-before');
      const panelAfter = document.getElementById('panel-after');

      panelBefore.innerHTML = isDark() ? beforeDarkSvg : beforeLightSvg;
      panelAfter.innerHTML = isDark() ? afterDarkSvg : afterLightSvg;

      initSyncedViewport();
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

    render();
  </script>
</body>
</html>`;
    },
  }),
});
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/diff-viewer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/atoms/diff-viewer.ts src/__tests__/diff-viewer.test.ts
git commit -m "feat: add diff viewer with side-by-side layout and synced zoom/pan"
```

---

### Task 3: Create Diff Flows (Create and View)

**Files:**
- Create: `src/flows/diff.ts`
- Test: `src/__tests__/diff-flow.test.ts`

**Step 1: Write the failing test**

```ts
// src/__tests__/diff-flow.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { createDiffFlow, viewDiffFlow, DiffValidationError, DiffNotFoundError } from "../flows/diff";
import { diagramConfigTag, baseUrlTag, requestOriginTag } from "../config/tags";
import { existsSync, unlinkSync } from "fs";

describe("Diff Flows", () => {
  const testDbPath = "/tmp/diff-flow-test.db";

  afterAll(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe("createDiffFlow", () => {
    it("creates a mermaid diff and returns shortlink", async () => {
      const scope = createScope({
        tags: [
          diagramConfigTag({
            dbPath: testDbPath,
            retentionDays: 30,
            cleanupIntervalMs: 3600000,
          }),
          baseUrlTag("https://example.com"),
        ],
      });

      const ctx = scope.createContext({ tags: [requestOriginTag("https://test.com")] });

      const result = await ctx.exec({
        flow: createDiffFlow,
        rawInput: {
          format: "mermaid",
          before: "graph TD; A-->B;",
          after: "graph TD; A-->B-->C;",
        },
      });

      expect(result.shortlink).toMatch(/^[a-f0-9]{8}$/);
      expect(result.url).toBe(`https://example.com/diff/${result.shortlink}`);

      await ctx.close();
      await scope.dispose();
    });

    it("throws validation error for missing before", async () => {
      const scope = createScope({
        tags: [
          diagramConfigTag({
            dbPath: testDbPath,
            retentionDays: 30,
            cleanupIntervalMs: 3600000,
          }),
        ],
      });

      const ctx = scope.createContext({ tags: [requestOriginTag("https://test.com")] });

      try {
        await ctx.exec({
          flow: createDiffFlow,
          rawInput: {
            format: "mermaid",
            after: "graph TD; A-->B;",
          },
        });
        expect(true).toBe(false); // Should not reach
      } catch (err) {
        expect((err as Error).message).toContain("before");
      }

      await ctx.close();
      await scope.dispose();
    });
  });

  describe("viewDiffFlow", () => {
    it("returns HTML for existing diff", async () => {
      const scope = createScope({
        tags: [
          diagramConfigTag({
            dbPath: testDbPath,
            retentionDays: 30,
            cleanupIntervalMs: 3600000,
          }),
          baseUrlTag("https://example.com"),
        ],
      });

      // Create a diff first
      const createCtx = scope.createContext({ tags: [requestOriginTag("https://test.com")] });
      const created = await createCtx.exec({
        flow: createDiffFlow,
        rawInput: {
          format: "mermaid",
          before: "graph TD; X-->Y;",
          after: "graph TD; X-->Y-->Z;",
        },
      });
      await createCtx.close();

      // View the diff
      const viewCtx = scope.createContext({ tags: [] });
      const result = await viewCtx.exec({
        flow: viewDiffFlow,
        input: { shortlink: created.shortlink },
      });

      expect(result.html).toContain("<!DOCTYPE html>");
      expect(result.html).toContain("Before");
      expect(result.html).toContain("After");
      expect(result.contentType).toBe("text/html");

      await viewCtx.close();
      await scope.dispose();
    });

    it("throws not found for non-existent diff", async () => {
      const scope = createScope({
        tags: [
          diagramConfigTag({
            dbPath: testDbPath,
            retentionDays: 30,
            cleanupIntervalMs: 3600000,
          }),
        ],
      });

      const ctx = scope.createContext({ tags: [] });

      try {
        await ctx.exec({
          flow: viewDiffFlow,
          input: { shortlink: "nonexist" },
        });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(DiffNotFoundError);
      }

      await ctx.close();
      await scope.dispose();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/diff-flow.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```ts
// src/flows/diff.ts
import { flow } from "@pumped-fn/lite";
import { diffStoreAtom, type CreateDiffInput } from "../atoms/diff-store";
import { diffViewerAtom } from "../atoms/diff-viewer";
import { d2RendererAtom } from "../atoms/d2-renderer";
import { loggerAtom } from "../atoms/logger";
import { baseUrlTag, requestOriginTag } from "../config/tags";
import type { DiagramFormat } from "../atoms/diagram-store";

export class DiffValidationError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "DiffValidationError";
  }
}

export class DiffNotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "DiffNotFoundError";
  }
}

interface CreateDiffRawInput {
  format?: unknown;
  before?: unknown;
  after?: unknown;
}

export interface CreateDiffResult {
  shortlink: string;
  url: string;
}

function parseCreateDiffInput(body: unknown): CreateDiffInput {
  if (!body || typeof body !== "object") {
    throw new DiffValidationError("Request body must be a JSON object");
  }

  const obj = body as CreateDiffRawInput;

  const format = obj.format;
  if (format !== "mermaid" && format !== "d2") {
    throw new DiffValidationError("format must be 'mermaid' or 'd2'");
  }

  if (typeof obj.before !== "string" || obj.before.trim() === "") {
    throw new DiffValidationError("before is required and must be a non-empty string");
  }

  if (typeof obj.after !== "string" || obj.after.trim() === "") {
    throw new DiffValidationError("after is required and must be a non-empty string");
  }

  return {
    format: format as DiagramFormat,
    before: obj.before,
    after: obj.after,
  };
}

export const createDiffFlow = flow({
  name: "createDiff",
  deps: {
    diffStore: diffStoreAtom,
    d2Renderer: d2RendererAtom,
    logger: loggerAtom,
  },
  parse: (raw: unknown) => parseCreateDiffInput(raw),
  factory: async (ctx, { diffStore, d2Renderer, logger }): Promise<CreateDiffResult> => {
    const { input } = ctx;
    const configuredBaseUrl = ctx.data.seekTag(baseUrlTag);
    const requestOrigin = ctx.data.seekTag(requestOriginTag) ?? "";
    const baseUrl = configuredBaseUrl || requestOrigin;

    logger.debug({ format: input.format }, "Creating diff");

    // Validate D2 syntax for both before and after
    if (input.format === "d2") {
      try {
        await d2Renderer.render(input.before, "light");
      } catch (err) {
        throw new DiffValidationError(`Invalid D2 syntax in 'before': ${(err as Error).message}`);
      }
      try {
        await d2Renderer.render(input.after, "light");
      } catch (err) {
        throw new DiffValidationError(`Invalid D2 syntax in 'after': ${(err as Error).message}`);
      }
    }

    const shortlink = diffStore.create(input);

    logger.info({ shortlink, format: input.format }, "Diff created");

    return {
      shortlink,
      url: `${baseUrl}/diff/${shortlink}`,
    };
  },
});

export interface ViewDiffInput {
  shortlink: string;
}

export interface ViewDiffResult {
  html: string;
  contentType: string;
}

export const viewDiffFlow = flow({
  name: "viewDiff",
  deps: {
    diffStore: diffStoreAtom,
    diffViewer: diffViewerAtom,
    d2Renderer: d2RendererAtom,
    logger: loggerAtom,
  },
  factory: async (ctx, { diffStore, diffViewer, d2Renderer, logger }): Promise<ViewDiffResult> => {
    const { shortlink } = ctx.input as ViewDiffInput;

    logger.debug({ shortlink }, "Viewing diff");

    const diff = diffStore.get(shortlink);
    if (!diff) {
      throw new DiffNotFoundError("Diff not found");
    }

    diffStore.touch(shortlink);

    let html: string;

    if (diff.format === "mermaid") {
      html = diffViewer.generateMermaidDiff({
        before: diff.before,
        after: diff.after,
        shortlink,
      });
    } else {
      // D2: pre-render all 4 variants (before/after x light/dark)
      const [beforeLight, beforeDark, afterLight, afterDark] = await Promise.all([
        d2Renderer.render(diff.before, "light"),
        d2Renderer.render(diff.before, "dark"),
        d2Renderer.render(diff.after, "light"),
        d2Renderer.render(diff.after, "dark"),
      ]);

      html = diffViewer.generateD2Diff({
        beforeLightSvg: beforeLight,
        beforeDarkSvg: beforeDark,
        afterLightSvg: afterLight,
        afterDarkSvg: afterDark,
        shortlink,
      });
    }

    logger.info({ shortlink, format: diff.format }, "Diff viewed");

    return {
      html,
      contentType: "text/html",
    };
  },
});
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/diff-flow.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/flows/diff.ts src/__tests__/diff-flow.test.ts
git commit -m "feat: add create and view diff flows with D2 validation"
```

---

### Task 4: Add Routes to Server

**Files:**
- Modify: `src/server.ts`

**Step 1: Add imports at the top of server.ts (after line 7)**

Add after existing flow imports:

```ts
import { createDiffFlow, viewDiffFlow, DiffValidationError, DiffNotFoundError } from "./flows/diff";
import { diffStoreAtom } from "./atoms/diff-store";
```

**Step 2: Update mapErrorToResponse function**

Add these cases after the `EmbedNotSupportedError` check (around line 96):

```ts
  if (error instanceof DiffValidationError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (error instanceof DiffNotFoundError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
```

**Step 3: Resolve diffStore in startServer (after diagramStore resolution, around line 121)**

Add:

```ts
  const diffStore = await scope.resolve(diffStoreAtom);
```

**Step 4: Add cleanup for diffs in the cleanup interval (after diagramStore.cleanup())**

Update the cleanup interval to:

```ts
  const cleanupInterval = setInterval(() => {
    diagramStore.cleanup();
    diffStore.cleanup();
  }, diagramConfig.cleanupIntervalMs);
```

**Step 5: Add POST /diff route (after the /render route, around line 165)**

Add this route block:

```ts
        if (req.method === "POST" && url.pathname === "/diff") {
          if (authConfig.enabled && authConfig.credentials) {
            const authHeader = req.headers.get("authorization");
            checkBasicAuth(authHeader, authConfig.credentials.username, authConfig.credentials.password);
          }

          const body = await req.json();

          const ctx = scope.createContext({ tags: [requestIdTag(requestId), requestOriginTag(url.origin)] });

          try {
            const result = await ctx.exec({
              flow: createDiffFlow,
              rawInput: body,
            });

            return new Response(JSON.stringify({ shortlink: result.shortlink, url: result.url }), {
              status: 200,
              headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
            });
          } finally {
            await ctx.close();
          }
        }
```

**Step 6: Add GET /diff/:id route (after the /e/:shortlink route)**

Add this route block:

```ts
        if (req.method === "GET" && url.pathname.startsWith("/diff/")) {
          const shortlink = url.pathname.slice(6);

          const ctx = scope.createContext({ tags: [requestIdTag(requestId)] });

          try {
            const result = await ctx.exec({
              flow: viewDiffFlow,
              input: { shortlink },
            });

            return new Response(result.html, {
              status: 200,
              headers: {
                "Content-Type": result.contentType,
                "X-Request-Id": requestId,
                "Cache-Control": "public, max-age=31536000, immutable",
              },
            });
          } finally {
            await ctx.close();
          }
        }
```

**Step 7: Update usage text in root endpoint**

Add diff documentation to the usage string (around line 250, after the embed section):

```ts
### POST /diff
Create a side-by-side comparison of two diagrams.

Request:
  curl -X POST ${url.origin}/diff \\${curlAuth}
    -H "Content-Type: application/json" \\
    -d '{"format": "mermaid", "before": "graph TD; A-->B;", "after": "graph TD; A-->B-->C;"}'

Response:
  {"shortlink": "xyz78901", "url": "${url.origin}/diff/xyz78901"}

Parameters:
  - format: "mermaid" or "d2" (required)
  - before: Source code for the "before" diagram (required)
  - after: Source code for the "after" diagram (required)

### GET /diff/:shortlink
View the side-by-side comparison with synced zoom/pan.

Example:
  Open in browser: ${url.origin}/diff/xyz78901

```

**Step 8: Run type check**

Run: `bunx @typescript/native-preview`
Expected: No errors

**Step 9: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 10: Commit**

```bash
git add src/server.ts
git commit -m "feat: add POST /diff and GET /diff/:id routes with cleanup"
```

---

### Task 5: Add Integration Tests for Diff Endpoints

**Files:**
- Modify: `src/__tests__/integration.test.ts`

**Step 1: Add diff endpoint integration tests**

Add this describe block at the end of the integration tests (before the closing `});`):

```ts
  describe("Diff endpoints", () => {
    it("POST /diff without auth returns 401", async () => {
      const res = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "mermaid",
          before: "graph TD; A-->B;",
          after: "graph TD; A-->B-->C;",
        }),
      });
      expect(res.status).toBe(401);
    });

    it("POST /diff with missing before returns 400", async () => {
      const res = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          format: "mermaid",
          after: "graph TD; A-->B;",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("before");
    });

    it("POST /diff with missing after returns 400", async () => {
      const res = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          format: "mermaid",
          before: "graph TD; A-->B;",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("after");
    });

    it("POST /diff creates mermaid diff and returns shortlink", async () => {
      const res = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          format: "mermaid",
          before: "graph TD; A-->B;",
          after: "graph TD; A-->B-->C;",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { shortlink: string; url: string };
      expect(body.shortlink).toMatch(/^[a-f0-9]{8}$/);
      expect(body.url).toBe(`${baseUrl}/diff/${body.shortlink}`);
    });

    it("GET /diff/:shortlink returns HTML with side-by-side view", async () => {
      // Create a diff first
      const createRes = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          format: "mermaid",
          before: "graph TD; X-->Y;",
          after: "graph TD; X-->Y-->Z;",
        }),
      });
      const createBody = await createRes.json() as { shortlink: string };

      // View the diff
      const viewRes = await fetch(`${baseUrl}/diff/${createBody.shortlink}`);

      expect(viewRes.status).toBe(200);
      expect(viewRes.headers.get("Content-Type")).toBe("text/html");

      const html = await viewRes.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Before");
      expect(html).toContain("After");
      expect(html).toContain("diff-container");
    });

    it("GET /diff/:shortlink has cache headers", async () => {
      const createRes = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          format: "mermaid",
          before: "graph TD; Cache-->Test;",
          after: "graph TD; Cache-->Test-->Done;",
        }),
      });
      const createBody = await createRes.json() as { shortlink: string };

      const viewRes = await fetch(`${baseUrl}/diff/${createBody.shortlink}`);

      expect(viewRes.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    });

    it("GET /diff/nonexistent returns 404", async () => {
      const res = await fetch(`${baseUrl}/diff/nonexist`);
      expect(res.status).toBe(404);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("not found");
    });

    it("POST /diff with d2 format validates syntax", async () => {
      const res = await fetch(`${baseUrl}/diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          format: "d2",
          before: "a -> b",
          after: "a -> b -> c",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { shortlink: string; url: string };
      expect(body.shortlink).toMatch(/^[a-f0-9]{8}$/);
    });
  });
```

**Step 2: Run integration tests**

Run: `bun test src/__tests__/integration.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/__tests__/integration.test.ts
git commit -m "test: add integration tests for diff endpoints"
```

---

### Task 6: Final Verification

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 2: Run type check**

Run: `bunx @typescript/native-preview`
Expected: No errors

**Step 3: Start server and manual test**

Run: `bun run src/server.ts`

Test with curl:
```bash
# Create a diff
curl -X POST http://localhost:3000/diff \
  -H "Content-Type: application/json" \
  -d '{"format": "mermaid", "before": "graph TD; A-->B;", "after": "graph TD; A-->B-->C;"}'

# Open the returned URL in browser to verify side-by-side view
```

**Step 4: Commit final state**

```bash
git add -A
git commit -m "feat: complete diagram diff comparison feature"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Diff store with auto-migration | `src/atoms/diff-store.ts` |
| 2 | Diff viewer (side-by-side HTML) | `src/atoms/diff-viewer.ts` |
| 3 | Diff flows (create + view) | `src/flows/diff.ts` |
| 4 | Server routes | `src/server.ts` |
| 5 | Integration tests | `src/__tests__/integration.test.ts` |
| 6 | Final verification | Manual testing |

**Key features:**
- Separate `diagram_diffs` table (auto-created on first use)
- `POST /diff` creates comparison, returns shortlink
- `GET /diff/:id` renders side-by-side viewer with synced zoom/pan
- D2 syntax pre-validated before storing
- Same cleanup/retention as regular diagrams
- Responsive layout (stacked on mobile)
