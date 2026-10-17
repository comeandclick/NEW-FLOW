'use client'
// Fichiers façon Finder (14/10/2026) : grandes icônes sans cadre, nom dessous, et visionneuse plein écran sans contour
// (titre en haut à gauche, Télécharger et fermer en haut à droite). Animations d'ouverture douces.
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, Download, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function IconeDossier({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 52" className={cn('drop-shadow-sm', className)} aria-hidden>
      <path d="M4 8a4 4 0 0 1 4-4h15l5 5h28a4 4 0 0 1 4 4v3H4z" fill="#5aa7ee" />
      <rect x="4" y="13" width="56" height="35" rx="4" fill="#7cbcf6" />
      <rect x="4" y="13" width="56" height="3" rx="1.5" fill="#a9d4fb" opacity=".7" />
    </svg>
  )
}

const TYPE: { test: (m: string, n: string) => boolean; lib: string; couleur: string }[] = [
  { test: (m) => m === 'application/pdf', lib: 'PDF', couleur: '#e5484d' },
  { test: (m) => m.startsWith('image/'), lib: 'IMG', couleur: '#30a46c' },
  { test: (m) => m.startsWith('video/'), lib: 'VIDÉO', couleur: '#8e4ec6' },
  { test: (m) => m.startsWith('audio/'), lib: 'AUDIO', couleur: '#f76b15' },
  { test: (m, n) => /sheet|excel|csv/.test(m) || /\.(xlsx?|csv)$/i.test(n), lib: 'XLS', couleur: '#29a383' },
  { test: (m, n) => /word|document/.test(m) || /\.docx?$/i.test(n), lib: 'DOC', couleur: '#3e63dd' },
  { test: (m, n) => /zip|compressed/.test(m) || /\.zip$/i.test(n), lib: 'ZIP', couleur: '#8d8d8d' },
  { test: (_m, n) => /\.(md|txt)$/i.test(n), lib: 'TXT', couleur: '#6f6f6f' },
]
export function IconeDocument({ mime, nom, className }: { mime?: string | null; nom: string; className?: string }) {
  const t = TYPE.find((x) => x.test(mime ?? '', nom))
  const ext = t?.lib ?? (nom.split('.').pop()?.slice(0, 4).toUpperCase() || 'FICHIER')
  return (
    <svg viewBox="0 0 48 60" className={cn('drop-shadow-sm', className)} aria-hidden>
      <path d="M6 2h26l12 12v40a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z" className="fill-white dark:fill-[#2a2a2a]" stroke="currentColor" strokeOpacity=".12" />
      <path d="M32 2v8a4 4 0 0 0 4 4h8" className="fill-[#ececec] dark:fill-[#3a3a3a]" stroke="currentColor" strokeOpacity=".12" />
      {[22, 27, 32].map((y) => <rect key={y} x="9" y={y} width={y === 32 ? 18 : 28} height="2" rx="1" className="fill-black/10 dark:fill-white/10" />)}
      <rect x="6" y="41" width={Math.max(18, ext.length * 6.5 + 8)} height="11" rx="2.5" fill={t?.couleur ?? '#6f6f6f'} />
      <text x="10" y="49.5" fontSize="7.5" fontWeight="700" fill="#fff" fontFamily="ui-sans-serif, system-ui">{ext}</text>
    </svg>
  )
}

/** Élément de la grille : icône (ou miniature d'image) sans cadre, nom en dessous sur 2 lignes. */
export function ElementFinder({ icone, nom, sous, onOuvrir, menu, selection, i = 0 }: { icone: React.ReactNode; nom: string; sous?: string; onOuvrir: () => void; menu?: React.ReactNode; selection?: boolean; i?: number }) {
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.92, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32, delay: Math.min(i, 16) * 0.018 }}
      className="group relative flex flex-col items-center">
      <button onClick={onOuvrir} onDoubleClick={onOuvrir} className={cn('flex w-full flex-col items-center gap-2 rounded-xl p-2 text-center outline-none transition-colors focus-visible:bg-text/5', selection && 'bg-text/5')}>
        <span className="grid h-[72px] w-full place-items-center transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-95">{icone}</span>
        <span className="line-clamp-2 w-full break-words px-1 text-[12.5px] font-medium leading-tight">{nom}</span>
        {sous && <span className="-mt-1 text-[11px] text-text-3">{sous}</span>}
      </button>
      {menu && <div className="absolute right-1 top-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">{menu}</div>}
    </motion.div>
  )
}

