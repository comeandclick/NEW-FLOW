'use client'
// Prépare une facture pour l'IA (15/10/2026) : photo réduite en JPEG, ou les 2 premières pages d'un PDF rendues en image.
const MAX = 1600

async function versJpeg(source: CanvasImageSource, w: number, h: number) {
  const k = Math.min(1, MAX / Math.max(w, h))
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k)
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(source, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

export async function fichierEnImages(f: File): Promise<string[]> {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise
    const out: string[] = []
    for (let p = 1; p <= Math.min(2, doc.numPages); p++) {
      const page = await doc.getPage(p)
      const vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: MAX / Math.max(vp0.width, vp0.height) })
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
      await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
      out.push(c.toDataURL('image/jpeg', 0.85))
    }
    return out
  }
  if (!f.type.startsWith('image/')) throw new Error('Envoie une photo (JPEG, PNG, HEIC) ou un PDF')
  const bmp = await createImageBitmap(f).catch(() => null)
  if (bmp) return [await versJpeg(bmp, bmp.width, bmp.height)]
  // HEIC sur certains navigateurs : on passe par une balise image
  const url = URL.createObjectURL(f)
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Image illisible : convertis-la en JPEG')); i.src = url })
    return [await versJpeg(img, img.naturalWidth, img.naturalHeight)]
  } finally { URL.revokeObjectURL(url) }
}
