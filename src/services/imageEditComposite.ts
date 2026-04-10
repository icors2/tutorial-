import type { Area } from 'react-easy-crop'
import type { ImageEditArrow, ImageEditLabel, ImageEditStateV1 } from '../types/imageEdit'
import { getLabelFontSpec } from '../utils/labelBounds'

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image load failed'))
    }
    img.src = url
  })
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth: number,
) {
  const headLen = Math.max(12, lineWidth * 4)
  const angle = Math.atan2(y2 - y1, x2 - x1)
  ctx.strokeStyle = 'rgba(255, 80, 0, 0.95)'
  ctx.fillStyle = 'rgba(255, 80, 0, 0.95)'
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6),
  )
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6),
  )
  ctx.closePath()
  ctx.fill()
}

function drawLabels(ctx: CanvasRenderingContext2D, labels: ImageEditLabel[]) {
  for (const L of labels) {
    const px = Math.max(10, L.fontSizePx)
    ctx.save()
    ctx.translate(L.x, L.y)
    ctx.rotate(((L.rotationDeg ?? 0) * Math.PI) / 180)
    ctx.font = getLabelFontSpec(px)
    ctx.textBaseline = 'top'
    const strokeW = Math.max(2, px / 10)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = strokeW
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.strokeText(L.text, 0, 0)
    ctx.fillStyle = L.color || '#fff'
    ctx.fillText(L.text, 0, 0)
    ctx.restore()
  }
}

export function drawHighlightsOnContext(
  ctx: CanvasRenderingContext2D,
  rects: Area[],
  nw: number,
  nh: number,
) {
  const line = Math.max(2, Math.round(Math.min(nw, nh) / 200))
  ctx.fillStyle = 'rgba(255, 230, 80, 0.38)'
  ctx.strokeStyle = 'rgba(255, 120, 0, 0.95)'
  ctx.lineWidth = line
  for (const r of rects) {
    const x = Math.max(0, r.x)
    const y = Math.max(0, r.y)
    const w = Math.max(0, r.width)
    const h = Math.max(0, r.height)
    if (w < 1 || h < 1) continue
    ctx.fillRect(x, y, w, h)
    ctx.strokeRect(x + line / 2, y + line / 2, w - line, h - line)
  }
}

/** Draw highlights, arrows, and labels on a cropped-image canvas (full pixel coords). */
export function paintAnnotationsOnCroppedContext(
  ctx: CanvasRenderingContext2D,
  nw: number,
  nh: number,
  highlights: Area[],
  arrows: ImageEditArrow[],
  labels: ImageEditLabel[],
) {
  drawHighlightsOnContext(ctx, highlights, nw, nh)
  const lw = Math.max(2, Math.round(Math.min(nw, nh) / 120))
  for (const a of arrows) {
    drawArrow(ctx, a.x1, a.y1, a.x2, a.y2, lw)
  }
  drawLabels(ctx, labels)
}

/** Rasterize original + saved edit recipe to a JPEG blob (same logic as editor Apply). */
export async function compositeImageEditToBlob(
  originalBlob: Blob,
  edit: ImageEditStateV1,
): Promise<Blob> {
  const img = await loadImageFromBlob(originalBlob)
  const { crop } = edit
  const w = Math.max(1, Math.round(crop.width))
  const h = Math.max(1, Math.round(crop.height))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas context')
  ctx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    w,
    h,
  )
  paintAnnotationsOnCroppedContext(
    ctx,
    w,
    h,
    edit.highlights,
    edit.arrows,
    edit.labels,
  )
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('JPEG failed'))),
      'image/jpeg',
      0.92,
    )
  })
}