/** Visionneuse plein écran : la vidéo / l'image / le PDF seuls, sans contour ni bloc autour. Échap ferme. */
export function Visionneuse({ titre, url, mime, onFermer, onTelecharger, libTelecharger = 'Télécharger', sansApercu = 'Pas d\'aperçu pour ce type de fichier.', description }:
  { titre: string; url: string; mime?: string | null; onFermer: () => void; onTelecharger: () => void; libTelecharger?: string; sansApercu?: string; description?: string | null }) {
  // 17/10/2026 : description préparée pour la publication (vidéos Kalimat, MyUstadh, clients), affichée au clic et copiable proprement
  const [desc, setDesc] = useState(false)
  const [copie, setCopie] = useState(false)
  const copier = async () => {
    if (!description) return
    try { await navigator.clipboard.writeText(description.trim()) } catch {
      const z = document.createElement('textarea'); z.value = description.trim(); document.body.appendChild(z); z.select(); document.execCommand('copy'); z.remove()
    }
    setCopie(true); setTimeout(() => setCopie(false), 1800)
  }
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onFermer(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onFermer])
  const m = mime ?? ''
  return (
    <motion.div role="dialog" aria-modal aria-label={titre} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[80] flex flex-col bg-black/92 backdrop-blur-xl" onClick={onFermer}>
      <div className="flex shrink-0 items-center gap-3 px-4 py-3 safe-top text-white sm:px-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium">{titre}</h2>
        {description && <button onClick={() => setDesc((v) => !v)} aria-expanded={desc} className={cn('inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors', desc ? 'bg-white text-black' : 'bg-white/12 hover:bg-white/20')}><FileText className="size-4" />Description</button>}
        <button onClick={onTelecharger} className="inline-flex h-9 items-center gap-2 rounded-full bg-white/12 px-4 text-[13px] font-medium transition-colors hover:bg-white/20"><Download className="size-4" />{libTelecharger}</button>
        <button onClick={onFermer} aria-label="Fermer" className="grid size-9 place-items-center rounded-full bg-white/12 transition-colors hover:bg-white/20"><X className="size-4" /></button>
      </div>
      <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-8 sm:pb-8" onClick={(e) => e.stopPropagation()}>
        {m.startsWith('image/') ? <img src={url} alt={titre} className="max-h-full max-w-full object-contain" />
          : m.startsWith('video/') ? <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" />
          : m.startsWith('audio/') ? <audio src={url} controls autoPlay className="w-full max-w-lg" />
          : m === 'application/pdf' ? <iframe src={url} title={titre} className="h-full w-full max-w-5xl rounded-md bg-white" />
          : <p className="text-sm text-white/70">{sansApercu}</p>}
      </motion.div>
      {description && desc && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} onClick={(e) => e.stopPropagation()}
          className="mx-auto mb-4 w-[calc(100%-2rem)] max-w-xl shrink-0 rounded-2xl bg-white/10 p-4 text-white safe-bottom sm:mb-8">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-white/70">Description à publier</span>
            <button onClick={copier} className="inline-flex h-8 items-center gap-2 rounded-full bg-white px-3.5 text-[13px] font-medium text-black transition-opacity hover:opacity-90">
              {copie ? <><Check className="size-4" />Copiée</> : <><Copy className="size-4" />Copier</>}
            </button>
          </div>
          <p className="max-h-[32vh] overflow-y-auto whitespace-pre-wrap break-words text-[14px] leading-relaxed">{description.trim()}</p>
        </motion.div>
      )}
    </motion.div>
  )
}
