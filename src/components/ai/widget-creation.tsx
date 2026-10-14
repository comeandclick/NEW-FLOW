'use client'
// Création en langage naturel (14/10/2026) : « ajoute une tâche demain à 12h avec un agent IA », « rendez-vous la semaine
// prochaine avec Adam »… L'IA remplit ce qu'elle a compris ; ce qui manque devient une case à remplir (date, heure,
// titre…). Rien n'est créé sans le clic sur « Créer ». États : à compléter → prêt → création… → créé (ou erreur).
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowUpRight, Bot, CalendarPlus, Check, CircleAlert, ListPlus, NotebookPen, X } from 'lucide-react'
import { getDb } from '@/lib/supabase/client'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { createTask } from '@/components/tasks/task-panel'
import type { Creation } from '@/lib/ai-widgets'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const estBot = (p: unknown) => !!(p as { preferences?: { bot?: boolean } } | null)?.preferences?.bot
const LIB = { tache: 'Nouvelle tâche', evenement: 'Nouveau rendez-vous', note: 'Nouvelle note' } as const
const ICONE = { tache: ListPlus, evenement: CalendarPlus, note: NotebookPen } as const
const PRIO = [['low', 'Basse'], ['medium', 'Normale'], ['high', 'Haute'], ['urgent', 'Urgente']] as const

function Champ({ label, manque, children, large }: { label: string; manque?: boolean; children: React.ReactNode; large?: boolean }) {
  return (
    <label className={cn('block space-y-1', large && 'sm:col-span-2')}>
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-text-3">{label}{manque && <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 text-[10.5px] text-warning"><CircleAlert className="size-3" />à compléter</span>}</span>
      {children}
    </label>
  )
}
const entree = (manque?: boolean) => cn('h-9 w-full rounded-lg border bg-bg px-2.5 text-[13.5px] outline-none transition-colors focus:border-text/50', manque ? 'border-warning/60 ring-2 ring-warning/15' : 'border-border')

