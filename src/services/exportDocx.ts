import type { StepRecord } from '../db/schema'
import { getImage } from '../db/schema'
import type {
  ExportFormat,
  PerStepImageScalePct,
  TutorialExportLayout,
} from '../types/exportLayout'
import { stepImageWidthFactor } from '../types/exportLayout'
import { instructionHtmlToDocxParagraphs } from './richText'

export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}

export async function jpegDimensions(data: Uint8Array): Promise<{ w: number; h: number }> {
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

function slugifyFilename(title: string): string {
  const base = title
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
  return base || 'tutorial'
}

export function defaultExportFilename(title: string, format: ExportFormat): string {
  const slug = slugifyFilename(title)
  return format === 'pdf' ? `${slug}.pdf` : `${slug}.docx`
}

export async function buildTutorialDocx(
  title: string,
  steps: StepRecord[],
  layout: TutorialExportLayout,
  perStepScale: PerStepImageScalePct,
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

    async function imageParagraph(): Promise<InstanceType<typeof Paragraph> | null> {
      if (!step.imageId) return null
      const rec = await getImage(step.imageId)
      if (!rec) return null
      const raw = await blobToUint8Array(rec.blob)
      const { w, h } = await jpegDimensions(raw)
      const factor = stepImageWidthFactor(step.id, perStepScale)
      const cap = layout.docImageMaxWidthPx * factor
      const scale = Math.min(1, cap / w)
      const tw = Math.max(1, Math.round(w * scale))
      const th = Math.max(1, Math.round(h * scale))
      return new Paragraph({
        children: [
          new ImageRun({
            type: 'jpg',
            data: raw,
            transformation: { width: tw, height: th },
          }),
        ],
      })
    }

    const textParas = instructionHtmlToDocxParagraphs(
      step.text,
      Paragraph,
      TextRun,
      UnderlineType,
      { defaultBodyHalfPoints: layout.docBodyHalfPoints },
    )

    if (layout.stepContentOrder === 'image-first') {
      const img = await imageParagraph()
      if (img) children.push(img)
      children.push(...textParas)
    } else {
      children.push(...textParas)
      const img = await imageParagraph()
      if (img) children.push(img)
    }
  }

  const doc = new Document({
    sections: [{ children }],
  })

  return await Packer.toBlob(doc)
}

export async function saveExportBlob(
  blob: Blob,
  filename: string,
  format: ExportFormat,
): Promise<'picker' | 'download'> {
  const types =
    format === 'pdf'
      ? [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
      : [
          {
            description: 'Word',
            accept: {
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            },
          },
        ]
  const opts = { suggestedName: filename, types }
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
