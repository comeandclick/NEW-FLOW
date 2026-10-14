'use client'
// Widgets de l'assistant, suite (14/10/2026) : fiche client, notes, fichiers, discussions, activité, objectifs, CRM,
// équipe et agents IA, bilan, projets, focus. Chacun a ses états (vide, en retard, atteint, en ligne, occupé…),
// lit les données en direct et renvoie vers la page de Flow concernée.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { format, formatDistanceToNowStrict, isBefore, isSameDay, startOfDay, startOfWeek, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Activity, BarChart3, Bot, Briefcase, CheckSquare, FileText, Film, FolderKanban, Folder, Handshake, Image as ImageIcon, MessageSquare, StickyNote, Target, Timer, Users } from 'lucide-react'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { useUnread } from '@/lib/hooks/use-unread'
import { useI18n } from '@/i18n/provider'
import { actionKey } from '@/lib/activity'
import { groupFiles, type ClientFile, type ClientMessage, type ClientRow, type ClientTodo } from '@/lib/clients'
import type { Activity as Act, CalEvent, Conversation, Deal, FileRow, Goal, Message, Note, Task, TimeEntry } from '@/lib/types'
import type { Widget } from '@/lib/ai-widgets'
import { Avatar } from '@/components/ui/misc'
import { Cadre, Vide, ligne } from '@/components/ai/widgets'
import { cn } from '@/lib/utils'
import { Miniature } from '@/components/common/miniature'

