import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { StepRecord } from '../db/schema'
import { StepCard } from './StepCard'

type Props = {
  steps: StepRecord[]
  imagePreviewUrls: Record<string, string>
  onTextChange: (stepId: string, text: string) => void
  onDelete: (stepId: string) => void
  onCameraFile: (stepId: string, file: File) => void
  onGalleryFile: (stepId: string, file: File) => void
  onClearImage: (stepId: string) => void
  onReorder: (orderedIds: string[]) => void
  onEditImage?: (stepId: string) => void
}

export function StepList({
  steps,
  imagePreviewUrls,
  onTextChange,
  onDelete,
  onCameraFile,
  onGalleryFile,
  onClearImage,
  onReorder,
  onEditImage,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ids = steps.map((s) => s.id)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const next = [...ids]
    const [removed] = next.splice(oldIndex, 1)
    next.splice(newIndex, 0, removed)
    onReorder(next)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="step-list">
          {steps.map((step, i) => (
            <StepCard
              key={step.id}
              step={step}
              stepNumber={i + 1}
              previewUrl={imagePreviewUrls[step.id]}
              onTextChange={(t) => onTextChange(step.id, t)}
              onDelete={() => onDelete(step.id)}
              onCameraFile={(f) => onCameraFile(step.id, f)}
              onGalleryFile={(f) => onGalleryFile(step.id, f)}
              onClearImage={() => onClearImage(step.id)}
              onEditImage={
                onEditImage && imagePreviewUrls[step.id]
                  ? () => onEditImage(step.id)
                  : undefined
              }
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
