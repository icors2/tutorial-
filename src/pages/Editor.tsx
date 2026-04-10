import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExportDialog } from '../components/ExportDialog'
import { ImageEditorModal } from '../components/ImageEditorModal'
import { StepList } from '../components/StepList'
import { getImage } from '../db/schema'
import { useTutorialEditor } from '../hooks/useTutorialEditor'
import { instructionTextIsMeaningful } from '../services/richText'
import { parseImageEditJson, type ImageEditStateV1 } from '../types/imageEdit'

type ImageEditSession = {
  stepId: string
  key: number
  imageSrc: string
  initialEdit: ImageEditStateV1 | null
  sourceImageId: string
  revokeOnClose: boolean
}

export function Editor() {
  const { tutorialId } = useParams<{ tutorialId: string }>()
  const navigate = useNavigate()
  const [exportOpen, setExportOpen] = useState(false)
  const [imageEdit, setImageEdit] = useState<ImageEditSession | null>(null)

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
    attachImageFromEditor,
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

  function closeImageEditor() {
    setImageEdit((cur) => {
      if (cur?.revokeOnClose) URL.revokeObjectURL(cur.imageSrc)
      return null
    })
  }

  async function openImageEditor(stepId: string) {
    const step = steps.find((s) => s.id === stepId)
    if (!step?.imageId) return
    const initial = parseImageEditJson(step.imageEditJson)
    let imageSrc = ''
    let revokeOnClose = false
    if (initial?.originalImageId) {
      const orig = await getImage(initial.originalImageId)
      if (orig) {
        imageSrc = URL.createObjectURL(orig.blob)
        revokeOnClose = true
      }
    }
    if (!imageSrc) {
      imageSrc = imagePreviewUrls[stepId] ?? ''
    }
    if (!imageSrc) return
    setImageEdit({
      stepId,
      key: Date.now(),
      imageSrc,
      initialEdit: initial,
      sourceImageId: step.imageId,
      revokeOnClose,
    })
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
        onEditImage={(stepId) => void openImageEditor(stepId)}
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
        imageSrc={imageEdit?.imageSrc ?? ''}
        initialEdit={imageEdit?.initialEdit ?? null}
        sourceImageId={imageEdit?.sourceImageId ?? ''}
        onClose={closeImageEditor}
        onApply={(p) => {
          const session = imageEdit
          if (session) {
            void attachImageFromEditor(session.stepId, p.compositeBlob, p.editState)
            if (session.revokeOnClose) URL.revokeObjectURL(session.imageSrc)
            setImageEdit(null)
          }
        }}
      />
    </div>
  )
}
