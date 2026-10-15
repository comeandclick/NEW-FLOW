'use client'
// Zone de signature au doigt (téléphone, tablette) ou à la souris (PC). Renvoie une image PNG (data URL).
import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

export function SignaturePad({ onChange, height = 160 }: { onChange: (dataUrl: string | null) => void; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const dessin = useRef(false)
  const [vide, setVide] = useState(true)

  useEffect(() => {
    const c = ref.current!
    const ajuster = () => {
      const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1
      c.width = r.width * dpr; c.height = r.height * dpr
      const x = c.getContext('2d')!; x.scale(dpr, dpr); x.lineWidth = 2.2; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#111'
      setVide(true); onChange(null)
    }
    ajuster()
    window.addEventListener('resize', ajuster)
    return () => window.removeEventListener('resize', ajuster)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const }
  const down = (e: React.PointerEvent) => { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); dessin.current = true; const [x, y] = pos(e); const g = ref.current!.getContext('2d')!; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, y + 0.1); g.stroke() }
  const move = (e: React.PointerEvent) => { if (!dessin.current) return; const [x, y] = pos(e); const g = ref.current!.getContext('2d')!; g.lineTo(x, y); g.stroke() }
  const up = () => { if (!dessin.current) return; dessin.current = false; setVide(false); onChange(ref.current!.toDataURL('image/png')) }
  const effacer = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setVide(true); onChange(null) }

  return (
    <div className="relative">
      <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Zone de signature"
        className="block w-full touch-none rounded-xl border border-dashed border-border-strong bg-white" style={{ height }} />
      {vide && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-neutral-400">Signer ici avec le doigt ou la souris</span>}
      {!vide && <button type="button" onClick={effacer} className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[12px] text-neutral-600 shadow-sm"><Eraser className="size-3.5" />Effacer</button>}
    </div>
  )
}
