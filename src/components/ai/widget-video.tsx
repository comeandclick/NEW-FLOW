'use client'
// Vidéos motion depuis l'assistant (14/10/2026).
// 1) « Crée la vidéo de demain pour le TikTok de MyUstadh » : reprend le modèle habituel du client (série déjà produite),
//    fait choisir s'il y en a plusieurs, « Plus d'infos » pour la durée, le sujet, une note… puis part vers l'Atelier
//    (même demande que Motion design → Lancer). États : choisir → prêt → envoi → envoyée / en attente du Mac / erreur.
// 2) « Imagine un nouveau modèle motion pour X » : l'idée de l'IA, à enregistrer dans le dossier privé du client,
//    puis à lancer directement.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowUpRight, Check, ChevronDown, Clapperboard, Laptop, Rocket, Save, Sparkles, WifiOff } from 'lucide-react'
import { getDb } from '@/lib/supabase/client'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { createAndSubmit } from '@/lib/studio/launch'
import { studioApi, usePoll, useStudioMode } from '@/lib/studio/api'
import { FORMATS, VOIX, modelesDe, serieDe, type Format, type Modele } from '@/lib/studio/motion-modeles'
import { noteClientTags, texteDeNote } from '@/lib/client-notes'
import type { DemandeVideo } from '@/lib/ai-widgets'
import type { Note } from '@/lib/types'
import { cn } from '@/lib/utils'

type ClientRow = { id: string; name: string; company: string | null }
type Prod = { client: string; serie: string | null; numero: number | null; maj: string }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const MARQUES = ['Kalimat', 'Lumora']

