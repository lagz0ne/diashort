import { atom } from "@pumped-fn/lite";

export interface HTMLGeneratorOptions {
  embedUrl?: string;
}

export interface HTMLGenerator {
  generateMermaid(source: string, shortlink: string): string;
  generateD2(lightSvg: string, darkSvg: string, shortlink: string, options?: HTMLGeneratorOptions): string;
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

const baseStyles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #fafafa;
    }
    html[data-theme="dark"] body { background: #1a1a1a; color: #eee; }
    #diagram {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      cursor: grab;
      position: relative;
    }
    #diagram.dragging { cursor: grabbing; }
    #diagram svg {
      transform-origin: 0 0;
      position: absolute;
      top: 0;
      left: 0;
      user-select: none;
      -webkit-user-select: none;
    }
    #diagram.selectable svg {
      user-select: text;
      -webkit-user-select: text;
    }
    #diagram.selectable { cursor: text; }
    #diagram.selectable.dragging { cursor: text; }
    #loading {
      color: #666;
      font-size: 0.875rem;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    #error {
      color: #dc3545;
      background: #fff5f5;
      padding: 1rem;
      border-radius: 4px;
      max-width: 600px;
      white-space: pre-wrap;
      font-family: monospace;
      font-size: 0.875rem;
      cursor: default;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    html[data-theme="dark"] #loading { color: #999; }
    html[data-theme="dark"] #error { background: #2d1f1f; }
    .controls {
      position: fixed;
      bottom: 16px;
      right: 16px;
      display: flex;
      gap: 4px;
      background: rgba(255, 255, 255, 0.9);
      padding: 6px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      z-index: 1000;
    }
    html[data-theme="dark"] .controls { background: rgba(40, 40, 40, 0.9); }
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
    html[data-theme="dark"] .controls button { color: #eee; }
    .controls button:hover { background: rgba(0, 0, 0, 0.1); }
    html[data-theme="dark"] .controls button:hover { background: rgba(255, 255, 255, 0.1); }
    .controls button.active { background: rgba(0, 102, 204, 0.2); }
    html[data-theme="dark"] .controls button.active { background: rgba(0, 102, 204, 0.3); }
    .controls button:focus {
      outline: 2px solid #0066cc;
      outline-offset: 1px;
    }
    .controls .separator {
      width: 1px;
      background: #ddd;
      margin: 4px 2px;
    }
    html[data-theme="dark"] .controls .separator { background: #555; }
    @media (pointer: coarse) {
      .controls button { width: 44px; height: 44px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .controls button { transition: none; }
    }
`;

const controlsHtml = `
  <div class="controls">
    <button id="zoom-in" aria-label="Zoom in">+</button>
    <button id="zoom-reset" aria-label="Reset view">&#x21BA;</button>
    <button id="zoom-out" aria-label="Zoom out">&minus;</button>
    <div class="separator"></div>
    <button id="select-toggle" aria-label="Enable text selection">T</button>
    <button id="theme-toggle" aria-label="Toggle dark mode">&#x263E;</button>
  </div>
`;

const viewportScript = `
  const viewport = {
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

  function initViewport() {
    const container = document.getElementById('diagram');
    const svg = container.querySelector('svg');
    if (!svg) return;

    // Get SVG dimensions from viewBox or getBBox
    let svgWidth, svgHeight;
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[\\s,]+/).map(Number);
      svgWidth = parts[2] || 800;
      svgHeight = parts[3] || 600;
    } else {
      const bbox = svg.getBBox();
      svgWidth = bbox.width || 800;
      svgHeight = bbox.height || 600;
    }

    // Set explicit dimensions on SVG to prevent 100% width issues
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('height', svgHeight);
    svg.style.width = svgWidth + 'px';
    svg.style.height = svgHeight + 'px';

    // Calculate scale to fit viewport with padding
    const vw = window.innerWidth - viewport.padding * 2;
    const vh = window.innerHeight - viewport.padding * 2;
    const scaleX = vw / svgWidth;
    const scaleY = vh / svgHeight;
    let fitScale = Math.min(scaleX, scaleY, 1); // Cap at 100%

    // Center the diagram
    const scaledWidth = svgWidth * fitScale;
    const scaledHeight = svgHeight * fitScale;
    const tx = (window.innerWidth - scaledWidth) / 2;
    const ty = (window.innerHeight - scaledHeight) / 2;

    viewport.scale = fitScale;
    viewport.translateX = tx;
    viewport.translateY = ty;
    viewport.homeState = { scale: fitScale, translateX: tx, translateY: ty };

    applyTransform();
    setupEventListeners();
  }

  function applyTransform() {
    const svg = document.querySelector('#diagram svg');
    if (!svg) return;
    svg.style.transform = 'translate(' + viewport.translateX + 'px, ' + viewport.translateY + 'px) scale(' + viewport.scale + ')';
  }

  function zoomTo(newScale, anchorX, anchorY) {
    newScale = Math.max(viewport.minScale, Math.min(viewport.maxScale, newScale));

    // Adjust translation to zoom toward anchor point
    const scaleDiff = newScale / viewport.scale;
    viewport.translateX = anchorX - (anchorX - viewport.translateX) * scaleDiff;
    viewport.translateY = anchorY - (anchorY - viewport.translateY) * scaleDiff;
    viewport.scale = newScale;

    applyTransform();
  }

  function resetView() {
    if (!viewport.homeState) return;
    viewport.scale = viewport.homeState.scale;
    viewport.translateX = viewport.homeState.translateX;
    viewport.translateY = viewport.homeState.translateY;
    applyTransform();
  }

  function setupEventListeners() {
    const container = document.getElementById('diagram');

    // Wheel zoom
    container.addEventListener('wheel', function(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 / viewport.zoomFactor : viewport.zoomFactor;
      zoomTo(viewport.scale * delta, e.clientX, e.clientY);
    }, { passive: false });

    // Mouse drag
    container.addEventListener('mousedown', function(e) {
      if (e.target.closest('.controls')) return;
      if (container.classList.contains('selectable')) return;
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      container.classList.add('dragging');
    });

    window.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      viewport.translateX += e.clientX - lastX;
      viewport.translateY += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      applyTransform();
    });

    window.addEventListener('mouseup', function() {
      isDragging = false;
      container.classList.remove('dragging');
    });

    // Touch events
    container.addEventListener('touchstart', function(e) {
      if (e.target.closest('.controls')) return;
      if (container.classList.contains('selectable')) return;
      if (e.touches.length === 1) {
        isDragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        container.classList.add('dragging');
      } else if (e.touches.length === 2) {
        isDragging = false;
        initialPinchDistance = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        initialPinchScale = viewport.scale;
      }
    }, { passive: true });

    container.addEventListener('touchmove', function(e) {
      if (e.target.closest('.controls')) return;
      e.preventDefault();
      if (e.touches.length === 1 && isDragging) {
        viewport.translateX += e.touches[0].clientX - lastX;
        viewport.translateY += e.touches[0].clientY - lastY;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        applyTransform();
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const newScale = initialPinchScale * (dist / initialPinchDistance);
        zoomTo(newScale, centerX, centerY);
      }
    }, { passive: false });

    container.addEventListener('touchend', function() {
      isDragging = false;
      container.classList.remove('dragging');
    });

    // Button controls
    document.getElementById('zoom-in').addEventListener('click', function() {
      zoomTo(viewport.scale * viewport.zoomFactor, window.innerWidth / 2, window.innerHeight / 2);
    });

    document.getElementById('zoom-out').addEventListener('click', function() {
      zoomTo(viewport.scale / viewport.zoomFactor, window.innerWidth / 2, window.innerHeight / 2);
    });

    document.getElementById('zoom-reset').addEventListener('click', resetView);

    document.getElementById('select-toggle').addEventListener('click', function() {
      container.classList.toggle('selectable');
      var isSelectable = container.classList.contains('selectable');
      this.classList.toggle('active', isSelectable);
      this.setAttribute('aria-label', isSelectable ? 'Disable text selection' : 'Enable text selection');
    });

    // Recalculate on resize
    window.addEventListener('resize', function() {
      const svg = document.querySelector('#diagram svg');
      if (!svg) return;
      const svgWidth = parseFloat(svg.getAttribute('width')) || 800;
      const svgHeight = parseFloat(svg.getAttribute('height')) || 600;
      const vw = window.innerWidth - viewport.padding * 2;
      const vh = window.innerHeight - viewport.padding * 2;
      const scaleX = vw / svgWidth;
      const scaleY = vh / svgHeight;
      const fitScale = Math.min(scaleX, scaleY, 1);
      const scaledWidth = svgWidth * fitScale;
      const scaledHeight = svgHeight * fitScale;
      const tx = (window.innerWidth - scaledWidth) / 2;
      const ty = (window.innerHeight - scaledHeight) / 2;
      viewport.homeState = { scale: fitScale, translateX: tx, translateY: ty };
    });
  }
