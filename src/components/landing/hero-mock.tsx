'use client'
import { motion } from 'framer-motion'
import { CalendarDays, CheckSquare, FileText, Home, MessageSquare, Search, Video } from 'lucide-react'
import { Avatar } from '@/components/ui/misc'

const rows = [
  { t: 'Finaliser le nouvel onboarding', s: 'En cours', c: '#7681e8', p: '#f06670', who: 'Alex Demo' },
  { t: 'Préparer la démo client', s: 'À faire', c: '#a4a8b1', p: '#e5a53a', who: 'Léa Martin' },
  { t: 'Corriger la synchronisation', s: 'En cours', c: '#7681e8', p: '#f06670', who: 'Karim Benali' },
  { t: 'Maquettes écran profil', s: 'Terminé', c: '#4cc38a', p: '#a4a8b1', who: 'Sophie Dubois' },
  { t: 'Rédiger la page tarifs', s: 'En revue', c: '#e5a53a', p: '#e5a53a', who: 'Léa Martin' },
]

export function HeroMock() {
  const nav = [Home, CheckSquare, FileText, MessageSquare, CalendarDays, Video]
  return (
    <div className="relative mx-auto w-full max-w-5xl [perspective:1800px]">
      <div className="pointer-events-none absolute -inset-x-10 -top-10 h-72 opacity-80 blur-2xl" style={{ background: 'var(--glow)' }} />
      <motion.div initial={{ opacity: 0, y: 40, rotateX: 12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 1, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-lg" style={{ transformOrigin: '50% 0%' }}>
        <div className="flex h-9 items-center gap-1.5 border-b border-border bg-surface-2 px-3.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" /><span className="size-2.5 rounded-full bg-[#febc2e]" /><span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="mx-auto flex h-5 w-56 items-center justify-center rounded-md bg-surface-3 text-[10px] text-text-3">flow.app/app/demo</span>
        </div>
        <div className="grid grid-cols-[52px_1fr] sm:grid-cols-[180px_1fr]">
          <aside className="space-y-1 border-r border-border bg-bg-subtle p-2 sm:p-3">
            <div className="mb-3 hidden items-center gap-2 px-1 text-[13px] font-semibold sm:flex"><span className="size-5 rounded-md bg-accent" /> Flow Demo</div>
            {['Accueil', 'Tâches', 'Notes', 'Messages', 'Calendrier', 'Réunions'].map((n, i) => {
              const Icon = nav[i]
              return (
                <div key={n} className={`flex items-center justify-center gap-2 rounded-md p-2 text-[12px] sm:justify-start sm:px-2 sm:py-1.5 ${i === 1 ? 'bg-surface-3 text-text' : 'text-text-3'}`}>
                  <Icon className="size-4" /><span className="hidden sm:inline">{n}</span>
                </div>
              )
            })}
          </aside>
          <div className="min-w-0 p-3 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><div className="text-[15px] font-semibold">Tâches</div><div className="text-[11px] text-text-3">14 tâches · 3 en cours</div></div>
              <div className="flex items-center gap-2"><div className="hidden h-7 w-36 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 text-[11px] text-text-3 sm:flex"><Search className="size-3" /> Rechercher</div>
                <div className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white">+ Nouvelle</div></div>
            </div>
            <div className="space-y-1.5">
              {rows.map((r, i) => (
                <motion.div key={r.t} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 + i * 0.09, duration: 0.5 }}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/50 px-3 py-2.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: r.p }} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{r.t}</span>
                  <span className="hidden rounded-md px-1.5 py-0.5 text-[10px] font-medium sm:inline" style={{ background: `color-mix(in srgb, ${r.c} 16%, transparent)`, color: r.c }}>{r.s}</span>
                  <Avatar name={r.who} size={20} />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 1.4, duration: 0.6 }}
        className="absolute -bottom-6 right-2 hidden w-64 animate-float rounded-xl border border-border-strong bg-surface p-3 shadow-lg sm:block">
        <div className="flex items-center gap-2 text-[11px] text-text-3"><MessageSquare className="size-3.5 text-accent" /> #general</div>
        <div className="mt-2 flex items-start gap-2"><Avatar name="Léa Martin" size={22} /><div className="rounded-xl rounded-tl-sm bg-surface-2 px-2.5 py-1.5 text-[12px]">Le nouveau design est top 🎉</div></div>
        <div className="mt-2 flex items-center gap-2 pl-7"><div className="flex h-7 flex-1 items-center gap-1.5 rounded-full bg-accent px-2.5">
          {Array.from({ length: 22 }).map((_, i) => <span key={i} className="w-0.5 rounded bg-white/80" style={{ height: 4 + ((i * 7) % 12) }} />)}</div></div>
      </motion.div>
    </div>
  )
}