function useClient(nom: string) {
  const { ws } = useWorkspace()
  const q = useLive<ClientRow>('clients', { select: 'id,name,company', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const n = norm(nom)
  const c = q.data.find((x) => norm(x.name) === n || (x.company && norm(x.company) === n)) ?? q.data.find((x) => n && (norm(x.name).includes(n) || (x.company && norm(x.company).includes(n))))
  const marque = MARQUES.find((m) => norm(m) === n)
  return { client: c ?? null, nom: c?.name ?? marque ?? nom, marque: c?.company ?? c?.name ?? marque ?? nom, loading: q.loading }
}

/** Modèles d'un client : ceux de Flow + ses modèles maison (notes « modèle motion » de son dossier privé). */
function useModeles(clientNom: string, clientId: string | null) {
  const { ws } = useWorkspace()
  const notes = useLive<Note>('notes', { select: 'id,title,content,tags,created_at', eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false], limit: 200, enabled: !!clientId })
  return useMemo(() => {
    const maison: Modele[] = notes.data.filter((x) => clientId && x.tags?.includes(`client:${clientId}`) && x.tags.includes('modele-motion')).map((x) => {
      const titre = x.title.replace(`${clientNom} · `, ''), texte = texteDeNote(x.content)
      const fmt: Format = /16:9|1920x1080|horizontal/i.test(texte) ? '1920x1080' : /1:1|carr/i.test(texte) ? '1080x1080' : '1080x1920'
      const s = Number(texte.match(/(\d{2,3})\s*s(?:ec|\b)/)?.[1]) || 45
      return { id: `note:${x.id}`, titre, detail: 'Modèle maison', serie: titre, format: fmt, duree: s, voix: ['presentation_fr', 'kalimat_ar_fr', 'presentation_en'], voixDefaut: 'presentation_fr', sujet: { label: 'Sujet', placeholder: '' }, consignes: `Modèle maison « ${titre} » (dossier privé du client) :\n${texte}` }
    })
    return [...maison, ...modelesDe(clientNom).filter((m) => !m.bientot)]
  }, [notes.data, clientId, clientNom])
}

export function WidgetVideoDemande({ d, modeleForce }: { d: DemandeVideo; modeleForce?: string }) {
  const { ws } = useWorkspace()
  const { mode } = useStudioMode()
  const devs = usePoll(studioApi.devices, 30000, mode === 'live')
  const atelier = (devs.data?.devices ?? []).find((x) => x.online) ?? null
  const cl = useClient(d.client)
  const modeles = useModeles(cl.nom, cl.client?.id ?? null)
  const prods = useLive<Prod>('motion_projets', { select: 'client,serie,numero,maj', eq: { workspace_id: ws.id } })
  // modèle habituel = celui dont la série a été produite le plus récemment pour ce client
  const habituel = useMemo(() => {
    const series = prods.data.filter((p) => norm(p.client) === norm(cl.nom) && p.serie).sort((a, b) => b.maj.localeCompare(a.maj)).map((p) => p.serie)
    return series.length ? modeles.find((m) => serieDe(m, cl.nom) === series[0]) ?? null : null
  }, [prods.data, modeles, cl.nom])
  const demande = useMemo(() => { const m = modeleForce ?? d.modele; if (!m) return null; const n = norm(m); return modeles.find((x) => norm(x.titre) === n) ?? modeles.find((x) => norm(x.titre).includes(n) || n.includes(norm(x.titre))) ?? null }, [d.modele, modeleForce, modeles])
  const [choixId, setChoixId] = useState<string | null>(null)
  const modele = modeles.find((m) => m.id === choixId) ?? demande ?? habituel ?? (modeles.length === 1 ? modeles[0] : null)
  const [plus, setPlus] = useState(false)
  const [sujet, setSujet] = useState(d.sujet ?? '')
  const [note, setNote] = useState(d.note ?? '')
  const [duree, setDuree] = useState<number | null>(d.duree ?? null)
  const [fmt, setFmt] = useState<Format | null>(null)
  const [publication, setPublication] = useState(d.publication ?? '')
  const [voixOn, setVoixOn] = useState(true)
  const [etat, setEtat] = useState<'brouillon' | 'envoi' | 'envoyee' | 'erreur'>('brouillon')

  const serie = modele ? serieDe(modele, cl.nom) : ''
  const numero = serie ? Math.max(0, ...prods.data.filter((p) => p.serie === serie).map((p) => p.numero ?? 0)) + 1 : null
  const dureeV = duree ?? modele?.duree ?? 45, fmtV = fmt ?? modele?.format ?? '1080x1920'
  const titre = modele ? (modele.id === 'mini_cours' ? `Cours ${numero}${sujet.trim() ? ` · ${sujet.trim()}` : ''}` : `${modele.titre}${numero ? ` n° ${numero}` : ''}${sujet.trim() ? ` · ${sujet.trim()}` : ''}`) : ''

  async function lancer() {
    if (!modele) return
    setEtat('envoi')
    try {
      const voix = modele.voixDefaut ?? modele.voix[0]
      const spec = { atelier: 1, wsSlug: ws.slug, client: cl.nom, clientId: cl.client?.id ?? null, modele: modele.id, modeleTitre: modele.titre, serie: serie || null, numero, sujet: sujet.trim(), notes: note.trim(),
        consignes: modele.consignes, format: fmtV, duree: dureeV, fps: 60, musique: true, publication: publication || null, voix: voixOn ? { id: voix, titre: VOIX[voix].titre, texte: '' } : null, depuis: 'assistant' }
      const resume = ['Demande de vidéo motion design pour l\'Atelier (depuis l\'assistant) :', `${cl.nom} · ${modele.titre}${numero ? ` n° ${numero}` : ''}`, sujet.trim() && `Sujet : ${sujet.trim()}`, note.trim() && `Notes : ${note.trim()}`,
        `Voix : ${voixOn ? VOIX[voix].titre : 'aucune'}`, `Format ${fmtV} · ${dureeV} s · 60 i/s · musique`, publication && `Publication prévue le ${publication}`].filter(Boolean).join('\n')
      if (mode !== 'live') { await new Promise((r) => setTimeout(r, 500)); setEtat('envoyee'); return }
      await createAndSubmit({ kind: 'motion', title: titre, spec, prompt: resume, refs: [], workspaceId: ws.id })
      setEtat('envoyee')
    } catch { setEtat('erreur') }
  }

  const pastille = etat === 'envoyee' ? ['Envoyée', 'bg-success/15 text-success'] : etat === 'erreur' ? ['Erreur', 'bg-danger/15 text-danger'] : etat === 'envoi' ? ['Envoi…', 'bg-info/15 text-info'] : modele ? ['Prête', 'bg-info/15 text-info'] : ['Choisis le modèle', 'bg-warning/15 text-warning']
  return (
    <motion.div layout className={cn('overflow-hidden rounded-xl border bg-surface shadow-sm', etat === 'envoyee' ? 'border-success/40' : 'border-border')}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Clapperboard className="size-4 text-text-3" strokeWidth={1.75} /><span className="truncate text-[13px] font-semibold">Vidéo pour {cl.marque}</span>
        <span className={cn('ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', pastille[1])}>{pastille[0]}</span>
      </div>
      {etat === 'envoyee' ? (
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="grid size-8 place-items-center rounded-full bg-success text-white"><Check className="size-4" strokeWidth={3} /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-medium">{titre}</p>
            <p className="text-xs text-text-3">{mode !== 'live' ? 'Mode démo : demande simulée.' : atelier ? `Un agent démarre sur « ${atelier.name} ».` : 'Elle partira dès que l\'Atelier sera ouvert sur le Mac.'}</p></div>
          <Link href={`/app/${ws.slug}/motion`} className="inline-flex items-center gap-1 text-xs text-text-3 hover:text-text">Suivre<ArrowUpRight className="size-3.5" /></Link>
        </div>
      ) : (
        <div className="space-y-3 px-4 py-3">
          {!cl.loading && !cl.client && !MARQUES.some((m) => norm(m) === norm(d.client)) && <p className="text-xs text-warning">« {d.client} » n&apos;est pas encore dans tes clients : il sera traité comme un nouveau client.</p>}
          <div>
            <p className="mb-1.5 text-[11.5px] font-medium text-text-3">{habituel && !choixId && !demande ? 'Modèle habituel' : modele ? 'Modèle' : `${modeles.length} modèles possibles : lequel ?`}</p>
            <div className="flex flex-wrap gap-1.5">{modeles.map((m) => (
              <button key={m.id} type="button" onClick={() => setChoixId(m.id)} className={cn('rounded-lg border px-2.5 py-1.5 text-left transition-colors', modele?.id === m.id ? 'border-transparent bg-text text-bg' : 'border-border text-text-2 hover:text-text', !modele && 'border-warning/50')}>
                <span className="block text-[12.5px] font-medium">{m.titre}{habituel?.id === m.id && <span className="ml-1 opacity-70">· habituel</span>}</span><span className="block text-[11px] opacity-70">{m.detail}</span>
              </button>))}</div>
          </div>
          {modele && <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-2"><Sparkles className="size-3.5 text-text-3" /><b className="font-medium text-text">{titre}</b><span>{FORMATS.find((f) => f.id === fmtV)?.titre} · {dureeV} s</span>{publication && <span>publication {format(new Date(`${publication}T12:00`), 'EEEE d MMMM', { locale: fr })}</span>}</p>}
          <button type="button" onClick={() => setPlus((p) => !p)} aria-expanded={plus} className="inline-flex items-center gap-1 text-xs font-medium text-text-2 hover:text-text">Plus d&apos;infos<ChevronDown className={cn('size-3.5 transition-transform', plus && 'rotate-180')} /></button>
          <AnimatePresence initial={false}>{plus && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
                <label className="space-y-1 sm:col-span-2"><span className="text-[11.5px] font-medium text-text-3">Sujet</span><input value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Vide : l'agent choisit la suite logique" className="h-9 w-full rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-text/50" /></label>
                <label className="space-y-1"><span className="text-[11.5px] font-medium text-text-3">Durée : {dureeV} s</span><input type="range" min={5} max={120} step={5} value={dureeV} onChange={(e) => setDuree(Number(e.target.value))} className="w-full accent-[var(--text)]" /></label>
                <label className="space-y-1"><span className="text-[11.5px] font-medium text-text-3">Publication</span><input type="date" value={publication} onChange={(e) => setPublication(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-bg px-2.5 text-[13px]" /></label>
                <div className="space-y-1"><span className="text-[11.5px] font-medium text-text-3">Format</span><div className="flex flex-wrap gap-1.5">{FORMATS.map((f) => <button key={f.id} type="button" onClick={() => setFmt(f.id)} className={cn('rounded-full border px-2.5 py-1 text-xs', fmtV === f.id ? 'border-transparent bg-text text-bg' : 'border-border text-text-2')}>{f.titre}</button>)}</div></div>
                <label className="flex items-center gap-2 self-end text-[13px] text-text-2"><input type="checkbox" checked={voixOn} onChange={(e) => setVoixOn(e.target.checked)} />Voix off</label>
                <label className="space-y-1 sm:col-span-2"><span className="text-[11.5px] font-medium text-text-3">Note pour l&apos;agent</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Style, référence, ce qu'il faut éviter…" className="w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-[13px] outline-none focus:border-text/50" /></label>
              </div>
            </motion.div>)}</AnimatePresence>
          <div className="flex items-center gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-3">{atelier ? <><Laptop className="size-3.5 text-success" />Atelier connecté</> : <><WifiOff className="size-3.5" />Le Mac n&apos;est pas connecté : elle attendra</>}</span>
            {etat === 'erreur' && <span className="text-xs text-danger">Envoi impossible.</span>}
            <button type="button" disabled={!modele || etat === 'envoi'} onClick={() => void lancer()} className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-text px-4 text-[12.5px] font-medium text-bg transition-opacity disabled:opacity-35"><Rocket className="size-3.5" />{etat === 'envoi' ? 'Envoi…' : 'Lancer'}</button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

export function WidgetModeleMotion({ client, titre, idee, format: fmt, duree }: { client: string; titre: string; idee: string; format?: string; duree?: number }) {
  const { ws } = useWorkspace(); const { userId } = useSession()
  const cl = useClient(client)
  const [etat, setEtat] = useState<'idee' | 'envoi' | 'enregistre' | 'erreur' | 'lancer'>('idee')
  const [texte, setTexte] = useState(`${idee}${fmt ? `\nFormat : ${fmt}` : ''}${duree ? `\nDurée : ${duree} s` : ''}`)
  const [noteId, setNoteId] = useState<string | null>(null)
  async function enregistrer() {
    if (!cl.client || !userId) { setEtat('erreur'); return }
    setEtat('envoi')
    const { data, error } = await getDb().from('notes').insert({ workspace_id: ws.id, created_by: userId, kind: 'note', title: `${cl.client.name} · ${titre}`, tags: noteClientTags(cl.client.id, 'modele_motion'),
      content: { type: 'doc', content: texte.split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) } }).select('id').single()
    if (error || !data) { setEtat('erreur'); return }
    setNoteId(data.id); setEtat('enregistre')
  }
  if (etat === 'lancer') return <WidgetVideoDemande d={{ client: cl.nom, duree }} modeleForce={titre} />
  return (
    <motion.div layout className={cn('overflow-hidden rounded-xl border bg-surface shadow-sm', etat === 'enregistre' ? 'border-success/40' : 'border-border')}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Sparkles className="size-4 text-text-3" strokeWidth={1.75} /><span className="truncate text-[13px] font-semibold">Nouveau modèle · {cl.marque}</span>
        <span className={cn('ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', etat === 'enregistre' ? 'bg-success/15 text-success' : etat === 'erreur' ? 'bg-danger/15 text-danger' : 'bg-text/10 text-text-2')}>{etat === 'enregistre' ? 'Enregistré' : etat === 'erreur' ? 'Erreur' : 'Idée'}</span>
      </div>
      <div className="space-y-3 px-4 py-3">
        <h4 className="text-[15px] font-semibold tracking-tight">{titre}</h4>
        {etat === 'idee' || etat === 'envoi' || etat === 'erreur'
          ? <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={Math.min(14, texte.split('\n').length + 2)} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-text/50" />
          : <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-2">{texte}</p>}
        {etat === 'erreur' && <p className="text-xs text-danger">{cl.client ? 'Enregistrement impossible.' : `« ${client} » n'est pas dans tes clients : ajoute-le d'abord.`}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {etat === 'enregistre' && cl.client && <Link href={`/app/${ws.slug}/clients/${cl.client.id}`} className="mr-auto inline-flex items-center gap-1 text-xs text-text-3 hover:text-text">Dossier du client<ArrowUpRight className="size-3.5" /></Link>}
          {etat !== 'enregistre' && <button type="button" disabled={etat === 'envoi'} onClick={() => void enregistrer()} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3.5 text-[12.5px] font-medium text-text-2 hover:text-text disabled:opacity-40"><Save className="size-3.5" />{etat === 'envoi' ? 'Enregistrement…' : 'Enregistrer le modèle'}</button>}
          {noteId && <button type="button" onClick={() => setEtat('lancer')} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-text px-4 text-[12.5px] font-medium text-bg"><Rocket className="size-3.5" />Lancer une vidéo avec</button>}
        </div>
      </div>
    </motion.div>
  )
}
