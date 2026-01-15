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
