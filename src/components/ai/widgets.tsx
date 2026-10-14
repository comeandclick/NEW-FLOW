'use client'
// Widgets de l'assistant (14/10/2026) : ils remplacent une longue réponse écrite par un affichage propre et cliquable.
// Données en direct (useLive), cliquables vers les pages de Flow, apparition en cascade.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { format, isBefore, isSameDay, isWithinInterval, endOfWeek, startOfDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowUpRight, CalendarDays, Check, CheckSquare, ChevronDown, Clapperboard, Download, Film, Handshake, MessageSquare, TriangleAlert } from 'lucide-react'
import { getDb } from '@/lib/supabase/client'
import { signedUrl } from '@/lib/storage'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { groupFiles, type ClientFile, type ClientMessage, type ClientRow, type ClientTodo } from '@/lib/clients'
import type { CalEvent, Task } from '@/lib/types'
import type { Widget } from '@/lib/ai-widgets'
import { Avatar } from '@/components/ui/misc'
import { cn } from '@/lib/utils'
import { WidgetPlus } from '@/components/ai/widgets-plus'
import { WidgetCreation } from '@/components/ai/widget-creation'
import { WidgetModeleMotion, WidgetVideoDemande } from '@/components/ai/widget-video'

export const ligne = { hidden: { opacity: 0, y: 6, filter: 'blur(4px)' }, show: (i: number) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: { delay: 0.12 + i * 0.045, type: 'spring' as const, stiffness: 420, damping: 34 } }) }

