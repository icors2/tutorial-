import { visualPageDimensions } from '../types/visualExportLayout'

const CAPTURE_CLASS = 'visual-export-page--capturing'

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let c = 0
    function tick() {
      c += 1
      if (c >= n) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** Rasterize each page DOM node (fixed px size) into a multi-page PDF. */
export async function rasterizeVisualPagesToPdf(
  pageElements: HTMLElement[],
  pageSize: 'a4' | 'letter',
): Promise<Blob> {
  if (pageElements.length === 0) {
    throw new Error('No pages to export')
  }
  const { w, h } = visualPageDimensions(pageSize)
  const { jsPDF } = await import('jspdf')
  const html2canvas = (await import('html2canvas')).default
  const fmt = pageSize === 'letter' ? 'letter' : 'a4'
  const pdf = new jsPDF({ unit: 'pt', format: fmt, orientation: 'portrait' })

  for (const el of pageElements) {
    el.classList.add(CAPTURE_CLASS)
  }
  await waitFrames(2)

  try {
    for (let i = 0; i < pageElements.length; i++) {
      if (i > 0) pdf.addPage()
      const el = pageElements[i]
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: w,
        height: h,
        windowWidth: w,
        windowHeight: h,
      })
      const img = canvas.toDataURL('image/jpeg', 0.92)
      pdf.addImage(img, 'JPEG', 0, 0, w, h)
    }
  } finally {
    for (const el of pageElements) {
      el.classList.remove(CAPTURE_CLASS)
    }
  }

  return pdf.output('blob')
}
