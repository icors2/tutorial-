import type { Area } from 'react-easy-crop'

export type ImageEditLabel = {
  id: string
  x: number
  y: number
  text: string
  fontSizePx: number
  color: string
}

export type ImageEditArrow = {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Persisted non-destructive edit recipe (v1). Coordinates are in cropped-canvas pixels. */
export type ImageEditStateV1 = {
  v: 1
  originalImageId: string
  crop: Area
  highlights: Area[]
  arrows: ImageEditArrow[]
  labels: ImageEditLabel[]
}

export function parseImageEditJson(raw: string | undefined): ImageEditStateV1 | null {
  if (!raw?.trim()) return null
  try {
    const o = JSON.parse(raw) as ImageEditStateV1
    if (o?.v !== 1 || typeof o.originalImageId !== 'string' || !o.crop) return null
    return {
      v: 1,
      originalImageId: o.originalImageId,
      crop: o.crop,
      highlights: Array.isArray(o.highlights) ? o.highlights : [],
      arrows: Array.isArray(o.arrows) ? o.arrows : [],
      labels: Array.isArray(o.labels) ? o.labels : [],
    }
  } catch {
    return null
  }
}

export function stringifyImageEdit(state: ImageEditStateV1): string {
  return JSON.stringify(state)
}