export function WidgetCreation({ c }: { c: Creation }) {
  const { ws, members, me, log, notifyUser } = useWorkspace(); const { userId } = useSession()
  const taches = useLive<Task>('tasks', { select: 'id,status,assignee_id', eq: { workspace_id: ws.id }, is: { deleted_at: null }, live: false })
  const nomDe = (m: (typeof members)[number]) => m.profile?.full_name ?? m.profile?.email ?? '?'
  // « agent IA » → l'agent IA le plus libre ; sinon le membre dont le nom correspond
  const agentLibre = useMemo(() => members.filter((m) => estBot(m.profile)).map((m) => ({ m, charge: taches.data.filter((t) => t.assignee_id === m.user_id && t.status === 'in_progress').length }))
    .sort((a, b) => a.charge - b.charge)[0], [members, taches.data])
  const trouver = (nom?: string) => { if (!nom) return undefined; const n = norm(nom)
    if (/^(moi|me)$/.test(n)) return userId ?? undefined
    if (/agent|\bia\b|\bai\b|bot/.test(n)) return agentLibre?.m.user_id
    return members.find((m) => norm(nomDe(m)) === n)?.user_id ?? members.find((m) => norm(nomDe(m)).split(/\s+/).some((p) => p.length > 1 && n.split(/[\s,]+/).includes(p)))?.user_id }
  const invites = useMemo(() => (c.avec ?? '').split(/,|\bet\b|&/).map((x) => x.trim()).filter(Boolean), [c.avec])

  const [titre, setTitre] = useState(c.titre ?? '')
  const [date, setDate] = useState(c.date ?? '')
  const [heure, setHeure] = useState(c.heure ?? '')
  const [duree, setDuree] = useState(c.duree ?? 60)
  const [assigne, setAssigne] = useState<string>(() => trouver(c.assigne) ?? (c.objet === 'tache' ? userId ?? '' : ''))
  const [participants, setParticipants] = useState<string[]>(() => [...new Set(invites.map((x) => trouver(x)).filter(Boolean) as string[])])
  const [externes] = useState(() => invites.filter((x) => !trouver(x)))
  const [lieu, setLieu] = useState(c.lieu ?? '')
  const [priorite, setPriorite] = useState(c.priorite && PRIO.some(([k]) => k === c.priorite) ? c.priorite : 'medium')
  const [contenu, setContenu] = useState(c.contenu ?? '')
  const [etat, setEtat] = useState<'brouillon' | 'envoi' | 'cree' | 'erreur' | 'annule'>('brouillon')
  const [lien, setLien] = useState<string | null>(null)
  // l'agent IA arrive après le chargement des membres : on le choisit dès qu'on le connaît
  const [agentPose, setAgentPose] = useState(false)
  if (!agentPose && !assigne && c.assigne && agentLibre && /agent|\bia\b|bot/.test(norm(c.assigne))) { setAssigne(agentLibre.m.user_id); setAgentPose(true) }

  const manque = { titre: !titre.trim(), date: c.objet === 'evenement' && !date, heure: c.objet === 'evenement' && !heure }
  const pret = !manque.titre && !manque.date && !manque.heure
  const I = ICONE[c.objet]

  async function creer() {
    if (!pret || !userId) return
    setEtat('envoi')
    try {
      if (c.objet === 'tache') {
        const due = date ? new Date(`${date}T${heure || '12:00'}`).toISOString() : null
        const description = [c.client && `Client : ${c.client}`, contenu].filter(Boolean).join('\n') || null
        const { data, error } = await createTask(ws.id, userId, { title: titre.trim(), assignee_id: assigne || null, due_date: due, priority: priorite as Task['priority'], description } as never,
          (id, t) => void notifyUser(id, { type: 'task', title: `${me?.full_name ?? 'Quelqu\'un'} t'a confié une tâche`, body: t, url: `/app/${ws.slug}/tasks` }))
        if (error || !data) throw error
        log('task.created', 'task', data.id, { title: data.title }); setLien(`/app/${ws.slug}/tasks?open=${data.id}`)
      } else if (c.objet === 'evenement') {
        const debut = new Date(`${date}T${heure}`), fin = new Date(debut.getTime() + duree * 60_000)
        const tous = [...new Set([userId, ...participants])]
        const description = [externes.length && `Avec : ${externes.join(', ')}`, c.client && `Client : ${c.client}`, contenu].filter(Boolean).join('\n') || null
        const { data, error } = await getDb().from('events').insert({ workspace_id: ws.id, created_by: userId, title: titre.trim(), description, start_at: debut.toISOString(), end_at: fin.toISOString(), all_day: false, location: lieu || null, attendees: tous }).select('id').single()
        if (error || !data) throw error
        log('event.created', 'event', data.id, { title: titre.trim() })
        for (const a of tous) void notifyUser(a, { type: 'event', title: `${me?.full_name ?? 'Quelqu\'un'} t'invite : ${titre.trim()}`, body: format(debut, 'EEEE d MMMM à HH:mm', { locale: fr }), url: `/app/${ws.slug}/calendar` })
        setLien(`/app/${ws.slug}/calendar`)
      } else {
        const { data, error } = await getDb().from('notes').insert({ workspace_id: ws.id, created_by: userId, title: titre.trim(), content: { type: 'doc', content: contenu.split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) } }).select('id').single()
        if (error || !data) throw error
        log('note.created', 'note', data.id, { title: titre.trim() }); setLien(`/app/${ws.slug}/notes/${data.id}`)
      }
      setEtat('cree')
    } catch { setEtat('erreur') }
  }

  if (etat === 'annule') return <p className="text-[13px] text-text-3">Création annulée.</p>
  return (
    <motion.div layout className={cn('overflow-hidden rounded-xl border bg-surface shadow-sm transition-colors', etat === 'cree' ? 'border-success/40' : 'border-border')}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <I className="size-4 text-text-3" strokeWidth={1.75} /><span className="text-[13px] font-semibold">{LIB[c.objet]}</span>
        <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium', etat === 'cree' ? 'bg-success/15 text-success' : etat === 'erreur' ? 'bg-danger/15 text-danger' : pret ? 'bg-info/15 text-info' : 'bg-warning/15 text-warning')}>
          {etat === 'cree' ? 'Créé' : etat === 'erreur' ? 'Erreur' : etat === 'envoi' ? 'Création…' : pret ? 'Prêt' : 'À compléter'}</span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {etat === 'cree' ? (
          <motion.div key="ok" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 px-4 py-4">
            <span className="grid size-8 place-items-center rounded-full bg-success text-white"><Check className="size-4" strokeWidth={3} /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-medium">{titre}</p>
              <p className="text-xs text-text-3">{[date && format(new Date(`${date}T${heure || '12:00'}`), heure ? 'EEEE d MMMM à HH:mm' : 'EEEE d MMMM', { locale: fr }), assigne && c.objet === 'tache' && members.find((m) => m.user_id === assigne) && `pour ${nomDe(members.find((m) => m.user_id === assigne)!)}`].filter(Boolean).join(' · ') || 'Enregistré'}</p></div>
            {lien && <Link href={lien} className="inline-flex items-center gap-1 text-xs text-text-3 hover:text-text">Ouvrir<ArrowUpRight className="size-3.5" /></Link>}
          </motion.div>
        ) : (
          <motion.form key="f" exit={{ opacity: 0 }} onSubmit={(e) => { e.preventDefault(); void creer() }} className="grid gap-3 px-4 py-3 sm:grid-cols-2">
            <Champ label="Titre" manque={manque.titre} large><input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder={c.objet === 'evenement' ? 'Ex. Point avec Adam' : 'Ex. Préparer la démo'} className={entree(manque.titre)} autoFocus={manque.titre} /></Champ>
            {c.objet !== 'note' && <>
              <Champ label="Date" manque={manque.date}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={entree(manque.date)} /></Champ>
              <Champ label={c.objet === 'tache' ? 'Heure (facultatif)' : 'Heure'} manque={manque.heure}><input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={entree(manque.heure)} /></Champ>
            </>}
            {c.objet === 'tache' && <>
              <Champ label="Pour"><select value={assigne} onChange={(e) => setAssigne(e.target.value)} className={entree()}>
                <option value="">Personne</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{nomDe(m)}{m.user_id === userId ? ' (moi)' : ''}{estBot(m.profile) ? (agentLibre?.m.user_id === m.user_id ? ' · agent IA libre' : ' · agent IA') : ''}</option>)}
              </select></Champ>
              <Champ label="Importance"><select value={priorite} onChange={(e) => setPriorite(e.target.value)} className={entree()}>{PRIO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Champ>
              {c.assigne && /agent|\bia\b|bot/.test(norm(c.assigne)) && !agentLibre && <p className="flex items-center gap-1.5 text-xs text-warning sm:col-span-2"><Bot className="size-3.5" />Aucun agent IA dans cet espace : choisis quelqu&apos;un.</p>}
            </>}
            {c.objet === 'evenement' && <>
              <Champ label="Durée"><select value={duree} onChange={(e) => setDuree(Number(e.target.value))} className={entree()}>{[15, 30, 45, 60, 90, 120, 180].map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`.replace('.5', ' h 30').replace(' h h', ' h')}</option>)}</select></Champ>
              <Champ label="Lieu (facultatif)"><input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Visio, bureau…" className={entree()} /></Champ>
              <Champ label="Avec" large>
                <div className="flex flex-wrap gap-1.5">
                  {members.filter((m) => m.user_id !== userId).map((m) => { const on = participants.includes(m.user_id)
                    return <button type="button" key={m.user_id} onClick={() => setParticipants((p) => (on ? p.filter((x) => x !== m.user_id) : [...p, m.user_id]))} className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors', on ? 'border-transparent bg-text text-bg' : 'border-border text-text-2 hover:text-text')}>{nomDe(m)}</button> })}
                  {externes.map((x) => <span key={x} className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-text-2" title="Hors de l'équipe : noté dans la description">{x}</span>)}
                </div>
              </Champ>
            </>}
            {(c.objet === 'note' || contenu) && <Champ label={c.objet === 'note' ? 'Contenu' : 'Détails'} large><textarea value={contenu} onChange={(e) => setContenu(e.target.value)} rows={3} className={cn(entree(), 'h-auto py-2')} /></Champ>}
            <div className="flex items-center gap-2 sm:col-span-2">
              {etat === 'erreur' && <span className="text-xs text-danger">La création a échoué. Réessaie.</span>}
              {!pret && <span className="text-xs text-text-3">Complète ici, ou réponds-moi dans le chat.</span>}
              <button type="button" onClick={() => setEtat('annule')} className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] text-text-3 hover:text-text"><X className="size-3.5" />Annuler</button>
              <button type="submit" disabled={!pret || etat === 'envoi'} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-text px-4 text-[12.5px] font-medium text-bg transition-opacity disabled:opacity-35"><Check className="size-3.5" />{etat === 'envoi' ? 'Création…' : 'Créer'}</button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
