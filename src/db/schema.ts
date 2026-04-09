import Dexie, { type EntityTable } from 'dexie'

export interface TutorialRecord {
  id: string
  title: string
  updatedAt: number
}

export interface StepRecord {
  id: string
  tutorialId: string
  sortOrder: number
  text: string
  imageId?: string
}

export interface StoredImageRecord {
  id: string
  blob: Blob
  mimeType: string
  createdAt: number
}

class TutoDocDB extends Dexie {
  tutorials!: EntityTable<TutorialRecord, 'id'>
  steps!: EntityTable<StepRecord, 'id'>
  images!: EntityTable<StoredImageRecord, 'id'>

  constructor() {
    super('tutodoc')
    this.version(1).stores({
      tutorials: 'id, updatedAt',
      steps: 'id, tutorialId, sortOrder, imageId',
      images: 'id',
    })
  }
}

export const db = new TutoDocDB()

export async function listTutorials(): Promise<TutorialRecord[]> {
  return db.tutorials.orderBy('updatedAt').reverse().toArray()
}

export async function getTutorial(id: string): Promise<TutorialRecord | undefined> {
  return db.tutorials.get(id)
}

export async function createTutorial(title: string): Promise<string> {
  const id = crypto.randomUUID()
  const now = Date.now()
  await db.tutorials.add({ id, title, updatedAt: now })
  return id
}

export async function updateTutorialTitle(id: string, title: string): Promise<void> {
  await db.tutorials.update(id, { title, updatedAt: Date.now() })
}

export async function deleteTutorial(id: string): Promise<void> {
  const steps = await db.steps.where('tutorialId').equals(id).toArray()
  for (const s of steps) {
    await deleteStep(s.id)
  }
  await db.tutorials.delete(id)
}

export async function getStepsForTutorial(tutorialId: string): Promise<StepRecord[]> {
  const steps = await db.steps.where('tutorialId').equals(tutorialId).toArray()
  return steps.sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function addStep(tutorialId: string): Promise<StepRecord> {
  const existing = await db.steps.where('tutorialId').equals(tutorialId).toArray()
  const maxOrder = existing.reduce((m, s) => Math.max(m, s.sortOrder), -1)
  const step: StepRecord = {
    id: crypto.randomUUID(),
    tutorialId,
    sortOrder: maxOrder + 1,
    text: '',
  }
  await db.steps.add(step)
  await db.tutorials.update(tutorialId, { updatedAt: Date.now() })
  return step
}

export async function updateStepText(stepId: string, text: string): Promise<void> {
  const step = await db.steps.get(stepId)
  if (!step) return
  await db.steps.update(stepId, { text })
  await db.tutorials.update(step.tutorialId, { updatedAt: Date.now() })
}

export async function deleteStep(stepId: string): Promise<void> {
  const step = await db.steps.get(stepId)
  if (!step) return
  const imageId = step.imageId
  await db.steps.delete(stepId)
  if (imageId) await deleteImageIfOrphan(imageId)
  await db.tutorials.update(step.tutorialId, { updatedAt: Date.now() })
}

export async function setStepImage(stepId: string, imageId: string): Promise<void> {
  const step = await db.steps.get(stepId)
  if (!step) return
  const old = step.imageId
  await db.steps.update(stepId, { imageId })
  if (old && old !== imageId) await deleteImageIfOrphan(old)
  await db.tutorials.update(step.tutorialId, { updatedAt: Date.now() })
}

export async function clearStepImage(stepId: string): Promise<void> {
  const step = await db.steps.get(stepId)
  if (!step) return
  const old = step.imageId
  const next: StepRecord = {
    id: step.id,
    tutorialId: step.tutorialId,
    sortOrder: step.sortOrder,
    text: step.text,
  }
  await db.steps.put(next)
  if (old) await deleteImageIfOrphan(old)
  await db.tutorials.update(step.tutorialId, { updatedAt: Date.now() })
}

export async function saveImageBlob(blob: Blob, mimeType: string): Promise<string> {
  const id = crypto.randomUUID()
  await db.images.add({ id, blob, mimeType, createdAt: Date.now() })
  return id
}

export async function getImage(id: string): Promise<StoredImageRecord | undefined> {
  return db.images.get(id)
}

async function deleteImageIfOrphan(imageId: string): Promise<void> {
  const count = await db.steps.where('imageId').equals(imageId).count()
  if (count === 0) await db.images.delete(imageId)
}

export async function persistStepOrder(
  tutorialId: string,
  orderedStepIds: string[],
): Promise<void> {
  await db.transaction('rw', db.steps, db.tutorials, async () => {
    for (let i = 0; i < orderedStepIds.length; i++) {
      await db.steps.update(orderedStepIds[i], { sortOrder: i })
    }
    await db.tutorials.update(tutorialId, { updatedAt: Date.now() })
  })
}