export function Cadre({ icone: I, titre, compte, lien, children }: { icone: typeof CheckSquare; titre: string; compte?: number; lien?: { href: string; lib: string }; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <I className="size-4 text-text-3" strokeWidth={1.75} /><span className="text-[13px] font-semibold">{titre}</span>
        {compte !== undefined && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-text/10 px-1.5 text-[11px] font-medium">{compte}</span>}
        {lien && <Link href={lien.href} className="ml-auto inline-flex items-center gap-1 text-xs text-text-3 transition-colors hover:text-text">{lien.lib}<ArrowUpRight className="size-3.5" /></Link>}
      </div>
      {children}
    </div>
  )
}
export const Vide = ({ texte }: { texte: string }) => <p className="px-4 py-6 text-center text-[13px] text-text-3">{texte}</p>

/* ── Tâches ── */
const PRIO: Record<string, string> = { urgent: 'bg-danger', high: 'bg-warning', medium: 'bg-info', low: 'bg-text/30' }
function WidgetTaches({ periode }: { periode: 'jour' | 'semaine' | 'retard' | 'toutes' }) {
  const { ws } = useWorkspace(); const { userId } = useSession()
  const q = useLive<Task>('tasks', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const [faites, setFaites] = useState<string[]>([])
  const auj = startOfDay(new Date())
  const liste = useMemo(() => q.data.filter((x) => !['done', 'cancelled'].includes(x.status) && (x.assignee_id === userId || !x.assignee_id)).filter((x) => {
    const d = x.due_date ? new Date(x.due_date) : null
    if (periode === 'jour') return !!d && (isSameDay(d, auj) || isBefore(d, auj))
    if (periode === 'semaine') return !!d && isBefore(d, endOfWeek(auj, { weekStartsOn: 1 }))
    if (periode === 'retard') return !!d && isBefore(d, auj)
    return true
  }).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9')).slice(0, 12), [q.data, periode, userId, auj])
  const cocher = async (t: Task) => { setFaites((f) => [...f, t.id]); await getDb().from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', t.id) }
  const titre = { jour: 'Aujourd\'hui', semaine: 'Cette semaine', retard: 'En retard', toutes: 'Tâches ouvertes' }[periode]
  return (
    <Cadre icone={CheckSquare} titre={titre} compte={liste.length} lien={{ href: `/app/${ws.slug}/tasks`, lib: 'Tâches' }}>
      {!q.loading && !liste.length ? <Vide texte="Rien à faire ici. Profite !" /> : (
        <ul className="divide-y divide-border">
          {liste.map((t, i) => { const fait = faites.includes(t.id), d = t.due_date ? new Date(t.due_date) : null, retard = !!d && isBefore(d, auj)
            return (
              <motion.li key={t.id} custom={i} variants={ligne} initial="hidden" animate="show" className="flex items-center gap-3 px-4 py-2.5">
                <button onClick={() => void cocher(t)} aria-label="Terminer" className={cn('grid size-[18px] shrink-0 place-items-center rounded-full border transition-colors', fait ? 'border-success bg-success text-white' : 'border-border-strong hover:border-text-3')}>{fait && <Check className="size-3" strokeWidth={3} />}</button>
                <Link href={`/app/${ws.slug}/tasks?open=${t.id}`} className={cn('min-w-0 flex-1 truncate text-[13.5px] transition-colors hover:text-text', fait ? 'text-text-3 line-through' : 'text-text')}>{t.title}</Link>
                <span className={cn('size-1.5 shrink-0 rounded-full', PRIO[t.priority])} title={t.priority} />
                {d && <span className={cn('shrink-0 text-xs tabular-nums', retard ? 'text-danger' : 'text-text-3')}>{format(d, 'd MMM', { locale: fr })}</span>}
              </motion.li>
            ) })}
        </ul>
      )}
    </Cadre>
  )
}

/* ── Clients en attente (tiroir par client) ── */
function WidgetClients({ filtre }: { filtre: 'tous' | 'attente' }) {
  const { ws } = useWorkspace()
  const clients = useLive<ClientRow>('clients', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const files = useLive<ClientFile>('client_files', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const todos = useLive<ClientTodo>('client_todos', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const msgs = useLive<ClientMessage>('client_messages', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const [ouvert, setOuvert] = useState<string | null>(null)
  const auj = startOfDay(new Date())
  const rangs = useMemo(() => clients.data.map((c) => {
    const g = groupFiles(files.data.filter((f) => f.client_id === c.id))
    const aValider = g.filter((x) => x.versions[0].status === 'livree').map((x) => x.versions[0])
    const modifs = g.filter((x) => x.versions[0].status === 'modif').map((x) => x.versions[0])
    const ouvertes = todos.data.filter((x) => x.client_id === c.id && !x.done)
    const retard = ouvertes.filter((x) => x.due_date && isBefore(new Date(x.due_date), auj))
    const dernier = msgs.data.filter((m) => m.client_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    const repondre = dernier?.author_kind === 'client' ? dernier : null
    return { c, aValider, modifs, ouvertes, retard, repondre, poids: modifs.length * 3 + retard.length * 3 + (repondre ? 2 : 0) + aValider.length }
  }).filter((r) => filtre === 'tous' || r.poids > 0 || r.ouvertes.length).sort((a, b) => b.poids - a.poids || a.c.name.localeCompare(b.c.name)), [clients.data, files.data, todos.data, msgs.data, auj, filtre])
  return (
    <Cadre icone={Handshake} titre={filtre === 'tous' ? 'Tes clients' : 'Clients en attente'} compte={rangs.length} lien={{ href: `/app/${ws.slug}/clients`, lib: 'Clients' }}>
      {!clients.loading && !rangs.length ? <Vide texte={filtre === 'tous' ? 'Aucun client pour l\'instant.' : 'Aucun client n\'attend quoi que ce soit.'} /> : (
        <ul className="divide-y divide-border">
          {rangs.map((r, i) => { const o = ouvert === r.c.id
            return (
              <motion.li key={r.c.id} custom={i} variants={ligne} initial="hidden" animate="show">
                <button onClick={() => setOuvert(o ? null : r.c.id)} aria-expanded={o} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60">
                  <Avatar name={r.c.name} size={30} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{r.c.name}</span>
                    <span className="block truncate text-xs text-text-3">{[r.modifs.length && `${r.modifs.length} modif.`, r.aValider.length && `${r.aValider.length} à valider`, r.retard.length && `${r.retard.length} en retard`, r.repondre && 'attend ta réponse'].filter(Boolean).join(' · ') || (r.ouvertes.length ? `${r.ouvertes.length} tâche(s) en cours` : r.c.company || 'Rien en attente')}</span></span>
                  <EtatClient r={r} />
                  <ChevronDown className={cn('size-4 shrink-0 text-text-3 transition-transform', o && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {o && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 34 }} className="overflow-hidden">
                      <div className="space-y-1 bg-surface-2/50 px-4 pb-3 pt-1">
                        {[...r.modifs.map((f) => ({ k: f.id, I: Film, t: `Modification demandée : ${f.title}`, c: 'text-warning' })), ...r.retard.map((x) => ({ k: x.id, I: TriangleAlert, t: `En retard : ${x.title}`, c: 'text-danger' })),
                          ...r.aValider.map((f) => ({ k: f.id, I: Film, t: `À valider par le client : ${f.title}`, c: 'text-text-2' })), ...(r.repondre ? [{ k: 'm', I: MessageSquare, t: `« ${r.repondre.body.slice(0, 80)} »`, c: 'text-text-2' }] : []),
                          ...r.ouvertes.filter((x) => !r.retard.includes(x)).slice(0, 4).map((x) => ({ k: x.id, I: CheckSquare, t: x.title, c: 'text-text-2' })), { k: 'fiche', I: Handshake, t: 'Ouvrir la fiche client', c: 'text-text-3' }].map((e) => (
                          <Link key={e.k} href={`/app/${ws.slug}/clients/${r.c.id}`} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-text/5">
                            <e.I className={cn('size-3.5 shrink-0', e.c)} /><span className="min-w-0 flex-1 truncate">{e.t}</span><ArrowUpRight className="size-3.5 shrink-0 text-text-3" />
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            ) })}
        </ul>
      )}
    </Cadre>
  )
}

/* ── Vidéo (Productions de l'Atelier + Fichiers) ── */
export type Prod = { projet: string; titre: string; client: string; serie: string | null; numero: number | null; video_chemin: string | null; video_nom: string | null; statut: string; avancement: number }
type Fic = { id: string; name: string; storage_path: string; mime_type: string | null }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const mots = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((m) => m.length > 1 && !['le', 'la', 'les', 'du', 'de', 'des', 'un', 'une', 'en', 'cours', 'video', 'tiktok', 'moi', 'donne', 'comment'].includes(m))
function WidgetVideo({ recherche }: { recherche: string }) {
  const { ws } = useWorkspace()
  const prods = useLive<Prod>('motion_projets', { eq: { workspace_id: ws.id } })
  const fics = useLive<Fic>('files', { select: 'id,name,storage_path,mime_type', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const cands = useMemo(() => {
    const m = mots(recherche), num = recherche.match(/\b(\d{1,3})\b/)?.[1]
    const score = (txt: string, n?: number | null) => m.filter((x) => norm(txt).includes(x)).length + (num && n === Number(num) ? 3 : 0)
    const a = prods.data.filter((p) => p.video_chemin).map((p) => ({ cle: p.projet, titre: `${p.serie ? p.serie + (p.numero ? ` n° ${p.numero}` : '') + ' · ' : ''}${p.titre}`, chemin: p.video_chemin!, nom: p.video_nom ?? p.titre, s: score(`${p.titre} ${p.serie ?? ''} ${p.video_nom ?? ''}`, p.numero) }))
    const b = fics.data.filter((f) => f.mime_type?.startsWith('video/')).map((f) => ({ cle: f.id, titre: f.name.replace(/\.[a-z0-9]+$/i, ''), chemin: f.storage_path, nom: f.name, s: score(f.name) }))
    return [...a, ...b].filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 4)
  }, [prods.data, fics.data, recherche])
  const [choix, setChoix] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  const v = cands[choix]
  useEffect(() => { setUrl(null); if (v) signedUrl('files', v.chemin).then(setUrl).catch(() => setUrl(null)) }, [v])
  const telecharger = async () => { if (!url || !v) return; const b = await (await fetch(url)).blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = v.nom.endsWith('.mp4') ? v.nom : `${v.nom}.mp4`; a.click(); URL.revokeObjectURL(a.href) }
  if (!prods.loading && !fics.loading && !v) return <Cadre icone={Film} titre="Vidéo"><Vide texte={`Aucune vidéo ne correspond à « ${recherche} ».`} /></Cadre>
  return (
    <div className="overflow-hidden rounded-xl">
      <div className="mb-2 flex items-center gap-3">
        <h4 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{v?.titre ?? 'Recherche…'}</h4>
        <button onClick={() => void telecharger()} disabled={!url} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-text px-3.5 text-[12.5px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"><Download className="size-3.5" />Télécharger</button>
      </div>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 30 }}
        className="grid aspect-video max-h-[70vh] place-items-center overflow-hidden rounded-xl bg-black">
        {url ? <video key={url} src={url} controls playsInline className="h-full max-h-[70vh] w-full object-contain" /> : <span className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />}
      </motion.div>
      {cands.length > 1 && <div className="mt-2 flex flex-wrap gap-1.5">{cands.map((c, i) => <button key={c.cle} onClick={() => setChoix(i)} className={cn('max-w-[220px] truncate rounded-full border px-2.5 py-1 text-xs transition-colors', i === choix ? 'border-transparent bg-text text-bg' : 'border-border text-text-2 hover:text-text')}>{c.titre}</button>)}</div>}
    </div>
  )
}

/* ── Agenda ── */
function WidgetAgenda({ periode }: { periode: 'jour' | 'semaine' }) {
  const { ws } = useWorkspace()
  const q = useLive<CalEvent>('events', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['start_at', true] })
  const auj = startOfDay(new Date()), fin = periode === 'jour' ? new Date(auj.getTime() + 86400000) : endOfWeek(auj, { weekStartsOn: 1 })
  const liste = q.data.filter((e) => isWithinInterval(new Date(e.start_at), { start: auj, end: fin })).slice(0, 12)
  return (
    <Cadre icone={CalendarDays} titre={periode === 'jour' ? 'Aujourd\'hui' : 'Cette semaine'} compte={liste.length} lien={{ href: `/app/${ws.slug}/calendar`, lib: 'Calendrier' }}>
      {!q.loading && !liste.length ? <Vide texte="Aucun événement prévu." /> : (
        <ul className="divide-y divide-border">{liste.map((e, i) => (
          <motion.li key={e.id} custom={i} variants={ligne} initial="hidden" animate="show" className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-1 self-stretch rounded-full" style={{ background: e.color ?? 'var(--text-3)' }} />
            <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px]">{e.title}</span><span className="block text-xs text-text-3">{format(new Date(e.start_at), periode === 'jour' ? 'HH:mm' : 'EEE d MMM · HH:mm', { locale: fr })}{e.location ? ` · ${e.location}` : ''}</span></span>
          </motion.li>))}</ul>
      )}
    </Cadre>
  )
}

/* ── Productions ── */
const LIB: Record<string, [string, string]> = { a_valider: ['À valider', 'text-warning'], a_corriger: ['À corriger', 'text-danger'], en_cours: ['En cours', 'text-info'], valide: ['Validée', 'text-success'], publie: ['Publiée', 'text-success'], en_pause: ['En pause', 'text-text-3'] }
function WidgetProductions({ statut }: { statut?: string }) {
  const { ws } = useWorkspace()
  const q = useLive<Prod>('motion_projets', { eq: { workspace_id: ws.id } })
  const liste = q.data.filter((p) => !statut || p.statut === statut).sort((a, b) => (a.statut === 'a_valider' ? -1 : 0) - (b.statut === 'a_valider' ? -1 : 0)).slice(0, 10)
  return (
    <Cadre icone={Clapperboard} titre="Productions" compte={liste.length} lien={{ href: `/app/${ws.slug}/motion`, lib: 'Motion design' }}>
      {!q.loading && !liste.length ? <Vide texte="Aucune vidéo avec ce statut." /> : (
        <ul className="divide-y divide-border">{liste.map((p, i) => (
          <motion.li key={p.projet} custom={i} variants={ligne} initial="hidden" animate="show" className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px]">{p.numero ? <b className="mr-1">n° {p.numero}</b> : null}{p.titre}</span><span className="block text-xs text-text-3">{p.client}{p.serie ? ` · ${p.serie}` : ''}</span></span>
            <div className="hidden w-20 sm:block"><div className="h-1 overflow-hidden rounded-full bg-text/10"><div className="h-full rounded-full bg-text" style={{ width: `${p.avancement}%` }} /></div></div>
            <span className={cn('w-20 shrink-0 text-right text-xs font-medium', LIB[p.statut]?.[1])}>{LIB[p.statut]?.[0] ?? p.statut}</span>
          </motion.li>))}</ul>
      )}
    </Cadre>
  )
}

// état d'un client, en une pastille : la chose la plus urgente d'abord
function EtatClient({ r }: { r: { modifs: unknown[]; retard: unknown[]; repondre: unknown; aValider: unknown[]; ouvertes: unknown[] } }) {
  const [lib, c] = r.modifs.length ? ['Modifs demandées', 'bg-warning/15 text-warning'] : r.retard.length ? ['En retard', 'bg-danger/15 text-danger'] : r.repondre ? ['Attend ta réponse', 'bg-info/15 text-info']
    : r.aValider.length ? ['À valider', 'bg-text/10 text-text-2'] : r.ouvertes.length ? ['En cours', 'bg-text/10 text-text-2'] : ['À jour', 'bg-success/15 text-success']
  return <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', c)}>{lib}</span>
}

export function WidgetAssistant({ w }: { w: Widget }) {
  switch (w.type) {
    case 'taches': return <WidgetTaches periode={w.periode} />
    case 'clients': return <WidgetClients filtre={w.filtre ?? 'attente'} />
    case 'video': return <WidgetVideo recherche={w.recherche} />
    case 'agenda': return <WidgetAgenda periode={w.periode} />
    case 'productions': return <WidgetProductions statut={w.statut} />
    case 'creation': return <WidgetCreation c={w.c} />
    case 'video_demande': return <WidgetVideoDemande d={w.d} />
    case 'modele_motion': return <WidgetModeleMotion client={w.client} titre={w.titre} idee={w.idee} format={w.format} duree={w.duree} />
    default: return <WidgetPlus w={w} />
  }
}
