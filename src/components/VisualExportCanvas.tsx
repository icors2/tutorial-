import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Rnd, type DraggableData, type Position } from 'react-rnd'
import type { StepRecord } from '../db/schema'
import { getImage } from '../db/schema'
import { legacyTextToHtml, sanitizeInstructionHtml } from '../services/richText'
import type { VisualExportBlock } from '../types/visualExportLayout'
import { visualPageDimensions } from '../types/visualExportLayout'

export type VisualExportCanvasHandle = {
  getPageElements: () => HTMLElement[]
}

type FontPts = { title: number; step: number; body: number }

type Props = {
  tutorialTitle: string
  steps: StepRecord[]
  pageSize: 'a4' | 'letter'
  fontPts: FontPts
  blocks: VisualExportBlock[]
  setBlocks: React.Dispatch<React.SetStateAction<VisualExportBlock[]>>
  pageCount: number
  setPageCount: React.Dispatch<React.SetStateAction<number>>
}

const PAGE_MARGIN = 40

export const VisualExportCanvas = forwardRef<VisualExportCanvasHandle, Props>(
  function VisualExportCanvas(
    {
      tutorialTitle,
      steps,
      pageSize,
      fontPts,
      blocks,
      setBlocks,
      pageCount,
      setPageCount,
    },
    ref,
  ) {
    const { w: PAGE_W, h: PAGE_H } = useMemo(
      () => visualPageDimensions(pageSize),
      [pageSize],
    )
    const pageRefs = useRef<(HTMLDivElement | null)[]>([])
    const [imageUrls, setImageUrls] = useState<Record<string, string>>({})

    useImperativeHandle(
      ref,
      () => ({
        getPageElements: () =>
          Array.from({ length: pageCount }, (_, i) => pageRefs.current[i]).filter(
            (el): el is HTMLDivElement => el != null,
          ),
      }),
      [pageCount],
    )

    useEffect(() => {
      let cancelled = false
      const revoke: string[] = []
      const next: Record<string, string> = {}

      void (async () => {
        for (const s of steps) {
          if (!s.imageId || cancelled) continue
          try {
            const rec = await getImage(s.imageId)
            if (!rec || cancelled) continue
            const u = URL.createObjectURL(rec.blob)
            revoke.push(u)
            next[s.id] = u
          } catch {
            /* skip missing image */
          }
        }
        if (!cancelled) setImageUrls(next)
      })()

      return () => {
        cancelled = true
        revoke.forEach((u) => URL.revokeObjectURL(u))
      }
    }, [steps])

    const bringToFront = useCallback((id: string) => {
      setBlocks((prev) => {
        const maxZ = prev.reduce((m, b) => Math.max(m, b.z), 0)
        return prev.map((b) => (b.id === id ? { ...b, z: maxZ + 1 } : b))
      })
    }, [setBlocks])

    const updateBlock = useCallback(
      (id: string, patch: Partial<Pick<VisualExportBlock, 'x' | 'y' | 'w' | 'h' | 'pageIndex'>>) => {
        setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
      },
      [setBlocks],
    )

    const moveBlockToPage = useCallback(
      (id: string, newPage: number) => {
        setPageCount((c) => Math.max(c, newPage + 1))
        updateBlock(id, { pageIndex: newPage, x: PAGE_MARGIN, y: PAGE_MARGIN })
      },
      [setPageCount, updateBlock],
    )

    return (
      <div className="visual-export">
        <p className="visual-export__hint muted">
          Each box is draggable and resizable. Pick a page to move content between sheets. Export
          captures the pages exactly as shown (PDF).
        </p>
        <div className="visual-export__toolbar">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setPageCount((c) => c + 1)}
          >
            Add page
          </button>
          <span className="visual-export__meta">
            {pageCount} page{pageCount === 1 ? '' : 's'} ·{' '}
            {pageSize === 'letter' ? 'US Letter' : 'A4'} ({PAGE_W}×{PAGE_H}px)
          </span>
        </div>
        <div className="visual-export__scroll">
          {Array.from({ length: pageCount }, (_, pageIndex) => (
            <div key={pageIndex} className="visual-export__page-slot">
              <span className="visual-export__page-label">Page {pageIndex + 1}</span>
              <div
                ref={(el) => {
                  pageRefs.current[pageIndex] = el
                }}
                className="visual-export-page"
                style={{ width: PAGE_W, height: PAGE_H }}
              >
                {blocks
                  .filter((b) => b.pageIndex === pageIndex)
                  .sort((a, b) => a.z - b.z)
                  .map((b) => (
                    <Rnd
                      key={b.id}
                      size={{ width: b.w, height: b.h }}
                      position={{ x: b.x, y: b.y }}
                      bounds="parent"
                      minWidth={100}
                      minHeight={72}
                      cancel=".visual-export-block__page, .visual-export-block__page *"
                      onDragStart={() => bringToFront(b.id)}
                      onDrag={(_e: unknown, d: DraggableData) =>
                        updateBlock(b.id, { x: d.x, y: d.y })
                      }
                      onDragStop={(_e: unknown, d: DraggableData) =>
                        updateBlock(b.id, { x: d.x, y: d.y })
                      }
                      onResize={(
                        _e: MouseEvent | TouchEvent,
                        _dir: string,
                        refEl: HTMLElement,
                        _delta: { width: number; height: number },
                        pos: Position,
                      ) => {
                        updateBlock(b.id, {
                          w: refEl.offsetWidth,
                          h: refEl.offsetHeight,
                          x: pos.x,
                          y: pos.y,
                        })
                      }}
                      onResizeStop={(
                        _e: MouseEvent | TouchEvent,
                        _dir: string,
                        refEl: HTMLElement,
                        _delta: { width: number; height: number },
                        pos: Position,
                      ) => {
                        updateBlock(b.id, {
                          w: refEl.offsetWidth,
                          h: refEl.offsetHeight,
                          x: pos.x,
                          y: pos.y,
                        })
                      }}
                      style={{ zIndex: b.z }}
                      className="visual-export-rnd"
                    >
                      <div className="visual-export-block">
                        <div className="visual-export-block__chrome">
                          <label className="visual-export-block__page">
                            Page
                            <select
                              value={b.pageIndex}
                              onChange={(e) =>
                                moveBlockToPage(b.id, Number(e.target.value))
                              }
                              aria-label={`Page for ${b.type} block`}
                            >
                              {Array.from({ length: pageCount }, (_, i) => (
                                <option key={i} value={i}>
                                  {i + 1}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="visual-export-block__body">
                          {b.type === 'title' ? (
                            <h2
                              className="visual-export-block__title"
                              style={{ fontSize: `${fontPts.title}pt` }}
                            >
                              {tutorialTitle}
                            </h2>
                          ) : (
                            <StepBlockContent
                              step={steps.find((s) => s.id === b.stepId)}
                              stepLabel={
                                typeof b.stepIndex === 'number'
                                  ? b.stepIndex + 1
                                  : steps.findIndex((s) => s.id === b.stepId) + 1
                              }
                              imageSrc={b.stepId ? imageUrls[b.stepId] : undefined}
                              stepHeadingPt={fontPts.step}
                              bodyPt={fontPts.body}
                            />
                          )}
                        </div>
                      </div>
                    </Rnd>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  },
)

function StepBlockContent({
  step,
  stepLabel,
  imageSrc,
  stepHeadingPt,
  bodyPt,
}: {
  step: StepRecord | undefined
  stepLabel: number
  imageSrc: string | undefined
  stepHeadingPt: number
  bodyPt: number
}) {
  if (!step) {
    return <p className="muted">Missing step</p>
  }
  const html = sanitizeInstructionHtml(legacyTextToHtml(step.text))
  return (
    <div className="visual-export-step">
      <h3
        className="visual-export-step__heading"
        style={{ fontSize: `${stepHeadingPt}pt` }}
      >
        Step {stepLabel}
      </h3>
      {imageSrc ? (
        <div className="visual-export-step__img-wrap">
          <img src={imageSrc} alt="" className="visual-export-step__img" />
        </div>
      ) : null}
      <div
        className="visual-export-step__html"
        style={{ fontSize: `${bodyPt}pt` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
