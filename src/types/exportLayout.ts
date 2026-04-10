/** Order of image vs instruction text within each step */
export type StepContentOrder = 'image-first' | 'text-first'

export type ExportFormat = 'docx' | 'pdf'

/** Shared layout options for Word and PDF export */
export type TutorialExportLayout = {
  /** Max image width in pixels (DOCX) */
  docImageMaxWidthPx: number
  /** Max image width in points (PDF content area) */
  pdfImageMaxWidthPt: number
  stepContentOrder: StepContentOrder
  /** DOCX body text size in half-points (12pt = 24) when not overridden by HTML */
  docBodyHalfPoints: number
  pdfPageSize: 'a4' | 'letter'
  pdfMarginPt: number
  pdfTitleFontPt: number
  pdfStepHeadingFontPt: number
  pdfBodyFontPt: number
}

/** Per-step image width as % of the global max (25–100) */
export type PerStepImageScalePct = Record<string, number>

export const DEFAULT_EXPORT_LAYOUT: TutorialExportLayout = {
  docImageMaxWidthPx: 600,
  pdfImageMaxWidthPt: 480,
  stepContentOrder: 'image-first',
  docBodyHalfPoints: 24,
  pdfPageSize: 'a4',
  pdfMarginPt: 48,
  pdfTitleFontPt: 20,
  pdfStepHeadingFontPt: 14,
  pdfBodyFontPt: 11,
}

export function clampImageScalePct(n: number): number {
  return Math.min(100, Math.max(25, Math.round(n)))
}

/** Multiplier applied to max width for this step (0.25–1). */
export function stepImageWidthFactor(
  stepId: string,
  perStep: PerStepImageScalePct,
): number {
  const raw = perStep[stepId]
  const pct = typeof raw === 'number' && Number.isFinite(raw) ? raw : 100
  return clampImageScalePct(pct) / 100
}
