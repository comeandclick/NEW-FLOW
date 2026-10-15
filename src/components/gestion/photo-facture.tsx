'use client'
// Prendre une facture en photo (15/10/2026) : sur téléphone, l'appareil photo du téléphone s'ouvre directement ;
// sur ordinateur, la webcam s'affiche en grand avec un cadre, on déclenche, on reprend si c'est flou, on valide.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, RotateCcw, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

const tactile = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export function BoutonPhoto({ onPhotos, className, label = 'Prendre en photo', icone = false }: { onPhotos: (f: File[]) => void; className?: string; label?: string; icone?: boolean }) {
  const natif = useRef<HTMLInputElement>(null)
  const [webcam, setWebcam] = useState(false)
  const ouvrir = () => (tactile() ? natif.current?.click() : setWebcam(true))
  return (
    <>
      <input ref={natif} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files?.length) onPhotos(Array.from(e.target.files)); e.target.value = '' }} />
      {icone
        ? <button type="button" onClick={ouvrir} aria-label={label} title={label} className={className}><Camera className="size-4" /></button>
        : <Button type="button" className={className} onClick={ouvrir}><Camera className="size-4" />{label}</Button>}
      {webcam && <Webcam onClose={() => setWebcam(false)} onPhoto={(f) => { setWebcam(false); onPhotos([f]) }} onRepli={() => { setWebcam(false); natif.current?.click() }} />}
    </>
  )
}

function Webcam({ onClose, onPhoto, onRepli }: { onClose: () => void; onPhoto: (f: File) => void; onRepli: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const flux = useRef<MediaStream | null>(null)
  const [cliche, setCliche] = useState<{ url: string; blob: Blob } | null>(null)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let fini = false
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => { if (fini) { s.getTracks().forEach((t) => t.stop()); return } flux.current = s; if (video.current) { video.current.srcObject = s; void video.current.play() } })
      .catch(() => setErreur('Caméra indisponible ou refusée.'))
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => { fini = true; flux.current?.getTracks().forEach((t) => t.stop()); window.removeEventListener('keydown', k) }
  }, [onClose])

  function declencher() {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob((b) => b && setCliche({ url: URL.createObjectURL(b), blob: b }), 'image/jpeg', 0.92)
  }
  const valider = () => { if (cliche) onPhoto(new File([cliche.blob], `facture-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`, { type: 'image/jpeg' })) }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Photo de la facture">
      <div className="flex items-center justify-between p-3 text-white safe-top"><span className="text-[14px] font-medium">Cadre la facture en entier</span>
        <button onClick={onClose} aria-label="Fermer" className="grid size-10 place-items-center rounded-full bg-white/15 hover:bg-white/25"><X className="size-5" /></button></div>
      <div className="relative min-h-0 flex-1">
        {erreur ? <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-white"><p>{erreur}</p><Button onClick={onRepli}>Choisir une photo</Button></div>
          : cliche ? <img src={cliche.url} alt="Photo prise" className="absolute inset-0 size-full object-contain" />
            : <><video ref={video} playsInline muted className="absolute inset-0 size-full object-contain" /><div className="pointer-events-none absolute inset-[8%] rounded-2xl border-2 border-dashed border-white/60" /></>}
      </div>
      {!erreur && <div className="flex items-center justify-center gap-4 p-5 safe-bottom">
        {cliche ? <><Button size="lg" onClick={() => setCliche(null)}><RotateCcw className="size-4" />Reprendre</Button><Button size="lg" variant="primary" onClick={valider}><Check className="size-4" />Utiliser la photo</Button></>
          : <button onClick={declencher} aria-label="Prendre la photo" className="grid size-16 place-items-center rounded-full border-4 border-white bg-white/20 transition-transform active:scale-95"><span className="size-11 rounded-full bg-white" /></button>}
      </div>}
    </div>,
    document.body,
  )
}
