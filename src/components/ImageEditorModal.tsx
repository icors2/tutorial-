import { useCallback, useEffect, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { paintAnnotationsOnCroppedContext } from '../services/imageEditComposite'
import type { ImageEditArrow, ImageEditLabel, ImageEditStateV1 } from '../types/imageEdit'
import { getCroppedCanvas } from '../utils/cropImage'

export type ImageEditorApplyPayload = {
  compositeBlob: Blob
  editState: ImageEditStateV1
}

type BodyProps = {
  imageSrc: string
  initialEdit: ImageEditStateV1 | null
  sourceImageId: string
  onClose: () => void
  onApply: (payload: ImageEditorApplyPayload) => void
}

type Props = {
  open: boolean
  sessionKey: number
  imageSrc: string
  initialEdit: ImageEditStateV1 | null
  sourceImageId: string
  onClose: () => void
  onApply: (payload: ImageEditorApplyPayload) => void
}

type Phase = 'crop' | 'annotate'

type AnnotTool = 'highlight' | 'arrow' | 'text'

type AnnotateLayerProps = {
  source: HTMLCanvasElement
  tool: AnnotTool
  highlights: Area[]
  onHighlightsChange: (next: Area[]) => void
  arrows: ImageEditArrow[]
  onArrowsChange: (next: ImageEditArrow[]) => void
  labels: ImageEditLabel[]
  onLabelsChange: (next: ImageEditLabel[]) => void
}

function AnnotateLayer({
  source,
  tool,
  highlights,
  onHighlightsChange,
  arrows,
  onArrowsChange,
  labels,
  onLabelsChange,
}: AnnotateLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{
    kind: AnnotTool
    sx: number
    sy: number
    ex: number
    ey: number
  } | null>(null)

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
    const sc = scale
    paintAnnotationsOnCroppedContext(
      ctx,
      dw,
      dh,
      highlights.map((r) => ({
        x: r.x * sc,
        y: r.y * sc,
        width: r.width * sc,
        height: r.height * sc,
      })),
      arrows.map((a) => ({
        x1: a.x1 * sc,
        y1: a.y1 * sc,
        x2: a.x2 * sc,
        y2: a.y2 * sc,
      })),
      labels.map((L) => ({
        ...L,
        x: L.x * sc,
        y: L.y * sc,
        fontSizePx: L.fontSizePx * sc,
      })),
    )
    const d = dragRef.current
    if (d) {
      const x0 = d.sx * sc
      const y0 = d.sy * sc
      const x1 = d.ex * sc
      const y1 = d.ey * sc
      ctx.strokeStyle = 'rgba(0, 120, 255, 0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      if (d.kind === 'highlight') {
        const x = Math.min(x0, x1)
        const y = Math.min(y0, y1)
        const w = Math.abs(x1 - x0)
        const h = Math.abs(y1 - y0)
        ctx.strokeRect(x, y, w, h)
      } else if (d.kind === 'arrow') {
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }
  }, [source, nw, nh, dw, dh, scale, highlights, arrows, labels])

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

  function removeHighlight(i: number) {
    onHighlightsChange(highlights.filter((_, j) => j !== i))
  }
  function removeArrow(i: number) {
    onArrowsChange(arrows.filter((_, j) => j !== i))
  }
  function removeLabel(i: number) {
    onLabelsChange(labels.filter((_, j) => j !== i))
  }
  function editLabel(i: number) {
    const L = labels[i]
    const t = window.prompt('Label text', L.text)
    if (t === null) return
    onLabelsChange(labels.map((x, j) => (j === i ? { ...x, text: t } : x)))
  }

  return (
    <div className="image-editor__annotate">
      <p className="image-editor__hint">
        Highlight: drag a box. Arrow: drag from tail to tip. Text: tap where the label should go. Use
        the list below to remove or edit labels.
      </p>
      <canvas
        ref={canvasRef}
        className="image-editor__paint-canvas"
        width={dw}
        height={dh}
        role="presentation"
        onPointerDown={(e) => {
          const t = tool
          e.currentTarget.setPointerCapture(e.pointerId)
          const { x, y } = clientToNatural(e.clientX, e.clientY)
          if (t === 'text') {
            dragRef.current = { kind: 'text', sx: x, sy: y, ex: x, ey: y }
            redraw()
            return
          }
          dragRef.current = { kind: t, sx: x, sy: y, ex: x, ey: y }
          redraw()
        }}
        onPointerMove={(e) => {
          if (!dragRef.current || dragRef.current.kind === 'text') return
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

          if (d.kind === 'text') {
            const dist = Math.hypot(ex - d.sx, ey - d.sy)
            dragRef.current = null
            redraw()
            if (dist > 12) return
            const text = window.prompt('Text on photo', 'Label')
            if (text === null || !text.trim()) return
            onLabelsChange([
              ...labels,
              {
                id: crypto.randomUUID(),
                x: d.sx,
                y: d.sy,
                text: text.trim(),
                fontSizePx: Math.max(14, Math.round(Math.min(nw, nh) / 28)),
                color: '#ffffff',
              },
            ])
            return
          }

          if (d.kind === 'highlight') {
            const x0 = Math.min(d.sx, ex)
            const y0 = Math.min(d.sy, ey)
            const w = Math.abs(ex - d.sx)
            const h = Math.abs(ey - d.sy)
            dragRef.current = null
            redraw()
            if (w > 4 && h > 4) {
              onHighlightsChange([...highlights, { x: x0, y: y0, width: w, height: h }])
            }
            return
          }

          if (d.kind === 'arrow') {
            const dist = Math.hypot(ex - d.sx, ey - d.sy)
            dragRef.current = null
            redraw()
            if (dist > 8) {
              onArrowsChange([...arrows, { x1: d.sx, y1: d.sy, x2: ex, y2: ey }])
            }
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null
          redraw()
        }}
      />

      <div className="image-editor__layers">
        <h3 className="image-editor__layers-title">Edits on this photo</h3>
        {highlights.length === 0 && arrows.length === 0 && labels.length === 0 ? (
          <p className="image-editor__layers-empty muted">No annotations yet.</p>
        ) : (
          <ul className="image-editor__layer-list">
            {highlights.map((_, i) => (
              <li key={`h-${i}`}>
                Highlight {i + 1}
                <button type="button" className="btn btn--ghost" onClick={() => removeHighlight(i)}>
                  Remove
                </button>
              </li>
            ))}
            {arrows.map((_, i) => (
              <li key={`a-${i}`}>
                Arrow {i + 1}
                <button type="button" className="btn btn--ghost" onClick={() => removeArrow(i)}>
                  Remove
                </button>
              </li>
            ))}
            {labels.map((L, i) => (
              <li key={L.id}>
                Text: “{L.text.length > 24 ? `${L.text.slice(0, 24)}…` : L.text}”
                <button type="button" className="btn btn--ghost" onClick={() => editLabel(i)}>
                  Edit
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => removeLabel(i)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ImageEditorModalBody({
  imageSrc,
  initialEdit,
  sourceImageId,
  onClose,
  onApply,
}: BodyProps) {
  const [phase, setPhase] = useState<Phase>('crop')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedPixels, setCroppedPixels] = useState<Area | null>(null)
  const [croppedCanvas, setCroppedCanvas] = useState<HTMLCanvasElement | null>(null)
  const [annotTool, setAnnotTool] = useState<AnnotTool>('highlight')
  const [highlights, setHighlights] = useState<Area[]>(() => initialEdit?.highlights ?? [])
  const [arrows, setArrows] = useState<ImageEditArrow[]>(() => initialEdit?.arrows ?? [])
  const [labels, setLabels] = useState<ImageEditLabel[]>(() => initialEdit?.labels ?? [])
  const cropKeyRef = useRef<string | null>(null)

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedPixels(pixels)
  }, [])

  async function goToAnnotate() {
    if (!croppedPixels) return
    const key = JSON.stringify(croppedPixels)
    const prev = cropKeyRef.current
    if (prev !== null && prev !== key) {
      setHighlights([])
      setArrows([])
      setLabels([])
    }
    cropKeyRef.current = key
    try {
      const canvas = await getCroppedCanvas(imageSrc, croppedPixels)
      setCroppedCanvas(canvas)
      setPhase('annotate')
    } catch {
      window.alert('Could not crop this image. Try again.')
    }
  }

  function handleApply() {
    const base = croppedCanvas
    if (!base || !croppedPixels) return
    const w = base.width
    const h = base.height
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')
    if (!ctx) return
    ctx.drawImage(base, 0, 0)
    paintAnnotationsOnCroppedContext(ctx, w, h, highlights, arrows, labels)
    void new Promise<Blob>((resolve, reject) => {
      out.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Export failed'))),
        'image/jpeg',
        0.92,
      )
    }).then((compositeBlob) => {
      const editState: ImageEditStateV1 = {
        v: 1,
        originalImageId: initialEdit?.originalImageId ?? sourceImageId,
        crop: croppedPixels,
        highlights,
        arrows,
        labels,
      }
      onApply({ compositeBlob, editState })
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
        {phase === 'crop' ? 'Move & crop' : 'Annotate photo'}
      </h2>

      {phase === 'crop' ? (
        <>
          <div className="image-editor__crop-wrap">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={undefined}
              rotation={0}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              initialCroppedAreaPixels={initialEdit?.crop}
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
        <>
          <div className="image-editor__tool-row" role="toolbar" style={{ marginBottom: '0.5rem' }}>
            <span className="image-editor__tool-label">Tool:</span>
            {(['highlight', 'arrow', 'text'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`btn btn--secondary image-editor__tool-btn${annotTool === t ? ' is-active' : ''}`}
                onClick={() => setAnnotTool(t)}
              >
                {t === 'highlight' ? 'Highlight' : t === 'arrow' ? 'Arrow' : 'Text on photo'}
              </button>
            ))}
          </div>
          <AnnotateLayer
            source={croppedCanvas}
            tool={annotTool}
            highlights={highlights}
            onHighlightsChange={setHighlights}
            arrows={arrows}
            onArrowsChange={setArrows}
            labels={labels}
            onLabelsChange={setLabels}
          />
        </>
      ) : null}

      <div className="modal__actions image-editor__footer">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        {phase === 'crop' ? (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => void goToAnnotate()}
            disabled={!croppedPixels}
          >
            Next: annotate
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setPhase('crop')
                setCroppedCanvas(null)
              }}
            >
              Back to crop
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
  initialEdit,
  sourceImageId,
  onClose,
  onApply,
}: Props) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <ImageEditorModalBody
        key={sessionKey}
        imageSrc={imageSrc}
        initialEdit={initialEdit}
        sourceImageId={sourceImageId}
        onClose={onClose}
        onApply={onApply}
      />
    </div>
  )
}
