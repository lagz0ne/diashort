/**
 * Diashort index page — research-paper aesthetic.
 * Pure HTML/CSS, zero JS dependencies. Bright, typographic, academic.
 */
export function indexPage(origin: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Diashort — Diagram Shortlink Service</title>
  <style>
    /* ── Reset & Base ─────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --fg: #1a1a2e;
      --bg: #fefefe;
      --accent: #e84855;
      --accent2: #f9a825;
      --accent3: #2196f3;
      --code-bg: #f5f0eb;
      --rule: #e0dcd4;
      --muted: #6b6b7b;
      --serif: "Crimson Pro", "Georgia", "Times New Roman", serif;
      --mono: "JetBrains Mono", "Fira Code", "Consolas", monospace;
      --sans: "Inter", "Helvetica Neue", system-ui, sans-serif;
      --content-w: 720px;
    }

    html { font-size: 18px; scroll-behavior: smooth; }
    body {
      font-family: var(--serif);
      color: var(--fg);
      background: var(--bg);
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Paper Container ──────────────────────────── */
    .paper {
      max-width: var(--content-w);
      margin: 0 auto;
      padding: 4rem 2rem 6rem;
    }

    /* ── Header / Title Block ─────────────────────── */
    .header {
      text-align: center;
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 2px solid var(--fg);
    }

    .header h1 {
      font-size: 2.4rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.15;
      margin-bottom: 0.3rem;
    }

    .header h1 .accent { color: var(--accent); }

    .header .subtitle {
      font-size: 1.15rem;
      color: var(--muted);
      font-style: italic;
      margin-bottom: 1.2rem;
    }

    .header .authors {
      font-family: var(--sans);
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--muted);
    }

    .header .authors a {
      color: var(--accent3);
      text-decoration: none;
    }

    .header .authors a:hover {
      text-decoration: underline;
    }

    /* ── Abstract ──────────────────────────────────── */
    .abstract {
      background: linear-gradient(135deg, #fff8f0 0%, #f0f7ff 100%);
      border-left: 4px solid var(--accent);
      padding: 1.5rem 1.8rem;
      margin-bottom: 2.5rem;
      border-radius: 0 8px 8px 0;
    }

    .abstract-label {
      font-family: var(--sans);
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--accent);
      margin-bottom: 0.5rem;
    }

    .abstract p {
      font-size: 0.95rem;
      color: #333;
    }

    /* ── Sections ──────────────────────────────────── */
    .section {
      margin-bottom: 2.5rem;
    }

    .section h2 {
      font-size: 1.35rem;
      font-weight: 700;
      margin-bottom: 0.8rem;
      padding-bottom: 0.3rem;
      border-bottom: 1px solid var(--rule);
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }

    .section h2 .num {
      font-family: var(--mono);
      font-size: 0.85rem;
      color: var(--accent);
      font-weight: 400;
    }

    .section h3 {
      font-size: 1.05rem;
      font-weight: 600;
      margin: 1.2rem 0 0.5rem;
      color: var(--accent3);
    }

    .section p {
      margin-bottom: 0.8rem;
    }

    /* ── Endpoint Cards ───────────────────────────── */
    .endpoints {
      display: grid;
      gap: 1rem;
      margin: 1.2rem 0;
    }

    .endpoint {
      background: var(--code-bg);
      border: 1px solid var(--rule);
      border-radius: 8px;
      padding: 1.2rem 1.4rem;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .endpoint:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
    }

    .endpoint .method {
      font-family: var(--mono);
      font-size: 0.7rem;
      font-weight: 700;
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      margin-right: 0.5rem;
    }

    .method.post { background: var(--accent); color: white; }
    .method.get { background: var(--accent3); color: white; }

    .endpoint .path {
      font-family: var(--mono);
      font-size: 0.85rem;
      font-weight: 600;
    }

    .endpoint .desc {
      font-size: 0.85rem;
      color: var(--muted);
      margin-top: 0.4rem;
    }

    .endpoint .params {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted);
      margin-top: 0.3rem;
    }

    /* ── Code Blocks ──────────────────────────────── */
    pre {
      background: #1a1a2e;
      color: #e0e0e0;
      font-family: var(--mono);
      font-size: 0.75rem;
      line-height: 1.6;
      padding: 1.2rem 1.4rem;
      border-radius: 8px;
      overflow-x: auto;
      margin: 1rem 0;
      position: relative;
    }

    pre .comment { color: #6b7280; }
    pre .string { color: #fbbf24; }
    pre .key { color: #60a5fa; }
    pre .cmd { color: #34d399; }

    code {
      font-family: var(--mono);
      font-size: 0.82rem;
      background: var(--code-bg);
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
    }

    pre code {
      background: none;
      padding: 0;
      font-size: inherit;
    }

    /* ── Table ─────────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
      font-size: 0.85rem;
    }

    thead th {
      font-family: var(--sans);
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted);
      text-align: left;
      padding: 0.5rem 0.8rem;
      border-bottom: 2px solid var(--fg);
    }

    tbody td {
      padding: 0.55rem 0.8rem;
      border-bottom: 1px solid var(--rule);
      vertical-align: top;
    }

    tbody tr:last-child td { border-bottom: none; }
    tbody td:first-child { font-family: var(--mono); font-size: 0.8rem; }

    /* ── Diagram Demo ─────────────────────────────── */
    .demo {
      background: linear-gradient(135deg, #fef3c7 0%, #fce7f3 50%, #dbeafe 100%);
      border-radius: 12px;
      padding: 1.5rem 1.8rem;
      margin: 1.5rem 0;
      text-align: center;
    }

    .demo-label {
      font-family: var(--sans);
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--accent);
      margin-bottom: 0.3rem;
    }

    .demo textarea {
      width: 100%;
      min-height: 100px;
      font-family: var(--mono);
      font-size: 0.78rem;
      padding: 0.8rem;
      border: 1px solid var(--rule);
      border-radius: 6px;
      background: white;
      color: var(--fg);
      resize: vertical;
      margin: 0.8rem 0;
    }

    .demo textarea:focus {
      outline: none;
      border-color: var(--accent3);
      box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
    }

    .demo-controls {
      display: flex;
      gap: 0.6rem;
      justify-content: center;
      align-items: center;
      margin-bottom: 0.8rem;
    }

    .demo select, .demo button {
      font-family: var(--sans);
      font-size: 0.78rem;
      padding: 0.45rem 1rem;
      border-radius: 6px;
      border: 1px solid var(--rule);
      cursor: pointer;
    }

    .demo select {
      background: white;
      color: var(--fg);
    }

    .demo button {
      background: var(--accent);
      color: white;
      border: none;
      font-weight: 600;
      transition: background 0.15s ease, transform 0.1s ease;
    }

    .demo button:hover { background: #d63c49; transform: translateY(-1px); }
    .demo button:active { transform: translateY(0); }
    .demo button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .demo-result {
      margin-top: 0.8rem;
      font-family: var(--mono);
      font-size: 0.75rem;
      text-align: left;
      min-height: 2rem;
    }

    .demo-result a {
      color: var(--accent3);
      text-decoration: none;
      font-weight: 600;
    }

    .demo-result a:hover { text-decoration: underline; }

    .demo-result .error { color: var(--accent); }

    /* ── Footnotes ─────────────────────────────────── */
    .footnotes {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--rule);
      font-size: 0.8rem;
      color: var(--muted);
    }

    .footnotes h2 { font-size: 1rem; border: none; padding: 0; margin-bottom: 0.6rem; }

    .footnotes p { margin-bottom: 0.4rem; }

    .footnotes a { color: var(--accent3); text-decoration: none; }
    .footnotes a:hover { text-decoration: underline; }

    sup {
      font-size: 0.65rem;
      color: var(--accent);
      font-weight: 600;
    }

    /* ── Badge Row ─────────────────────────────────── */
    .badges {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 0.8rem;
    }

    .badge {
      font-family: var(--sans);
      font-size: 0.6rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 0.2rem 0.6rem;
      border-radius: 99px;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }

    .badge.runtime { background: #fef3c7; color: #92400e; }
    .badge.formats { background: #dbeafe; color: #1e40af; }
    .badge.storage { background: #d1fae5; color: #065f46; }

    /* ── Responsive ────────────────────────────────── */
    @media (max-width: 600px) {
      html { font-size: 16px; }
      .paper { padding: 2rem 1.2rem 4rem; }
      .header h1 { font-size: 1.8rem; }
      pre { font-size: 0.7rem; padding: 1rem; }
    }

    /* ── Print ─────────────────────────────────────── */
    @media print {
      .demo, .demo-controls, .demo-result { display: none; }
      pre { white-space: pre-wrap; }
      .endpoint:hover { transform: none; box-shadow: none; }
    }
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
</head>
<body>
  <div class="paper">

    <!-- ── Title Block ─────────────────────────────── -->
    <header class="header">
      <h1>Dia<span class="accent">short</span></h1>
      <p class="subtitle">A Stateless Diagram Shortlink Service for Mermaid &amp; D2</p>
      <div class="badges">
        <span class="badge runtime">&#9889; Bun Runtime</span>
        <span class="badge formats">&#9998; Mermaid &amp; D2</span>
        <span class="badge storage">&#128230; SQLite Backed</span>
      </div>
      <p class="authors" style="margin-top: 1rem;">
        Open-source &middot; <a href="https://github.com/lagz0ne/diashort">github.com/lagz0ne/diashort</a>
      </p>
    </header>

    <!-- ── Abstract ────────────────────────────────── -->
    <div class="abstract">
      <div class="abstract-label">Abstract</div>
      <p>
        Diashort transforms diagram source code into permanent, shareable shortlinks.
        Submit Mermaid or D2 markup via a single API call and receive an immutable URL
        that renders an interactive viewer with zoom, pan, and theme support.
        Embed raw SVGs directly in documentation, READMEs, and dashboards.
        Every shortlink supports multi-version history<sup>1</sup> &mdash;
        update a diagram without breaking existing links.
      </p>
    </div>

    <!-- ── §1 Introduction ─────────────────────────── -->
    <section class="section">
      <h2><span class="num">§1</span> Introduction</h2>
      <p>
        Diagrams are essential for communicating architecture, workflows, and data models.
        Yet sharing them remains friction-heavy: rendering locally, exporting PNGs,
        uploading to hosting services, and managing stale versions.
      </p>
      <p>
        Diashort eliminates this loop. Write your diagram in code, POST it,
        get a permanent link. The service handles rendering, caching, and versioning.
        Every diagram is addressable by a short, human-friendly URL.
      </p>
    </section>

    <!-- ── §2 API Reference ────────────────────────── -->
    <section class="section">
      <h2><span class="num">§2</span> API Reference</h2>

      <div class="endpoints">
        <div class="endpoint">
          <span class="method post">POST</span>
          <span class="path">/render</span>
          <div class="desc">Create a new diagram shortlink or update an existing one.</div>
          <div class="params">
            Body: <code>{ "source": "...", "format": "mermaid|d2" }</code><br/>
            Optional: <code>"shortlink": "abc123"</code> (update existing), <code>"versionName": "v2"</code>
          </div>
        </div>

        <div class="endpoint">
          <span class="method get">GET</span>
          <span class="path">/d/:shortlink</span>
          <div class="desc">View diagram in an interactive HTML viewer with zoom, pan, and dark mode toggle.</div>
          <div class="params">Bare shortlink redirects (302) to latest version.</div>
        </div>

        <div class="endpoint">
          <span class="method get">GET</span>
          <span class="path">/e/:shortlink</span>
          <div class="desc">Raw SVG embed &mdash; perfect for <code>&lt;img&gt;</code> tags and markdown.</div>
          <div class="params">Query: <code>?theme=light|dark</code></div>
        </div>

        <div class="endpoint">
          <span class="method get">GET</span>
          <span class="path">/health</span>
          <div class="desc">Health check endpoint for uptime monitors and load balancers.</div>
          <div class="params">Returns <code>{ "status": "ok" }</code></div>
        </div>
      </div>
    </section>

    <!-- ── §3 Quick Start ──────────────────────────── -->
    <section class="section">
      <h2><span class="num">§3</span> Quick Start</h2>

      <h3>3.1 &ensp; Create a Mermaid diagram</h3>
      <pre><code><span class="cmd">curl</span> -s -X POST ${origin}/render \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -d <span class="string">'{"source": "graph TD\\n  A[Start] --> B{Decision}\\n  B -->|Yes| C[Do it]\\n  B -->|No| D[Skip]", "format": "mermaid"}'</span></code></pre>

      <h3>3.2 &ensp; Create a D2 diagram</h3>
      <pre><code><span class="cmd">curl</span> -s -X POST ${origin}/render \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -d <span class="string">'{"source": "server -> db: query\\ndb -> server: results\\nserver -> client: response", "format": "d2"}'</span></code></pre>

      <h3>3.3 &ensp; Embed in Markdown</h3>
      <pre><code><span class="comment"># Use the embed URL in any markdown document</span>
![Architecture](${origin}/e/<span class="string">your-shortlink</span>?theme=light)</code></pre>
    </section>

    <!-- ── §4 Response Format ──────────────────────── -->
    <section class="section">
      <h2><span class="num">§4</span> Response Format</h2>
      <p>A successful <code>POST /render</code> returns:</p>
      <pre><code>{
  <span class="key">"shortlink"</span>: <span class="string">"a1b2c3"</span>,
  <span class="key">"url"</span>:       <span class="string">"${origin}/d/a1b2c3/v1"</span>,
  <span class="key">"embed"</span>:     <span class="string">"${origin}/e/a1b2c3/v1"</span>
}</code></pre>

      <table>
        <thead>
          <tr><th>Field</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td>shortlink</td><td>The unique identifier for this diagram</td></tr>
          <tr><td>url</td><td>Full URL to the interactive viewer (immutable-cached per version)</td></tr>
          <tr><td>embed</td><td>Direct SVG URL for embedding in docs, READMEs, dashboards</td></tr>
        </tbody>
      </table>
    </section>

    <!-- ── §5 Versioning ───────────────────────────── -->
    <section class="section">
      <h2><span class="num">§5</span> Multi-Version Shortlinks</h2>
      <p>
        Each shortlink supports multiple versions<sup>1</sup>. Bare shortlink URLs always
        redirect to the latest version. Versioned URLs are immutable and permanently cached.
      </p>
      <pre><code><span class="comment"># Update an existing diagram (auto-increments version)</span>
<span class="cmd">curl</span> -s -X POST ${origin}/render \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -d <span class="string">'{"source": "graph TD\\n  A --> B --> C", "format": "mermaid", "shortlink": "a1b2c3"}'</span>

<span class="comment"># Name a version explicitly</span>
<span class="cmd">curl</span> -s -X POST ${origin}/render \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -d <span class="string">'{"source": "...", "format": "mermaid", "shortlink": "a1b2c3", "versionName": "final-review"}'</span></code></pre>

      <table>
        <thead>
          <tr><th>URL Pattern</th><th>Behavior</th></tr>
        </thead>
        <tbody>
          <tr><td>/d/a1b2c3</td><td>302 redirect &#8594; latest version</td></tr>
          <tr><td>/d/a1b2c3/v1</td><td>Immutable, cached forever</td></tr>
          <tr><td>/d/a1b2c3/final-review</td><td>Named version, also immutable</td></tr>
        </tbody>
      </table>
    </section>

    <!-- ── §6 Live Playground ──────────────────────── -->
    <section class="section">
      <h2><span class="num">§6</span> Playground</h2>
      <p>Try it directly &mdash; paste diagram source below and hit render.</p>

      <div class="demo">
        <div class="demo-label">Interactive Demo</div>
        <div class="demo-controls">
          <select id="demo-format">
            <option value="mermaid">Mermaid</option>
            <option value="d2">D2</option>
          </select>
          <button id="demo-submit" onclick="submitDemo()">Render &amp; Create Link</button>
        </div>
        <textarea id="demo-source" spellcheck="false">graph TD
  A[User Request] --> B{Auth?}
  B -->|Yes| C[Process]
  B -->|No| D[Reject]
  C --> E[Respond]</textarea>
        <div class="demo-result" id="demo-result"></div>
      </div>
    </section>

    <!-- ── Footnotes ───────────────────────────────── -->
    <footer class="footnotes">
      <h2>Notes</h2>
      <p><sup>1</sup> Multi-version shortlinks were introduced in the February 2026 release.
        Version names must start with a letter; <code>^v\\d+$</code> patterns are reserved for auto-versioning.</p>
      <p style="margin-top: 1rem; font-size: 0.72rem;">
        Diashort is built with <a href="https://bun.sh">Bun</a>,
        <a href="https://mermaid.js.org">Mermaid</a>,
        <a href="https://d2lang.com">D2</a>, and
        <a href="https://github.com/nickhudkins/pumped-fn">@pumped-fn/lite</a>.
      </p>
    </footer>

  </div>

  <script>
    const ORIGIN = ${JSON.stringify(origin)};

    function submitDemo() {
      const source = document.getElementById("demo-source").value.trim();
      const format = document.getElementById("demo-format").value;
      const result = document.getElementById("demo-result");
      const btn = document.getElementById("demo-submit");

      if (!source) { result.innerHTML = '<span class="error">Please enter diagram source.</span>'; return; }

      btn.disabled = true;
      btn.textContent = "Rendering…";
      result.textContent = "";

      fetch(ORIGIN + "/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, format }),
      })
        .then(r => r.json().then(data => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) {
            result.innerHTML = '<span class="error">Error: ' + (data.error || "Unknown error") + '</span>';
          } else {
            result.innerHTML =
              '&#9989; <a href="' + data.url + '" target="_blank">' + data.url + '</a>' +
              '<br/>Embed: <code>' + data.embed + '</code>';
          }
        })
        .catch(err => {
          result.innerHTML = '<span class="error">Network error: ' + err.message + '</span>';
        })
        .finally(() => {
          btn.disabled = false;
          btn.textContent = "Render & Create Link";
        });
    }

    // Switch example source when format changes
    document.getElementById("demo-format").addEventListener("change", function () {
      const ta = document.getElementById("demo-source");
      if (this.value === "d2") {
        ta.value = "server -> db: query\\ndb -> server: results\\nserver -> client: JSON response";
      } else {
        ta.value = "graph TD\\n  A[User Request] --> B{Auth?}\\n  B -->|Yes| C[Process]\\n  B -->|No| D[Reject]\\n  C --> E[Respond]";
      }
    });
  </script>
</body>
</html>`;
}
