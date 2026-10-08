'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { motion } from 'framer-motion'
import { Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { Goal, KeyResult } from '@/lib/types'

const COLORS = ['#6366f1', '#22c55e', '#f97316', '#ec4899', '#0ea5e9', '#a855f7']
const pct = (c: number, t: number) => (t > 0 ? Math.max(0, Math.min(100, Math.round((c / t) * 100))) : 0)

export default function GoalsPage() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { ws, canWrite, log } = useWorkspace()
  const { userId } = useSession()
  const goals = useLive<Goal>('goals', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false] })
  const krs = useLive<KeyResult>('key_results', { eq: { workspace_id: ws.id } })
  const [draft, setDraft] = useState<(Partial<Goal> & { title: string }) | null>(null)
  const [krTitle, setKrTitle] = useState<Record<string, string>>({})

  async function save() {
    if (!draft || !userId || !draft.title.trim()) return
    const row = { title: draft.title.trim(), description: draft.description || null, target: Number(draft.target) || 100, current: Number(draft.current) || 0, unit: draft.unit || '%', color: draft.color ?? COLORS[0], due_date: draft.due_date || null, status: draft.status ?? 'active' }
    if (draft.id) await getDb().from('goals').update(row).eq('id', draft.id)
    else { const { data } = await getDb().from('goals').insert({ ...row, workspace_id: ws.id, created_by: userId }).select().single(); log('goal.created', 'goal', (data as any)?.id, { title: row.title }) }
    setDraft(null); goals.refresh()
  }
  async function bump(g: Goal, current: number) {
    await getDb().from('goals').update({ current, status: current >= g.target ? 'completed' : g.status === 'completed' ? 'active' : g.status }).eq('id', g.id); goals.refresh()
  }
  async function addKr(g: Goal) {
    const title = krTitle[g.id]?.trim(); if (!title) return
    await getDb().from('key_results').insert({ workspace_id: ws.id, goal_id: g.id, title, target: 100, current: 0, unit: '%' })
    setKrTitle((s) => ({ ...s, [g.id]: '' })); krs.refresh()
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <PageHeader title={t('goals.title')} subtitle={`${goals.data.length}`} icon={<Target className="size-[18px]" />} actions={canWrite && <Button variant="primary" onClick={() => setDraft({ title: '', target: 100, current: 0, unit: '%', color: COLORS[0] })}><Plus className="size-4" />{t('goals.new')}</Button>} />
      {goals.data.length === 0 && !goals.loading ? <EmptyState icon={<Target className="size-5" />} title={t('goals.empty')} hint={t('goals.emptyHint')} />
        : <div className="space-y-4">{goals.data.map((g, i) => {
          const p = pct(g.current, g.target)
          const list = krs.data.filter((k) => k.goal_id === g.id)
          return (
            <motion.article key={g.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-[15px] font-semibold">{g.title}</h2>
                  <Badge color={g.status === 'completed' ? 'var(--success)' : undefined}>{t(`goals.status.${g.status}` as any)}</Badge>{g.due_date && <span className="text-xs text-text-3">{format(new Date(g.due_date), 'd MMM yyyy', { locale: dfl })}</span>}</div>
                  {g.description && <p className="mt-1 text-[13px] text-text-2">{g.description}</p>}</div>
                {canWrite && <div className="flex"><Button variant="ghost" size="icon" onClick={() => setDraft(g)} aria-label={t('common.edit')}><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={async () => { await getDb().from('goals').update({ deleted_at: new Date().toISOString() }).eq('id', g.id); goals.refresh() }} aria-label={t('common.delete')}><Trash2 className="size-4" /></Button></div>}
              </div>
              <div className="mt-4 flex items-center gap-3"><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3"><motion.div initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full" style={{ background: g.color ?? 'var(--accent)' }} /></div>
                <span className="w-24 text-right text-xs tabular-nums text-text-2">{g.current}/{g.target} {g.unit} · {p}%</span></div>
              {canWrite && <input type="range" min={0} max={g.target} value={g.current} onChange={(e) => bump(g, Number(e.target.value))} className="mt-3 w-full accent-[var(--accent)]" aria-label={t('goals.current')} />}
              <div className="mt-4 space-y-2"><h3 className="text-xs font-medium uppercase tracking-wide text-text-3">{t('goals.kr')}</h3>
                {list.map((k) => (
                  <div key={k.id} className="flex items-center gap-3 text-[13px]"><span className="min-w-0 flex-1 truncate">{k.title}</span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: `${pct(k.current, k.target)}%` }} /></div>
                    {canWrite ? <input type="number" value={k.current} min={0} max={k.target} onChange={async (e) => { await getDb().from('key_results').update({ current: Number(e.target.value) }).eq('id', k.id); krs.refresh() }} className={cn('h-7 w-16 rounded-md border border-border bg-surface-2 px-1.5 text-right text-xs tabular-nums')} aria-label={k.title} /> : <span className="tabular-nums">{k.current}</span>}</div>))}
                {canWrite && <div className="flex gap-2 pt-1"><Input className="h-8" value={krTitle[g.id] ?? ''} onChange={(e) => setKrTitle((s) => ({ ...s, [g.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addKr(g)} placeholder={t('goals.addKr')} /><Button size="sm" onClick={() => addKr(g)} aria-label={t('goals.addKr')}><Plus className="size-3.5" /></Button></div>}</div>
            </motion.article>)
        })}</div>}
      <Dialog open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? t('goals.edit') : t('goals.new')}
        footer={<><Button onClick={() => setDraft(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={save} disabled={!draft?.title.trim()}>{t('common.save')}</Button></>}>
        {draft && <div className="space-y-4"><Field label={t('common.title')}><Input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <Field label={t('common.description')}><Textarea rows={2} value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3"><Field label={t('goals.target')}><Input type="number" min={1} value={draft.target ?? 100} onChange={(e) => setDraft({ ...draft, target: Number(e.target.value) })} /></Field>
            <Field label={t('goals.current')}><Input type="number" min={0} value={draft.current ?? 0} onChange={(e) => setDraft({ ...draft, current: Number(e.target.value) })} /></Field>
            <Field label={t('goals.unit')}><Input value={draft.unit ?? '%'} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label={t('goals.due')}><Input type="date" value={draft.due_date ?? ''} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></Field>
            <Field label={t('common.status')}><Select value={draft.status ?? 'active'} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{['active', 'paused', 'completed'].map((s) => <option key={s} value={s}>{t(`goals.status.${s}` as any)}</option>)}</Select></Field></div>
          <div className="flex gap-2">{COLORS.map((c) => <button key={c} aria-label={c} onClick={() => setDraft({ ...draft, color: c })} className={cn('size-6 rounded-full ring-offset-2 ring-offset-surface', draft.color === c && 'ring-2 ring-text')} style={{ background: c }} />)}</div></div>}
      </Dialog>
    </div>
  )
}