`;

export const htmlGeneratorAtom = atom({
  deps: {},
  factory: (): HTMLGenerator => ({
    generateMermaid(source: string, shortlink: string): string {
      const escapedSource = escapeJs(source);
      const title = `Diagram - ${shortlink}`;

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div id="diagram">
    <div id="loading">Loading diagram...</div>
  </div>
  ${controlsHtml}

  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    ${viewportScript}

    const source = \`${escapedSource}\`;
    const shortlink = '${shortlink}';

    function getEffectiveTheme() {
      const stored = localStorage.getItem('theme-preference');
      if (stored === 'dark' || stored === 'light') return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyThemeUI() {
      const theme = getEffectiveTheme();
      document.documentElement.setAttribute('data-theme', theme);
      const btn = document.getElementById('theme-toggle');
      if (btn) {
        btn.innerHTML = theme === 'dark' ? '\\u2600' : '\\u263E';
        btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      }
    }

    async function render() {
      const container = document.getElementById('diagram');
      const theme = getEffectiveTheme();
      const mermaidTheme = theme === 'dark' ? 'dark' : 'default';
      const cacheKey = 'diagram-' + shortlink + '-' + theme;

      applyThemeUI();

      // Check localStorage cache
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        container.innerHTML = cached;
        initViewport();
        return;
      }

      try {
        mermaid.initialize({ startOnLoad: false, theme: mermaidTheme });
        const { svg } = await mermaid.render('mermaid-diagram', source);
        container.innerHTML = svg;
        localStorage.setItem(cacheKey, svg);
        initViewport();
      } catch (err) {
        container.innerHTML = '<div id="error">' + err.message + '</div>';
      }
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      if (!localStorage.getItem('theme-preference')) {
        document.getElementById('diagram').innerHTML = '<div id="loading">Loading diagram...</div>';
        render();
      }
    });

    document.getElementById('theme-toggle').addEventListener('click', function() {
      const next = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme-preference', next);
      document.getElementById('diagram').innerHTML = '<div id="loading">Loading diagram...</div>';
      render();
    });

    render();
  </script>
</body>
</html>`;
    },

    generateD2(lightSvg: string, darkSvg: string, shortlink: string, options?: HTMLGeneratorOptions): string {
      const title = `Diagram - ${shortlink}`;

      // Escape SVGs for embedding in script
      const escapedLightSvg = escapeJs(lightSvg);
      const escapedDarkSvg = escapeJs(darkSvg);

      // OpenGraph meta tags for link previews (only when embedUrl is provided)
      const ogTags = options?.embedUrl
        ? `
  <meta property="og:type" content="image">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:image" content="${escapeHtml(options.embedUrl)}">
  <meta property="og:image:type" content="image/svg+xml">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${escapeHtml(options.embedUrl)}">`
        : "";

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>${ogTags}
  <style>${baseStyles}</style>
</head>
<body>
  <div id="diagram">
    <div id="loading">Loading diagram...</div>
  </div>
  ${controlsHtml}

  <script>
    ${viewportScript}

    const lightSvg = \`${escapedLightSvg}\`;
    const darkSvg = \`${escapedDarkSvg}\`;

    function getEffectiveTheme() {
      const stored = localStorage.getItem('theme-preference');
      if (stored === 'dark' || stored === 'light') return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function render() {
      const theme = getEffectiveTheme();
      document.documentElement.setAttribute('data-theme', theme);
      const container = document.getElementById('diagram');
      container.innerHTML = theme === 'dark' ? darkSvg : lightSvg;
      const btn = document.getElementById('theme-toggle');
      if (btn) {
        btn.innerHTML = theme === 'dark' ? '\\u2600' : '\\u263E';
        btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      }
      initViewport();
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      if (!localStorage.getItem('theme-preference')) render();
    });

    document.getElementById('theme-toggle').addEventListener('click', function() {
      const next = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme-preference', next);
      render();
    });

    render();
  </script>
</body>
</html>`;
    },
  }),
});
