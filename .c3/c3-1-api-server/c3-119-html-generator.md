---
id: c3-119
title: HTML Generator
type: component
category: feature
parent: c3-1
goal: Generate HTML pages with server-rendered SVG inlined for instant display.
---

# HTML Generator

Generates complete HTML pages with pre-rendered SVG diagrams inlined. Both Mermaid and D2 diagrams are server-rendered before being passed to the generator.

## Goal

Generate HTML pages with server-rendered SVG inlined for instant display.

## Dependencies

None (pure template generation — receives pre-rendered SVGs as input).

## Interface

```typescript
interface HTMLGeneratorOptions {
  embedUrl?: string;
  sourceUrl?: string;
  versionInfo?: VersionInfo;
}

interface VersionInfo {
  shortlink: string;
  currentVersion: string;
  versionsApiUrl: string;
  format: "mermaid" | "d2";
}

interface HTMLGenerator {
  generateMermaid(svg: string, shortlink: string, options?: HTMLGeneratorOptions): string;
  generateD2(lightSvg: string, darkSvg: string, shortlink: string, options?: HTMLGeneratorOptions): string;
}
```
## Behavior

| Format | Rendering | Dark Mode |
| --- | --- | --- |
| Mermaid | Single SVG inlined, no CDN script | CSS filter: invert(1) hue-rotate(180deg) |
| D2 | Light + dark SVGs inlined | Swaps SVG based on theme preference |
## Features

| Feature | Implementation |
| --- | --- |
| Responsive | CSS flexbox centering, max-width constraints |
| Dark mode | CSS filter for Mermaid, dual SVGs for D2 |
| Theme persistence | localStorage for theme-preference only |
| Version picker | Dropdown to switch between diagram versions |
| Compare overlay | Fetches SVGs from /e/ endpoint for both formats |
| OpenGraph tags | Embed URL for link previews (when embedUrl provided) |
| Source discovery | Injects <link rel="source" href="..."> into <head> (when sourceUrl provided) for LLM/programmatic access to diagram source |
| Error handling | Shows parse errors in UI |
### Source Discovery

When `sourceUrl` is provided in `HTMLGeneratorOptions`, the generator injects a `<link rel="source">` tag into the HTML `<head>`:

```html
<link rel="source" href="/api/d/:shortlink/versions/:version/source">
```
This enables LLMs and programmatic tools to discover the raw diagram source from a rendered page. The URL points to the source API endpoint which returns the diagram definition text.

## References

- `htmlGeneratorAtom` - `src/atoms/html-generator.ts`
## Testing Strategy

**Unit scope:**

- HTML contains SVG content
- Source is properly escaped (XSS prevention)
- No CDN mermaid script tag in output
- No localStorage SVG caching in output
- `<link rel="source">` present when sourceUrl provided
- `<link rel="source">` absent when sourceUrl omitted
**Integration scope:**

- Rendered page in headless browser (optional)
