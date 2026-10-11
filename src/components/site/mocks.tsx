'use client'
import { CalendarDays, CheckSquare, FileText, Hand, Home, MessageSquare, Mic, Phone, Play, Search, Users, Video } from 'lucide-react'
import { Avatar } from '@/components/ui/misc'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'

/** Product mock-ups built from the real design tokens. Static: no data, no network. */
function useL() {
  const { locale, t } = useI18n()
  return { L: (fr: string, en: string) => (locale === 'fr' ? fr : en), t }
}

export function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('overflow-hidden rounded-lg border border-border-strong bg-surface', className)}>{children}</div>
}

const dot = (c: string) => <span className="size-2 shrink-0 rounded-full" style={{ background: c }} />

export function AppWindow({ children, active = 1, wide }: { children: React.ReactNode; active?: number; wide?: boolean }) {
  const { L } = useL()
  const items = [[Home, L('Accueil', 'Home')], [CheckSquare, L('Tâches', 'Tasks')], [FileText, 'Notes'], [CalendarDays, L('Calendrier', 'Calendar')], [MessageSquare, 'Messages'], [Users, 'CRM']] as const
  return (
    <Frame>
      <div className={cn('grid grid-cols-[48px_1fr]', wide && 'sm:grid-cols-[176px_1fr]')}>
        <aside className="space-y-0.5 border-r border-border bg-bg-subtle p-2 sm:p-2.5">
          <div className={cn('mb-2.5 hidden items-center gap-2 px-1.5 text-[13px] font-semibold', wide && 'sm:flex')}><span className="flex size-5 items-center justify-center rounded-md bg-accent text-[10px] font-bold text-white">F</span>Flow</div>
          {items.map(([Icon, label], i) => (
            <div key={label} className={cn('flex items-center justify-center gap-2 rounded-md p-2 text-[12px]', i === active ? 'bg-surface-3 font-medium text-text' : 'text-text-3', wide && 'sm:justify-start sm:px-2 sm:py-1.5')}>
              <Icon className={cn('size-4', i === active && 'text-accent-ink')} /><span className={cn('hidden', wide && 'sm:inline')}>{label}</span></div>))}
        </aside>
        <div className={cn('min-w-0 p-3', wide ? 'sm:p-5' : 'sm:p-4')}>{children}</div>
      </div>
    </Frame>
  )
}

export function TasksMock() {
  const { L, t } = useL()
  const cols = [
    { k: 'todo' as const, c: 'var(--text-2)', cards: [[L('Préparer la démo client', 'Prepare the client demo'), 'var(--danger)', 'LM'], [L('Rédiger la page tarifs', 'Write the pricing page'), 'var(--warning)', 'KB']] },
    { k: 'in_progress' as const, c: 'var(--warning)', cards: [[L('Finaliser l’onboarding', 'Finish onboarding'), 'var(--warning)', 'AD'], [L('Corriger la synchronisation', 'Fix sync issue'), 'var(--danger)', 'KB'], [L('Maquettes mobile', 'Mobile mockups'), 'var(--info)', 'SD']] },
    { k: 'done' as const, c: 'var(--success)', cards: [[L('Choisir l’outil d’emailing', 'Pick the email tool'), 'var(--text-3)', 'AD']] },
  ]
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><div className="text-[14px] font-semibold">{t('nav.tasks')}</div>
        <div className="flex items-center gap-2"><span className="hidden h-7 w-32 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 text-[11px] text-text-3 sm:flex"><Search className="size-3" />{t('common.search')}</span>
          <span className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white">+ {t('common.new')}</span></div></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {cols.map((col) => (
          <div key={col.k} className="min-w-0 rounded-lg [&:nth-child(3)]:hidden sm:[&:nth-child(3)]:block border border-border bg-surface-2/60 p-1.5 sm:p-2">
            <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-medium sm:text-[12px]">{dot(col.c)}<span className="truncate">{t(`status.${col.k}`)}</span><span className="text-text-3">{col.cards.length}</span></div>
            <div className="space-y-1.5">{col.cards.map(([title, p, who]) => (
              <div key={title} className="rounded-md border border-border bg-surface p-2 shadow-sm"><div className="flex gap-1.5 text-[11px] leading-snug [overflow-wrap:anywhere] sm:text-[12px]">{dot(p)}<span className="min-w-0">{title}</span></div>
                <div className="mt-2 flex justify-end"><Avatar name={{ LM: 'Léa Martin', KB: 'Karim Benali', AD: 'Alex Demo', SD: 'Sophie Dubois' }[who]} size={16} /></div></div>))}</div>
          </div>))}
      </div>
    </div>
  )
}

