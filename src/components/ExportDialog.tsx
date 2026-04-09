import { useEffect, useState } from 'react'
import type { StepRecord } from '../db/schema'
import {
  buildTutorialDocx,
  defaultExportFilename,
  saveDocxFile,
  shareDocxFile,
} from '../services/exportDocx'

type Props = {
  open: boolean
  onClose: () => void
  tutorialTitle: string
  steps: StepRecord[]
}

export function ExportDialog({ open, onClose, tutorialTitle, steps }: Props) {
  const [filename, setFilename] = useState(() =>
    defaultExportFilename(tutorialTitle),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastBlob, setLastBlob] = useState<Blob | null>(null)

  useEffect(() => {
    if (open) {
      setFilename(defaultExportFilename(tutorialTitle))
      setError(null)
      setLastBlob(null)
    }
  }, [open, tutorialTitle])

  if (!open) return null

  const ensureDocxName = (name: string) => {
    const t = name.trim()
    if (!t) return defaultExportFilename(tutorialTitle)
    return t.toLowerCase().endsWith('.docx') ? t : `${t}.docx`
  }

  async function handleExport() {
    setError(null)
    setBusy(true)
    setLastBlob(null)
    try {
      const blob = await buildTutorialDocx(tutorialTitle, steps)
      setLastBlob(blob)
      const name = ensureDocxName(filename)
      await saveDocxFile(blob, name)
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
    const name = ensureDocxName(filename)
    try {
      await shareDocxFile(lastBlob, name)
    } catch {
      setError('Sharing is not available on this device.')
    }
  }

  const canShare =
    lastBlob &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="export-title" className="modal__title">
          Export to Word
        </h2>
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
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleExport()}
            disabled={busy}
          >
            {busy ? 'Working…' : 'Export'}
          </button>
          {canShare ? (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void handleShare()}
            >
              Share
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