const Pastille = ({ lib, ton }: { lib: string; ton: 'ok' | 'alerte' | 'danger' | 'info' | 'neutre' }) => (
  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', { ok: 'bg-success/15 text-success', alerte: 'bg-warning/15 text-warning', danger: 'bg-danger/15 text-danger', info: 'bg-info/15 text-info', neutre: 'bg-text/10 text-text-2' }[ton])}>{lib}</span>
)
const Barre = ({ pct, ton = 'bg-text' }: { pct: number; ton?: string }) => (
  <div className="h-1.5 overflow-hidden rounded-full bg-text/10"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, pct))}%` }} transition={{ type: 'spring', stiffness: 120, damping: 22, delay: 0.2 }} className={cn('h-full rounded-full', ton)} /></div>
)
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ouverte = (t: Task) => !['done', 'cancelled'].includes(t.status)
const estBot = (p: unknown) => !!(p as { preferences?: { bot?: boolean } } | null)?.preferences?.bot

/* ── Fiche d'un client ── */
function WidgetClient({ nom }: { nom: string }) {
  const { ws } = useWorkspace()
  const clients = useLive<ClientRow>('clients', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const c = useMemo(() => { const n = norm(nom); return clients.data.find((x) => norm(x.name) === n) ?? clients.data.find((x) => norm(x.name).includes(n) || n.includes(norm(x.name)) || (x.company && norm(x.company).includes(n))) }, [clients.data, nom])
  const files = useLive<ClientFile>('client_files', { eq: { workspace_id: ws.id, client_id: c?.id }, is: { deleted_at: null }, enabled: !!c })
  const todos = useLive<ClientTodo>('client_todos', { eq: { workspace_id: ws.id, client_id: c?.id }, is: { deleted_at: null }, enabled: !!c })
  const msgs = useLive<ClientMessage>('client_messages', { eq: { workspace_id: ws.id, client_id: c?.id }, is: { deleted_at: null }, order: ['created_at', false], limit: 3, enabled: !!c })
  const [onglet, setOnglet] = useState<'videos' | 'afaire' | 'messages'>('videos')
  if (!clients.loading && !c) return <Cadre icone={Handshake} titre="Client"><Vide texte={`Je ne trouve pas de client « ${nom} » dans cet espace.`} /></Cadre>
  if (!c) return <Cadre icone={Handshake} titre={nom}><Vide texte="Chargement…" /></Cadre>
  const versions = groupFiles(files.data).map((g) => g.versions[0])
  const auj = startOfDay(new Date()), ouvertes = todos.data.filter((x) => !x.done), retard = ouvertes.filter((x) => x.due_date && isBefore(new Date(x.due_date), auj))
  const modifs = versions.filter((v) => v.status === 'modif'), aValider = versions.filter((v) => v.status === 'livree'), repondre = msgs.data[0]?.author_kind === 'client'
  const etat: [string, 'ok' | 'alerte' | 'danger' | 'info' | 'neutre'] = modifs.length ? ['Modifs demandées', 'alerte'] : retard.length ? ['En retard', 'danger'] : repondre ? ['Attend ta réponse', 'info'] : aValider.length ? ['À valider', 'neutre'] : ['À jour', 'ok']
  const VST: Record<string, [string, 'ok' | 'alerte' | 'neutre' | 'info']> = { livree: ['À valider', 'neutre'], modif: ['Modifs', 'alerte'], validee: ['Validée', 'ok'] }
  return (
    <Cadre icone={Handshake} titre={c.name} lien={{ href: `/app/${ws.slug}/clients/${c.id}`, lib: 'Fiche' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar name={c.name} size={38} />
        <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-semibold">{c.name}</p><p className="truncate text-xs text-text-3">{c.company ?? 'Client'}</p></div>
        <Pastille lib={etat[0]} ton={etat[1]} />
      </div>
      <div className="grid grid-cols-3 gap-px border-y border-border bg-border text-center">
        {[[versions.length, 'vidéos'], [ouvertes.length, 'à faire'], [modifs.length + aValider.length, 'en attente']].map(([n, l]) => <div key={l} className="bg-surface py-2"><p className="text-lg font-semibold tabular-nums">{n}</p><p className="text-[11px] text-text-3">{l}</p></div>)}
      </div>
      <div className="flex gap-1 px-3 pt-2">
        {([['videos', 'Vidéos'], ['afaire', 'À faire'], ['messages', 'Messages']] as const).map(([k, l]) => <button key={k} onClick={() => setOnglet(k)} className={cn('rounded-full px-2.5 py-1 text-xs transition-colors', onglet === k ? 'bg-text text-bg' : 'text-text-2 hover:text-text')}>{l}</button>)}
      </div>
      <ul className="divide-y divide-border">
        {onglet === 'videos' && (versions.length ? versions.slice(0, 6).map((v, i) => (
          <motion.li key={v.id} custom={i} variants={ligne} initial="hidden" animate="show" className="flex items-center gap-3 px-4 py-2.5"><Film className="size-3.5 shrink-0 text-text-3" /><span className="min-w-0 flex-1 truncate text-[13px]">{v.title} <span className="text-text-3">v{v.version}</span></span><Pastille lib={VST[v.status]?.[0] ?? v.status} ton={VST[v.status]?.[1] ?? 'neutre'} /></motion.li>
        )) : <li><Vide texte="Aucune vidéo livrée." /></li>)}
        {onglet === 'afaire' && (ouvertes.length ? ouvertes.slice(0, 6).map((x, i) => (
          <motion.li key={x.id} custom={i} variants={ligne} initial="hidden" animate="show" className="flex items-center gap-3 px-4 py-2.5"><CheckSquare className="size-3.5 shrink-0 text-text-3" /><span className="min-w-0 flex-1 truncate text-[13px]">{x.title}</span>{x.due_date && <span className={cn('text-xs', retard.includes(x) ? 'text-danger' : 'text-text-3')}>{format(new Date(x.due_date), 'd MMM', { locale: fr })}</span>}</motion.li>
        )) : <li><Vide texte="Rien à faire pour ce client." /></li>)}
        {onglet === 'messages' && (msgs.data.length ? msgs.data.map((m, i) => (
          <motion.li key={m.id} custom={i} variants={ligne} initial="hidden" animate="show" className="px-4 py-2.5"><p className="text-xs text-text-3">{m.author_kind === 'client' ? c.name : 'Équipe'} · {formatDistanceToNowStrict(new Date(m.created_at), { locale: fr, addSuffix: true })}</p><p className="line-clamp-2 text-[13px]">{m.body}</p></motion.li>
        )) : <li><Vide texte="Aucun message." /></li>)}
      </ul>
    </Cadre>
  )
}

/* ── Notes ── */
function WidgetNotes({ recherche }: { recherche?: string }) {
  const { ws } = useWorkspace()
  const q = useLive<Note>('notes', { select: 'id,title,icon,is_pinned,updated_at,kind,tags', eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['updated_at', false], limit: 60 })
  const liste = useMemo(() => { const m = recherche ? norm(recherche).split(/\s+/).filter((x) => x.length > 2) : []
    return q.data.filter((n) => !m.length || m.some((x) => norm(n.title || '').includes(x))).sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned)).slice(0, 8) }, [q.data, recherche])
  return (
    <Cadre icone={StickyNote} titre={recherche ? `Notes : ${recherche}` : 'Notes récentes'} compte={liste.length} lien={{ href: `/app/${ws.slug}/notes`, lib: 'Notes' }}>
      {!q.loading && !liste.length ? <Vide texte={recherche ? 'Aucune note ne correspond.' : 'Aucune note pour l\'instant.'} /> : (
        <ul className="divide-y divide-border">{liste.map((n, i) => (
          <motion.li key={n.id} custom={i} variants={ligne} initial="hidden" animate="show">
            <Link href={`/app/${ws.slug}/notes/${n.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60">
              <FileText className="size-3.5 shrink-0 text-text-3" /><span className="min-w-0 flex-1 truncate text-[13.5px]">{n.title || 'Sans titre'}</span>
              {n.is_pinned && <Pastille lib="Épinglée" ton="info" />}{n.kind !== 'note' && <Pastille lib={n.kind === 'wiki' ? 'Wiki' : 'Doc'} ton="neutre" />}
              <span className="shrink-0 text-xs text-text-3">{formatDistanceToNowStrict(new Date(n.updated_at), { locale: fr })}</span>
            </Link>
          </motion.li>))}</ul>
      )}
    </Cadre>
  )
}