const WAVE = [30, 55, 40, 70, 90, 60, 35, 50, 80, 65, 45, 75, 55, 30, 60, 85, 50, 40, 70, 55, 35, 45, 65, 30]
export function ChatMock() {
  const { L } = useL()
  return (
    <Frame>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-semibold"><span className="text-text-3">#</span>produit<span className="ml-auto flex items-center gap-1 text-text-3"><Phone className="size-3.5" /><Video className="size-3.5" /></span></div>
      <div className="space-y-3 p-4 text-[12.5px]">
        <div className="flex gap-2.5"><Avatar name="Léa Martin" size={26} /><div><div className="text-[11px] font-semibold">Léa Martin <span className="font-normal text-text-3">10:42</span></div><div className="mt-0.5 text-text-2">{L('Le nouveau parcours est prêt à tester.', 'The new flow is ready to test.')}</div>
          <div className="mt-1 flex gap-1"><span className="rounded-full border border-accent bg-accent-soft px-1.5 text-[11px] text-accent-ink">👍 2</span><span className="rounded-full border border-border px-1.5 text-[11px]">🎉 1</span></div></div></div>
        <div className="flex gap-2.5"><Avatar name="Karim Benali" size={26} /><div className="min-w-0"><div className="text-[11px] font-semibold">Karim Benali <span className="font-normal text-text-3">10:44</span></div>
          <div className="mt-1 flex w-52 max-w-full items-center gap-2 rounded-2xl bg-surface-2 px-2.5 py-1.5"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-white"><Play className="size-3 translate-x-px fill-current" /></span>
            <div className="flex h-6 flex-1 items-center gap-[2px]">{WAVE.map((v, i) => <span key={i} className={cn('w-[2px] flex-1 rounded-full', i < 9 ? 'bg-accent' : 'bg-text-3/50')} style={{ height: `${v}%` }} />)}</div><span className="text-[10px] tabular-nums text-text-3">0:18</span></div></div></div>
        <div className="flex gap-2.5"><Avatar name="Sophie Dubois" size={26} /><div><div className="text-[11px] font-semibold">Sophie Dubois <span className="font-normal text-text-3">10:51</span></div>
          <div className="mt-1 flex w-60 max-w-full items-center gap-2.5 rounded-xl border border-border px-3 py-2"><span className="flex size-7 items-center justify-center rounded-full bg-success/15 text-success"><Video className="size-3.5" /></span><span className="flex-1 text-[11.5px]">{L('Appel vidéo lancé', 'Video call started')}</span><span className="rounded-md bg-accent px-2 py-1 text-[10px] font-semibold text-white">{L('Rejoindre', 'Join')}</span></div></div></div>
      </div>
      <div className="m-3 mt-0 flex items-center gap-2 rounded-xl border border-border-strong bg-surface-2/60 px-3 py-2 text-[12px] text-text-3">{L('Message dans #produit', 'Message #produit')}<Mic className="ml-auto size-4" /></div>
    </Frame>
  )
}

export function CalendarMock() {
  const { L } = useL()
  const days = L('lun,mar,mer,jeu,ven', 'Mon,Tue,Wed,Thu,Fri').split(',')
  const ev = [{ d: 0, t: 20, h: 36, c: '#6366f1', n: 'Standup' }, { d: 1, t: 70, h: 60, c: '#22c55e', n: 'Sprint review', v: true }, { d: 2, t: 40, h: 90, c: '#f97316', n: L('Démo client', 'Client demo'), v: true }, { d: 3, t: 110, h: 44, c: '#ec4899', n: L('Revue', 'Review') }, { d: 4, t: 30, h: 70, c: '#0ea5e9', n: 'Planning' }]
  return (
    <AppWindow active={3}>
      <div className="mb-3 flex items-center justify-between"><div className="text-[14px] font-semibold">{L('Octobre 2026', 'October 2026')}</div><div className="flex gap-1 text-[11px]"><span className="rounded-md bg-surface-3 px-2 py-1">{L('Semaine', 'Week')}</span></div></div>
      <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] uppercase text-text-3">{days.map((d, i) => <div key={d}>{d}<div className={cn('mx-auto mt-0.5 flex size-5 items-center justify-center rounded-full text-[11px] normal-case tabular-nums', i === 2 ? 'bg-accent text-white' : 'text-text')}>{6 + i}</div></div>)}</div>
      <div className="relative mt-2 grid h-44 grid-cols-5 gap-1.5 border-t border-border pt-2">
        {days.map((d, i) => <div key={d} className="relative border-l border-border/60">{ev.filter((e) => e.d === i).map((e) => (
          <div key={e.n} className="absolute inset-x-0.5 overflow-hidden rounded-md border-l-2 px-1 py-0.5 text-[9.5px] font-medium leading-tight sm:text-[10.5px]" style={{ top: e.t, height: e.h, background: `color-mix(in srgb, ${e.c} 22%, var(--surface))`, borderColor: e.c }}>
            <span className="flex items-center gap-0.5">{e.v && <Video className="size-2.5 shrink-0" />}<span className="truncate">{e.n}</span></span></div>))}</div>)}
      </div>
    </AppWindow>
  )
}

