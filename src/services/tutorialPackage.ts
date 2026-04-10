import {
  db,
  getStepsForTutorial,
  getTutorial,
  type StepRecord,
  type TutorialRecord,
} from '../db/schema'
import { parseImageEditJson } from '../types/imageEdit'

export const PACKAGE_FILE_EXTENSION = '.tutodoc.json'
export const PACKAGE_MIME = 'application/json'

export type TutorialPackageV1 = {
  v: 1
  exportedAt: number
  app: 'tutodoc'
  tutorial: Pick<TutorialRecord, 'title' | 'updatedAt'>
  steps: Array<{
    sortOrder: number
    text: string
    /** Key matching `images` record, or null */
    imagePlaceholder: string | null
    imageEditJson?: string
  }>
  images: Record<string, { mimeType: string; dataBase64: string }>
}

function placeholderForIndex(i: number): string {
  return `@@TDCIMG${i}@@`
}

function collectImageIds(steps: StepRecord[]): string[] {
  const ids = new Set<string>()
  for (const s of steps) {
    if (s.imageId) ids.add(s.imageId)
    const meta = parseImageEditJson(s.imageEditJson)
    if (meta?.originalImageId) ids.add(meta.originalImageId)
  }
  return [...ids]
}

function buildUuidToPlaceholder(ids: string[]): Map<string, string> {
  const m = new Map<string, string>()
  ids.forEach((id, i) => m.set(id, placeholderForIndex(i)))
  return m
}

function swapUuids(s: string, uuidToPh: Map<string, string>): string {
  let out = s
  for (const [uuid, ph] of uuidToPh) {
    if (!out.includes(uuid)) continue
    out = out.split(uuid).join(ph)
  }
  return out
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const data = r.result as string
      const i = data.indexOf(',')
      resolve(i >= 0 ? data.slice(i + 1) : data)
    }
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsDataURL(blob)
  })
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' })
}

function slugifyForFilename(title: string): string {
  const base = title
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48)
  return base || 'tutorial'
}

export function defaultPackageFilename(title: string): string {
  const d = new Date()
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${slugifyForFilename(title)}-${y}${mo}${day}${PACKAGE_FILE_EXTENSION}`
}

export async function buildTutorialPackage(tutorialId: string): Promise<{
  blob: Blob
  filename: string
}> {
  const tutorial = await getTutorial(tutorialId)
  if (!tutorial) throw new Error('Tutorial not found')
  const steps = await getStepsForTutorial(tutorialId)
  const ids = collectImageIds(steps)
  const uuidToPh = buildUuidToPlaceholder(ids)

  const images: TutorialPackageV1['images'] = {}
  for (const id of ids) {
    const ph = uuidToPh.get(id)
    if (!ph) continue
    const rec = await db.images.get(id)
    if (!rec) throw new Error(`Missing image ${id}`)
    images[ph] = {
      mimeType: rec.mimeType || 'image/jpeg',
      dataBase64: await blobToBase64(rec.blob),
    }
  }

  const exportedSteps: TutorialPackageV1['steps'] = steps.map((s) => {
    const imagePh = s.imageId ? (uuidToPh.get(s.imageId) ?? null) : null
    const rawEdit = s.imageEditJson?.trim()
    const imageEditJson = rawEdit
      ? swapUuids(rawEdit, uuidToPh)
      : undefined
    return {
      sortOrder: s.sortOrder,
      text: s.text,
      imagePlaceholder: imagePh,
      imageEditJson,
    }
  })

  const pkg: TutorialPackageV1 = {
    v: 1,
    exportedAt: Date.now(),
    app: 'tutodoc',
    tutorial: { title: tutorial.title, updatedAt: tutorial.updatedAt },
    steps: exportedSteps,
    images,
  }

  const json = JSON.stringify(pkg)
  const blob = new Blob([json], { type: PACKAGE_MIME })
  return { blob, filename: defaultPackageFilename(tutorial.title) }
}

function isPackageV1(o: unknown): o is TutorialPackageV1 {
  if (!o || typeof o !== 'object') return false
  const p = o as TutorialPackageV1
  if (p.v !== 1 || p.app !== 'tutodoc') return false
  if (!p.tutorial || typeof p.tutorial.title !== 'string') return false
  if (!Array.isArray(p.steps) || typeof p.images !== 'object' || !p.images) return false
  return true
}

export type ImportPackageResult = { tutorialId: string; title: string }

export async function importTutorialPackage(file: Blob): Promise<ImportPackageResult> {
  let text: string
  try {
    text = await file.text()
  } catch {
    throw new Error('Could not read file')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON')
  }
  if (!isPackageV1(parsed)) {
    throw new Error('Not a TutoDOC transfer file (wrong format)')
  }

  const tutorialId = crypto.randomUUID()
  const now = Date.now()
  const title = parsed.tutorial.title.trim() || 'Imported tutorial'

  const phToNewId = new Map<string, string>()

  await db.transaction('rw', db.tutorials, db.steps, db.images, async () => {
    for (const [ph, entry] of Object.entries(parsed.images)) {
      if (!entry || typeof entry.dataBase64 !== 'string' || typeof entry.mimeType !== 'string') {
        throw new Error('Invalid image entry in package')
      }
      const blob = base64ToBlob(entry.dataBase64, entry.mimeType)
      const id = crypto.randomUUID()
      await db.images.add({ id, blob, mimeType: entry.mimeType, createdAt: Date.now() })
      phToNewId.set(ph, id)
    }

    await db.tutorials.add({
      id: tutorialId,
      title,
      updatedAt: now,
    })

    const sorted = [...parsed.steps].sort((a, b) => a.sortOrder - b.sortOrder)
    for (const st of sorted) {
      const stepId = crypto.randomUUID()
      let imageEditJson = st.imageEditJson
      if (imageEditJson) {
        const repl = [...phToNewId.entries()].sort((a, b) => b[0].length - a[0].length)
        for (const [ph, nid] of repl) {
          imageEditJson = imageEditJson.split(ph).join(nid)
        }
      }
      let imageId: string | undefined
      if (st.imagePlaceholder) {
        const mapped = phToNewId.get(st.imagePlaceholder)
        if (mapped) imageId = mapped
      }
      const row: StepRecord = {
        id: stepId,
        tutorialId,
        sortOrder: st.sortOrder,
        text: typeof st.text === 'string' ? st.text : '',
        ...(imageId ? { imageId } : {}),
        ...(imageEditJson?.trim() ? { imageEditJson } : {}),
      }
      await db.steps.add(row)
    }
  })

  return { tutorialId, title }
}

export async function savePackageFile(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