/* ── Fichiers ── */
const taille = (o: number | null) => (!o ? '' : o > 1e6 ? `${(o / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(o / 1e3))} Ko`)
function WidgetFichiers({ genre }: { genre: 'tous' | 'images' | 'videos' | 'documents' }) {
  const { ws } = useWorkspace()
  const q = useLive<FileRow>('files', { select: 'id,name,folder,size,mime_type,created_at,storage_path', eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false], limit: 80 })
  const liste = q.data.filter((f) => { const m = f.mime_type ?? ''
    return genre === 'tous' || (genre === 'images' && m.startsWith('image/')) || (genre === 'videos' && m.startsWith('video/')) || (genre === 'documents' && !m.startsWith('image/') && !m.startsWith('video/')) }).slice(0, 10)
  const Ic = (m: string | null) => (m?.startsWith('image/') ? ImageIcon : m?.startsWith('video/') ? Film : FileText)
  return (
    <Cadre icone={Folder} titre={{ tous: 'Fichiers récents', images: 'Images', videos: 'Vidéos', documents: 'Documents' }[genre]} compte={liste.length} lien={{ href: `/app/${ws.slug}/files`, lib: 'Fichiers' }}>
      {!q.loading && !liste.length ? <Vide texte="Aucun fichier de ce genre." /> : (
        <ul className="divide-y divide-border">{liste.map((f, i) => { const I = Ic(f.mime_type), neuf = Date.now() - new Date(f.created_at).getTime() < 864e5
          return (
            <motion.li key={f.id} custom={i} variants={ligne} initial="hidden" animate="show" className="flex items-center gap-3 px-4 py-2.5">
              {f.mime_type?.startsWith('image/') || f.mime_type?.startsWith('video/') ? <Miniature petit path={f.storage_path} mime={f.mime_type} nom={f.name} />
                : <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-text/5"><I className="size-4 text-text-2" strokeWidth={1.75} /></span>}
              <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px]">{f.name}</span><span className="block text-xs text-text-3">{f.folder && f.folder !== '/' ? `${f.folder} · ` : ''}{taille(f.size)}</span></span>
              {neuf ? <Pastille lib="Nouveau" ton="info" /> : <span className="shrink-0 text-xs text-text-3">{format(new Date(f.created_at), 'd MMM', { locale: fr })}</span>}
            </motion.li>) })}</ul>
      )}
    </Cadre>
  )
}

