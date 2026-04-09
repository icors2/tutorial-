const MAX_EDGE = 1920
const JPEG_QUALITY = 0.82

/**
 * Decode, scale so neither dimension exceeds MAX_EDGE, re-encode as JPEG.
 */
export async function processImageBlob(input: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(input)
  try {
    const { width, height } = bitmap
    if (width <= 0 || height <= 0) {
      throw new Error('Invalid image dimensions')
    }
    const scale = Math.min(1, MAX_EDGE / width, MAX_EDGE / height)
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2d context')
    ctx.drawImage(bitmap, 0, 0, w, h)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('JPEG encoding failed'))),
        'image/jpeg',
        JPEG_QUALITY,
      )
    })
  } finally {
    bitmap.close()
  }
}
