import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRef } from 'react'
import type { StepRecord } from '../db/schema'
import { StepTextEditor } from './StepTextEditor'

type Props = {
  step: StepRecord
  stepNumber: number
  previewUrl?: string
  onTextChange: (text: string) => void
  onDelete: () => void
  onCameraFile: (file: File) => void
  onGalleryFile: (file: File) => void
  onClearImage: () => void
  onEditImage?: () => void
}

export function StepCard({
  step,
  stepNumber,
  previewUrl,
  onTextChange,
  onDelete,
  onCameraFile,
  onGalleryFile,
  onClearImage,
  onEditImage,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  }

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  return (
    <article
      ref={setNodeRef}
      style={style}
      className="step-card"
      data-step-id={step.id}
    >
      <div className="step-card__header">
        <button
          type="button"
          className="step-card__drag"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <span aria-hidden>⠿</span>
        </button>
        <span className="step-card__label">Step {stepNumber}</span>
        <div className="step-card__actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="Edit step text"
            onClick={() => textRef.current?.focus()}
          >
            ✎
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            aria-label="Delete step"
            onClick={onDelete}
          >
            ✕
          </button>
        </div>
      </div>

      {previewUrl ? (
        <div className="step-card__image-wrap">
          <img src={previewUrl} alt="" className="step-card__image" />
        </div>
      ) : null}

      <div className="step-card__media-actions">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onCameraFile(f)
            e.target.value = ''
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onGalleryFile(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => cameraRef.current?.click()}
        >
          Add photo from camera
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => galleryRef.current?.click()}
        >
          Add photo from gallery
        </button>
        {previewUrl ? (
          <>
            {onEditImage ? (
              <button type="button" className="btn btn--secondary" onClick={onEditImage}>
                Edit photo
              </button>
            ) : null}
            <button type="button" className="btn btn--ghost" onClick={onClearImage}>
              Clear image
            </button>
          </>
        ) : null}
      </div>

      <div className="step-card__field">
        <span className="visually-hidden">Instructions</span>
        <StepTextEditor
          stepId={step.id}
          html={step.text}
          onChange={onTextChange}
          editorRef={textRef}
        />
      </div>
    </article>
  )
}
