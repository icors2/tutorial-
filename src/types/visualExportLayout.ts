import type { StepRecord } from '../db/schema'

export type VisualExportBlock = {
  id: string
  type: 'title' | 'step'
  stepId?: string
  /** 0-based step index for label */
  stepIndex?: number
  pageIndex: number
  x: number
  y: number
  w: number
  h: number
  z: number
}

export function visualPageDimensions(pageSize: 'a4' | 'letter'): { w: number; h: number } {
  return pageSize === 'letter' ? { w: 612, h: 792 } : { w: 595, h: 842 }
}

/** Initial stacked layout; spills to extra pages when needed. */
export function createDefaultVisualBlocks(
  steps: StepRecord[],
  pageSize: 'a4' | 'letter',
): { blocks: VisualExportBlock[]; pageCount: number } {
  const { w: PW, h: PH } = visualPageDimensions(pageSize)
  const M = 40
  const innerW = PW - 2 * M
  const blocks: VisualExportBlock[] = []
  let page = 0
  let y = M
  let z = 0

  const ensureSpace = (need: number) => {
    if (y + need > PH - M) {
      page += 1
      y = M
    }
  }

  const titleH = 56
  ensureSpace(titleH)
  blocks.push({
    id: 'blk-title',
    type: 'title',
    pageIndex: page,
    x: M,
    y,
    w: innerW,
    h: titleH,
    z: z++,
  })
  y += titleH + 14

  const stepH = Math.min(260, Math.max(140, Math.round(PH * 0.26)))

  steps.forEach((s, i) => {
    ensureSpace(stepH)
    blocks.push({
      id: `blk-step-${s.id}`,
      type: 'step',
      stepId: s.id,
      stepIndex: i,
      pageIndex: page,
      x: M,
      y,
      w: innerW,
      h: stepH,
      z: z++,
    })
    y += stepH + 14
  })

  return { blocks, pageCount: Math.max(1, page + 1) }
}
