import { useState } from 'react'
import { buildTutorialPackage, savePackageFile } from '../services/tutorialPackage'
import { shareExportedBlob } from '../services/shareExport'

type Props = {
  open: boolean
  onClose: () => void
  tutorialId: string
  tutorialTitle: string
}

export function TransferDialog({ open, onClose, tutorialId, tutorialTitle }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const canShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function buildAndGetBlob() {
    const { blob, filename } = await buildTutorialPackage(tutorialId)
    return { blob, filename }
  }

  async function handleDownload() {
    setError(null)
    setBusy(true)
    try {
      const { blob, filename } = await buildAndGetBlob()
      await savePackageFile(blob, filename)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create transfer file')
    } finally {
      setBusy(false)
    }
  }

  async function handleShare() {
    setError(null)
    setBusy(true)
    try {
      const { blob, filename } = await buildAndGetBlob()
      const r = await shareExportedBlob({
        blob,
        filename,
        mime: 'application/json',
        title: tutorialTitle,
        summaryText: `TutoDOC transfer: ${tutorialTitle}`,
      })
      if (r === 'unavailable') {
        setError('Sharing is not available. Use Download and send the file another way.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Share failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="transfer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="transfer-title" className="modal__title">
          Transfer to another device
        </h2>
        <p className="transfer-dialog__copy">
          Saves everything for this tutorial—steps, text, photos, and photo edits—into one{' '}
          <code className="transfer-dialog__code">.tutodoc.json</code> file. On your computer,
          open TutoDOC and use <strong>Import transfer file</strong> on the home screen.
        </p>
        <p className="muted transfer-dialog__hint">
          Tip: email the file to yourself, use cloud storage, or Share to Drive / Files.
        </p>
        {error ? <p className="modal__error">{error}</p> : null}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleDownload()}
            disabled={busy}
          >
            {busy ? 'Working…' : 'Download'}
          </button>
          {canShare ? (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void handleShare()}
              disabled={busy}
            >
              Share…
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
