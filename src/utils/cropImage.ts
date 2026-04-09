import type { Area } from 'react-easy-crop'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

/** Pixel crop is relative to the natural image dimensions (react-easy-crop `croppedAreaPixels`). */
export async function getCroppedCanvas(
  imageSrc: string,
  pixelCrop: Area,
): Promise<HTMLCanvasElement> {
  const image = await loadImage(imageSrc)
  const w = Math.max(1, Math.round(pixelCrop.width))
  const h = Math.max(1, Math.round(pixelCrop.height))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas context')
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    w,
    h,
  )
  return canvas
}
