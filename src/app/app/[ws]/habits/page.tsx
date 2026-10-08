'use client'
import { HubTabs } from '@/components/shell/hub-tabs'
import { useState } from 'react'
import { addDays, format, startOfDay } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { Check, Flame, Plus, Repeat, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { Habit } from '@/lib/types'

const COLORS = ['#6366f1', '#22c55e', '#f97316', '#ec4899', '#0ea5e9', '#a855f7']
type Log = { id: string; habit_id: string; day: string }
const key = (d: Date) => format(d, 'yyyy-MM-dd')

export default function HabitsPage() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { ws } = useWorkspace()
  const { userId } = useSession()
  const habits = useLive<Habit>('habits', { eq: { workspace_id: ws.id, user_id: userId ?? undefined }, is: { deleted_at: null }, order: ['created_at', true], enabled: !!userId })
  const logs = useLive<Log>('habit_logs', { eq: { workspace_id: ws.id } })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [per, setPer] = useState(7)
  const [color, setColor] = useState(COLORS[0])
  const days = Array.from({ length: 7 }, (_, i) => startOfDay(addDays(new Date(), i - 6)))

  async function toggle(h: Habit, d: Date) {
    const existing = logs.data.find((l) => l.habit_id === h.id && l.day === key(d))
    if (existing) { logs.setData((x) => x.filter((l) => l.id !== existing.id)); await getDb().from('habit_logs').delete().eq('id', existing.id) }
    else { logs.setData((x) => [...x, { id: `tmp-${Math.random()}`, habit_id: h.id, day: key(d) }]); await getDb().from('habit_logs').insert({ habit_id: h.id, workspace_id: ws.id, day: key(d) }) }
    logs.refresh()
  }
  const streak = (h: Habit) => { let n = 0; for (let i = 0; i < 365; i++) { const d = key(addDays(startOfDay(new Date()), -i)); if (logs.data.some((l) => l.habit_id === h.id && l.day === d)) n++; else if (i > 0) break; else continue } return n }
  async function create() {
    if (!name.trim() || !userId) return
    await getDb().from('habits').insert({ workspace_id: ws.id, user_id: userId, name: name.trim(), color, target_per_week: per })
    setOpen(false); setName(''); habits.refresh()
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <HubTabs hub="focus" />
      <PageHeader title={t('habits.title')} icon={<Repeat className="size-[18px]" />} actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" />{t('habits.new')}</Button>} />
      {habits.data.length === 0 && !habits.loading ? <EmptyState icon={<Repeat className="size-5" />} title={t('habits.empty')} hint={t('habits.emptyHint')} />
        : <div className="space-y-3">
          <div className="hidden grid-cols-[1fr_repeat(7,40px)_36px] items-end gap-1 px-4 text-center text-[11px] uppercase text-text-3 sm:grid"><span />{days.map((d) => <span key={d.toISOString()}>{format(d, 'EEE', { locale: dfl })}</span>)}<span /></div>
          {habits.data.map((h) => {
            const done = days.filter((d) => logs.data.some((l) => l.habit_id === h.id && l.day === key(d))).length
            return (
              <div key={h.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="grid items-center gap-3 sm:grid-cols-[1fr_repeat(7,40px)_36px] sm:gap-1">
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: h.color ?? COLORS[0] }} /><span className="truncate text-sm font-medium">{h.name}</span></div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-text-3"><span>{done}/{h.target_per_week}</span><span className="flex items-center gap-1"><Flame className="size-3 text-warning" />{t('habits.streak', { n: streak(h) })}</span></div></div>
                  <div className="flex justify-between gap-1 sm:contents">{days.map((d) => {
                    const on = logs.data.some((l) => l.habit_id === h.id && l.day === key(d))
                    return <button key={d.toISOString()} onClick={() => toggle(h, d)} aria-pressed={on} aria-label={`${h.name} ${format(d, 'PP', { locale: dfl })}`}
                      className={cn('mx-auto flex size-9 items-center justify-center rounded-xl border transition-all active:scale-90', on ? 'border-transparent text-white' : 'border-border text-transparent hover:border-border-strong hover:text-text-3')} style={on ? { background: h.color ?? COLORS[0] } : undefined}><Check className="size-4" /></button>
                  })}</div>
                  <button onClick={async () => { await getDb().from('habits').update({ deleted_at: new Date().toISOString() }).eq('id', h.id); habits.refresh() }} className="hidden text-text-3 hover:text-danger sm:block" aria-label={t('common.delete')}><Trash2 className="mx-auto size-4" /></button>
                </div>
              </div>)
          })}</div>}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('habits.new')} size="sm" footer={<><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" onClick={create} disabled={!name.trim()}>{t('common.create')}</Button></>}>
        <div className="space-y-4"><Field label={t('habits.name')}><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} /></Field>
          <Field label={t('habits.perWeek', { n: per })}><input type="range" min={1} max={7} value={per} onChange={(e) => setPer(Number(e.target.value))} className="w-full accent-[var(--accent)]" /></Field>
          <div className="flex gap-2">{COLORS.map((c) => <button key={c} aria-label={c} onClick={() => setColor(c)} className={cn('size-6 rounded-full ring-offset-2 ring-offset-surface', color === c && 'ring-2 ring-text')} style={{ background: c }} />)}</div></div>
      </Dialog>
    </div>
  )
}
