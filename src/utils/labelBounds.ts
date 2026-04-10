import type { ImageEditLabel } from '../types/imageEdit'

const LABEL_FONT_WEIGHT = '600'

export function getLabelFontSpec(fontSizePx: number): string {
  return `${LABEL_FONT_WEIGHT} ${fontSizePx}px Inter, system-ui, sans-serif`
}

/** Bounding box in cropped-canvas (natural) pixels; y is top (matches canvas textBaseline top). */
export function measureLabelBounds(L: ImageEditLabel): {
  x: number
  y: number
  w: number
  h: number
} {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return { x: L.x, y: L.y, w: 0, h: L.fontSizePx }
  ctx.font = getLabelFontSpec(L.fontSizePx)
  const m = ctx.measureText(L.text)
  const w = Math.max(4, m.width)
  const h = Math.max(L.fontSizePx * 1.25, L.fontSizePx)
  return { x: L.x, y: L.y, w, h }
}

/** Bounds in the same coordinate space as the preview canvas (scaled). */
export function measureLabelBoundsDisplay(
  L: ImageEditLabel,
  scale: number,
): { x: number; y: number; w: number; h: number } {
  const fs = Math.max(8, L.fontSizePx * scale)
  return measureLabelBounds({
    ...L,
    x: L.x * scale,
    y: L.y * scale,
    fontSizePx: fs,
  })
}

/** Top-most label under point (natural coords), or null. */
const HIT_PAD = 8

export function hitTestLabelId(
  px: number,
  py: number,
  labels: ImageEditLabel[],
): string | null {
  for (let i = labels.length - 1; i >= 0; i--) {
    const L = labels[i]
    const b = measureLabelBounds(L)
    if (
      px >= b.x - HIT_PAD &&
      px <= b.x + b.w + HIT_PAD &&
      py >= b.y - HIT_PAD &&
      py <= b.y + b.h + HIT_PAD
    ) {
      return L.id
    }
  }
  return null
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
