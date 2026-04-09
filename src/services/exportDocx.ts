import type { StepRecord } from '../db/schema'
import { getImage } from '../db/schema'
import { instructionHtmlToDocxParagraphs } from './richText'

const DOC_IMAGE_MAX_WIDTH = 600

function slugifyFilename(title: string): string {
  const base = title
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
  return base || 'tutorial'
}

export function defaultExportFilename(title: string): string {
  return `${slugifyFilename(title)}.docx`
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}

async function jpegDimensions(data: Uint8Array): Promise<{ w: number; h: number }> {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const blob = new Blob([copy], { type: 'image/jpeg' })
  const bitmap = await createImageBitmap(blob)
  try {
    return { w: bitmap.width, h: bitmap.height }
  } finally {
    bitmap.close()
  }
}

export async function buildTutorialDocx(
  title: string,
  steps: StepRecord[],
): Promise<Blob> {
  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    ImageRun,
    TextRun,
    UnderlineType,
  } = await import('docx')

  const children: InstanceType<typeof Paragraph>[] = []

  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
    }),
  )

  let stepIndex = 0
  for (const step of steps) {
    stepIndex += 1
    children.push(
      new Paragraph({
        text: `Step ${stepIndex}`,
        heading: HeadingLevel.HEADING_2,
      }),
    )

    if (step.imageId) {
      const rec = await getImage(step.imageId)
      if (rec) {
        const raw = await blobToUint8Array(rec.blob)
        const { w, h } = await jpegDimensions(raw)
        const scale = Math.min(1, DOC_IMAGE_MAX_WIDTH / w)
        const tw = Math.max(1, Math.round(w * scale))
        const th = Math.max(1, Math.round(h * scale))
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: 'jpg',
                data: raw,
                transformation: { width: tw, height: th },
              }),
            ],
          }),
        )
      }
    }

    const textParas = instructionHtmlToDocxParagraphs(
      step.text,
      Paragraph,
      TextRun,
      UnderlineType,
    )
    children.push(...textParas)
  }

  const doc = new Document({
    sections: [{ children }],
  })

  return await Packer.toBlob(doc)
}

export async function saveDocxFile(
  blob: Blob,
  filename: string,
): Promise<'picker' | 'download'> {
  const opts = { suggestedName: filename, types: [{ description: 'Word', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } }] }
  if ('showSaveFilePicker' in window) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = await (window as any).showSaveFilePicker(opts)
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'picker'
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return 'download'
}

export async function shareDocxFile(blob: Blob, filename: string): Promise<boolean> {
  if (!navigator.share) return false
  const file = new File([blob], filename, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const canFiles =
    typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  if (!canFiles) return false
  await navigator.share({ files: [file], title: filename })
  return true
}
