import { useEffect, useRef, type RefObject } from 'react'
import { legacyTextToHtml, sanitizeInstructionHtml } from '../services/richText'

const FONT_SIZES_PT = [12, 14, 16, 18, 24, 28] as const

type Props = {
  stepId: string
  html: string
  onChange: (html: string) => void
  editorRef?: RefObject<HTMLDivElement | null>
}

function applyFontSizePt(pt: number) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (range.collapsed) return
  const span = document.createElement('span')
  span.style.fontSize = `${pt}pt`
  try {
    range.surroundContents(span)
  } catch {
    const frag = range.extractContents()
    span.appendChild(frag)
    range.insertNode(span)
  }
  sel.removeAllRanges()
  const nr = document.createRange()
  nr.selectNodeContents(span)
  nr.collapse(false)
  sel.addRange(nr)
}

export function StepTextEditor({ stepId, html, onChange, editorRef }: Props) {
  const innerRef = useRef<HTMLDivElement>(null)
  const ref = editorRef ?? innerRef

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = sanitizeInstructionHtml(legacyTextToHtml(html))
    // Only reset DOM when switching steps; avoid deps on `html` so typing does not reset the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId])

  function emitChange() {
    const el = ref.current
    if (!el) return
    onChange(sanitizeInstructionHtml(el.innerHTML))
  }

  function exec(cmd: 'bold' | 'italic' | 'underline') {
    document.execCommand(cmd, false)
    emitChange()
  }

  return (
    <div className="step-text-editor">
      <div
        className="step-text-editor__toolbar"
        role="toolbar"
        aria-label="Text formatting"
      >
        <button
          type="button"
          className="step-text-editor__tool"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('bold')}
          title="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="step-text-editor__tool"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('italic')}
          title="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="step-text-editor__tool"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('underline')}
          title="Underline"
        >
          <u>U</u>
        </button>
        <label className="step-text-editor__size">
          <span className="visually-hidden">Font size</span>
          <select
            aria-label="Font size"
            defaultValue=""
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = e.target.value
              e.target.selectedIndex = 0
              if (!v) return
              applyFontSizePt(Number(v))
              emitChange()
            }}
          >
            <option value="">Size</option>
            {FONT_SIZES_PT.map((pt) => (
              <option key={pt} value={pt}>
                {pt} pt
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        ref={ref}
        className="step-text-editor__field"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        onInput={emitChange}
        onBlur={emitChange}
      />
    </div>
  )
}