export function NotesMock() {
  const { L } = useL()
  return (
    <AppWindow active={2}>
      <div className="mb-1 flex items-center gap-2"><span className="text-xl">📌</span><span className="text-[17px] font-semibold tracking-tight">{L('Réunion de lancement', 'Launch meeting')}</span></div>
      <div className="mb-3 flex gap-1.5 text-[10px]"><span className="rounded bg-surface-3 px-1.5 py-0.5 text-text-2">projet</span><span className="rounded bg-surface-3 px-1.5 py-0.5 text-text-2">{L('réunion', 'meeting')}</span></div>
      <div className="mb-2 text-[14px] font-semibold">{L('Décisions', 'Decisions')}</div>
      <ul className="mb-3 list-disc space-y-1 pl-5 text-[12px] text-text-2"><li>{L('Lancement public le 15', 'Public launch on the 15th')}</li><li>{L('Budget marketing validé', 'Marketing budget approved')}</li></ul>
      <div className="mb-2 text-[14px] font-semibold">{L('Actions', 'Actions')}</div>
      <div className="space-y-1.5 text-[12px]">{[[L('Envoyer le compte rendu', 'Send the minutes'), true], [L('Réserver la salle', 'Book the room'), false], [L('Valider le planning', 'Confirm the schedule'), false]].map(([t, c]) => (
        <div key={String(t)} className="flex items-center gap-2"><span className={cn('flex size-3.5 items-center justify-center rounded-[4px] border text-[9px]', c ? 'border-accent bg-accent text-white' : 'border-border-strong')}>{c ? '✓' : ''}</span><span className={c ? 'text-text-3 line-through' : ''}>{String(t)}</span></div>))}</div>
    </AppWindow>
  )
}

export function CrmMock() {
  const { L, t } = useL()
  const cols = [[t('crm.stage.qualification'), [[L('Pack équipe', 'Team pack'), '2 400 €']]], [t('crm.stage.proposition'), [[L('Projet Studio Onde', 'Studio Onde project'), '7 500 €']]], [t('crm.stage.négociation'), [[L('Déploiement BrightLabs', 'BrightLabs rollout'), '12 000 €'], [L('Licence annuelle', 'Annual licence'), '3 600 €']]]] as const
  return (
    <AppWindow active={5}>
      <div className="mb-3 grid grid-cols-3 gap-2">{[[L('Pipeline', 'Pipeline'), '25 500 €'], [L('Pondéré', 'Weighted'), '14 180 €'], [t('crm.won'), '8 400 €']].map(([k, v]) => <div key={k} className="rounded-lg border border-border p-2"><div className="text-[10px] text-text-3">{k}</div><div className="text-[13px] font-semibold tabular-nums sm:text-[15px]">{v}</div></div>)}</div>
      <div className="grid grid-cols-3 gap-2">{cols.map(([name, deals]) => (
        <div key={name} className="min-w-0 rounded-lg border border-border bg-surface-2/60 p-1.5"><div className="mb-1.5 truncate px-1 text-[10.5px] font-medium">{name}</div>
          <div className="space-y-1.5">{deals.map(([n, v]) => <div key={n} className="rounded-md border border-border bg-surface p-1.5 text-[10.5px] shadow-sm"><div className="truncate">{n}</div><div className="mt-1 font-semibold tabular-nums">{v}</div></div>)}</div></div>))}</div>
    </AppWindow>
  )
}

export function CallMock() {
  const { L } = useL()
  const tiles = [['Léa Martin', false], ['Karim Benali', true], ['Alex Demo', false], ['Sophie Dubois', false]] as const
  return (
    <Frame>
      <div className="grid grid-cols-2 gap-1.5 bg-bg-subtle p-1.5">{tiles.map(([n, hand]) => (
        <div key={n} className="relative flex aspect-video items-center justify-center rounded-lg bg-surface-2"><Avatar name={n} size={36} />
          <span className="absolute bottom-1.5 left-2 text-[10px] font-medium text-text-2">{n}</span>{hand && <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-warning text-black"><Hand className="size-3" /></span>}</div>))}</div>
      <div className="flex items-center justify-center gap-2 border-t border-border py-2.5">{[Mic, Video].map((I, i) => <span key={i} className="flex size-7 items-center justify-center rounded-full bg-surface-3"><I className="size-3.5" /></span>)}<span className="flex size-7 items-center justify-center rounded-full bg-danger-bg text-white"><Phone className="size-3.5 rotate-[135deg]" /></span></div>
      <span className="sr-only">{L('Appel vidéo', 'Video call')}</span>
    </Frame>
  )
}
