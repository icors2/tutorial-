import type { ImageEditLabel } from '../types/imageEdit'

const LABEL_FONT_WEIGHT = '600'

export function getLabelFontSpec(fontSizePx: number): string {
  return `${LABEL_FONT_WEIGHT} ${fontSizePx}px Inter, system-ui, sans-serif`
}

/** Unrotated text width/height for a label (anchor at x,y, baseline top). */
export function measureLabelTextBox(L: ImageEditLabel): { w: number; h: number } {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return { w: 0, h: L.fontSizePx }
  ctx.font = getLabelFontSpec(L.fontSizePx)
  const m = ctx.measureText(L.text)
  const w = Math.max(4, m.width)
  const h = Math.max(L.fontSizePx * 1.25, L.fontSizePx)
  return { w, h }
}

/** Bounding box in cropped-canvas (natural) pixels; y is top (matches canvas textBaseline top). */
export function measureLabelBounds(L: ImageEditLabel): {
  x: number
  y: number
  w: number
  h: number
} {
  const { w, h } = measureLabelTextBox(L)
  return { x: L.x, y: L.y, w, h }
}

/** Axis-aligned bounds of rotated label box (anchor top-left at x,y before rotation). */
export function getRotatedLabelAabb(
  x: number,
  y: number,
  w: number,
  h: number,
  rotationDeg: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [lx, ly] of corners) {
    const rx = x + lx * cos - ly * sin
    const ry = y + lx * sin + ly * cos
    minX = Math.min(minX, rx)
    minY = Math.min(minY, ry)
    maxX = Math.max(maxX, rx)
    maxY = Math.max(maxY, ry)
  }
  return { minX, minY, maxX, maxY }
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
    const { w, h } = measureLabelTextBox(L)
    const rot = L.rotationDeg ?? 0
    if (rot === 0) {
      if (
        px >= L.x - HIT_PAD &&
        px <= L.x + w + HIT_PAD &&
        py >= L.y - HIT_PAD &&
        py <= L.y + h + HIT_PAD
      ) {
        return L.id
      }
      continue
    }
    const rad = (-rot * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const dx = px - L.x
    const dy = py - L.y
    const lx = dx * cos - dy * sin
    const ly = dx * sin + dy * cos
    if (
      lx >= -HIT_PAD &&
      lx <= w + HIT_PAD &&
      ly >= -HIT_PAD &&
      ly <= h + HIT_PAD
    ) {
      return L.id
    }
  }
  return null
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
