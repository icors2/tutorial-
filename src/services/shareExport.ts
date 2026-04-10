export type ShareResult = 'file' | 'text' | 'cancelled' | 'unavailable'

export async function shareExportedBlob(options: {
  blob: Blob
  filename: string
  mime: string
  title: string
  summaryText: string
}): Promise<ShareResult> {
  const { blob, filename, mime, title, summaryText } = options
  if (typeof navigator === 'undefined' || !navigator.share) return 'unavailable'

  try {
    const file = new File([blob], filename, { type: mime })
    const canFiles =
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    if (canFiles) {
      await navigator.share({
        files: [file],
        title,
        text: summaryText,
      })
      return 'file'
    }
    await navigator.share({
      title,
      text: `${summaryText}\n\nTip: attach the saved file "${filename}" from your device when sending email or messages.`,
    })
    return 'text'
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
    throw e
  }
}

export function buildExportMailtoUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function exportMimeForFilename(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}
