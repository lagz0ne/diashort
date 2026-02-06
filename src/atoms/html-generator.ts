import { atom } from "@pumped-fn/lite";

export interface HTMLGeneratorOptions {
  embedUrl?: string;
  versionInfo?: VersionInfo;
}

export interface VersionInfo {
  shortlink: string;
  currentVersion: string;
  versionsApiUrl: string;
  hasMultipleVersions: boolean;
  format: "mermaid" | "d2";
}

export interface HTMLGenerator {
  generateMermaid(source: string, shortlink: string, options?: HTMLGeneratorOptions): string;
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
    #diagram > svg {
      transform-origin: 0 0;
      position: absolute;
      top: 0;
      left: 0;
      user-select: none;
      -webkit-user-select: none;
    }
    html[data-theme="dark"] #diagram > svg {
      filter: invert(1) hue-rotate(180deg);
    }
    #diagram.selectable > svg {
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
      gap: 6px;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 8px 10px;
      border-radius: 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.1);
      border: 1px solid rgba(0,0,0,0.06);
      z-index: 1000;
      align-items: center;
    }
    html[data-theme="dark"] .controls {
      background: rgba(36, 36, 36, 0.92);
      border-color: rgba(255,255,255,0.08);
      box-shadow: 0 1px 3px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.3);
    }
    .controls button {
      width: 34px;
      height: 34px;
      border: none;
      background: transparent;
      cursor: pointer;
      border-radius: 7px;
      font-size: 17px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #444;
      transition: background 0.15s, color 0.15s;
    }
    html[data-theme="dark"] .controls button { color: #ccc; }
    .controls button:hover { background: rgba(0, 0, 0, 0.07); color: #111; }
    html[data-theme="dark"] .controls button:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
    .controls button.active { background: rgba(0, 102, 204, 0.15); color: #0066cc; }
    html[data-theme="dark"] .controls button.active { background: rgba(60, 140, 255, 0.2); color: #6ab0ff; }
    .controls button:focus-visible {
      outline: 2px solid #0066cc;
      outline-offset: 1px;
    }
    .controls .separator {
      width: 1px;
      height: 20px;
      background: rgba(0,0,0,0.1);
      margin: 0 2px;
      flex-shrink: 0;
    }
    html[data-theme="dark"] .controls .separator { background: rgba(255,255,255,0.1); }
    .controls select {
      height: 34px;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 7px;
      padding: 0 28px 0 10px;
      font-size: 13px;
      font-weight: 500;
      background: rgba(0,0,0,0.03);
      color: #333;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      transition: border-color 0.15s, background 0.15s;
    }
    .controls select:hover { border-color: rgba(0,0,0,0.25); background: rgba(0,0,0,0.06); }
    .controls select:focus-visible { outline: 2px solid #0066cc; outline-offset: 1px; }
    html[data-theme="dark"] .controls select {
      border-color: rgba(255,255,255,0.12);
      color: #ddd;
      background-color: rgba(255,255,255,0.06);
      background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }
    html[data-theme="dark"] .controls select:hover { border-color: rgba(255,255,255,0.25); background-color: rgba(255,255,255,0.1); }
    .controls #compare-btn {
      font-size: 14px;
      font-weight: 500;
      width: auto;
      padding: 0 10px;
      gap: 4px;
      letter-spacing: -0.01em;
    }
    @media (pointer: coarse) {
      .controls button { width: 44px; height: 44px; }
      .controls select { height: 44px; }
      .controls #compare-btn { height: 44px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .controls button, .controls select { transition: none; }
    }
`;

const versionStyles = `
    .compare-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.85);
      z-index: 2000;
      display: none;
      flex-direction: column;
    }
    .compare-overlay.active { display: flex; }
    .compare-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      background: #fff;
      border-bottom: 1px solid #e5e5e5;
      flex-shrink: 0;
    }
    html[data-theme="dark"] .compare-header { background: #1e1e1e; border-color: #333; }
    .compare-header label {
      font-size: 12px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    html[data-theme="dark"] .compare-header label { color: #777; }
    .compare-header select {
      height: 34px;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 7px;
      padding: 0 28px 0 10px;
      font-size: 13px;
      font-weight: 500;
      background: rgba(0,0,0,0.03);
      color: #333;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      transition: border-color 0.15s;
      cursor: pointer;
    }
    .compare-header select:hover { border-color: rgba(0,0,0,0.25); }
    .compare-header select:focus-visible { outline: 2px solid #0066cc; outline-offset: 1px; }
    html[data-theme="dark"] .compare-header select {
      border-color: rgba(255,255,255,0.12);
      background-color: rgba(255,255,255,0.06);
      color: #ddd;
      background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }
    html[data-theme="dark"] .compare-header select:hover { border-color: rgba(255,255,255,0.25); }
    .compare-header .compare-close {
      margin-left: auto;
      width: 34px; height: 34px;
      border: none; background: transparent;
      cursor: pointer; font-size: 18px; color: #888;
      border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, color 0.15s;
    }
    .compare-header .compare-close:hover { background: rgba(0,0,0,0.07); color: #333; }
    html[data-theme="dark"] .compare-header .compare-close { color: #888; }
    html[data-theme="dark"] .compare-header .compare-close:hover { background: rgba(255,255,255,0.1); color: #ddd; }
    .compare-panels {
      flex: 1;
      display: flex;
      flex-direction: row;
      overflow: hidden;
    }
    .compare-panel {
      flex: 1;
      overflow: hidden;
      position: relative;
      cursor: grab;
    }
    .compare-panel.dragging { cursor: grabbing; }
    .compare-panel:first-child { border-right: 1px solid #444; }
    .compare-panel-label {
      position: absolute;
      top: 8px; left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.6);
      color: #fff;
      padding: 2px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      z-index: 1;
      pointer-events: none;
    }
    .compare-panel > svg {
      transform-origin: 0 0;
      position: absolute;
      top: 0; left: 0;
      user-select: none;
    }
    .compare-panel .compare-loading {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      color: #999;
      font-size: 14px;
    }
`;

function buildControlsHtml(versionInfo?: VersionInfo): string {
  const versionControls = versionInfo?.hasMultipleVersions
    ? `
    <select id="version-picker" aria-label="Select version"></select>
    <button id="compare-btn" aria-label="Compare versions" title="Compare versions">&#x2194; Compare</button>
    <div class="separator"></div>`
    : "";

  return `
  <div class="controls">
    ${versionControls}
    <button id="zoom-in" aria-label="Zoom in">+</button>
    <button id="zoom-reset" aria-label="Reset view">&#x21BA;</button>
    <button id="zoom-out" aria-label="Zoom out">&minus;</button>
    <div class="separator"></div>
    <button id="select-toggle" aria-label="Enable text selection">T</button>
    <button id="theme-toggle" aria-label="Toggle dark mode">&#x263E;</button>
  </div>`;
}

function buildCompareOverlayHtml(): string {
  return `
  <div id="compare-overlay" class="compare-overlay">
    <div class="compare-header">
      <label>From:</label>
      <select id="compare-from"></select>
      <label>To:</label>
      <select id="compare-to"></select>
      <button class="compare-close" id="compare-close" aria-label="Close comparison">&times;</button>
    </div>
    <div class="compare-panels">
      <div class="compare-panel" id="compare-panel-from">
        <div class="compare-panel-label" id="compare-label-from">From</div>
        <div class="compare-loading">Select versions to compare</div>
      </div>
      <div class="compare-panel" id="compare-panel-to">
        <div class="compare-panel-label" id="compare-label-to">To</div>
        <div class="compare-loading">Select versions to compare</div>
      </div>
    </div>
  </div>`;
}

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
    const svg = container.querySelector(':scope > svg');
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
    const svg = document.querySelector('#diagram > svg');
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
      const svg = document.querySelector('#diagram > svg');
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

function buildVersionScript(versionInfo: VersionInfo): string {
  return `
    // Version picker + compare overlay
    const versionShortlink = '${versionInfo.shortlink}';
    const currentVersion = '${versionInfo.currentVersion}';
    const versionsApiUrl = '${versionInfo.versionsApiUrl}';
    const diagramFormat = '${versionInfo.format}';
    let versionsList = [];

    async function loadVersions() {
      try {
        const res = await fetch(versionsApiUrl);
        const data = await res.json();
        versionsList = data.versions || [];
        populateVersionPicker();
        populateCompareDropdowns();
      } catch (e) { console.error('Failed to load versions', e); }
    }

    function populateVersionPicker() {
      const picker = document.getElementById('version-picker');
      if (!picker) return;
      picker.innerHTML = '';
      versionsList.forEach(function(v) {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = v.name;
        if (v.name === currentVersion) opt.selected = true;
        picker.appendChild(opt);
      });
      picker.addEventListener('change', function() {
        window.location.href = '/d/' + versionShortlink + '/' + this.value;
      });
    }

    function populateCompareDropdowns() {
      var fromSel = document.getElementById('compare-from');
      var toSel = document.getElementById('compare-to');
      if (!fromSel || !toSel) return;
      [fromSel, toSel].forEach(function(sel) {
        sel.innerHTML = '<option value="">-- select --</option>';
        versionsList.forEach(function(v) {
          var opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = v.name;
          sel.appendChild(opt);
        });
      });
    }

    // Compare overlay
    var compareOverlay = document.getElementById('compare-overlay');
    var compareBtn = document.getElementById('compare-btn');
    var compareClose = document.getElementById('compare-close');

    var compareViewport = { scale: 1, translateX: 0, translateY: 0 };
    var compareDragging = false;
    var compareLastX = 0, compareLastY = 0;

    function applyCompareTransform() {
      var panels = document.querySelectorAll('.compare-panel > svg');
      panels.forEach(function(svg) {
        svg.style.transform = 'translate(' + compareViewport.translateX + 'px, ' + compareViewport.translateY + 'px) scale(' + compareViewport.scale + ')';
      });
    }

    if (compareBtn) {
      compareBtn.addEventListener('click', function() {
        compareOverlay.classList.add('active');
      });
    }
    if (compareClose) {
      compareClose.addEventListener('click', function() {
        compareOverlay.classList.remove('active');
      });
    }

    // Synced pan/zoom on compare panels
    document.querySelectorAll('.compare-panel').forEach(function(panel) {
      panel.addEventListener('wheel', function(e) {
        e.preventDefault();
        var factor = e.deltaY > 0 ? 1/1.2 : 1.2;
        var newScale = Math.max(0.1, Math.min(5, compareViewport.scale * factor));
        var diff = newScale / compareViewport.scale;
        var rect = panel.getBoundingClientRect();
        var cx = e.clientX - rect.left;
        var cy = e.clientY - rect.top;
        compareViewport.translateX = cx - (cx - compareViewport.translateX) * diff;
        compareViewport.translateY = cy - (cy - compareViewport.translateY) * diff;
        compareViewport.scale = newScale;
        applyCompareTransform();
      }, { passive: false });

      panel.addEventListener('mousedown', function(e) {
        compareDragging = true;
        compareLastX = e.clientX;
        compareLastY = e.clientY;
        panel.classList.add('dragging');
      });
    });

    window.addEventListener('mousemove', function(e) {
      if (!compareDragging) return;
      compareViewport.translateX += e.clientX - compareLastX;
      compareViewport.translateY += e.clientY - compareLastY;
      compareLastX = e.clientX;
      compareLastY = e.clientY;
      applyCompareTransform();
    });

    window.addEventListener('mouseup', function() {
      compareDragging = false;
      document.querySelectorAll('.compare-panel').forEach(function(p) { p.classList.remove('dragging'); });
    });

    async function renderComparePanel(panelId, versionName) {
      var panel = document.getElementById(panelId);
      if (!panel || !versionName) return;
      panel.innerHTML = '<div class="compare-panel-label">' + versionName + '</div><div class="compare-loading">Loading...</div>';

      try {
        if (diagramFormat === 'mermaid') {
          var res = await fetch('/api/d/' + versionShortlink + '/versions/' + versionName + '/source');
          var data = await res.json();
          var mermaidTheme = getEffectiveTheme() === 'dark' ? 'dark' : 'default';
          mermaid.initialize({ startOnLoad: false, theme: mermaidTheme });
          var result = await mermaid.render('compare-' + panelId + '-' + Date.now(), data.source);
          panel.innerHTML = '<div class="compare-panel-label">' + versionName + '</div>' + result.svg;
        } else {
          var theme = getEffectiveTheme();
          var embedRes = await fetch('/e/' + versionShortlink + '/' + versionName + '?theme=' + theme);
          var svgText = await embedRes.text();
          panel.innerHTML = '<div class="compare-panel-label">' + versionName + '</div>' + svgText;
        }
      } catch (e) {
        panel.innerHTML = '<div class="compare-panel-label">' + versionName + '</div><div class="compare-loading">Failed to load</div>';
      }
    }

    var fromSel = document.getElementById('compare-from');
    var toSel = document.getElementById('compare-to');
    if (fromSel) {
      fromSel.addEventListener('change', function() {
        compareViewport = { scale: 1, translateX: 0, translateY: 0 };
        renderComparePanel('compare-panel-from', this.value);
      });
    }
    if (toSel) {
      toSel.addEventListener('change', function() {
        compareViewport = { scale: 1, translateX: 0, translateY: 0 };
        renderComparePanel('compare-panel-to', this.value);
      });
    }

    loadVersions();
  `;
}

export const htmlGeneratorAtom = atom({
  deps: {},
  factory: (): HTMLGenerator => ({
    generateMermaid(source: string, shortlink: string, options?: HTMLGeneratorOptions): string {
      const escapedSource = escapeJs(source);
      const versionInfo = options?.versionInfo;
      const versionName = versionInfo?.currentVersion ?? shortlink;
      const title = `Diagram - ${shortlink}`;
      const hasVersions = versionInfo?.hasMultipleVersions ?? false;

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${baseStyles}${hasVersions ? versionStyles : ""}</style>
</head>
<body>
  <div id="diagram">
    <div id="loading">Loading diagram...</div>
  </div>
  ${buildControlsHtml(versionInfo)}
  ${hasVersions ? buildCompareOverlayHtml() : ""}

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
      const cacheKey = 'diagram-' + shortlink + '-${escapeJs(versionName)}';

      applyThemeUI();

      // Check localStorage cache
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        container.innerHTML = cached;
        initViewport();
        return;
      }

      try {
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
        const { svg } = await mermaid.render('mermaid-diagram', source);
        container.innerHTML = svg;
        localStorage.setItem(cacheKey, svg);
        initViewport();
      } catch (err) {
        container.innerHTML = '<div id="error">' + err.message + '</div>';
      }
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      if (!localStorage.getItem('theme-preference')) applyThemeUI();
    });

    document.getElementById('theme-toggle').addEventListener('click', function() {
      const next = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme-preference', next);
      applyThemeUI();
    });

    render();
    ${hasVersions && versionInfo ? buildVersionScript(versionInfo) : ""}
  </script>
</body>
</html>`;
    },

    generateD2(lightSvg: string, darkSvg: string, shortlink: string, options?: HTMLGeneratorOptions): string {
      const title = `Diagram - ${shortlink}`;
      const versionInfo = options?.versionInfo;
      const hasVersions = versionInfo?.hasMultipleVersions ?? false;

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
  <style>${baseStyles}${hasVersions ? versionStyles : ""}</style>
</head>
<body>
  <div id="diagram">
    <div id="loading">Loading diagram...</div>
  </div>
  ${buildControlsHtml(versionInfo)}
  ${hasVersions ? buildCompareOverlayHtml() : ""}

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
    ${hasVersions && versionInfo ? buildVersionScript(versionInfo) : ""}
  </script>
</body>
</html>`;
    },
  }),
});
