/**
 * Generates solid-brand and maskable-safe PWA icons into public/.
 * Run: npm run gen:icons
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')

function solid(w, h, r, g, b) {
  const png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) * 4
      png.data[i] = r
      png.data[i + 1] = g
      png.data[i + 2] = b
      png.data[i + 3] = 255
    }
  }
  return png
}

/** Dark bg (#16171d) with inset purple square (~80% safe zone for maskable). */
function maskable(size) {
  const bg = { r: 22, g: 23, b: 29 }
  const fg = { r: 170, g: 59, b: 255 }
  const png = new PNG({ width: size, height: size })
  const inset = Math.round(size * 0.1)
  const inner = size - 2 * inset
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) * 4
      const ix = x - inset
      const iy = y - inset
      let r = bg.r
      let g = bg.g
      let b = bg.b
      if (ix >= 0 && ix < inner && iy >= 0 && iy < inner) {
        r = fg.r
        g = fg.g
        b = fg.b
      }
      png.data[i] = r
      png.data[i + 1] = g
      png.data[i + 2] = b
      png.data[i + 3] = 255
    }
  }
  return png
}

fs.mkdirSync(publicDir, { recursive: true })

fs.writeFileSync(
  path.join(publicDir, 'pwa-192.png'),
  PNG.sync.write(solid(192, 192, 170, 59, 255)),
)
fs.writeFileSync(
  path.join(publicDir, 'pwa-512.png'),
  PNG.sync.write(solid(512, 512, 170, 59, 255)),
)
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-192.png'), PNG.sync.write(maskable(192)))
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512.png'), PNG.sync.write(maskable(512)))

console.log('Wrote public/pwa-*.png and public/pwa-maskable-*.png')
