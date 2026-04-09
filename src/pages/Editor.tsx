import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExportDialog } from '../components/ExportDialog'
import { ImageEditorModal } from '../components/ImageEditorModal'
import { StepList } from '../components/StepList'
import { useTutorialEditor } from '../hooks/useTutorialEditor'
import { instructionTextIsMeaningful } from '../services/richText'

export function Editor() {
  const { tutorialId } = useParams<{ tutorialId: string }>()
  const navigate = useNavigate()
  const [exportOpen, setExportOpen] = useState(false)
  const [imageEdit, setImageEdit] = useState<{
    stepId: string
    src: string
    key: number
  } | null>(null)

  const {
    tutorial,
    title,
    setTitle,
    steps,
    loading,
    addStep,
    updateStepText,
    deleteStep,
    attachImageFromBlob,
    clearImage,
    reorderSteps,
    imagePreviewUrls,
  } = useTutorialEditor(tutorialId)

  function validateExport(): string | null {
    if (!steps.length) return 'Add at least one step before exporting.'
    const empty = steps.some((s) => !instructionTextIsMeaningful(s.text))
    if (empty) return 'Every step needs instruction text before export.'
    return null
  }

  function openExport() {
    const err = validateExport()
    if (err) {
      window.alert(err)
      return
    }
    setExportOpen(true)
  }

  if (!tutorialId) {
    return <p className="muted">Missing tutorial.</p>
  }

  if (loading && !tutorial) {
    return <p className="muted">Loading…</p>
  }

  if (!tutorial) {
    return (
      <div className="page">
        <p className="muted">Tutorial not found.</p>
        <Link to="/">Back to list</Link>
      </div>
    )
  }

  return (
    <div className="page editor">
      <header className="editor__toolbar">
        <button
          type="button"
          className="btn btn--ghost editor__back"
          onClick={() => void navigate('/')}
        >
          ← Back
        </button>
        <div className="editor__toolbar-spacer" />
        <button type="button" className="btn btn--primary" onClick={openExport}>
          Export
        </button>
      </header>

      <label className="editor__title-field">
        <span className="visually-hidden">Tutorial title</span>
        <input
          type="text"
          className="editor__title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tutorial title"
        />
      </label>

      <StepList
        steps={steps}
        imagePreviewUrls={imagePreviewUrls}
        onTextChange={(id, t) => void updateStepText(id, t)}
        onDelete={(id) => {
          if (window.confirm('Remove this step?')) void deleteStep(id)
        }}
        onCameraFile={(id, file) => void attachImageFromBlob(id, file)}
        onGalleryFile={(id, file) => void attachImageFromBlob(id, file)}
        onClearImage={(id) => void clearImage(id)}
        onReorder={(ids) => void reorderSteps(ids)}
        onEditImage={(stepId) => {
          const src = imagePreviewUrls[stepId]
          if (src) setImageEdit({ stepId, src, key: Date.now() })
        }}
      />

      <div className="editor__footer">
        <button type="button" className="btn btn--secondary" onClick={() => void addStep()}>
          Add step
        </button>
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tutorialTitle={title.trim() || 'Tutorial'}
        steps={steps}
      />

      <ImageEditorModal
        open={!!imageEdit}
        sessionKey={imageEdit?.key ?? 0}
        imageSrc={imageEdit?.src ?? ''}
        onClose={() => setImageEdit(null)}
        onApply={(blob) => {
          if (imageEdit) void attachImageFromBlob(imageEdit.stepId, blob)
        }}
      />
    </div>
  )
}
