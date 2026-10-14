'use client'
// Vignettes des fichiers (14/10/2026) : une image ou une vidéo montre son aperçu (image réduite, première image de la
// vidéo avec sa durée), pas une icône PNG/MP4. Chargées seulement quand elles arrivent à l'écran, URL signées en cache.
import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { getDb } from '@/lib/supabase/client'
import { signedUrl } from '@/lib/storage'
import { IconeDocument } from '@/components/common/finder'
import { cn } from '@/lib/utils'

const reduites = new Map<string, string>()
/** Image réduite à 320 px (transformation Supabase) ; null si le projet ne la propose pas. */
async function urlReduite(path: string) {
  if (reduites.has(path)) return reduites.get(path)!
  const { data } = await getDb().storage.from('files').createSignedUrl(path, 3600, { transform: { width: 320, height: 320, resize: 'cover', quality: 70 } })
  const u = data?.signedUrl ?? ''
  reduites.set(path, u)
  return u
}
const duree = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function Miniature({ path, mime, nom, className, petit }: { path: string; mime: string | null; nom: string; className?: string; petit?: boolean }) {
  const image = !!mime?.startsWith('image/') && !mime.includes('svg') && !mime.includes('heic'), video = !!mime?.startsWith('video/')
  const boite = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [repli, setRepli] = useState(false) // transformation refusée : image d'origine
  const [echec, setEchec] = useState(false)
  const [secs, setSecs] = useState<number | null>(null)
  const [pret, setPret] = useState(false)
  useEffect(() => {
    if (!(image || video) || !boite.current) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect() } }, { rootMargin: '200px' })
    io.observe(boite.current)
    return () => io.disconnect()
  }, [image, video])
  useEffect(() => {
    if (!visible) return
    let vivant = true
    ;(image && !repli ? urlReduite(path) : signedUrl('files', path)).then((u) => { if (vivant) { if (u) setUrl(u); else if (image && !repli) setRepli(true); else setEchec(true) } })
    return () => { vivant = false }
  }, [visible, path, image, repli])

  if ((!image && !video) || echec) return <IconeDocument mime={mime} nom={nom} className={className ?? 'h-[66px] w-[54px]'} />
  return (
    <span ref={boite} className={cn('relative block shrink-0 overflow-hidden rounded-lg bg-surface-3 shadow-sm ring-1 ring-black/5 dark:ring-white/10', petit ? 'h-9 w-12' : 'h-[72px] w-[96px]')}>
      {!pret && <span className="skeleton absolute inset-0 rounded-lg" />}
      {url && image && <img src={url} alt="" loading="lazy" decoding="async" onLoad={() => setPret(true)} onError={() => (repli ? setEchec(true) : setRepli(true))} className={cn('size-full object-cover transition-opacity duration-300', pret ? 'opacity-100' : 'opacity-0')} />}
      {url && video && <video src={`${url}#t=0.5`} preload="metadata" muted playsInline onLoadedData={() => setPret(true)} onLoadedMetadata={(e) => setSecs(e.currentTarget.duration)} onError={() => setEchec(true)} className={cn('size-full object-cover transition-opacity duration-300', pret ? 'opacity-100' : 'opacity-0')} />}
      {video && <span className="absolute inset-0 grid place-items-center"><span className={cn('grid place-items-center rounded-full bg-black/55 text-white backdrop-blur', petit ? 'size-4' : 'size-6')}><Play className="ml-px size-3 fill-current" /></span></span>}
      {video && !petit && secs !== null && Number.isFinite(secs) && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] font-medium tabular-nums text-white">{duree(secs)}</span>}
    </span>
  )
}
