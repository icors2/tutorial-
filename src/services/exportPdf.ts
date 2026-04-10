import type { StepRecord } from '../db/schema'
import { getImage } from '../db/schema'
import type { PerStepImageScalePct, TutorialExportLayout } from '../types/exportLayout'
import { stepImageWidthFactor } from '../types/exportLayout'
import { blobToUint8Array, jpegDimensions } from './exportDocx'
import { instructionHtmlToPlainLines } from './richText'

export async function buildTutorialPdf(
  title: string,
  steps: StepRecord[],
  layout: TutorialExportLayout,
  perStepScale: PerStepImageScalePct,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const fmt = layout.pdfPageSize === 'letter' ? 'letter' : 'a4'
  const pdf = new jsPDF({ unit: 'pt', format: fmt, orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const m = layout.pdfMarginPt
  const contentW = pageW - 2 * m
  let y = m

  function ensureSpace(needed: number) {
    if (y + needed > pageH - m) {
      pdf.addPage()
      y = m
    }
  }

  function writeWrapped(text: string, fontSizePt: number, bold: boolean, afterBlockPt: number) {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(fontSizePt)
    const lines = pdf.splitTextToSize((text || ' ').trim() || ' ', contentW)
    const lineHeight = fontSizePt * 1.25
    for (const line of lines) {
      ensureSpace(lineHeight)
      pdf.text(line, m, y + fontSizePt * 0.85)
      y += lineHeight
    }
    y += afterBlockPt
  }

  writeWrapped(title, layout.pdfTitleFontPt, true, 10)

  let stepIndex = 0
  for (const step of steps) {
    stepIndex += 1
    writeWrapped(`Step ${stepIndex}`, layout.pdfStepHeadingFontPt, true, 6)

    const factor = stepImageWidthFactor(step.id, perStepScale)
    const maxImgW = Math.min(layout.pdfImageMaxWidthPt * factor, contentW)

    const drawImage = async () => {
      if (!step.imageId) return
      const rec = await getImage(step.imageId)
      if (!rec) return
      const raw = await blobToUint8Array(rec.blob)
      const { w, h } = await jpegDimensions(raw)
      const scale = Math.min(1, maxImgW / w)
      const tw = Math.max(1, Math.round(w * scale))
      const th = Math.max(1, Math.round(h * scale))
      ensureSpace(th + 10)
      pdf.addImage(raw, 'JPEG', m, y, tw, th)
      y += th + 10
    }

    const drawText = () => {
      pdf.setFont('helvetica', 'normal')
      for (const line of instructionHtmlToPlainLines(step.text)) {
        writeWrapped(line, layout.pdfBodyFontPt, false, 2)
      }
    }

    if (layout.stepContentOrder === 'image-first') {
      await drawImage()
      drawText()
    } else {
      drawText()
      await drawImage()
    }

    y += 8
  }

  return pdf.output('blob')
}
