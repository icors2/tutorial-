import { useCallback, useEffect, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { getCroppedCanvas } from '../utils/cropImage'

type BodyProps = {
  imageSrc: string
  onClose: () => void
  onApply: (blob: Blob) => void
}

type Props = {
  open: boolean
  /** Changes each time the editor opens so inner state remounts cleanly. */
  sessionKey: number
  imageSrc: string
  onClose: () => void
  onApply: (blob: Blob) => void
}

type Phase = 'crop' | 'highlight'

function compositeHighlightsToBlob(
  source: HTMLCanvasElement,
  rects: Area[],
): Promise<Blob> {
  const nw = source.width
  const nh = source.height
  const out = document.createElement('canvas')
  out.width = nw
  out.height = nh
  const ctx = out.getContext('2d')
  if (!ctx) return Promise.reject(new Error('No canvas context'))
  ctx.drawImage(source, 0, 0)
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
  return new Promise((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Export failed'))),
      'image/jpeg',
      0.92,
    )
  })
}

type HighlightLayerProps = {
  source: HTMLCanvasElement
  highlights: Area[]
  onChange: (next: Area[]) => void
}

function HighlightLayer({ source, highlights, onChange }: HighlightLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ sx: number; sy: number; ex: number; ey: number } | null>(
    null,
  )

  const nw = source.width
  const nh = source.height
  const maxW = 560
  const maxH = 420
  const scale = Math.min(maxW / nw, maxH / nh, 1)
  const dw = Math.round(nw * scale)
  const dh = Math.round(nh * scale)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = dw
    canvas.height = dh
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(source, 0, 0, nw, nh, 0, 0, dw, dh)
    ctx.fillStyle = 'rgba(255, 230, 80, 0.35)'
    ctx.strokeStyle = 'rgba(255, 120, 0, 0.9)'
    ctx.lineWidth = Math.max(1, Math.round(2 * scale))
    const drawRect = (r: Area) => {
      const x = r.x * scale
      const y = r.y * scale
      const w = r.width * scale
      const h = r.height * scale
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
    }
    highlights.forEach(drawRect)
    const drag = dragRef.current
    if (drag) {
      const nx0 = drag.sx * scale
      const ny0 = drag.sy * scale
      const nx1 = drag.ex * scale
      const ny1 = drag.ey * scale
      const x = Math.min(nx0, nx1)
      const y = Math.min(ny0, ny1)
      const w = Math.abs(nx1 - nx0)
      const h = Math.abs(ny1 - ny0)
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(0, 120, 255, 0.9)'
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
    }
  }, [source, nw, nh, dw, dh, scale, highlights])

  useEffect(() => {
    redraw()
  }, [redraw])

  function clientToNatural(clientX: number, clientY: number) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const lx = clientX - rect.left
    const ly = clientY - rect.top
    const x = (lx / rect.width) * nw
    const y = (ly / rect.height) * nh
    return {
      x: Math.max(0, Math.min(nw, x)),
      y: Math.max(0, Math.min(nh, y)),
    }
  }

  return (
    <div className="image-editor__highlight">
      <p className="image-editor__hint">
        Drag on the image to draw highlight rectangles. Undo removes the last one.
      </p>
      <canvas
        ref={canvasRef}
        className="image-editor__paint-canvas"
        width={dw}
        height={dh}
        role="presentation"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          const { x, y } = clientToNatural(e.clientX, e.clientY)
          dragRef.current = { sx: x, sy: y, ex: x, ey: y }
          redraw()
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return
          const { x, y } = clientToNatural(e.clientX, e.clientY)
          dragRef.current = { ...dragRef.current, ex: x, ey: y }
          redraw()
        }}
        onPointerUp={(e) => {
          const d = dragRef.current
          if (!d) return
          e.currentTarget.releasePointerCapture(e.pointerId)
          const { x, y } = clientToNatural(e.clientX, e.clientY)
          const ex = x
          const ey = y
          const x0 = Math.min(d.sx, ex)
          const y0 = Math.min(d.sy, ey)
          const w = Math.abs(ex - d.sx)
          const h = Math.abs(ey - d.sy)
          dragRef.current = null
          redraw()
          if (w > 4 && h > 4) {
            onChange([...highlights, { x: x0, y: y0, width: w, height: h }])
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null
          redraw()
        }}
      />
    </div>
  )
}

function ImageEditorModalBody({ imageSrc, onClose, onApply }: BodyProps) {
  const [phase, setPhase] = useState<Phase>('crop')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedPixels, setCroppedPixels] = useState<Area | null>(null)
  const [croppedCanvas, setCroppedCanvas] = useState<HTMLCanvasElement | null>(null)
  const [highlights, setHighlights] = useState<Area[]>([])

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedPixels(pixels)
  }, [])

  async function goToHighlights() {
    if (!croppedPixels) return
    try {
      const canvas = await getCroppedCanvas(imageSrc, croppedPixels)
      setCroppedCanvas(canvas)
      setPhase('highlight')
    } catch {
      window.alert('Could not crop this image. Try again.')
    }
  }

  function handleApply() {
    const src = croppedCanvas
    if (!src) return
    void compositeHighlightsToBlob(src, highlights).then((blob) => {
      onApply(blob)
      onClose()
    })
  }

  return (
    <div
      className="modal modal--wide image-editor"
      role="dialog"
      aria-labelledby="image-editor-title"
      onClick={(e) => e.stopPropagation()}
    >
        <h2 id="image-editor-title" className="modal__title">
          {phase === 'crop' ? 'Move & crop' : 'Highlight areas'}
        </h2>

        {phase === 'crop' ? (
          <>
            <div className="image-editor__crop-wrap">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={undefined}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <label className="image-editor__zoom">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
          </>
        ) : croppedCanvas ? (
          <HighlightLayer
            source={croppedCanvas}
            highlights={highlights}
            onChange={setHighlights}
          />
        ) : null}

        <div className="modal__actions image-editor__footer">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          {phase === 'crop' ? (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void goToHighlights()}
              disabled={!croppedPixels}
            >
              Next: highlights
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setPhase('crop')
                  setCroppedCanvas(null)
                  setHighlights([])
                }}
              >
                Back to crop
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setHighlights((h) => h.slice(0, -1))}
                disabled={highlights.length === 0}
              >
                Undo highlight
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setHighlights([])}
                disabled={highlights.length === 0}
              >
                Clear highlights
              </button>
              <button type="button" className="btn btn--primary" onClick={handleApply}>
                Apply
              </button>
            </>
          )}
        </div>
    </div>
  )
}

export function ImageEditorModal({
  open,
  sessionKey,
  imageSrc,
  onClose,
  onApply,
}: Props) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <ImageEditorModalBody
        key={sessionKey}
        imageSrc={imageSrc}
        onClose={onClose}
        onApply={onApply}
      />
    </div>
  )
}
