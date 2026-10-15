'use client'
// Une facture en grand (15/10/2026) : plein écran, défilement pour lire le bas, fermer d'un clic ou avec Échap.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'
import { signedUrl } from '@/lib/storage'

export function ImageFacture({ src, onClose }: { src: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!src) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [src, onClose])
  if (!src || typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/85 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Facture en grand">
      <div className="flex justify-end gap-2 p-3 safe-top">
        <a href={src} download="facture.jpg" onClick={(e) => e.stopPropagation()} className="grid size-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Télécharger"><Download className="size-5" /></a>
        <button onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Fermer"><X className="size-5" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-6" onClick={onClose}>
        <img src={src} alt="Facture" onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-3xl rounded-lg bg-white shadow-2xl" />
      </div>
    </div>,
    document.body,
  )
}

/** Image d'origine d'une facture enregistrée (photo, ou 1re page du PDF) ; data URL en démo, sinon lien signé. */
export function useImageFacture(chemin?: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!chemin) { setUrl(null); return }
    if (chemin.startsWith('data:')) { setUrl(chemin); return }
    let vivant = true
    void signedUrl('files', chemin).then((u) => { if (vivant) setUrl(u || null) })
    return () => { vivant = false }
  }, [chemin])
  return url
}