/* ── Discussions ── */
function WidgetDiscussions({ filtre }: { filtre: 'non_lues' | 'recentes' }) {
  const { ws, nameOf } = useWorkspace(); const { userId } = useSession()
  const { byConv } = useUnread(ws.id, userId)
  const convs = useLive<Conversation>('conversations', { eq: { workspace_id: ws.id } })
  const ids = convs.data.map((c) => c.id)
  const msgs = useLive<Message>('messages', { select: 'id,conversation_id,user_id,content,kind,created_at', in: { conversation_id: ids }, is: { deleted_at: null }, order: ['created_at', false], limit: 120, enabled: ids.length > 0, live: false })
  const liste = useMemo(() => convs.data.map((c) => ({ c, dernier: msgs.data.find((m) => m.conversation_id === c.id), nl: byConv[c.id] ?? 0 }))
    .filter((x) => x.dernier && (filtre === 'recentes' || x.nl > 0)).sort((a, b) => b.dernier!.created_at.localeCompare(a.dernier!.created_at)).slice(0, 8), [convs.data, msgs.data, byConv, filtre])
  const nomConv = (c: Conversation, m?: Message) => (c.type === 'dm' ? (m && m.user_id !== userId ? nameOf(m.user_id) : 'Message privé') : `# ${c.name ?? 'canal'}`)
  return (
    <Cadre icone={MessageSquare} titre={filtre === 'non_lues' ? 'Messages non lus' : 'Discussions récentes'} compte={filtre === 'non_lues' ? liste.reduce((a, x) => a + x.nl, 0) : liste.length} lien={{ href: `/app/${ws.slug}/messages`, lib: 'Messages' }}>
      {!convs.loading && !msgs.loading && !liste.length ? <Vide texte={filtre === 'non_lues' ? 'Tout est lu. Rien ne t\'attend.' : 'Aucune discussion.'} /> : (
        <ul className="divide-y divide-border">{liste.map(({ c, dernier: m, nl }, i) => (
          <motion.li key={c.id} custom={i} variants={ligne} initial="hidden" animate="show">
            <Link href={`/app/${ws.slug}/messages/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60">
              <Avatar name={nameOf(m!.user_id)} size={28} />
              <span className="min-w-0 flex-1"><span className={cn('block truncate text-[13.5px]', nl ? 'font-semibold' : '')}>{nomConv(c, m)}</span>
                <span className="block truncate text-xs text-text-3">{m!.user_id === userId ? 'Toi : ' : `${nameOf(m!.user_id)} : `}{m!.content || { voice: 'message vocal', file: 'fichier', call: 'appel', system: 'info', text: '' }[m!.kind]}</span></span>
              {nl > 0 ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-text px-1.5 text-[11px] font-semibold text-bg">{nl}</span> : <span className="shrink-0 text-xs text-text-3">{formatDistanceToNowStrict(new Date(m!.created_at), { locale: fr })}</span>}
            </Link>
          </motion.li>))}</ul>
      )}
    </Cadre>
  )
}

/* ── Activité ── */
function WidgetActivite({ periode }: { periode: 'jour' | 'semaine' }) {
  const { ws, nameOf } = useWorkspace(); const { t } = useI18n()
  const q = useLive<Act>('activity_logs', { eq: { workspace_id: ws.id }, order: ['created_at', false], limit: 60 })
  const depuis = periode === 'jour' ? startOfDay(new Date()) : subDays(new Date(), 7)
  const liste = q.data.filter((a) => new Date(a.created_at) >= depuis).slice(0, 10)
  return (
    <Cadre icone={Activity} titre={periode === 'jour' ? 'Activité du jour' : 'Activité de la semaine'} compte={liste.length} lien={{ href: `/app/${ws.slug}/activity`, lib: 'Activité' }}>
      {!q.loading && !liste.length ? <Vide texte={periode === 'jour' ? 'Calme plat aujourd\'hui.' : 'Aucune activité cette semaine.'} /> : (
        <ul className="relative px-4 py-2">{liste.map((a, i) => (
          <motion.li key={a.id} custom={i} variants={ligne} initial="hidden" animate="show" className="relative flex gap-3 py-1.5 pl-4 before:absolute before:left-[3px] before:top-0 before:h-full before:w-px before:bg-border last:before:h-3">
            <span className="absolute left-0 top-[11px] size-[7px] rounded-full bg-text-3" />
            <p className="min-w-0 flex-1 text-[13px]"><span className="font-medium">{nameOf(a.user_id)}</span> <span className="text-text-2">{t(actionKey(a.action))}</span> <span className="font-medium">{(a.meta as { title?: string })?.title}</span></p>
            <span className="shrink-0 text-xs text-text-3">{format(new Date(a.created_at), periode === 'jour' ? 'HH:mm' : 'EEE HH:mm', { locale: fr })}</span>
          </motion.li>))}</ul>
      )}
    </Cadre>
  )
}

/* ── Objectifs ── */
function WidgetObjectifs() {
  const { ws } = useWorkspace()
  const q = useLive<Goal>('goals', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const auj = startOfDay(new Date())
  const liste = q.data.map((g) => { const pct = Math.round((Number(g.current) / Math.max(1, Number(g.target))) * 100), fin = g.due_date ? new Date(g.due_date) : null
    const etat: [string, 'ok' | 'danger' | 'alerte' | 'info'] = pct >= 100 ? ['Atteint', 'ok'] : fin && isBefore(fin, auj) ? ['En retard', 'danger'] : fin && fin.getTime() - auj.getTime() < 7 * 864e5 && pct < 70 ? ['À risque', 'alerte'] : ['En bonne voie', 'info']
    return { g, pct, fin, etat } }).sort((a, b) => a.pct - b.pct).slice(0, 8)
  return (
    <Cadre icone={Target} titre="Objectifs" compte={liste.length} lien={{ href: `/app/${ws.slug}/goals`, lib: 'Objectifs' }}>
      {!q.loading && !liste.length ? <Vide texte="Aucun objectif fixé." /> : (
        <ul className="divide-y divide-border">{liste.map(({ g, pct, fin, etat }, i) => (
          <motion.li key={g.id} custom={i} variants={ligne} initial="hidden" animate="show" className="space-y-1.5 px-4 py-3">
            <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{g.title}</span><Pastille lib={etat[0]} ton={etat[1]} /></div>
            <Barre pct={pct} ton={etat[1] === 'ok' ? 'bg-success' : etat[1] === 'danger' ? 'bg-danger' : etat[1] === 'alerte' ? 'bg-warning' : 'bg-text'} />
            <p className="flex justify-between text-xs text-text-3"><span className="tabular-nums">{g.current} / {g.target} {g.unit} · {pct} %</span>{fin && <span>échéance {format(fin, 'd MMM', { locale: fr })}</span>}</p>
          </motion.li>))}</ul>
      )}
    </Cadre>
  )
}

/* ── CRM ── */
const ETAPES = ['prospection', 'qualification', 'proposition', 'négociation', 'gagné', 'perdu'] as const
const euros = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
function WidgetCrm({ vue }: { vue: 'en_cours' | 'gagnees' | 'toutes' }) {
  const { ws } = useWorkspace()
  const q = useLive<Deal>('crm_deals', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const deals = q.data.filter((d) => vue === 'toutes' || (vue === 'gagnees' ? d.stage === 'gagné' : !['gagné', 'perdu'].includes(d.stage)))
  const etapes = ETAPES.filter((s) => deals.some((d) => d.stage === s))
  const total = deals.reduce((a, d) => a + Number(d.value), 0), pondere = deals.reduce((a, d) => a + (Number(d.value) * d.probability) / 100, 0)
  return (
    <Cadre icone={Briefcase} titre={{ en_cours: 'Affaires en cours', gagnees: 'Affaires gagnées', toutes: 'Toutes les affaires' }[vue]} compte={deals.length} lien={{ href: `/app/${ws.slug}/crm`, lib: 'CRM' }}>
      {!q.loading && !deals.length ? <Vide texte={vue === 'gagnees' ? 'Pas encore d\'affaire gagnée.' : 'Aucune affaire en cours.'} /> : (<>
        <div className="grid grid-cols-2 gap-px border-b border-border bg-border">
          <div className="bg-surface px-4 py-2.5"><p className="text-[11px] text-text-3">Total</p><p className="text-lg font-semibold tabular-nums">{euros(total)}</p></div>
          <div className="bg-surface px-4 py-2.5"><p className="text-[11px] text-text-3">{vue === 'gagnees' ? 'Affaires' : 'Pondéré'}</p><p className="text-lg font-semibold tabular-nums">{vue === 'gagnees' ? deals.length : euros(pondere)}</p></div>
        </div>
        {etapes.map((s, i) => { const l = deals.filter((d) => d.stage === s)
          return (
            <motion.div key={s} custom={i} variants={ligne} initial="hidden" animate="show" className="border-b border-border px-4 py-2.5 last:border-0">
              <div className="mb-1.5 flex items-center gap-2"><span className="text-[12.5px] font-medium capitalize">{s}</span><span className="text-xs text-text-3">{l.length}</span><span className="ml-auto text-xs tabular-nums text-text-2">{euros(l.reduce((a, d) => a + Number(d.value), 0))}</span></div>
              <div className="flex flex-wrap gap-1.5">{l.slice(0, 6).map((d) => <span key={d.id} className={cn('max-w-[220px] truncate rounded-md border px-2 py-1 text-xs', d.close_date && isBefore(new Date(d.close_date), startOfDay(new Date())) && !['gagné', 'perdu'].includes(d.stage) ? 'border-danger/40 text-danger' : 'border-border text-text-2')}>{d.title} · {euros(Number(d.value))}</span>)}</div>
            </motion.div>) })}
      </>)}
    </Cadre>
  )
}

/* ── Équipe et agents IA ── */
function WidgetEquipe({ filtre }: { filtre: 'tous' | 'agents' | 'disponibles' }) {
  const { ws, members, online } = useWorkspace()
  const taches = useLive<Task>('tasks', { select: 'id,status,assignee_id,due_date', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const evts = useLive<CalEvent>('events', { select: 'id,start_at,end_at,attendees', eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['start_at', false], limit: 60 })
  const maintenant = Date.now()
  const rangs = members.map((m) => {
    const bot = estBot(m.profile), miennes = taches.data.filter((t) => t.assignee_id === m.user_id && ouverte(t)), enCours = miennes.filter((t) => t.status === 'in_progress').length
    const reunion = evts.data.some((e) => (e.attendees ?? []).includes(m.user_id) && new Date(e.start_at).getTime() <= maintenant && new Date(e.end_at).getTime() >= maintenant)
    const etat: [string, 'ok' | 'alerte' | 'neutre' | 'info'] = bot ? (enCours ? ['Occupé', 'alerte'] : ['Libre', 'ok']) : reunion ? ['En réunion', 'alerte'] : online.has(m.user_id) ? ['En ligne', 'ok'] : ['Hors ligne', 'neutre']
    return { m, bot, charge: miennes.length, etat, libre: etat[1] === 'ok' }
  }).filter((r) => filtre === 'tous' || (filtre === 'agents' ? r.bot : r.libre)).sort((a, b) => Number(b.libre) - Number(a.libre) || a.charge - b.charge)
  return (
    <Cadre icone={filtre === 'agents' ? Bot : Users} titre={{ tous: 'Équipe', agents: 'Agents IA', disponibles: 'Disponibles maintenant' }[filtre]} compte={rangs.length} lien={{ href: `/app/${ws.slug}/team`, lib: 'Équipe' }}>
      {!rangs.length ? <Vide texte={filtre === 'agents' ? 'Aucun agent IA dans cet espace.' : 'Personne n\'est disponible pour l\'instant.'} /> : (
        <ul className="divide-y divide-border">{rangs.map((r, i) => (
          <motion.li key={r.m.user_id} custom={i} variants={ligne} initial="hidden" animate="show" className="flex items-center gap-3 px-4 py-2.5">
            <span className="relative"><Avatar name={r.m.profile?.full_name ?? r.m.profile?.email ?? '?'} size={30} />{r.bot && <Bot className="absolute -bottom-1 -right-1 size-3.5 rounded-full bg-surface p-px text-text-2" />}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px]">{r.m.profile?.full_name ?? r.m.profile?.email}</span><span className="block text-xs text-text-3">{r.bot ? 'Agent IA' : r.m.role} · {r.charge} tâche{r.charge > 1 ? 's' : ''} ouverte{r.charge > 1 ? 's' : ''}</span></span>
            <Pastille lib={r.etat[0]} ton={r.etat[1]} />
          </motion.li>))}</ul>
      )}
    </Cadre>
  )
}

/* ── Bilan ── */
function WidgetBilan({ periode }: { periode: 'jour' | 'semaine' }) {
  const { ws } = useWorkspace(); const { userId } = useSession()
  const taches = useLive<Task>('tasks', { select: 'id,status,assignee_id,due_date,completed_at', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const evts = useLive<CalEvent>('events', { select: 'id,start_at,end_at', eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['start_at', false], limit: 100 })
  const cf = useLive<ClientFile>('client_files', { select: 'id,client_id,title,status,version,created_at', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const temps = useLive<TimeEntry>('time_entries', { select: 'id,started_at,ended_at', eq: { workspace_id: ws.id, user_id: userId }, order: ['started_at', false], limit: 200 })
  const auj = startOfDay(new Date()), debut = periode === 'jour' ? auj : startOfWeek(auj, { weekStartsOn: 1 }), fin = new Date(periode === 'jour' ? auj.getTime() + 864e5 : debut.getTime() + 7 * 864e5)
  const dans = (d: string | null) => !!d && new Date(d) >= debut && new Date(d) < fin
  const faites = taches.data.filter((t) => t.status === 'done' && dans(t.completed_at)).length
  const prevues = taches.data.filter((t) => ouverte(t) && dans(t.due_date) && (!t.assignee_id || t.assignee_id === userId)).length
  const retard = taches.data.filter((t) => ouverte(t) && t.due_date && isBefore(new Date(t.due_date), auj)).length
  const rdv = evts.data.filter((e) => dans(e.start_at)).length
  const attente = groupFiles(cf.data).filter((g) => ['modif', 'livree'].includes(g.versions[0].status)).length
  const focus = Math.round(temps.data.filter((e) => e.ended_at && dans(e.started_at)).reduce((a, e) => a + (new Date(e.ended_at!).getTime() - new Date(e.started_at).getTime()) / 6e4, 0))
  const tuiles: { l: string; v: string | number; ton?: 'ok' | 'danger' }[] = [
    { l: 'Tâches faites', v: faites, ton: faites ? 'ok' : undefined }, { l: periode === 'jour' ? 'Encore prévues' : 'Prévues', v: prevues },
    { l: 'En retard', v: retard, ton: retard ? 'danger' : 'ok' }, { l: 'Rendez-vous', v: rdv },
    { l: 'Clients en attente', v: attente, ton: attente ? 'danger' : 'ok' }, { l: 'Focus', v: focus >= 60 ? `${Math.floor(focus / 60)} h ${String(focus % 60).padStart(2, '0')}` : `${focus} min` },
  ]
  const humeur = retard ? 'Quelques retards à rattraper.' : faites >= prevues ? 'Tout roule, rien en retard.' : 'Rien en retard, continue comme ça.'
  return (
    <Cadre icone={BarChart3} titre={periode === 'jour' ? 'Bilan du jour' : 'Bilan de la semaine'}>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">{tuiles.map((x, i) => (
        <motion.div key={x.l} custom={i} variants={ligne} initial="hidden" animate="show" className="bg-surface px-4 py-3">
          <p className={cn('text-2xl font-semibold tabular-nums tracking-tight', x.ton === 'danger' && 'text-danger', x.ton === 'ok' && 'text-success')}>{x.v}</p><p className="text-xs text-text-3">{x.l}</p>
        </motion.div>))}</div>
      <p className="border-t border-border px-4 py-2.5 text-[13px] text-text-2">{humeur}</p>
    </Cadre>
  )
}

/* ── Projets ── */
function WidgetProjets() {
  const { ws, projects } = useWorkspace()
  const taches = useLive<Task>('tasks', { select: 'id,status,project_id,due_date', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const auj = startOfDay(new Date())
  const rangs = projects.filter((p) => p.status !== 'archived').map((p) => { const l = taches.data.filter((t) => t.project_id === p.id && t.status !== 'cancelled'), faites = l.filter((t) => t.status === 'done').length
    const retard = l.filter((t) => ouverte(t) && t.due_date && isBefore(new Date(t.due_date), auj)).length, pct = l.length ? Math.round((faites / l.length) * 100) : 0
    const etat: [string, 'ok' | 'danger' | 'neutre' | 'info'] = l.length && pct === 100 ? ['Terminé', 'ok'] : retard ? [`${retard} en retard`, 'danger'] : !faites ? ['Pas commencé', 'neutre'] : ['En cours', 'info']
    return { p, total: l.length, faites, pct, etat } }).sort((a, b) => b.total - a.total).slice(0, 8)
  return (
    <Cadre icone={FolderKanban} titre="Projets" compte={rangs.length} lien={{ href: `/app/${ws.slug}/projects`, lib: 'Projets' }}>
      {!rangs.length ? <Vide texte="Aucun projet dans cet espace." /> : (
        <ul className="divide-y divide-border">{rangs.map(({ p, total, faites, pct, etat }, i) => (
          <motion.li key={p.id} custom={i} variants={ligne} initial="hidden" animate="show" className="space-y-1.5 px-4 py-2.5">
            <div className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} /><span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{p.name}</span><Pastille lib={etat[0]} ton={etat[1]} /></div>
            <div className="flex items-center gap-3"><div className="flex-1"><Barre pct={pct} ton={etat[1] === 'ok' ? 'bg-success' : 'bg-text'} /></div><span className="w-16 text-right text-xs tabular-nums text-text-3">{faites}/{total}</span></div>
          </motion.li>))}</ul>
      )}
    </Cadre>
  )
}

/* ── Focus ── */
function WidgetFocus() {
  const { ws } = useWorkspace(); const { userId } = useSession()
  const q = useLive<TimeEntry>('time_entries', { select: 'id,started_at,ended_at,kind', eq: { workspace_id: ws.id, user_id: userId }, order: ['started_at', false], limit: 300 })
  const jours = Array.from({ length: 7 }, (_, i) => startOfDay(subDays(new Date(), 6 - i)))
  const min = jours.map((j) => Math.round(q.data.filter((e) => e.ended_at && e.kind !== 'break' && isSameDay(new Date(e.started_at), j)).reduce((a, e) => a + (new Date(e.ended_at!).getTime() - new Date(e.started_at).getTime()) / 6e4, 0)))
  const max = Math.max(60, ...min), total = min.reduce((a, x) => a + x, 0), auj = min[6]
  const h = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`)
  const etat: [string, 'ok' | 'info' | 'neutre'] = auj >= 120 ? ['Belle journée', 'ok'] : auj > 0 ? ['En route', 'info'] : ['Pas encore commencé', 'neutre']
  return (
    <Cadre icone={Timer} titre="Focus" lien={{ href: `/app/${ws.slug}/focus`, lib: 'Lancer' }}>
      <div className="flex items-end justify-between px-4 pt-3"><div><p className="text-2xl font-semibold tabular-nums tracking-tight">{h(auj)}</p><p className="text-xs text-text-3">aujourd&apos;hui · {h(total)} sur 7 jours</p></div><Pastille lib={etat[0]} ton={etat[1]} /></div>
      <div className="flex h-28 items-end gap-2 px-4 pb-3 pt-4">{min.map((m, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <motion.div initial={{ height: 0 }} animate={{ height: `${(m / max) * 72}px` }} transition={{ delay: 0.1 + i * 0.04, type: 'spring', stiffness: 200, damping: 24 }} className={cn('w-full min-h-[3px] rounded-md', i === 6 ? 'bg-text' : 'bg-text/25')} title={h(m)} />
          <span className="text-[10.5px] text-text-3">{format(jours[i], 'EEEEE', { locale: fr })}</span>
        </div>))}</div>
    </Cadre>
  )
}

export function WidgetPlus({ w }: { w: Widget }) {
  switch (w.type) {
    case 'client': return <WidgetClient nom={w.nom} />
    case 'notes': return <WidgetNotes recherche={w.recherche} />
    case 'fichiers': return <WidgetFichiers genre={w.genre} />
    case 'discussions': return <WidgetDiscussions filtre={w.filtre} />
    case 'activite': return <WidgetActivite periode={w.periode} />
    case 'objectifs': return <WidgetObjectifs />
    case 'crm': return <WidgetCrm vue={w.vue} />
    case 'equipe': return <WidgetEquipe filtre={w.filtre} />
    case 'bilan': return <WidgetBilan periode={w.periode} />
    case 'projets': return <WidgetProjets />
    case 'focus': return <WidgetFocus />
    default: return null
  }
}

