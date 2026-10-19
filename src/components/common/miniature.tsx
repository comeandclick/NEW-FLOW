'use client'
// Vignettes des fichiers (14/10/2026) : une image ou une vidéo montre son aperçu (image réduite, première image de la
// vidéo avec sa durée), pas une icône PNG/MP4. Chargées seulement quand elles arrivent à l'écran.
// 19/10/2026 : le quota « Cached Egress » de Supabase (5 Go/mois) était dépassé. Les liens signés changent à chaque
// session, donc le navigateur re-téléchargeait les photos en entier (la réduction côté Supabase n'existe pas sur le
// plan gratuit) et le début de chaque vidéo. Désormais la vignette est faite une fois dans le navigateur (JPEG 320 px)
// et gardée dans le Cache Storage : les visites suivantes ne téléchargent plus rien.
import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { signedUrl } from '@/lib/storage'
import { IconeDocument } from '@/components/common/finder'
import { cn } from '@/lib/utils'

const BOITE = 'flow-miniatures-v1'
const LARGEUR = 320
type Vignette = { url: string; secs: number | null }
const memoire = new Map<string, Promise<Vignette | null>>()
const duree = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

async function lireBoite(cle: string): Promise<Vignette | null> {
  try {
    const r = await (await caches.open(BOITE)).match(cle)
    if (!r) return null
    const secs = Number(r.headers.get('x-duree'))
    return { url: URL.createObjectURL(await r.blob()), secs: Number.isFinite(secs) && secs > 0 ? secs : null }
  } catch { return null }
}

async function ranger(cle: string, blob: Blob, secs: number | null) {
  try {
    const headers: Record<string, string> = { 'content-type': 'image/jpeg' }
    if (secs) headers['x-duree'] = String(secs)
    await (await caches.open(BOITE)).put(cle, new Response(blob, { headers }))
  } catch { /* stockage du navigateur indisponible : on affichera quand même */ }
}

function reduire(source: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  const k = Math.min(1, LARGEUR / Math.max(1, w))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k))
  c.getContext('2d')?.drawImage(source, 0, 0, c.width, c.height)
  return new Promise((ok) => { try { c.toBlob((b) => ok(b), 'image/jpeg', 0.72) } catch { ok(null) } })
}

/** Image : téléchargée une fois, réduite dans le navigateur. */
async function depuisImage(url: string): Promise<{ blob: Blob | null; secs: null }> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'
  img.src = url
  await img.decode()
  return { blob: await reduire(img, img.naturalWidth, img.naturalHeight), secs: null }
}

/** Vidéo : seules les métadonnées et l'image à 0,5 s sont lues (requêtes partielles), une fois. */
function depuisVideo(url: string): Promise<{ blob: Blob | null; secs: number | null }> {
  return new Promise((ok, ko) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.preload = 'metadata'
    const fin = setTimeout(() => { v.removeAttribute('src'); v.load(); ko(new Error('délai')) }, 20_000)
    v.onloadedmetadata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2) }
    v.onseeked = async () => {
      clearTimeout(fin)
      const blob = await reduire(v, v.videoWidth, v.videoHeight)
      const secs = Number.isFinite(v.duration) ? v.duration : null
      v.removeAttribute('src'); v.load()
      ok({ blob, secs })
    }
    v.onerror = () => { clearTimeout(fin); ko(new Error('vidéo')) }
    v.src = url
  })
}

function vignette(path: string, video: boolean): Promise<Vignette | null> {
  const cle = `/__miniature/${encodeURIComponent(path)}`
  let p = memoire.get(cle)
  if (!p) {
    p = (async () => {
      const deja = await lireBoite(cle)
      if (deja) return deja
      const url = await signedUrl('files', path)
      if (!url) return null
      try {
        const { blob, secs } = video ? await depuisVideo(url) : await depuisImage(url)
        if (!blob) return null
        await ranger(cle, blob, secs)
        return { url: URL.createObjectURL(blob), secs }
      } catch {
        // CORS refusé ou format illisible : vignette directe (comme avant), non gardée.
        return video ? null : { url, secs: null }
      }
    })()
    memoire.set(cle, p)
  }
  return p
}

export function Miniature({ path, mime, nom, className, petit }: { path: string; mime: string | null; nom: string; className?: string; petit?: boolean }) {
  const image = !!mime?.startsWith('image/') && !mime.includes('svg') && !mime.includes('heic'), video = !!mime?.startsWith('video/')
  const boite = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [v, setV] = useState<Vignette | null>(null)
  const [echec, setEchec] = useState(false)
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
    vignette(path, video).then((r) => { if (vivant) { if (r) setV(r); else setEchec(true) } })
    return () => { vivant = false }
  }, [visible, path, video])

  if ((!image && !video) || (echec && image)) return <IconeDocument mime={mime} nom={nom} className={className ?? 'h-[66px] w-[54px]'} />
  return (
    <span ref={boite} className={cn('relative block shrink-0 overflow-hidden rounded-lg bg-surface-3 shadow-sm ring-1 ring-black/5 dark:ring-white/10', petit ? 'h-9 w-12' : 'h-[72px] w-[96px]')}>
      {!pret && !echec && <span className="skeleton absolute inset-0 rounded-lg" />}
      {v && <img src={v.url} alt="" decoding="async" onLoad={() => setPret(true)} onError={() => setEchec(true)} className={cn('size-full object-cover transition-opacity duration-300', pret ? 'opacity-100' : 'opacity-0')} />}
      {video && <span className="absolute inset-0 grid place-items-center"><span className={cn('grid place-items-center rounded-full bg-black/55 text-white backdrop-blur', petit ? 'size-4' : 'size-6')}><Play className="ml-px size-3 fill-current" /></span></span>}
      {video && !petit && v?.secs != null && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] font-medium tabular-nums text-white">{duree(v.secs)}</span>}
    </span>
  )
}
