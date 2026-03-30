/**
 * Diashort index page — research-paper aesthetic, v2.
 * Redesigned: playground-first, single-accent palette, developer ergonomics
 * (copy buttons, section anchors, keyboard shortcuts), zero AI tells.
 */
export function indexPage(origin: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Diashort — Diagram Shortlink Service</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='12' fill='%23b91c1c'/%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --ink: #1c1917;
      --paper: #faf9f7;
      --red: #b91c1c;
      --red-hover: #991b1b;
      --red-subtle: #fef2f2;
      --stone: #78716c;
      --stone-light: #d6d3d1;
      --stone-wash: #f5f5f4;

      --serif: "Crimson Pro", Georgia, "Times New Roman", serif;
      --grotesk: "Space Grotesk", system-ui, sans-serif;
      --mono: "JetBrains Mono", "Fira Code", Consolas, monospace;
      --w: 680px;
    }

    html { font-size: 18px; scroll-behavior: smooth; }

    body {
      font-family: var(--serif);
      color: var(--ink);
      background: var(--paper);
      line-height: 1.75;
      -webkit-font-smoothing: antialiased;
    }

    ::selection { background: var(--red-subtle); color: var(--red); }

    /* ── Paper ──────────────────────────────────────── */
    .paper {
      max-width: var(--w);
      margin: 0 auto;
      padding: 5rem 2rem 4rem;
    }

    /* ── Header ────────────────────────────────────── */
    header { margin-bottom: 2rem; }

    header h1 {
      font-size: 2.8rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1.1;
    }

    header .subtitle {
      font-size: 1.1rem;
      font-style: italic;
      color: var(--stone);
      margin-top: 0.2rem;
    }

    header .meta {
      font-family: var(--grotesk);
      font-size: 0.7rem;
      color: var(--stone);
      letter-spacing: 0.03em;
      margin-top: 1rem;
    }

    header .meta a {
      color: var(--ink);
      text-decoration: none;
      border-bottom: 1px solid var(--stone-light);
      transition: border-color 0.12s, color 0.12s;
    }

    header .meta a:hover { border-color: var(--red); color: var(--red); }

    /* ── Divider ───────────────────────────────────── */
    .rule { border: none; border-top: 2px solid var(--ink); margin: 0; }

    /* ── Abstract ──────────────────────────────────── */
    .abstract { margin: 2rem 0 2.5rem; }

    .label {
      font-family: var(--grotesk);
      font-size: 0.6rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: var(--red);
      margin-bottom: 0.35rem;
    }

    .abstract p {
      font-size: 0.95rem;
      color: #44403c;
    }

    /* ── Figure / Playground ────────────────────────── */
    figure { margin: 0 0 3.5rem; }

    .pg-frame {
      border: 1px solid var(--stone-light);
      padding: 1.4rem;
      background: white;
    }

    figcaption {
      font-size: 0.82rem;
      color: var(--stone);
      margin-top: 0.5rem;
      line-height: 1.5;
    }

    figcaption strong { color: var(--ink); font-weight: 600; }

    kbd {
      font-family: var(--mono);
      font-size: 0.7rem;
      padding: 0.08rem 0.3rem;
      border: 1px solid var(--stone-light);
      border-radius: 3px;
      background: var(--stone-wash);
    }

    .pg-controls {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 0.7rem;
    }

    .pg-controls select {
      font-family: var(--grotesk);
      font-size: 0.78rem;
      padding: 0.32rem 0.65rem;
      border: 1px solid var(--stone-light);
      border-radius: 0;
      background: white;
      color: var(--ink);
      cursor: pointer;
    }

    .pg-controls button {
      font-family: var(--grotesk);
      font-size: 0.78rem;
      font-weight: 500;
      padding: 0.32rem 0.85rem;
      border: none;
      background: var(--red);
      color: white;
      cursor: pointer;
      transition: background 0.12s;
    }

    .pg-controls button:hover { background: var(--red-hover); }
    .pg-controls button:disabled { opacity: 0.5; cursor: wait; }

    .pg-hint {
      margin-left: auto;
      font-family: var(--grotesk);
      font-size: 0.62rem;
      color: var(--stone);
    }

    .pg-source {
      width: 100%;
      min-height: 110px;
      font-family: var(--mono);
      font-size: 0.78rem;
      line-height: 1.5;
      padding: 0.75rem;
      border: 1px solid var(--stone-light);
      background: var(--stone-wash);
      color: var(--ink);
      resize: vertical;
    }

    .pg-source:focus {
      outline: none;
      border-color: var(--red);
      box-shadow: 0 0 0 2px var(--red-subtle);
    }

    .pg-result {
      font-family: var(--mono);
      font-size: 0.75rem;
      min-height: 1.2rem;
      margin-top: 0.7rem;
    }

    .pg-result a {
      color: var(--red);
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: border-color 0.12s;
    }

    .pg-result a:hover { border-color: var(--red); }
    .pg-result .error { color: var(--red); }

    /* ── Sections ──────────────────────────────────── */
    .section { margin-bottom: 3rem; }

    .section h2 {
      font-size: 1.4rem;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 0.8rem;
    }

    .section h2 .n {
      font-family: var(--mono);
      font-size: 0.78rem;
      color: var(--red);
      font-weight: 400;
      margin-right: 0.25rem;
    }

    .section h2 .anchor {
      font-family: var(--mono);
      font-size: 0.78rem;
      color: var(--stone-light);
      text-decoration: none;
      margin-left: 0.3rem;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .section h2:hover .anchor { opacity: 1; }
    .section h2 .anchor:hover { color: var(--red); }

    .section h3 {
      font-size: 1rem;
      font-weight: 600;
      margin: 1.2rem 0 0.35rem;
    }

    .section p { margin-bottom: 0.7rem; }

    /* ── Endpoints (definition-list, not cards) ──── */
    .ep { padding: 0.9rem 0; }
    .ep + .ep { border-top: 1px solid var(--stone-light); }

    .ep-head {
      display: flex;
      align-items: baseline;
      gap: 0.45rem;
      margin-bottom: 0.2rem;
    }

    .ep-method {
      font-family: var(--mono);
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--ink);
    }

    .ep-method.post { color: var(--red); }

    .ep-path {
      font-family: var(--mono);
      font-size: 0.9rem;
      font-weight: 700;
    }

    .ep-desc {
      font-size: 0.88rem;
      color: var(--stone);
    }

    .ep-params {
      font-family: var(--mono);
      font-size: 0.7rem;
      color: var(--stone);
      margin-top: 0.15rem;
    }

    /* ── Code Blocks ───────────────────────────────── */
    pre {
      position: relative;
      background: var(--ink);
      color: var(--stone-light);
      font-family: var(--mono);
      font-size: 0.75rem;
      line-height: 1.65;
      padding: 1rem 1.2rem;
      overflow-x: auto;
      margin: 0.75rem 0;
    }

    pre .copy-btn {
      position: absolute;
      top: 0.4rem;
      right: 0.4rem;
      font-family: var(--grotesk);
      font-size: 0.58rem;
      font-weight: 500;
      color: var(--stone);
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      padding: 0.12rem 0.45rem;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s;
    }

    pre:hover .copy-btn { opacity: 1; }
    pre .copy-btn:hover { background: rgba(255,255,255,0.12); color: white; }
    pre .copy-btn.copied { color: #6ee7b7; }

    pre .comment { color: #78716c; }
    pre .string { color: #fbbf24; }
    pre .key { color: #93c5fd; }
    pre .cmd { color: #6ee7b7; }

    code {
      font-family: var(--mono);
      font-size: 0.82rem;
      background: var(--stone-wash);
      padding: 0.06rem 0.28rem;
    }

    pre code { background: none; padding: 0; font-size: inherit; }

    /* ── Tables ─────────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.8rem 0;
      font-size: 0.85rem;
    }

    thead th {
      font-family: var(--grotesk);
      font-size: 0.58rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--stone);
      text-align: left;
      padding: 0.35rem 0.5rem;
      border-bottom: 2px solid var(--ink);
    }

    tbody td {
      padding: 0.4rem 0.5rem;
      border-bottom: 1px solid var(--stone-light);
      vertical-align: top;
    }

    tbody tr:last-child td { border-bottom: none; }
    tbody td:first-child { font-family: var(--mono); font-size: 0.78rem; }

    /* ── Footer ─────────────────────────────────────── */
    footer.notes {
      margin-top: 4.5rem;
      padding-top: 1.2rem;
      border-top: 1px solid var(--stone-light);
      font-size: 0.78rem;
      color: var(--stone);
    }

    footer.notes p { margin-bottom: 0.25rem; }

    footer.notes a {
      color: var(--ink);
      text-decoration: none;
      border-bottom: 1px solid var(--stone-light);
      transition: border-color 0.12s, color 0.12s;
    }

    footer.notes a:hover { border-color: var(--red); color: var(--red); }

    sup { font-size: 0.6rem; color: var(--red); font-weight: 700; }

    /* ── Focus ──────────────────────────────────────── */
    :focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }

    /* ── Responsive ─────────────────────────────────── */
    @media (max-width: 600px) {
      html { font-size: 16px; }
      .paper { padding: 3rem 1.2rem; }
      header h1 { font-size: 2.2rem; }
      pre { font-size: 0.7rem; }
      .pg-hint { display: none; }
    }

    @media print {
      figure { display: none; }
      .copy-btn { display: none !important; }
      pre { white-space: pre-wrap; }
      body { background: white; color: black; }
    }
  </style>
</head>
<body>
  <div class="paper">

    <header>
      <h1>Diashort</h1>
      <p class="subtitle">A diagram shortlink service for Mermaid &amp; D2</p>
      <p class="meta">Open-source &middot; <a href="https://github.com/lagz0ne/diashort">github.com/lagz0ne/diashort</a></p>
    </header>

    <hr class="rule" />

    <div class="abstract">
      <div class="label">Abstract</div>
      <p>
        Diashort transforms diagram source code into permanent, shareable shortlinks.
        Submit Mermaid or D2 markup via a single API call and receive an immutable URL
        with an interactive viewer. Embed raw SVGs directly into documentation.
        Every shortlink supports multi-version history<sup>1</sup>.
      </p>
    </div>

    <figure id="playground">
      <div class="pg-frame">
        <div class="pg-controls">
          <select id="pg-format" aria-label="Diagram format">
            <option value="mermaid">Mermaid</option>
            <option value="d2">D2</option>
          </select>
          <button id="pg-submit">Render</button>
          <span class="pg-hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd></span>
        </div>
        <label for="pg-source" class="label" style="margin-bottom:0.3rem">Source</label>
        <textarea id="pg-source" class="pg-source" spellcheck="false">graph TD
  A[User Request] --> B{Auth?}
  B -->|Yes| C[Process]
  B -->|No| D[Reject]
  C --> E[Respond]</textarea>
        <div class="pg-result" id="pg-result"></div>
      </div>
      <figcaption>
        <strong>Figure 1.</strong> Interactive playground &mdash; paste diagram source
        and create a shortlink. Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> or click Render.
      </figcaption>
    </figure>

    <section class="section" id="api">
      <h2><span class="n">&sect;1</span> API Reference <a href="#api" class="anchor" aria-label="Link to this section">#</a></h2>

      <div class="endpoints">
        <div class="ep">
          <div class="ep-head">
            <span class="ep-method post">POST</span>
            <span class="ep-path">/render</span>
          </div>
          <div class="ep-desc">Create a new diagram shortlink or update an existing one.</div>
          <div class="ep-params">
            Body: <code>{ "source": "...", "format": "mermaid|d2" }</code><br/>
            Optional: <code>"shortlink"</code>, <code>"versionName"</code>
          </div>
        </div>

        <div class="ep">
          <div class="ep-head">
            <span class="ep-method">GET</span>
            <span class="ep-path">/d/:shortlink</span>
          </div>
          <div class="ep-desc">Interactive HTML viewer with zoom, pan, and dark mode.</div>
          <div class="ep-params">Bare shortlinks redirect (302) to latest version.</div>
        </div>

        <div class="ep">
          <div class="ep-head">
            <span class="ep-method">GET</span>
            <span class="ep-path">/e/:shortlink</span>
          </div>
          <div class="ep-desc">Raw SVG embed for <code>&lt;img&gt;</code> tags and markdown.</div>
          <div class="ep-params">Query: <code>?theme=light|dark</code></div>
        </div>

        <div class="ep">
          <div class="ep-head">
            <span class="ep-method">GET</span>
            <span class="ep-path">/health</span>
          </div>
          <div class="ep-desc">Health check for uptime monitors.</div>
          <div class="ep-params">Returns <code>{ "status": "ok" }</code></div>
        </div>
      </div>
    </section>

    <section class="section" id="usage">
      <h2><span class="n">&sect;2</span> Usage <a href="#usage" class="anchor" aria-label="Link to this section">#</a></h2>

      <h3>Create a Mermaid diagram</h3>
      <pre><button class="copy-btn" type="button">Copy</button><code><span class="cmd">curl</span> -s -X POST ${origin}/render \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -d <span class="string">'{"source": "graph TD\\n  A --> B", "format": "mermaid"}'</span></code></pre>

      <h3>Create a D2 diagram</h3>
      <pre><button class="copy-btn" type="button">Copy</button><code><span class="cmd">curl</span> -s -X POST ${origin}/render \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -d <span class="string">'{"source": "server -> db: query", "format": "d2"}'</span></code></pre>

      <h3>Embed in Markdown</h3>
      <pre><button class="copy-btn" type="button">Copy</button><code>![Architecture](${origin}/e/your-shortlink?theme=light)</code></pre>

      <h3>Response format</h3>
      <p>A successful <code>POST /render</code> returns:</p>
      <pre><button class="copy-btn" type="button">Copy</button><code>{
  <span class="key">"shortlink"</span>: <span class="string">"a1b2c3"</span>,
  <span class="key">"url"</span>:       <span class="string">"${origin}/d/a1b2c3/v1"</span>,
  <span class="key">"embed"</span>:     <span class="string">"${origin}/e/a1b2c3/v1"</span>
}</code></pre>

      <table>
        <thead><tr><th>Field</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td>shortlink</td><td>Unique identifier for this diagram</td></tr>
          <tr><td>url</td><td>Interactive viewer URL (immutable per version)</td></tr>
          <tr><td>embed</td><td>Direct SVG URL for embedding</td></tr>
        </tbody>
      </table>
    </section>

    <section class="section" id="versions">
      <h2><span class="n">&sect;3</span> Versioning <a href="#versions" class="anchor" aria-label="Link to this section">#</a></h2>
      <p>
        Each shortlink supports multiple versions<sup>1</sup>. Bare URLs redirect to
        the latest. Versioned URLs are immutable and permanently cached.
      </p>

      <pre><button class="copy-btn" type="button">Copy</button><code><span class="comment"># Update an existing diagram</span>
<span class="cmd">curl</span> -s -X POST ${origin}/render \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -d <span class="string">'{"source": "...", "format": "mermaid", "shortlink": "a1b2c3"}'</span>

<span class="comment"># Named version</span>
<span class="cmd">curl</span> -s -X POST ${origin}/render \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -d <span class="string">'{"source": "...", "format": "mermaid", "shortlink": "a1b2c3", "versionName": "final"}'</span></code></pre>

      <table>
        <thead><tr><th>URL</th><th>Behavior</th></tr></thead>
        <tbody>
          <tr><td>/d/a1b2c3</td><td>302 redirect to latest version</td></tr>
          <tr><td>/d/a1b2c3/v1</td><td>Immutable, cached permanently</td></tr>
          <tr><td>/d/a1b2c3/final</td><td>Named version, also immutable</td></tr>
        </tbody>
      </table>
    </section>

    <footer class="notes">
      <p><sup>1</sup> Version names must start with a letter. Patterns like <code>v1</code>, <code>v2</code>, <code>v3</code> are reserved for auto-versioning.</p>
      <p style="margin-top:0.7rem">
        Built with <a href="https://bun.sh">Bun</a>,
        <a href="https://mermaid.js.org">Mermaid</a>,
        <a href="https://d2lang.com">D2</a>, and
        <a href="https://github.com/nickhudkins/pumped-fn">@pumped-fn/lite</a>.
      </p>
    </footer>

  </div>

  <script>
    var ORIGIN = ${JSON.stringify(origin)};
    var pgSource = document.getElementById('pg-source');
    var pgFormat = document.getElementById('pg-format');
    var pgSubmit = document.getElementById('pg-submit');
    var pgResult = document.getElementById('pg-result');
    var userEdited = false;

    pgSource.addEventListener('input', function() { userEdited = true; });

    pgSubmit.addEventListener('click', submitDemo);

    pgSource.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        submitDemo();
      }
    });

    pgFormat.addEventListener('change', function() {
      if (userEdited && !confirm('Replace with example? Your edits will be lost.')) {
        return;
      }
      userEdited = false;
      pgSource.value = this.value === 'd2'
        ? 'server -> db: query\\ndb -> server: results\\nserver -> client: JSON response'
        : 'graph TD\\n  A[User Request] --> B{Auth?}\\n  B -->|Yes| C[Process]\\n  B -->|No| D[Reject]\\n  C --> E[Respond]';
    });

    function submitDemo() {
      var source = pgSource.value.trim();
      var format = pgFormat.value;

      if (!source) {
        showError('Enter diagram source to render.');
        return;
      }

      pgSubmit.disabled = true;
      pgSubmit.textContent = 'Rendering\\u2026';
      pgResult.textContent = '';

      fetch(ORIGIN + '/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source, format: format }),
      })
        .then(function(r) { return r.json().then(function(data) { return { ok: r.ok, data: data }; }); })
        .then(function(res) {
          if (!res.ok) {
            showError(res.data.error || 'Unknown error');
          } else {
            showSuccess(res.data.url, res.data.embed);
          }
        })
        .catch(function(err) { showError('Network error: ' + err.message); })
        .finally(function() {
          pgSubmit.disabled = false;
          pgSubmit.textContent = 'Render';
        });
    }

    function showSuccess(url, embed) {
      pgResult.textContent = '';
      var link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = url;
      var embedCode = document.createElement('code');
      embedCode.textContent = embed;
      pgResult.append('\\u2713 ', link, document.createElement('br'), 'Embed: ', embedCode);
    }

    function showError(msg) {
      pgResult.textContent = '';
      var span = document.createElement('span');
      span.className = 'error';
      span.textContent = msg;
      pgResult.append(span);
    }

    document.querySelectorAll('.copy-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var code = btn.closest('pre').querySelector('code');
        navigator.clipboard.writeText(code.textContent).then(function() {
          btn.textContent = 'Copied';
          btn.classList.add('copied');
          setTimeout(function() {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 1500);
        });
      });
    });
  </script>
</body>
</html>`;
}
