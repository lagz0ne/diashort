import { atom } from "@pumped-fn/lite";

export interface HTMLGenerator {
  generateMermaid(source: string, shortlink: string): string;
  generateD2(lightSvg: string, darkSvg: string, shortlink: string): string;
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
    html, body { height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
      background: #fafafa;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #1a1a1a; color: #eee; }
    }
    #diagram {
      max-width: 100%;
      overflow: auto;
    }
    #diagram svg {
      max-width: 100%;
      height: auto;
      min-width: 200px;
      min-height: 200px;
    }
    #diagram svg:not([width]) {
      width: 100%;
    }
    #loading {
      color: #666;
      font-size: 0.875rem;
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
    }
    @media (prefers-color-scheme: dark) {
      #loading { color: #999; }
      #error { background: #2d1f1f; }
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

  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    const source = \`${escapedSource}\`;
    const shortlink = '${shortlink}';

    function getTheme() {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default';
    }

    function getCacheKey() {
      return 'diagram-' + shortlink + '-' + getTheme();
    }

    async function render() {
      const container = document.getElementById('diagram');
      const theme = getTheme();
      const cacheKey = getCacheKey();

      // Check localStorage cache
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        container.innerHTML = cached;
        return;
      }

      try {
        mermaid.initialize({ startOnLoad: false, theme: theme });
        const { svg } = await mermaid.render('mermaid-diagram', source);
        container.innerHTML = svg;
        localStorage.setItem(cacheKey, svg);
      } catch (err) {
        container.innerHTML = '<div id="error">' + err.message + '</div>';
      }
    }

    // Re-render when color scheme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      document.getElementById('diagram').innerHTML = '<div id="loading">Loading diagram...</div>';
      render();
    });

    render();
  </script>
</body>
</html>`;
    },

    generateD2(lightSvg: string, darkSvg: string, shortlink: string): string {
      const title = `Diagram - ${shortlink}`;

      // Escape SVGs for embedding in script
      const escapedLightSvg = escapeJs(lightSvg);
      const escapedDarkSvg = escapeJs(darkSvg);

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

  <script>
    const lightSvg = \`${escapedLightSvg}\`;
    const darkSvg = \`${escapedDarkSvg}\`;

    function isDark() {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function render() {
      const container = document.getElementById('diagram');
      container.innerHTML = isDark() ? darkSvg : lightSvg;
    }

    // Re-render when color scheme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

    render();
  </script>
</body>
</html>`;
    },
  }),
});
