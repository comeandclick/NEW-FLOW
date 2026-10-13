'use client'
import { HubTabs } from '@/components/shell/hub-tabs'
import Link from 'next/link'
import { useState } from 'react'
import { FolderKanban, LayoutTemplate, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import { TEMPLATES, type Template } from '@/lib/templates'
import { projectTree, withDescendants } from '@/lib/projects'

export const PROJECT_COLORS = ['#6366f1', '#22c55e', '#f97316', '#ec4899', '#0ea5e9', '#a855f7', '#eab308', '#14b8a6']

export default function ProjectsPage() {
  const { t, locale } = useI18n()
  const { ws, projects, canWrite, refreshProjects, log } = useWorkspace()
  const { userId } = useSession()
  const tasks = useLive<Task>('tasks', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [parent, setParent] = useState('')
  const tree = projectTree(projects)

  const [tplOpen, setTplOpen] = useState(false)
  const [busyTpl, setBusyTpl] = useState<string | null>(null)
  async function fromTemplate(tp: Template) {
    if (!userId) return
    setBusyTpl(tp.id)
    const L = locale === 'en' ? 'en' : 'fr'
    const { data: p, error } = await getDb().from('projects').insert({ workspace_id: ws.id, name: tp.name[L], description: tp.description[L], color: tp.color, created_by: userId }).select().single()
    if (error || !p) { toast.error(t('common.error')); setBusyTpl(null); return }
    const now = new Date()
    await getDb().from('tasks').insert(tp.tasks.map((x, i) => {
      const due = new Date(now); due.setDate(due.getDate() + (x.day ?? 0))
      return { workspace_id: ws.id, project_id: (p as { id: string }).id, title: x[L], status: 'todo', priority: x.priority ?? 'medium', created_by: userId, position: i * 1000, due_date: due.toISOString(), tags: [] }
    }))
    log('project.created', 'project', (p as { id: string }).id, { title: tp.name[L] })
    setBusyTpl(null); setTplOpen(false); await refreshProjects(); toast.success(t('common.saved'))
  }
  async function create() {
    if (!name.trim() || !userId) return
    const { data, error } = await getDb().from('projects').insert({ workspace_id: ws.id, name: name.trim(), description: desc || null, color, created_by: userId, ...(parent ? { parent_id: parent } : {}) }).select().single()
    if (error) { toast.error(t('common.error')); return }
    log('project.created', 'project', (data as { id: string }).id, { title: name.trim() })
    setOpen(false); setName(''); setDesc(''); await refreshProjects()
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <HubTabs hub="tasks" />
      <PageHeader title={t('proj.title')} subtitle={`${projects.length}`} icon={<FolderKanban className="size-[18px]" />} actions={canWrite && <><Button aria-label={t('proj.fromTemplate')} onClick={() => setTplOpen(true)}><LayoutTemplate className="size-4" /><span className="hidden sm:inline">{t('proj.fromTemplate')}</span></Button><Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" />{t('proj.new')}</Button></>} />
      {projects.length === 0 ? <EmptyState icon={<FolderKanban className="size-5" />} title={t('proj.empty')} hint={t('proj.emptyHint')} />
        : <div className="grid gap-3 lg:grid-cols-2">{tree.filter((x) => x.depth === 0).map(({ project: p }, i) => {
          // projet principal : progression sur ses tâches ET celles de ses sous-projets
          const inside = new Set(withDescendants(p.id, projects))
          const list = tasks.data.filter((x) => x.project_id && inside.has(x.project_id) && !x.parent_id)
          const done = list.filter((x) => x.status === 'done').length
          const pct = list.length ? Math.round((done / list.length) * 100) : 0
          const subs = tree.filter((x) => x.depth > 0 && inside.has(x.project.id))
          return (
            <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
              <Link href={`/app/${ws.slug}/projects/${p.id}`} className="block">
                <div className="flex items-center gap-3"><span className="size-3 rounded-full" style={{ background: p.color }} /><h3 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{p.name}</h3>{subs.length > 0 && <span className="text-xs text-text-3">{t('proj.nSubs', { n: subs.length })}</span>}</div>
                {p.description && <p className="mt-2 line-clamp-2 text-[13px] text-text-2">{p.description}</p>}
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: p.color }} /></div>
                <div className="mt-2 flex justify-between text-xs text-text-3"><span>{t('proj.tasks', { n: list.length })}</span><span>{t('proj.progress', { p: pct })}</span></div>
              </Link>
              {subs.length > 0 && (
                <ul className="mt-4 space-y-1 border-t border-border pt-3">
                  {subs.map(({ project: sp, depth }) => {
                    const own = tasks.data.filter((x) => x.project_id === sp.id && !x.parent_id), ok = own.filter((x) => x.status === 'done').length
                    return (
                      <li key={sp.id}>
                        <Link href={`/app/${ws.slug}/projects/${sp.id}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2" style={{ paddingLeft: 8 + (depth - 1) * 16 }}>
                          <span className="size-2 shrink-0 rounded-full" style={{ background: sp.color }} /><span className="min-w-0 flex-1 truncate">{sp.name}</span>
                          <span className="shrink-0 tabular-nums text-xs text-text-3">{ok}/{own.length}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </motion.div>)
        })}</div>}
      <Dialog open={tplOpen} onClose={() => setTplOpen(false)} title={t('proj.fromTemplate')}>
        <ul className="space-y-2">
          {TEMPLATES.map((tp) => {
            const L = locale === 'en' ? 'en' : 'fr'
            return (
              <li key={tp.id}>
                <button disabled={!!busyTpl} onClick={() => fromTemplate(tp)} className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface p-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-60">
                  <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: tp.color }} />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{tp.name[L]}</span><span className="mt-0.5 block text-[13px] text-text-2">{tp.description[L]}</span><span className="mt-1 block text-xs text-text-3">{t('proj.tasks', { n: tp.tasks.length })}</span></span>
                  {busyTpl === tp.id && <span className="text-xs text-text-3">…</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </Dialog>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('proj.new')} size="sm"
        footer={<><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" onClick={create} disabled={!name.trim()}>{t('common.create')}</Button></>}>
        <div className="space-y-4"><Field label={t('proj.name')}><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} /></Field>
          <Field label={t('common.description')}><Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <Field label={t('proj.parent')}><Select value={parent} onChange={(e) => setParent(e.target.value)}><option value="">{t('proj.noParent')}</option>{tree.map(({ project: x, depth }) => <option key={x.id} value={x.id}>{'\u00a0\u00a0'.repeat(depth)}{x.name}</option>)}</Select></Field>
          <div><span className="mb-1.5 block text-[13px] font-medium text-text-2">{t('proj.color')}</span><div className="flex gap-2">{PROJECT_COLORS.map((c) => <button key={c} aria-label={c} onClick={() => setColor(c)} className={cn('size-6 rounded-full ring-offset-2 ring-offset-surface', color === c && 'ring-2 ring-text')} style={{ background: c }} />)}</div></div></div>
      </Dialog>
    </div>
  )
}
