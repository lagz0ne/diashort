---
id: adr-20251224-chafa-terminal-renderer
title: Replace catimg with chafa for Higher Quality Terminal Output
status: accepted
date: 2024-12-24
---

# Replace catimg with chafa for Higher Quality Terminal Output

## Status
**Accepted** - 2024-12-24

## Problem/Requirement

The current terminal renderer (c3-115) uses catimg which produces blurry, low-quality output. catimg only supports basic Unicode half-block characters and cannot leverage modern terminal graphics protocols (Sixel, Kitty, iTerm2) that provide much higher fidelity.

Users testing with `curl ... | terminal` are getting poor visual quality even with scale=3 and width=120.

## Exploration Journey

**Initial hypothesis:** PNG-to-terminal is inherently lossy, but we can improve quality by using a better CLI tool.

**Explored:**
- catimg capabilities: Only symbols mode with `-r 2` for half-blocks
- chafa capabilities: Multiple output formats (sixel, kitty, iterm, symbols)
- chafa auto-detection: Detects terminal capabilities automatically
- chafa availability: Version 1.12.4 available in Debian bookworm

**Discovered:**
- chafa auto-detects terminal and selects optimal output format
- Supports true color (24-bit), 256-color, 16-color, mono
- Dithering options (ordered, diffusion, noise) improve quality
- tmux/screen passthrough support
- Drop-in replacement - same spawn pattern as catimg

## Solution

Replace catimg with chafa as the terminal image converter:

1. **Replace catimg with chafa in Dockerfile**
2. **Update terminal-renderer.ts** to spawn chafa with explicit format
3. **Add format parameter** - client specifies (symbols, sixels, kitty, iterm)
4. **Default to symbols** - most compatible for unknown clients
5. **Update config tags** - rename catimgPathTag to chafaPathTag

### Server-Side Rendering Consideration

Since we're rendering on the server and streaming to the client:
- **Server cannot auto-detect** terminal capabilities (no TTY)
- **Client must specify format** in the request body
- **Default to symbols** for maximum compatibility

Clients using capable terminals (iTerm2, Kitty, Sixel-enabled) should explicitly request their format for best quality.

### chafa Command Pattern

```bash
# Default - symbols mode (most compatible)
chafa -f symbols -w 80 --colors full input.png

# High quality for Sixel terminals (xterm, mlterm, etc)
chafa -f sixels -w 80 input.png

# Native protocol for Kitty terminal
chafa -f kitty -w 80 input.png

# Native protocol for iTerm2
chafa -f iterm -w 80 input.png
```

### Key chafa Options

| Option | Purpose | Default |
|--------|---------|---------|
| `-f/--format` | Output format (symbols, sixels, kitty, iterm) | auto-detect |
| `-w/--width` | Terminal columns | terminal width |
| `--colors` | Color mode (full, 256, 16, 2, none) | auto |
| `--dither` | Dithering (none, ordered, diffusion, noise) | none/noise |

## Changes Across Layers

### Context Level
- c3-0: Update External Dependencies diagram - catimg → chafa

### Container Level
- c3-1: No structural changes

### Component Level
- c3-115: Replace catimg with chafa, add format parameter
- c3-108: Rename CATIMG_PATH to CHAFA_PATH in config

## Verification

- [ ] chafa produces output on /render/terminal endpoint
- [ ] Auto-detection works (returns sixel/kitty when supported)
- [ ] Symbols fallback works for basic terminals
- [ ] format parameter allows explicit selection
- [ ] Docker image builds with chafa

## Implementation Plan

### Code Changes

| Layer Change | Code Location | Action | Details |
|--------------|---------------|--------|---------|
| c3-115 | src/atoms/terminal-renderer.ts | Modify | Replace catimg spawn with chafa, add format option |
| c3-108 | src/config/tags.ts | Modify | Rename catimgPathTag → chafaPathTag |
| c3-1 | src/flows/render-terminal.ts | Modify | Add format parameter to input |
| c3-1 | src/server.ts | Modify | Update root page docs |
| - | Dockerfile | Modify | Replace catimg with chafa in apt-get |
| - | README.md | Modify | Update docs |

### Acceptance Criteria

| Verification Item | Criterion | How to Test |
|-------------------|-----------|-------------|
| chafa renders | Returns ANSI output | curl POST /render/terminal |
| Format param works | Can force symbols/sixels | curl with {"format": "symbols"} |
| Auto-detect works | Uses best format for terminal | Test in kitty vs basic terminal |
| Docker builds | Image starts successfully | docker build && docker run |

## Related

- [c3-115 Terminal Renderer](../c3-1-api-server/c3-115-terminal-renderer.md)
- [adr-20251224-catimg-terminal-output](adr-20251224-catimg-terminal-output.md) - Previous catimg implementation
- [chafa man page](https://hpjansson.org/chafa/man/)
- [chafa GitHub](https://github.com/hpjansson/chafa)
