'use client'
import { useMemo, useState } from 'react'
import { Bug, Lightbulb, MessageCircleQuestion, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { PriorityIcon, STATUSES } from '@/components/common/task-ui'
import { TaskPanel, createTask } from '@/components/tasks/task-panel'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { buildDescription, buildTags, FB_SOURCES, FB_TAG, FB_TYPES, parseDescription, sourceOf, typeOf, type FbSource, type FbType } from '@/lib/feedback'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { Priority, Task, TaskStatus } from '@/lib/types'

const ICON: Record<FbType, typeof Bug> = { bug: Bug, idea: Lightbulb, question: MessageCircleQuestion }
const COLOR: Record<FbType, string> = { bug: 'var(--danger)', idea: 'var(--info)', question: 'var(--warning)' }
type Draft = { type: FbType; title: string; screen: string; version: string; device: string; steps: string; source: FbSource | ''; priority: Priority }
const EMPTY: Draft = { type: 'bug', title: '', screen: '', version: '', device: '', steps: '', source: 'testflight', priority: 'medium' }

/** Intake and triage for tester / user feedback. Every item is a normal task (tag "retour"), so it flows into projects, boards and release notes. */
export default function FeedbackPage() {
  const { t } = useI18n()
  const { ws, canWrite, log } = useWorkspace()
  const { userId } = useSession()
  const all = useLive<Task>('tasks', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false] })
  const items = useMemo(() => all.data.filter((x) => x.tags?.includes(FB_TAG)), [all.data])
  const [q, setQ] = useState('')
  const [type, setType] = useState<FbType | 'all'>('all')
  const [version, setVersion] = useState('all')
  const [scope, setScope] = useState<'open' | 'all'>('open')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const versions = useMemo(() => Array.from(new Set(items.map((x) => parseDescription(x.description).version).filter(Boolean))).sort().reverse(), [items])
  const shown = items.filter((x) => {
    const f = parseDescription(x.description)
    if (scope === 'open' && ['done', 'cancelled'].includes(x.status)) return false
    if (type !== 'all' && typeOf(x.tags) !== type) return false
    if (version !== 'all' && f.version !== version) return false
    const s = q.trim().toLowerCase()
    return !s || x.title.toLowerCase().includes(s) || f.steps.toLowerCase().includes(s) || f.screen.toLowerCase().includes(s)
  })
  const open = items.filter((x) => !['done', 'cancelled'].includes(x.status))
  const blocking = open.filter((x) => typeOf(x.tags) === 'bug' && ['urgent', 'high'].includes(x.priority))

  async function save() {
    if (!draft || !userId || !draft.title.trim()) return
    const { error } = await createTask(ws.id, userId, {
      title: draft.title.trim(), priority: draft.priority, status: 'backlog',
      description: buildDescription({ screen: draft.screen, version: draft.version, device: draft.device, steps: draft.steps }),
      tags: buildTags(draft.type, draft.source || null),
    })
    if (error) { toast.error(t('common.error')); return }
    log('task.created', 'task', null, { title: draft.title.trim() })
    setDraft(null); all.refresh(); toast.success(t('fb.saved'))
  }
  async function setStatus(x: Task, status: TaskStatus) {
    await getDb().from('tasks').update({ status, completed_at: status === 'done' ? new Date().toISOString() : null }).eq('id', x.id)
    all.refresh()
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <HubTabs hub="product" />
      <PageHeader title={t('fb.title')} subtitle={t('fb.sub')} icon={<Bug className="size-[18px]" />} actions={canWrite && <Button variant="primary" onClick={() => setDraft({ ...EMPTY })}><Plus className="size-4" />{t('fb.new')}</Button>} />

      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        {[[t('fb.stat.open'), open.length, ''], [t('fb.stat.blocking'), blocking.length, blocking.length ? 'text-danger' : ''], [t('fb.stat.ideas'), open.filter((x) => typeOf(x.tags) === 'idea').length, '']].map(([k, v, c]) => (
          <div key={String(k)} className="rounded-xl border border-border bg-surface p-3.5"><div className="text-xs text-text-3">{k}</div><div className={cn('mt-1 text-2xl font-semibold tabular-nums', c as string)}>{v}</div></div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" /><Input aria-label={t('common.search')} className="pl-9" placeholder={t('fb.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label={t('fb.type')} className="w-auto" value={type} onChange={(e) => setType(e.target.value as FbType | 'all')}><option value="all">{t('fb.allTypes')}</option>{FB_TYPES.map((x) => <option key={x} value={x}>{t(`fb.type.${x}`)}</option>)}</Select>
        <Select aria-label={t('fb.version')} className="w-auto" value={version} onChange={(e) => setVersion(e.target.value)}><option value="all">{t('fb.allVersions')}</option>{versions.map((v) => <option key={v} value={v}>{v}</option>)}</Select>
        <Select aria-label={t('common.status')} className="w-auto" value={scope} onChange={(e) => setScope(e.target.value as 'open' | 'all')}><option value="open">{t('fb.scope.open')}</option><option value="all">{t('fb.scope.all')}</option></Select>
      </div>

      {shown.length === 0 ? <EmptyState icon={<Bug className="size-5" />} title={items.length ? t('fb.noMatch') : t('fb.empty')} hint={items.length ? undefined : t('fb.emptyHint')} action={canWrite && !items.length ? <Button variant="primary" onClick={() => setDraft({ ...EMPTY })}>{t('fb.new')}</Button> : undefined} /> : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {shown.map((x) => {
            const f = parseDescription(x.description), ty = typeOf(x.tags), Icon = ICON[ty], src = sourceOf(x.tags)
            return (
              <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-4 py-3 last:border-0">
                <Icon className="size-4 shrink-0" style={{ color: COLOR[ty] }} aria-label={t(`fb.type.${ty}`)} />
                <button onClick={() => setOpenId(x.id)} className="min-w-0 flex-1 basis-48 text-left">
                  <span className="block truncate text-[13.5px] font-medium hover:underline">{x.title}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-text-3">{f.screen && <span>{f.screen}</span>}{f.version && <span>v{f.version}</span>}{f.device && <span>{f.device}</span>}{src && <span>{t(`fb.source.${src}`)}</span>}</span>
                </button>
                <PriorityIcon priority={x.priority as Priority} />
                {canWrite ? (
                  <Select aria-label={`${t('common.status')}: ${x.title}`} className="h-8 w-36 text-[13px]" value={x.status} onChange={(e) => setStatus(x, e.target.value as TaskStatus)}>{STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select>
                ) : <Badge>{t(`status.${x.status}`)}</Badge>}
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={!!draft} onClose={() => setDraft(null)} title={t('fb.new')}
        footer={<><Button onClick={() => setDraft(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={save} disabled={!draft?.title.trim()}>{t('common.create')}</Button></>}>
        {draft && (
          <div className="space-y-4">
            <div role="radiogroup" aria-label={t('fb.type')} className="grid grid-cols-3 gap-2">
              {FB_TYPES.map((x) => { const I = ICON[x]; return (
                <button key={x} role="radio" aria-checked={draft.type === x} onClick={() => setDraft({ ...draft, type: x })}
                  className={cn('flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[13px] font-medium transition-colors', draft.type === x ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-text-2 hover:bg-surface-2')}><I className="size-4" />{t(`fb.type.${x}`)}</button>) })}
            </div>
            <Field label={t('common.title')}><Input autoFocus value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('fb.screen')}><Input value={draft.screen} onChange={(e) => setDraft({ ...draft, screen: e.target.value })} /></Field>
              <Field label={t('fb.version')}><Input value={draft.version} placeholder="2.0.3 (41)" onChange={(e) => setDraft({ ...draft, version: e.target.value })} /></Field>
            </div>
            <Field label={t('fb.device')}><Input value={draft.device} placeholder="iPhone 13, iOS 18" onChange={(e) => setDraft({ ...draft, device: e.target.value })} /></Field>
            <Field label={draft.type === 'bug' ? t('fb.steps') : t('common.description')}><Textarea rows={4} value={draft.steps} onChange={(e) => setDraft({ ...draft, steps: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('fb.source')}><Select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value as FbSource | '' })}><option value="">—</option>{FB_SOURCES.map((s) => <option key={s} value={s}>{t(`fb.source.${s}`)}</option>)}</Select></Field>
              <Field label={t('fb.severity')}><Select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}>{(['urgent', 'high', 'medium', 'low'] as const).map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</Select></Field>
            </div>
          </div>
        )}
      </Dialog>
      <TaskPanel taskId={openId} open={!!openId} onClose={() => setOpenId(null)} onChanged={all.refresh} />
    </div>
  )
}
