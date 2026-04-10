import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addStep as dbAddStep,
  clearStepImage as dbClearStepImage,
  deleteStep as dbDeleteStep,
  getImage,
  getStepsForTutorial,
  getTutorial,
  persistStepOrder,
  saveImageBlob,
  setStepImage as dbSetStepImage,
  setStepImageWithEdit,
  updateStepText as dbUpdateStepText,
  updateTutorialTitle,
  type StepRecord,
  type TutorialRecord,
} from '../db/schema'
import { processImageBlob } from '../services/images'
import { stringifyImageEdit, type ImageEditStateV1 } from '../types/imageEdit'

export function useTutorialEditor(tutorialId: string | undefined) {
  const [tutorial, setTutorial] = useState<TutorialRecord | null>(null)
  const [steps, setSteps] = useState<StepRecord[]>([])
  const [imagePreviewUrls, setImagePreviewUrls] = useState<Record<string, string>>(
    {},
  )
  const [loading, setLoading] = useState(true)
  const titleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const revokeAllPreviews = useCallback((urls: Record<string, string>) => {
    Object.values(urls).forEach((u) => URL.revokeObjectURL(u))
  }, [])

  const loadPreviewsForSteps = useCallback(
    async (list: StepRecord[]) => {
      const next: Record<string, string> = {}
      for (const st of list) {
        if (!st.imageId) continue
        const img = await getImage(st.imageId)
        if (img) next[st.id] = URL.createObjectURL(img.blob)
      }
      return next
    },
    [],
  )

  const refreshFromDb = useCallback(async () => {
    if (!tutorialId) return
    const t = await getTutorial(tutorialId)
    const s = await getStepsForTutorial(tutorialId)
    setTutorial(t ?? null)
    setSteps(s)
    setImagePreviewUrls((prev) => {
      revokeAllPreviews(prev)
      return {}
    })
    const previews = await loadPreviewsForSteps(s)
    setImagePreviewUrls(previews)
  }, [tutorialId, loadPreviewsForSteps, revokeAllPreviews])

  useEffect(() => {
    if (!tutorialId) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        await refreshFromDb()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tutorialId, refreshFromDb])

  useEffect(() => {
    return () => {
      setImagePreviewUrls((prev) => {
        revokeAllPreviews(prev)
        return {}
      })
    }
  }, [revokeAllPreviews])

  const setTitle = useCallback(
    (title: string) => {
      setTutorial((prev) => (prev ? { ...prev, title } : prev))
      if (!tutorialId) return
      if (titleDebounce.current) clearTimeout(titleDebounce.current)
      titleDebounce.current = setTimeout(() => {
        void updateTutorialTitle(tutorialId, title)
      }, 400)
    },
    [tutorialId],
  )

  const addStep = useCallback(async () => {
    if (!tutorialId) return
    await dbAddStep(tutorialId)
    await refreshFromDb()
  }, [tutorialId, refreshFromDb])

  const updateStepText = useCallback(
    async (stepId: string, text: string) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, text } : s)),
      )
      await dbUpdateStepText(stepId, text)
    },
    [],
  )

  const deleteStep = useCallback(
    async (stepId: string) => {
      await dbDeleteStep(stepId)
      setImagePreviewUrls((prev) => {
        const u = prev[stepId]
        if (u) URL.revokeObjectURL(u)
        const next = { ...prev }
        delete next[stepId]
        return next
      })
      await refreshFromDb()
    },
    [refreshFromDb],
  )

  const attachImageFromBlob = useCallback(
    async (stepId: string, blob: Blob) => {
      const jpeg = await processImageBlob(blob)
      const imageId = await saveImageBlob(jpeg, 'image/jpeg')
      await dbSetStepImage(stepId, imageId)
      setImagePreviewUrls((prev) => {
        const old = prev[stepId]
        if (old) URL.revokeObjectURL(old)
        const next = { ...prev }
        next[stepId] = URL.createObjectURL(jpeg)
        return next
      })
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, imageId } : s)),
      )
    },
    [],
  )

  const attachImageFromEditor = useCallback(
    async (stepId: string, compositeBlob: Blob, editState: ImageEditStateV1) => {
      const jpeg = await processImageBlob(compositeBlob)
      const imageId = await saveImageBlob(jpeg, 'image/jpeg')
      const json = stringifyImageEdit(editState)
      await setStepImageWithEdit(stepId, imageId, json)
      setImagePreviewUrls((prev) => {
        const old = prev[stepId]
        if (old) URL.revokeObjectURL(old)
        const next = { ...prev }
        next[stepId] = URL.createObjectURL(jpeg)
        return next
      })
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId ? { ...s, imageId, imageEditJson: json } : s,
        ),
      )
    },
    [],
  )

  const clearImage = useCallback(
    async (stepId: string) => {
      await dbClearStepImage(stepId)
      setImagePreviewUrls((prev) => {
        const u = prev[stepId]
        if (u) URL.revokeObjectURL(u)
        const next = { ...prev }
        delete next[stepId]
        return next
      })
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? { ...s, imageId: undefined, imageEditJson: undefined }
            : s,
        ),
      )
    },
    [],
  )

  const reorderSteps = useCallback(
    async (orderedIds: string[]) => {
      if (!tutorialId) return
      await persistStepOrder(tutorialId, orderedIds)
      setSteps((prev) =>
        orderedIds
          .map((id) => prev.find((s) => s.id === id))
          .filter((s): s is StepRecord => s != null),
      )
    },
    [tutorialId],
  )

  return {
    tutorial,
    title: tutorial?.title ?? '',
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
    refreshFromDb,
  }
}