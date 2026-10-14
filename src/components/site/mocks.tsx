'use client'
// Aperçus du produit sur le site vitrine (14/10/2026) : de vrais mini-composants utilisables, sans réseau ni données réelles —
// cases à cocher, tâches à glisser entre colonnes, messages qu'on envoie (avec réponse), agenda dont on ouvre les événements…
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, Check, CheckSquare, ChevronRight, Clock, FileText, Hand, Home, MapPin, MessageSquare, Mic, MicOff, Pause, Phone, PhoneOff, Play, Plus, Search, Send, Users, Video, VideoOff, X } from 'lucide-react'
import { Avatar } from '@/components/ui/misc'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'

function useL() {
  const { locale, t } = useI18n()
  return { L: (fr: string, en: string) => (locale === 'fr' ? fr : en), t }
}

export function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('overflow-hidden rounded-xl border border-border-strong bg-surface', className)}>{children}</div>
}
const dot = (c: string) => <span className="size-2 shrink-0 rounded-full" style={{ background: c }} />

export function AppWindow({ children, active = 1, wide }: { children: React.ReactNode; active?: number; wide?: boolean }) {
  const { L } = useL()
  const items = [[Home, L('Accueil', 'Home')], [CheckSquare, L('Tâches', 'Tasks')], [FileText, 'Notes'], [CalendarDays, L('Calendrier', 'Calendar')], [MessageSquare, 'Messages'], [Users, 'CRM']] as const
  return (
    <Frame>
      <div className="flex items-center gap-1.5 border-b border-border bg-bg-subtle px-3 py-2">{['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />)}</div>
      <div className={cn('grid grid-cols-[48px_1fr]', wide && 'sm:grid-cols-[176px_1fr]')}>
        <aside className="space-y-0.5 border-r border-border bg-bg-subtle p-2 sm:p-2.5">
          <div className={cn('mb-2.5 hidden items-center gap-2 px-1.5 text-[13px] font-semibold', wide && 'sm:flex')}><span className="flex size-5 items-center justify-center rounded-md bg-text text-[10px] font-bold text-bg">F</span>Flow</div>
          {items.map(([Icon, label], i) => (
            <div key={label} className={cn('flex items-center justify-center gap-2 rounded-md p-2 text-[12px]', i === active ? 'bg-text/[0.07] font-medium text-text' : 'text-text-3', wide && 'sm:justify-start sm:px-2 sm:py-1.5')}>
              <Icon className="size-4" strokeWidth={1.75} /><span className={cn('hidden', wide && 'sm:inline')}>{label}</span></div>))}
        </aside>
        <div className={cn('min-w-0 p-3', wide ? 'sm:p-5' : 'sm:p-4')}>{children}</div>
      </div>
    </Frame>
  )
}

/* ── Tâches : cocher, glisser entre colonnes, ajouter ── */
type Col = 'todo' | 'in_progress' | 'done'
type Carte = { id: number; titre: string; p: string; qui: string; col: Col }
const NOMS: Record<string, string> = { LM: 'Léa Martin', KB: 'Karim Benali', AD: 'Alex Demo', SD: 'Sophie Dubois' }
export function TasksMock() {
  const { L, t } = useL()
  const [cartes, setCartes] = useState<Carte[]>(() => [
    { id: 1, titre: L('Préparer la démo client', 'Prepare the client demo'), p: 'var(--danger)', qui: 'LM', col: 'todo' },
    { id: 2, titre: L('Rédiger la page tarifs', 'Write the pricing page'), p: 'var(--warning)', qui: 'KB', col: 'todo' },
    { id: 3, titre: L('Finaliser l’onboarding', 'Finish onboarding'), p: 'var(--warning)', qui: 'AD', col: 'in_progress' },
    { id: 4, titre: L('Corriger la synchronisation', 'Fix sync issue'), p: 'var(--danger)', qui: 'KB', col: 'in_progress' },
    { id: 5, titre: L('Choisir l’outil d’emailing', 'Pick the email tool'), p: 'var(--text-3)', qui: 'AD', col: 'done' },
  ])
  const [glisse, setGlisse] = useState<number | null>(null), [survol, setSurvol] = useState<Col | null>(null)
  const [ajout, setAjout] = useState(''), [ouvertAjout, setOuvertAjout] = useState(false)
  const cols: { k: Col; c: string }[] = [{ k: 'todo', c: 'var(--text-2)' }, { k: 'in_progress', c: 'var(--warning)' }, { k: 'done', c: 'var(--success)' }]
  const deplacer = (id: number, col: Col) => setCartes((cs) => cs.map((x) => (x.id === id ? { ...x, col } : x)))
  const suivante: Record<Col, Col> = { todo: 'in_progress', in_progress: 'done', done: 'todo' }
  const ajouter = () => { if (!ajout.trim()) return; setCartes((cs) => [...cs, { id: Date.now(), titre: ajout.trim(), p: 'var(--info)', qui: 'AD', col: 'todo' }]); setAjout(''); setOuvertAjout(false) }
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2"><div className="text-[14px] font-semibold">{t('nav.tasks')}</div>
        <div className="flex items-center gap-2"><span className="hidden h-7 w-32 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 text-[11px] text-text-3 sm:flex"><Search className="size-3" />{t('common.search')}</span>
          <button onClick={() => setOuvertAjout((o) => !o)} className="flex items-center gap-1 rounded-md bg-text px-2.5 py-1 text-[11px] font-medium text-bg transition-opacity hover:opacity-90"><Plus className="size-3" />{t('common.new')}</button></div></div>
      <AnimatePresence>{ouvertAjout && (
        <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} onSubmit={(e) => { e.preventDefault(); ajouter() }} className="mb-2 flex gap-2 overflow-hidden">
          <input autoFocus value={ajout} onChange={(e) => setAjout(e.target.value)} placeholder={L('Nouvelle tâche puis Entrée', 'New task, then Enter')} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2.5 text-[12px] outline-none focus:border-text/30" />
          <button className="rounded-md border border-border px-2.5 text-[11px]">OK</button>
        </motion.form>)}</AnimatePresence>
      <div className="-mx-1 grid auto-cols-[78%] grid-flow-col gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0">
        {cols.map((col) => { const liste = cartes.filter((x) => x.col === col.k)
          return (
            <div key={col.k} onDragOver={(e) => { e.preventDefault(); setSurvol(col.k) }} onDragLeave={() => setSurvol(null)} onDrop={() => { if (glisse !== null) deplacer(glisse, col.k); setGlisse(null); setSurvol(null) }}
              className={cn('min-w-0 rounded-lg border border-border bg-surface-2/60 p-1.5 transition-colors sm:p-2', survol === col.k && 'border-text/30 bg-text/[0.06]')}>
              <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-medium sm:text-[12px]">{dot(col.c)}<span className="truncate">{t(`status.${col.k}`)}</span><span className="text-text-3">{liste.length}</span></div>
              <div className="min-h-10 space-y-1.5">
                <AnimatePresence initial={false}>{liste.map((x) => (
                  <motion.div key={x.id} layout layoutId={`carte-${x.id}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    draggable onDragStart={() => setGlisse(x.id)} onDragEnd={() => setGlisse(null)}
                    className={cn('group cursor-grab rounded-md border border-border bg-surface p-2 shadow-sm active:cursor-grabbing', glisse === x.id && 'opacity-40')}>
                    <div className="flex gap-1.5 text-[11px] leading-snug [overflow-wrap:anywhere] sm:text-[12px]">
                      <button onClick={() => deplacer(x.id, x.col === 'done' ? 'todo' : 'done')} aria-label={L('Terminer', 'Complete')} className={cn('mt-px grid size-3.5 shrink-0 place-items-center rounded-full border transition-colors', x.col === 'done' ? 'border-success bg-success text-white' : 'border-border-strong hover:border-text-3')}>{x.col === 'done' && <Check className="size-2.5" strokeWidth={3} />}</button>
                      <span className={cn('min-w-0', x.col === 'done' && 'text-text-3 line-through')}>{x.titre}</span></div>
                    <div className="mt-2 flex items-center justify-between">{dot(x.p)}
                      <span className="flex items-center gap-1"><button onClick={() => deplacer(x.id, suivante[x.col])} aria-label={L('Colonne suivante', 'Next column')} className="grid size-4 place-items-center rounded text-text-3 opacity-0 transition-opacity hover:bg-text/10 group-hover:opacity-100 max-sm:opacity-100"><ChevronRight className="size-3" /></button><Avatar name={NOMS[x.qui]} size={16} /></span></div>
                  </motion.div>))}</AnimatePresence>
              </div>
            </div>
          ) })}
      </div>
      <p className="mt-2 text-center text-[11px] text-text-3">{L('Essaie : coche, glisse une carte, ajoute une tâche.', 'Try it: tick, drag a card, add a task.')}</p>
    </div>
  )
}

/* ── Messages : envoyer, réponse animée, réactions, note vocale ── */
const WAVE = [30, 55, 40, 70, 90, 60, 35, 50, 80, 65, 45, 75, 55, 30, 60, 85, 50, 40, 70, 55, 35, 45, 65, 30]
type Bulle = { id: number; qui: string; texte?: string; vocal?: boolean; heure: string; moi?: boolean }
const heure = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
export function ChatMock() {
  const { L } = useL()
  const [bulles, setBulles] = useState<Bulle[]>(() => [
    { id: 1, qui: 'Léa Martin', texte: L('Le nouveau parcours est prêt à tester.', 'The new flow is ready to test.'), heure: '10:42' },
    { id: 2, qui: 'Karim Benali', vocal: true, heure: '10:44' },
  ])
  const [reactions, setReactions] = useState<Record<string, number>>({ '👍': 2, '🎉': 1 }), [mes, setMes] = useState<string[]>([])
  const [texte, setTexte] = useState(''), [ecrit, setEcrit] = useState(false), [lecture, setLecture] = useState(0), [joue, setJoue] = useState(false)
  const fin = useRef<HTMLDivElement>(null)
  useEffect(() => { fin.current?.parentElement?.scrollTo({ top: 99999, behavior: 'smooth' }) }, [bulles, ecrit])
  useEffect(() => { if (!joue) return; const t = setInterval(() => setLecture((p) => { if (p >= 1) { setJoue(false); return 0 } return p + 0.05 }), 90); return () => clearInterval(t) }, [joue])
  const reponses = [L('Top, merci ! Je regarde ça tout de suite.', 'Great, thanks! Looking now.'), L('Parfait, on en parle au point de 14 h ?', 'Perfect, shall we discuss at 2pm?'), L('Bien reçu 🙌', 'Got it 🙌')]
  const envoyer = () => {
    if (!texte.trim()) return
    setBulles((b) => [...b, { id: Date.now(), qui: 'Alex Demo', texte: texte.trim(), heure: heure(), moi: true }]); setTexte('')
    setTimeout(() => setEcrit(true), 500)
    setTimeout(() => { setEcrit(false); setBulles((b) => [...b, { id: Date.now() + 1, qui: 'Léa Martin', texte: reponses[b.length % reponses.length], heure: heure() }]) }, 1900)
  }
  const reagir = (e: string) => { const ai = mes.includes(e); setMes((m) => (ai ? m.filter((x) => x !== e) : [...m, e])); setReactions((r) => ({ ...r, [e]: (r[e] ?? 0) + (ai ? -1 : 1) })) }
  return (
    <Frame>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-semibold"><span className="text-text-3">#</span>produit<span className="ml-auto flex items-center gap-1 text-text-3"><Phone className="size-3.5" /><Video className="size-3.5" /></span></div>
      <div className="h-[260px] space-y-3 overflow-y-auto p-4 text-[12.5px]">
        {bulles.map((b, i) => (
          <motion.div key={b.id} initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={cn('flex gap-2', b.moi && 'flex-row-reverse')}>
            {!b.moi && <Avatar name={b.qui} size={24} />}
            <div className={cn('flex max-w-[80%] flex-col', b.moi ? 'items-end' : 'items-start')}>
              {!b.moi && <div className="mb-0.5 px-1 text-[10.5px] text-text-3"><span className="font-medium text-text-2">{b.qui}</span> · {b.heure}</div>}
              {b.vocal ? (
                <div className="flex w-52 max-w-full items-center gap-2 rounded-2xl bg-surface-2 px-2.5 py-1.5 dark:bg-surface-3">
                  <button onClick={() => setJoue((j) => !j)} aria-label={joue ? 'Pause' : 'Lecture'} className="flex size-7 shrink-0 items-center justify-center rounded-full bg-text text-bg">{joue ? <Pause className="size-3 fill-current" /> : <Play className="size-3 translate-x-px fill-current" />}</button>
                  <div className="flex h-6 flex-1 items-center gap-[2px]">{WAVE.map((v, k) => <span key={k} className={cn('w-[2px] flex-1 rounded-full transition-colors', k / WAVE.length < lecture ? 'bg-text' : 'bg-text-3/50')} style={{ height: `${v}%` }} />)}</div>
                  <span className="text-[10px] tabular-nums text-text-3">0:18</span>
                </div>
              ) : <div className={cn('rounded-2xl px-3 py-1.5 leading-relaxed', b.moi ? 'bg-text text-bg' : 'bg-surface-2 dark:bg-surface-3')}>{b.texte}</div>}
              {i === 0 && <div className="relative z-[1] -mt-1.5 ml-2 flex gap-1">{['👍', '🎉', '❤️'].filter((e) => (reactions[e] ?? 0) > 0 || e === '❤️').map((e) => (
                <button key={e} onClick={() => reagir(e)} className={cn('flex h-5 items-center gap-0.5 rounded-full border bg-surface px-1.5 text-[10.5px] shadow-sm transition-transform active:scale-90', mes.includes(e) ? 'border-text/30' : 'border-border')}>{e}{(reactions[e] ?? 0) > 0 && <span className="tabular-nums">{reactions[e]}</span>}</button>))}</div>}
              {b.moi && <div className="mt-0.5 px-1 text-[10px] text-text-3">{L('Lu', 'Read')} {b.heure}</div>}
            </div>
          </motion.div>
        ))}
        <AnimatePresence>{ecrit && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2"><Avatar name="Léa Martin" size={24} /><span className="flex gap-1 rounded-2xl bg-surface-2 px-3 py-2.5 dark:bg-surface-3">{[0, 1, 2].map((k) => <motion.span key={k} className="size-1.5 rounded-full bg-text-3" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: k * 0.15 }} />)}</span></motion.div>}</AnimatePresence>
        <div ref={fin} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); envoyer() }} className="m-3 mt-0 flex items-center gap-2 rounded-xl border border-border-strong bg-surface-2/60 px-3 py-1.5 focus-within:border-text/30">
        <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={L('Écris un message… puis Entrée', 'Write a message… then Enter')} className="min-w-0 flex-1 bg-transparent py-1 text-[12px] outline-none placeholder:text-text-3" />
        <button disabled={!texte.trim()} aria-label={L('Envoyer', 'Send')} className="grid size-7 place-items-center rounded-lg bg-text text-bg transition-opacity disabled:opacity-30"><Send className="size-3.5" /></button>
      </form>
    </Frame>
  )
}

/* ── Agenda : clic sur un événement → détail ── */
export function CalendarMock() {
  const { L } = useL()
  const days = L('lun,mar,mer,jeu,ven', 'Mon,Tue,Wed,Thu,Fri').split(',')
  const ev = [
    { d: 0, t: 20, h: 36, c: '#737373', n: 'Standup', heure: '09:00 – 09:15', lieu: L('Salle Aurore', 'Aurora room'), desc: L('Tour de table de 15 minutes : hier, aujourd’hui, blocages.', '15-minute round: yesterday, today, blockers.'), qui: ['Léa Martin', 'Karim Benali', 'Alex Demo'] },
    { d: 1, t: 70, h: 60, c: '#16a34a', n: 'Sprint review', v: true, heure: '14:00 – 15:00', lieu: 'Visio', desc: L('Démo des fonctionnalités terminées et priorités du prochain sprint.', 'Demo of finished work and next sprint priorities.'), qui: ['Sophie Dubois', 'Alex Demo'] },
    { d: 2, t: 40, h: 90, c: '#ea580c', n: L('Démo client', 'Client demo'), v: true, heure: '10:00 – 11:30', lieu: 'Visio', desc: L('Présentation de la nouvelle version au client Maison Verte.', 'Presenting the new version to Maison Verte.'), qui: ['Léa Martin', 'Alex Demo'] },
    { d: 3, t: 110, h: 44, c: '#db2777', n: L('Revue', 'Review'), heure: '16:00 – 16:45', lieu: L('Bureau', 'Office'), desc: L('Relecture des maquettes du profil.', 'Profile mockups review.'), qui: ['Sophie Dubois'] },
    { d: 4, t: 30, h: 70, c: '#2563eb', n: 'Planning', heure: '09:30 – 10:30', lieu: L('Salle Aurore', 'Aurora room'), desc: L('Planification du sprint 12.', 'Sprint 12 planning.'), qui: ['Karim Benali', 'Alex Demo', 'Léa Martin'] },
  ]
  const [ouvert, setOuvert] = useState<number | null>(2), [jour, setJour] = useState(2)
  const e = ouvert !== null ? ev[ouvert] : null
  return (
    <AppWindow active={3}>
      <div className="mb-3 flex items-center justify-between"><div className="text-[14px] font-semibold">{L('Octobre 2026', 'October 2026')}</div><div className="flex gap-1 text-[11px]"><span className="rounded-md bg-text/[0.07] px-2 py-1">{L('Semaine', 'Week')}</span></div></div>
      <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] uppercase text-text-3">{days.map((d, i) => <button key={d} onClick={() => setJour(i)}>{d}<div className={cn('mx-auto mt-0.5 flex size-5 items-center justify-center rounded-full text-[11px] normal-case tabular-nums transition-colors', i === jour ? 'bg-text text-bg' : 'text-text hover:bg-text/10')}>{6 + i}</div></button>)}</div>
      <div className="relative mt-2 grid h-44 grid-cols-5 gap-1.5 border-t border-border pt-2">
        {days.map((d, i) => <div key={d} className={cn('relative border-l border-border/60 transition-colors', i === jour && 'bg-text/[0.03]')}>{ev.map((x, k) => x.d === i && (
          <button key={x.n} onClick={() => setOuvert(k)} className={cn('absolute inset-x-0.5 overflow-hidden rounded-md border-l-2 px-1 py-0.5 text-left text-[9.5px] font-medium leading-tight transition-transform hover:scale-[1.03] sm:text-[10.5px]', ouvert === k && 'ring-1 ring-text/40')}
            style={{ top: x.t, height: x.h, background: `color-mix(in srgb, ${x.c} 20%, var(--surface))`, borderColor: x.c }}>
            <span className="flex items-center gap-0.5">{x.v && <Video className="size-2.5 shrink-0" />}<span className="truncate">{x.n}</span></span></button>))}</div>)}
      </div>
      <AnimatePresence mode="wait">{e && (
        <motion.div key={e.n} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className="relative mt-3 rounded-lg border border-border bg-surface-2/60 p-3 text-[12px]">
          <button onClick={() => setOuvert(null)} aria-label="Fermer" className="absolute right-2 top-2 text-text-3 hover:text-text"><X className="size-3.5" /></button>
          <div className="flex items-center gap-2 font-semibold"><span className="size-2 rounded-full" style={{ background: e.c }} />{e.n}</div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-3"><span className="flex items-center gap-1"><Clock className="size-3" />{e.heure}</span><span className="flex items-center gap-1"><MapPin className="size-3" />{e.lieu}</span></div>
          <p className="mt-2 text-text-2">{e.desc}</p>
          <div className="mt-2 flex -space-x-1.5">{e.qui.map((q) => <Avatar key={q} name={q} size={20} />)}</div>
        </motion.div>)}</AnimatePresence>
    </AppWindow>
  )
}

/* ── Notes : cases cochables ── */
export function NotesMock() {
  const { L } = useL()
  const [actions, setActions] = useState(() => [[L('Envoyer le compte rendu', 'Send the minutes'), true], [L('Réserver la salle', 'Book the room'), false], [L('Valider le planning', 'Confirm the schedule'), false]] as [string, boolean][])
  return (
    <AppWindow active={2}>
      <div className="mb-1 flex items-center gap-2"><span className="text-xl">📌</span><span className="text-[17px] font-semibold tracking-tight">{L('Réunion de lancement', 'Launch meeting')}</span></div>
      <div className="mb-3 flex gap-1.5 text-[10px]"><span className="rounded bg-text/[0.07] px-1.5 py-0.5 text-text-2">projet</span><span className="rounded bg-text/[0.07] px-1.5 py-0.5 text-text-2">{L('réunion', 'meeting')}</span></div>
      <div className="mb-2 text-[14px] font-semibold">{L('Décisions', 'Decisions')}</div>
      <ul className="mb-3 list-disc space-y-1 pl-5 text-[12px] text-text-2"><li>{L('Lancement public le 15', 'Public launch on the 15th')}</li><li>{L('Budget marketing validé', 'Marketing budget approved')}</li></ul>
      <div className="mb-2 flex items-center justify-between text-[14px] font-semibold">{L('Actions', 'Actions')}<span className="text-[11px] font-normal text-text-3">{actions.filter((a) => a[1]).length}/{actions.length}</span></div>
      <div className="space-y-1.5 text-[12px]">{actions.map(([t, c], i) => (
        <button key={t} onClick={() => setActions((a) => a.map((x, k) => (k === i ? [x[0], !x[1]] : x)))} className="flex w-full items-center gap-2 text-left">
          <span className={cn('flex size-3.5 items-center justify-center rounded-[4px] border transition-colors', c ? 'border-text bg-text text-bg' : 'border-border-strong')}>{c && <Check className="size-2.5" strokeWidth={3} />}</span><span className={cn('transition-colors', c && 'text-text-3 line-through')}>{t}</span></button>))}</div>
    </AppWindow>
  )
}

/* ── CRM : affaires déplaçables, totaux recalculés ── */
export function CrmMock() {
  const { L, t } = useL()
  const etapes = [t('crm.stage.qualification'), t('crm.stage.proposition'), t('crm.stage.négociation')]
  const [deals, setDeals] = useState(() => [{ id: 1, n: L('Pack équipe', 'Team pack'), v: 2400, e: 0 }, { id: 2, n: L('Projet Studio Onde', 'Studio Onde project'), v: 7500, e: 1 }, { id: 3, n: L('Déploiement BrightLabs', 'BrightLabs rollout'), v: 12000, e: 2 }, { id: 4, n: L('Licence annuelle', 'Annual licence'), v: 3600, e: 2 }])
  const [glisse, setGlisse] = useState<number | null>(null)
  const eur = (n: number) => `${n.toLocaleString('fr-FR')} €`
  const total = deals.reduce((a, d) => a + d.v, 0), pondere = deals.reduce((a, d) => a + d.v * [0.25, 0.5, 0.75][d.e], 0)
  return (
    <AppWindow active={5}>
      <div className="mb-3 grid grid-cols-3 gap-2">{[[L('Pipeline', 'Pipeline'), eur(total)], [L('Pondéré', 'Weighted'), eur(Math.round(pondere))], [t('crm.won'), '8 400 €']].map(([k, v]) => (
        <div key={k} className="rounded-lg border border-border p-2"><div className="text-[10px] text-text-3">{k}</div><motion.div key={v} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="text-[13px] font-semibold tabular-nums">{v}</motion.div></div>))}</div>
      <div className="grid grid-cols-3 gap-2">{etapes.map((name, e) => (
        <div key={name} onDragOver={(ev) => ev.preventDefault()} onDrop={() => { if (glisse !== null) setDeals((ds) => ds.map((d) => (d.id === glisse ? { ...d, e } : d))); setGlisse(null) }} className="min-w-0 rounded-lg border border-border bg-surface-2/60 p-1.5"><div className="mb-1.5 truncate px-1 text-[10.5px] font-medium">{name}</div>
          <div className="min-h-10 space-y-1.5">{deals.filter((d) => d.e === e).map((d) => (
            <motion.div layout key={d.id} draggable onDragStart={() => setGlisse(d.id)} onClick={() => setDeals((ds) => ds.map((x) => (x.id === d.id ? { ...x, e: (x.e + 1) % 3 } : x)))}
              className="cursor-grab rounded-md border border-border bg-surface p-1.5 text-[10.5px] shadow-sm active:cursor-grabbing"><div className="truncate">{d.n}</div><div className="mt-1 font-semibold tabular-nums">{eur(d.v)}</div></motion.div>))}</div></div>))}</div>
    </AppWindow>
  )
}

/* ── Appel : micro et caméra ── */
export function CallMock() {
  const { L } = useL()
  const [micro, setMicro] = useState(true), [cam, setCam] = useState(true), [main, setMain] = useState(false)
  const tiles = [['Léa Martin', false], ['Karim Benali', true], ['Alex Demo', main], ['Sophie Dubois', false]] as const
  return (
    <Frame>
      <div className="grid grid-cols-2 gap-1.5 bg-bg-subtle p-1.5">{tiles.map(([n, hand]) => (
        <div key={n} className="relative flex aspect-video items-center justify-center rounded-lg bg-surface-2"><Avatar name={n} size={36} />
          <span className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[10px] font-medium text-text-2">{n === 'Alex Demo' && !micro && <MicOff className="size-3 text-danger" />}{n}</span>
          {n === 'Alex Demo' && !cam && <span className="absolute right-1.5 top-1.5 text-text-3"><VideoOff className="size-3.5" /></span>}
          {hand && <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-warning text-black"><Hand className="size-3" /></span>}</div>))}</div>
      <div className="flex items-center justify-center gap-2 border-t border-border py-2.5">
        <button onClick={() => setMicro((m) => !m)} aria-label={L('Micro', 'Microphone')} className={cn('flex size-8 items-center justify-center rounded-full transition-colors', micro ? 'bg-surface-3' : 'bg-danger/15 text-danger')}>{micro ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}</button>
        <button onClick={() => setCam((c) => !c)} aria-label={L('Caméra', 'Camera')} className={cn('flex size-8 items-center justify-center rounded-full transition-colors', cam ? 'bg-surface-3' : 'bg-danger/15 text-danger')}>{cam ? <Video className="size-3.5" /> : <VideoOff className="size-3.5" />}</button>
        <button onClick={() => setMain((h) => !h)} aria-label={L('Lever la main', 'Raise hand')} className={cn('flex size-8 items-center justify-center rounded-full transition-colors', main ? 'bg-warning text-black' : 'bg-surface-3')}><Hand className="size-3.5" /></button>
        <span className="flex size-8 items-center justify-center rounded-full bg-danger-bg text-white"><PhoneOff className="size-3.5" /></span>
      </div>
    </Frame>
  )
}
