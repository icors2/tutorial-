import DOMPurify from 'dompurify'
import type { Paragraph } from 'docx'

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span']

export function legacyTextToHtml(text: string): string {
  const t = text ?? ''
  if (!t.trim()) return '<p><br></p>'
  if (t.trimStart().startsWith('<')) return t
  const esc = t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return esc
    .split('\n')
    .map((line) => `<p>${line ? line : '<br>'}</p>`)
    .join('')
}

export function sanitizeInstructionHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['style'],
    ALLOW_DATA_ATTR: false,
  })
}

/** True if instructions contain visible text (for export validation). */
export function instructionTextIsMeaningful(html: string): boolean {
  const clean = sanitizeInstructionHtml(legacyTextToHtml(html))
  const doc = new DOMParser().parseFromString(
    `<div id="r">${clean}</div>`,
    'text/html',
  )
  const root = doc.getElementById('r')
  const t = (root?.textContent ?? '').replace(/\u00a0/g, ' ').trim()
  return t.length > 0
}

type RunStyle = {
  bold?: boolean
  italics?: boolean
  underline?: boolean
  size?: number
}

function collectTextRuns(
  root: HTMLElement,
  TextRun: typeof import('docx').TextRun,
  UnderlineType: typeof import('docx').UnderlineType,
  defaultBodyHalfPoints?: number,
): InstanceType<typeof TextRun>[] {
  const runs: InstanceType<typeof TextRun>[] = []

  function walk(node: Node, style: RunStyle) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (!text) return
      const size = style.size ?? defaultBodyHalfPoints
      runs.push(
        new TextRun({
          text,
          bold: style.bold,
          italics: style.italics,
          underline: style.underline
            ? { type: UnderlineType.SINGLE }
            : undefined,
          ...(size !== undefined ? { size } : {}),
        }),
      )
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const next: RunStyle = { ...style }
    const tag = el.tagName.toLowerCase()
    if (tag === 'strong' || tag === 'b') next.bold = true
    if (tag === 'em' || tag === 'i') next.italics = true
    if (tag === 'u') next.underline = true
    if (tag === 'span' && el.style.fontSize) {
      const m = /(\d+(?:\.\d+)?)\s*pt/i.exec(el.style.fontSize)
      if (m) next.size = Math.round(parseFloat(m[1]) * 2)
    }
    el.childNodes.forEach((c) => walk(c, next))
  }

  walk(root, {})
  return runs
}

/** Plain lines for PDF / previews (paragraphs preserved). */
export function instructionHtmlToPlainLines(text: string): string[] {
  const raw = text ?? ''
  const trimmed = raw.trim()
  if (!trimmed) return ['']

  if (!trimmed.startsWith('<')) {
    return raw.split('\n').map((line) => line.replace(/\s+/g, ' ').trim())
  }

  const clean = sanitizeInstructionHtml(raw)
  const doc = new DOMParser().parseFromString(
    `<div id="root">${clean}</div>`,
    'text/html',
  )
  const root = doc.getElementById('root')
  if (!root) {
    const t = trimmed.replace(/\s+/g, ' ').trim()
    return t ? [t] : ['']
  }

  const lines: string[] = []
  root.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (t) lines.push(t)
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const el = child as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (tag === 'p') {
      const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      lines.push(t)
    } else if (tag === 'br') {
      lines.push('')
    } else {
      const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (t) lines.push(t)
    }
  })

  if (lines.length === 0) {
    const t = (root.textContent ?? '').replace(/\s+/g, ' ').trim()
    return t ? [t] : ['']
  }
  return lines
}

type DocxParaOpts = { defaultBodyHalfPoints?: number }

/** Builds docx paragraphs from stored instruction HTML or legacy plain text. */
export function instructionHtmlToDocxParagraphs(
  text: string,
  Paragraph: typeof import('docx').Paragraph,
  TextRun: typeof import('docx').TextRun,
  UnderlineType: typeof import('docx').UnderlineType,
  opts?: DocxParaOpts,
): Paragraph[] {
  const raw = text ?? ''
  const trimmed = raw.trim()
  if (!trimmed) {
    const d = opts?.defaultBodyHalfPoints
    return [
      new Paragraph({
        children: [new TextRun(d !== undefined ? { text: '', size: d } : { text: '' })],
      }),
    ]
  }

  if (!trimmed.startsWith('<')) {
    const lines = raw.split('\n')
    const d = opts?.defaultBodyHalfPoints
    return lines.map(
      (line) =>
        new Paragraph({
          children: [
            new TextRun(d !== undefined ? { text: line, size: d } : { text: line }),
          ],
        }),
    )
  }

  const clean = sanitizeInstructionHtml(raw)
  const doc = new DOMParser().parseFromString(
    `<div id="root">${clean}</div>`,
    'text/html',
  )
  const root = doc.getElementById('root')
  if (!root) {
    return [new Paragraph({ children: [new TextRun(raw)] })]
  }

  const out: Paragraph[] = []

  function paragraphFromElement(el: HTMLElement): Paragraph {
    const runs = collectTextRuns(
      el,
      TextRun,
      UnderlineType,
      opts?.defaultBodyHalfPoints,
    )
    return new Paragraph({
      children: runs.length ? runs : [new TextRun('')],
    })
  }

  root.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent ?? '').trim()
      if (t) out.push(new Paragraph({ children: [new TextRun(t)] }))
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const el = child as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (tag === 'p') {
      out.push(paragraphFromElement(el))
    } else if (tag === 'br') {
      out.push(new Paragraph({ children: [new TextRun('')] }))
    } else {
      out.push(paragraphFromElement(el))
    }
  })

  if (out.length === 0) {
    out.push(new Paragraph({ children: [new TextRun('')] }))
  }

  return out
}
