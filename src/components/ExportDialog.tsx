import { useEffect, useRef, useState } from 'react'
import type { StepRecord } from '../db/schema'
import {
  buildTutorialDocx,
  defaultExportFilename,
  saveExportBlob,
} from '../services/exportDocx'
import { buildTutorialPdf } from '../services/exportPdf'
import { rasterizeVisualPagesToPdf } from '../services/visualExportPdf'
import {
  buildExportMailtoUrl,
  exportMimeForFilename,
  shareExportedBlob,
} from '../services/shareExport'
import type { ExportFormat, TutorialExportLayout } from '../types/exportLayout'
import {
  clampImageScalePct,
  DEFAULT_EXPORT_LAYOUT,
} from '../types/exportLayout'
import {
  createDefaultVisualBlocks,
  type VisualExportBlock,
} from '../types/visualExportLayout'
import { VisualExportCanvas, type VisualExportCanvasHandle } from './VisualExportCanvas'

type Props = {
  open: boolean
  onClose: () => void
  tutorialTitle: string
  steps: StepRecord[]
}

type ExportMode = 'quick' | 'visual'

function ensureExportFilename(
  name: string,
  tutorialTitle: string,
  format: ExportFormat,
): string {
  const t = name.trim()
  if (!t) return defaultExportFilename(tutorialTitle, format)
  const without = t.replace(/\.(docx|pdf)$/i, '')
  return format === 'pdf' ? `${without}.pdf` : `${without}.docx`
}

