/** Studio : demandes de motion design et de sites envoyées à Claude Code sur le Mac connecté.
 *  Aujourd'hui : visuel + prompts réels + simulation locale. Plus tard : même modèle de données côté Supabase (voir docs/STUDIO-SYSTEME.md). */

export type RefKind = 'video' | 'image' | 'screen' | 'file' | 'link' | 'note'
export type RefItem = { id: string; kind: RefKind; name: string; size?: number; mime?: string; url?: string; note?: string }

export type Ratio = '9:16' | '16:9' | '1:1' | '4:5'
export type QualityId = 'hd' | 'fhd' | '4k'
export type AudioMode = 'none' | 'sfx' | 'music_sfx'

export const RATIOS: { id: Ratio; w: number; h: number; labelFr: string; labelEn: string; useFr: string; useEn: string }[] = [
  { id: '9:16', w: 9, h: 16, labelFr: 'Vertical', labelEn: 'Vertical', useFr: 'Reels, TikTok, Shorts', useEn: 'Reels, TikTok, Shorts' },
  { id: '16:9', w: 16, h: 9, labelFr: 'Horizontal', labelEn: 'Landscape', useFr: 'YouTube, site web, pub', useEn: 'YouTube, website, ads' },
  { id: '1:1', w: 1, h: 1, labelFr: 'Carré', labelEn: 'Square', useFr: 'Feed Instagram, LinkedIn', useEn: 'Instagram feed, LinkedIn' },
  { id: '4:5', w: 4, h: 5, labelFr: 'Portrait', labelEn: 'Portrait', useFr: 'Feed Instagram, Facebook', useEn: 'Instagram feed, Facebook' },
]

/** Hauteur du petit côté selon la qualité (vertical : largeur) : HD 720, Full HD 1080, 4K 2160. */
export const QUALITIES: { id: QualityId; short: number; labelFr: string; labelEn: string; hintFr: string; hintEn: string }[] = [
  { id: 'hd', short: 720, labelFr: 'HD', labelEn: 'HD', hintFr: 'Brouillon rapide', hintEn: 'Quick draft' },
  { id: 'fhd', short: 1080, labelFr: 'Full HD', labelEn: 'Full HD', hintFr: 'Réseaux sociaux', hintEn: 'Social media' },
  { id: '4k', short: 2160, labelFr: '4K', labelEn: '4K', hintFr: 'Rendu final net (recommandé)', hintEn: 'Sharp final render (recommended)' },
]

export function dimensions(ratio: Ratio, quality: QualityId) {
  const r = RATIOS.find((x) => x.id === ratio)!
  const q = QUALITIES.find((x) => x.id === quality)!
  const even = (n: number) => Math.round(n / 2) * 2
  if (r.w === r.h) return { w: q.short, h: q.short }
  if (r.w > r.h) return { w: even((q.short * r.w) / r.h), h: q.short }
  return { w: q.short, h: even((q.short * r.h) / r.w) }
}

export type StepState = 'todo' | 'active' | 'done' | 'blocked'
export type JobStatus = 'draft' | 'waiting_device' | 'queued' | 'running' | 'needs_answer' | 'done' | 'failed'

export type Step = { id: string; state: StepState; detail?: string }

export type Question = { id: string; text: string; choices?: string[]; askedAt: number; answer?: string; answeredAt?: number }
export type Notice = { id: string; at: number; title: string; body?: string; level: 'info' | 'success' | 'question'; read?: boolean }

export type MotionJob = {
  id: string
  kind: 'motion'
  title: string
  brief: string
  ratio: Ratio
  quality: QualityId
  fps: 30 | 60
  durationSec: number
  audio: AudioMode
  brand: string
  refs: RefItem[]
  verify: boolean
  createdAt: number
  status: JobStatus
  steps: Step[]
  questions: Question[]
  notices: Notice[]
  result?: { name: string; size?: number; url?: string; w: number; h: number }
}

export type SiteKind = 'showcase' | 'shop' | 'landing' | 'other'
export type SiteJob = {
  id: string
  kind: 'site'
  title: string
  siteKind: SiteKind
  brief: string
  refs: RefItem[]
  withFigma: boolean
  withSupabase: boolean
  withMotion: boolean
  motionBrief: string
  languages: string
  domain: string
  /** Réponses déjà données dans la session de questions. */
  qa: { q: string; a: string }[]
  understanding: number
  createdAt: number
  status: JobStatus
  steps: Step[]
  questions: Question[]
  notices: Notice[]
  liveUrl?: string
}

export type Job = MotionJob | SiteJob

export type Device = { id: string; name: string; os: string; pairedAt: number; lastSeen: number }
export type LibraryKind = 'sent' | 'render' | 'site'
export type LibraryItem = { id: string; kind: LibraryKind; refKind: RefKind | 'render-video' | 'render-image' | 'site'; name: string; size?: number; url?: string; jobId?: string; jobTitle?: string; at: number }
