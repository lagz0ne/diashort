# Interactive Diagram Viewer Design

## Problem

The current diagram viewer has limitations:
- SVG uses CSS `overflow: auto` which shows scrollbars on zoom
- No custom zoom controls - relies on browser defaults
- No pan/drag functionality

## Solution

Add interactive zoom and pan to the diagram viewer with both mouse/touch gestures and button controls.

## Requirements

| Feature | Implementation |
|---------|----------------|
| Scroll-wheel zoom | Zoom anchored to cursor position |
| Drag-to-pan | Click and drag anywhere on canvas |
| Button controls | +, -, reset in bottom-right corner |
| Initial view | Fit diagram to viewport |
| Reset | Return to fit-to-viewport state |
| Mobile support | Pinch-to-zoom, touch-drag pan |
| Format support | Both D2 and Mermaid diagrams |

## Viewport Behavior

### Initial Load
1. Wait for SVG to be present (immediate for D2, after render for Mermaid)
2. Calculate diagram bounding box via `getBBox()`
3. Compute scale to fit within viewport with 32px padding
4. Center diagram in viewport
5. Store as "home" position

### Zoom
- Range: 10% to 500%
- Increment: 20% per tick/click
- Scroll-wheel: anchors to cursor position
- Buttons: anchors to viewport center

### Pan
- Click-drag anywhere on canvas
- Cursor: `grab` on hover, `grabbing` while dragging
- Bounded: diagram can't be dragged fully out of view

## Control Panel UI

```
Position: Fixed, bottom-right, 16px from edges

┌─────────────────┐
│  [+]  [⟲]  [-]  │
└─────────────────┘

- Semi-transparent background (theme-aware)
- 32px button size (44px on touch devices)
- Subtle shadow for visibility
```

## Implementation

### State
```javascript
const state = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  homeState: null  // { scale, translateX, translateY }
};
```

### Core Functions
- `initViewport(svg)` - Calculate fit-to-viewport, store home state
- `applyTransform()` - Apply scale + translate via SVG transform attribute
- `zoomTo(newScale, anchorX, anchorY)` - Zoom toward anchor point
- `pan(deltaX, deltaY)` - Move diagram
- `resetView()` - Return to home state

### Event Handlers
- `wheel` - Zoom on scroll (preventDefault to avoid page scroll)
- `mousedown/mousemove/mouseup` - Drag to pan
- `touchstart/touchmove/touchend` - Pinch zoom + touch pan
- Button clicks - +/-/reset controls

### CSS Changes
```css
#diagram {
  position: relative;
  overflow: hidden;
  width: 100vw;
  height: 100vh;
}

#diagram svg {
  transform-origin: 0 0;
  /* Remove max-width constraints */
}

.controls {
  position: fixed;
  bottom: 16px;
  right: 16px;
}
```

## Edge Cases

| Case | Handling |
|------|----------|
| Very large diagrams | Minimum scale floor of 10% |
| Very small diagrams | Cap initial scale at 100% |
| SVG without dimensions | Use `getBBox()` for content bounds |
| Window resize | Recalculate home state |

## Accessibility

- Focusable buttons with keyboard navigation
- `aria-label` on all controls
- Respects `prefers-reduced-motion` for transitions

## Files to Modify

- `src/atoms/html-generator.ts` - Add viewport JS, update CSS, add control panel HTML