export function ExportDialog({ open, onClose, tutorialTitle, steps }: Props) {
  const [exportMode, setExportMode] = useState<ExportMode>('quick')
  const visualRef = useRef<VisualExportCanvasHandle>(null)
  const [visualBlocks, setVisualBlocks] = useState<VisualExportBlock[]>([])
  const [visualPageCount, setVisualPageCount] = useState(1)

  const [format, setFormat] = useState<ExportFormat>('docx')
  const [layout, setLayout] = useState<TutorialExportLayout>(() => ({
    ...DEFAULT_EXPORT_LAYOUT,
  }))
  const [perStepImagePct, setPerStepImagePct] = useState<Record<string, number>>(
    {},
  )
  const [filename, setFilename] = useState(() =>
    defaultExportFilename(tutorialTitle, 'docx'),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastBlob, setLastBlob] = useState<Blob | null>(null)

  useEffect(() => {
    if (open) {
      setExportMode('quick')
      setVisualBlocks([])
      setVisualPageCount(1)
      setFormat('docx')
      setLayout({ ...DEFAULT_EXPORT_LAYOUT })
      setPerStepImagePct({})
      setFilename(defaultExportFilename(tutorialTitle, 'docx'))
      setError(null)
      setLastBlob(null)
    }
  }, [open, tutorialTitle])

  function setFormatAndExtension(next: ExportFormat) {
    setFormat(next)
    setFilename((prev) => {
      const base = prev.replace(/\.(docx|pdf)$/i, '').trim()
      if (!base) return defaultExportFilename(tutorialTitle, next)
      return next === 'pdf' ? `${base}.pdf` : `${base}.docx`
    })
  }

  function switchToVisualMode() {
    setExportMode('visual')
    setFormat('pdf')
    setFilename((prev) => {
      const base = prev.replace(/\.(docx|pdf)$/i, '').trim()
      if (!base) return defaultExportFilename(tutorialTitle, 'pdf')
      return `${base}.pdf`
    })
    const { blocks, pageCount } = createDefaultVisualBlocks(steps, layout.pdfPageSize)
    setVisualBlocks(blocks)
    setVisualPageCount(pageCount)
  }

  function switchToQuickMode() {
    setExportMode('quick')
  }

  function handleVisualPageSizeChange(next: 'a4' | 'letter') {
    if (next === layout.pdfPageSize) return
    const ok = window.confirm(
      'Changing page size resets the visual canvas to a default layout. Continue?',
    )
    if (!ok) return
    setLayout((L) => ({ ...L, pdfPageSize: next }))
    const { blocks, pageCount } = createDefaultVisualBlocks(steps, next)
    setVisualBlocks(blocks)
    setVisualPageCount(pageCount)
  }

  if (!open) return null

  const effectiveFormat: ExportFormat = exportMode === 'visual' ? 'pdf' : format
  const exportName = ensureExportFilename(filename, tutorialTitle, effectiveFormat)
  const exportMime = exportMimeForFilename(exportName)
  const canUseShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function handleExport() {
    setError(null)
    setBusy(true)
    setLastBlob(null)
    try {
      let blob: Blob
      if (exportMode === 'visual') {
        const els = visualRef.current?.getPageElements() ?? []
        blob = await rasterizeVisualPagesToPdf(els, layout.pdfPageSize)
      } else {
        blob =
          format === 'pdf'
            ? await buildTutorialPdf(tutorialTitle, steps, layout, perStepImagePct)
            : await buildTutorialDocx(tutorialTitle, steps, layout, perStepImagePct)
      }
      setLastBlob(blob)
      await saveExportBlob(blob, exportName, effectiveFormat)
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setBusy(false)
        return
      }
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleShare() {
    if (!lastBlob) return
    setError(null)
    try {
      const r = await shareExportedBlob({
        blob: lastBlob,
        filename: exportName,
        mime: exportMime,
        title: tutorialTitle,
        summaryText: `Tutorial: ${tutorialTitle}`,
      })
      if (r === 'unavailable') {
        setError('Sharing is not available in this browser. Use Email or save the file.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Share failed')
    }
  }

  function handleEmail() {
    const name = lastBlob
      ? exportName
      : defaultExportFilename(tutorialTitle, effectiveFormat)
    const subject = `Tutorial: ${tutorialTitle}`
    const body = lastBlob
      ? `I exported this tutorial from TutoDOC.\n\nAttach the file:\n${name}\n\n(If the file is not attached, export again from the app and attach it from your Downloads or Files folder.)`
      : `Tutorial: ${tutorialTitle}\n\n(Open TutoDOC, export this tutorial, then attach the file to this email.)`
    window.location.href = buildExportMailtoUrl(subject, body)
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`modal modal--wide export-dialog${exportMode === 'visual' ? ' export-dialog--visual' : ''}`}
        role="dialog"
        aria-labelledby="export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="export-title" className="modal__title">
          Export tutorial
        </h2>

        <fieldset className="export-dialog__fieldset">
          <legend className="export-dialog__legend">Export style</legend>
          <div className="export-dialog__format-row">
            <label className="export-dialog__radio">
              <input
                type="radio"
                name="export-style"
                checked={exportMode === 'quick'}
                onChange={() => switchToQuickMode()}
                disabled={busy}
              />
              Quick (structured Word or PDF)
            </label>
            <label className="export-dialog__radio">
              <input
                type="radio"
                name="export-style"
                checked={exportMode === 'visual'}
                onChange={() => switchToVisualMode()}
                disabled={busy}
              />
              Visual page designer (drag &amp; resize, PDF)
            </label>
          </div>
          {exportMode === 'visual' ? (
            <p className="export-dialog__note muted">
              Arrange title and steps on page-sized artboards. Export rasterizes what you see into a
              PDF. Word is not available for this mode.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="export-dialog__fieldset">
          <legend className="export-dialog__legend">Format</legend>
          <div className="export-dialog__format-row">
            <label className="export-dialog__radio">
              <input
                type="radio"
                name="export-format"
                checked={format === 'docx'}
                onChange={() => setFormatAndExtension('docx')}
                disabled={busy || exportMode === 'visual'}
              />
              Word (.docx)
            </label>
            <label className="export-dialog__radio">
              <input
                type="radio"
                name="export-format"
                checked={format === 'pdf'}
                onChange={() => setFormatAndExtension('pdf')}
                disabled={busy}
              />
              PDF
            </label>
          </div>
        </fieldset>

        {exportMode === 'visual' ? (
          <div className="export-dialog__visual-panel">
            <div className="export-dialog__visual-toolbar">
              <label className="modal__field" style={{ marginBottom: 0 }}>
                Page size (resets layout)
                <select
                  className="modal__input"
                  value={layout.pdfPageSize}
                  onChange={(e) =>
                    handleVisualPageSizeChange(e.target.value as 'a4' | 'letter')
                  }
                  disabled={busy}
                >
                  <option value="a4">A4</option>
                  <option value="letter">US Letter</option>
                </select>
              </label>
              <label className="export-dialog__range export-dialog__range--compact">
                Title
                <input
                  type="range"
                  min={14}
                  max={28}
                  step={1}
                  value={layout.pdfTitleFontPt}
                  onChange={(e) =>
                    setLayout((L) => ({
                      ...L,
                      pdfTitleFontPt: Number(e.target.value),
                    }))
                  }
                  disabled={busy}
                />
                <span>{layout.pdfTitleFontPt}pt</span>
              </label>
              <label className="export-dialog__range export-dialog__range--compact">
                Step
                <input
                  type="range"
                  min={11}
                  max={22}
                  step={1}
                  value={layout.pdfStepHeadingFontPt}
                  onChange={(e) =>
                    setLayout((L) => ({
                      ...L,
                      pdfStepHeadingFontPt: Number(e.target.value),
                    }))
                  }
                  disabled={busy}
                />
                <span>{layout.pdfStepHeadingFontPt}pt</span>
              </label>
              <label className="export-dialog__range export-dialog__range--compact">
                Body
                <input
                  type="range"
                  min={9}
                  max={16}
                  step={1}
                  value={layout.pdfBodyFontPt}
                  onChange={(e) =>
                    setLayout((L) => ({ ...L, pdfBodyFontPt: Number(e.target.value) }))
                  }
                  disabled={busy}
                />
                <span>{layout.pdfBodyFontPt}pt</span>
              </label>
            </div>
            <VisualExportCanvas
              ref={visualRef}
              tutorialTitle={tutorialTitle}
              steps={steps}
              pageSize={layout.pdfPageSize}
              fontPts={{
                title: layout.pdfTitleFontPt,
                step: layout.pdfStepHeadingFontPt,
                body: layout.pdfBodyFontPt,
              }}
              blocks={visualBlocks}
              setBlocks={setVisualBlocks}
              pageCount={visualPageCount}
              setPageCount={setVisualPageCount}
            />
          </div>
        ) : null}

        {exportMode === 'quick' ? (
          <details className="export-dialog__details" open>
            <summary className="export-dialog__summary">Layout &amp; sizing</summary>
            <div className="export-dialog__layout-grid">
              <label className="modal__field export-dialog__range">
                Max image width (Word, px)
                <input
                  type="range"
                  min={240}
                  max={900}
                  step={10}
                  value={layout.docImageMaxWidthPx}
                  onChange={(e) =>
                    setLayout((L) => ({
                      ...L,
                      docImageMaxWidthPx: Number(e.target.value),
                    }))
                  }
                  disabled={busy}
                />
                <span>{layout.docImageMaxWidthPx}px</span>
              </label>
              <label className="modal__field export-dialog__range">
                Max image width (PDF, pt)
                <input
                  type="range"
                  min={200}
                  max={520}
                  step={10}
                  value={layout.pdfImageMaxWidthPt}
                  onChange={(e) =>
                    setLayout((L) => ({
                      ...L,
                      pdfImageMaxWidthPt: Number(e.target.value),
                    }))
                  }
                  disabled={busy}
                />
                <span>{layout.pdfImageMaxWidthPt}pt</span>
              </label>
              <label className="modal__field export-dialog__range">
                Word body text (half-points)
                <input
                  type="range"
                  min={18}
                  max={40}
                  step={1}
                  value={layout.docBodyHalfPoints}
                  onChange={(e) =>
                    setLayout((L) => ({
                      ...L,
                      docBodyHalfPoints: Number(e.target.value),
                    }))
                  }
                  disabled={busy}
                />
                <span>
                  {layout.docBodyHalfPoints} ({layout.docBodyHalfPoints / 2}pt)
                </span>
              </label>
              <fieldset className="export-dialog__fieldset export-dialog__fieldset--inline">
                <legend className="export-dialog__legend">Each step</legend>
                <label className="export-dialog__radio">
                  <input
                    type="radio"
                    name="step-order"
                    checked={layout.stepContentOrder === 'image-first'}
                    onChange={() =>
                      setLayout((L) => ({ ...L, stepContentOrder: 'image-first' }))
                    }
                    disabled={busy}
                  />
                  Image first, then instructions
                </label>
                <label className="export-dialog__radio">
                  <input
                    type="radio"
                    name="step-order"
                    checked={layout.stepContentOrder === 'text-first'}
                    onChange={() =>
                      setLayout((L) => ({ ...L, stepContentOrder: 'text-first' }))
                    }
                    disabled={busy}
                  />
                  Instructions first, then image
                </label>
              </fieldset>
              <label className="modal__field">
                PDF page size
                <select
                  className="modal__input"
                  value={layout.pdfPageSize}
                  onChange={(e) =>
                    setLayout((L) => ({
                      ...L,
                      pdfPageSize: e.target.value as 'a4' | 'letter',
                    }))
                  }
                  disabled={busy}
                >
                  <option value="a4">A4</option>
                  <option value="letter">US Letter</option>
                </select>
              </label>
              <label className="modal__field export-dialog__range">
                PDF margins (pt)
                <input
                  type="range"
                  min={36}
                  max={72}
                  step={2}
                  value={layout.pdfMarginPt}
                  onChange={(e) =>
                    setLayout((L) => ({ ...L, pdfMarginPt: Number(e.target.value) }))
                  }
                  disabled={busy}
                />
                <span>{layout.pdfMarginPt}pt</span>
              </label>
              <label className="modal__field export-dialog__range">
                PDF title (pt)
                <input
                  type="range"
                  min={14}
                  max={28}
                  step={1}
                  value={layout.pdfTitleFontPt}
                  onChange={(e) =>
                    setLayout((L) => ({
                      ...L,
                      pdfTitleFontPt: Number(e.target.value),
                    }))
                  }
                  disabled={busy}
                />
                <span>{layout.pdfTitleFontPt}pt</span>
              </label>
              <label className="modal__field export-dialog__range">
                PDF step heading (pt)
                <input
                  type="range"
                  min={11}
                  max={22}
                  step={1}
                  value={layout.pdfStepHeadingFontPt}
                  onChange={(e) =>
                    setLayout((L) => ({
                      ...L,
                      pdfStepHeadingFontPt: Number(e.target.value),
                    }))
                  }
                  disabled={busy}
                />
                <span>{layout.pdfStepHeadingFontPt}pt</span>
              </label>
              <label className="modal__field export-dialog__range">
                PDF body (pt)
                <input
                  type="range"
                  min={9}
                  max={16}
                  step={1}
                  value={layout.pdfBodyFontPt}
                  onChange={(e) =>
                    setLayout((L) => ({ ...L, pdfBodyFontPt: Number(e.target.value) }))
                  }
                  disabled={busy}
                />
                <span>{layout.pdfBodyFontPt}pt</span>
              </label>
            </div>

            {steps.length > 0 ? (
              <div className="export-dialog__per-step">
                <p className="export-dialog__per-step-title">Image size per step</p>
                <p className="muted export-dialog__hint">
                  Percent of the max width above (steps without images are ignored).
                </p>
                <ul className="export-dialog__per-step-list">
                  {steps.map((s, i) => (
                    <li key={s.id}>
                      <span className="export-dialog__per-step-label">
                        Step {i + 1}
                        {s.imageId ? '' : ' (no image)'}
                      </span>
                      <input
                        type="range"
                        min={25}
                        max={100}
                        step={5}
                        disabled={busy || !s.imageId}
                        value={clampImageScalePct(perStepImagePct[s.id] ?? 100)}
                        onChange={(e) =>
                          setPerStepImagePct((prev) => ({
                            ...prev,
                            [s.id]: clampImageScalePct(Number(e.target.value)),
                          }))
                        }
                      />
                      <span>{clampImageScalePct(perStepImagePct[s.id] ?? 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </details>
        ) : null}

        <label className="modal__field">
          File name
          <input
            type="text"
            className="modal__input"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            disabled={busy}
            autoComplete="off"
          />
        </label>
        {error ? <p className="modal__error">{error}</p> : null}
        <div className="modal__actions export-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleExport()}
            disabled={busy}
          >
            {busy ? 'Working…' : 'Export / save'}
          </button>
          {lastBlob ? (
            <>
              {canUseShare ? (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => void handleShare()}
                >
                  Share…
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleEmail}
              >
                Email…
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleEmail}
              title="Opens your mail app. Export first to attach the file."
            >
              Email…
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
