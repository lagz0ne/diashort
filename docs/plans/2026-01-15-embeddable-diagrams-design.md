# Embeddable Diagrams Design

## Problem

Diagrams cannot be embedded in markdown (`![](url)`) or show previews in chat tools (Slack, Discord, Notion). Currently only full HTML viewer pages are served.

## Solution

Add a raw SVG embed endpoint for D2 diagrams and OpenGraph meta tags for link previews.

## Scope

**In scope:**
- `GET /e/{shortlink}` endpoint returning raw SVG (D2 only)
- Update `/render` API response to include `embed` URL for D2
- OpenGraph meta tags on `/d/` viewer page

**Deferred:**
- Server-side Mermaid rendering
- Mermaid embed support

## Implementation

### 1. New Embed Endpoint

**Route:** `GET /e/{shortlink}`

**Behavior:**
- D2 diagrams: Return raw SVG with `Content-Type: image/svg+xml`
- Mermaid diagrams: Return 404 with JSON error
- Optional `?theme=dark` query param for dark variant (default: light)
- Cache headers: `Cache-Control: public, max-age=31536000, immutable`

**Usage:**
```markdown
![My Diagram](https://diashort.apps.quickable.co/e/a08091f2)
```

### 2. API Response Update

**D2 response:**
```json
{
  "shortlink": "a08091f2",
  "url": "http://localhost:3000/d/a08091f2",
  "embed": "http://localhost:3000/e/a08091f2"
}
```

**Mermaid response (unchanged structure):**
```json
{
  "shortlink": "b1c2d3e4",
  "url": "http://localhost:3000/d/b1c2d3e4"
}
```

### 3. OpenGraph Meta Tags

Add to `/d/{shortlink}` HTML `<head>` for D2 diagrams:

```html
<meta property="og:type" content="image">
<meta property="og:title" content="Diagram - {shortlink}">
<meta property="og:image" content="https://diashort.../e/{shortlink}">
<meta property="og:image:type" content="image/svg+xml">
<meta name="twitter:card" content="summary_large_image">
```

Mermaid diagrams: Basic title only, no `og:image`.

## Files to Modify

| File | Changes |
|------|---------|
| `src/server.ts` | Add `/e/:shortlink` route handler |
| `src/flows/render.ts` | Include `embed` URL in response for D2 |
| `src/atoms/html-generator.ts` | Add OpenGraph meta tags to generated HTML |

## Testing

- `GET /e/{d2-shortlink}` returns SVG with correct content-type
- `GET /e/{d2-shortlink}?theme=dark` returns dark theme SVG
- `GET /e/{mermaid-shortlink}` returns 404
- D2 render response includes `embed` field
- Mermaid render response does not include `embed` field
- D2 viewer page has `og:image` meta tag
- Mermaid viewer page has no `og:image` meta tag
