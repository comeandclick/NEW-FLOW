'use client'
import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, FileUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, Menu, MenuItem } from '@/components/ui/overlay'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { contactsToCsv, parseContactsCsv, parseTasksCsv, resolveAssignee, resolveProject, tasksToCsv, type ContactDraft, type TaskDraft } from '@/lib/csv'
import { useI18n } from '@/i18n/provider'

type Pending = { kind: 'tasks'; tasks: TaskDraft[]; skipped: number } | { kind: 'contacts'; contacts: ContactDraft[]; skipped: number }

function download(name: string, text: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); URL.revokeObjectURL(a.href)
}

/** Import / export a spreadsheet (CSV) of tasks or contacts. Understands Excel, Google Sheets and Trello exports. */
export function CsvMenu({ kind, onDone }: { kind: 'tasks' | 'contacts'; onDone?: () => void }) {
  const { t } = useI18n()
  const { ws, projects, members, canWrite, log } = useWorkspace()
  const { userId } = useSession()
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [createProjects, setCreateProjects] = useState(true)
  const [busy, setBusy] = useState(false)
  const ctx = { projects: projects.map((p) => ({ id: p.id, name: p.name })), members: members.map((m) => ({ user_id: m.user_id, email: m.profile?.email, name: m.profile?.full_name })) }

  async function exportCsv() {
    const db = getDb()
    if (kind === 'tasks') {
      const { data } = await db.from('tasks').select('*').eq('workspace_id', ws.id).is('deleted_at', null).order('created_at', { ascending: true })
      download(`tasks-${ws.slug}.csv`, tasksToCsv((data ?? []) as never, ctx))
    } else {
      const { data } = await db.from('crm_contacts').select('*').eq('workspace_id', ws.id).is('deleted_at', null).order('name', { ascending: true })
      download(`contacts-${ws.slug}.csv`, contactsToCsv((data ?? []) as never))
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    const text = await f.text()
    if (kind === 'tasks') { const r = parseTasksCsv(text); if (!r) { toast.error(t('csv.bad')); return } setPending({ kind: 'tasks', tasks: r.tasks, skipped: r.skipped }) }
    else { const r = parseContactsCsv(text); if (!r) { toast.error(t('csv.bad')); return } setPending({ kind: 'contacts', contacts: r.contacts, skipped: r.skipped }) }
    if (input.current) input.current.value = ''
  }

  async function confirm() {
    if (!pending || !userId) return
    setBusy(true)
    try {
      const db = getDb()
      if (pending.kind === 'tasks') {
        const byName = new Map(ctx.projects.map((p) => [p.name.trim().toLowerCase(), p.id]))
        if (createProjects) {
          const missing = Array.from(new Set(pending.tasks.map((x) => x.project).filter((n): n is string => !!n && !resolveProject(n, ctx)))).slice(0, 30)
          for (const name of missing) {
            const { data } = await db.from('projects').insert({ workspace_id: ws.id, name: name.slice(0, 80), created_by: userId }).select('id').single()
            if (data) byName.set(name.trim().toLowerCase(), (data as { id: string }).id)
          }
        }
        const rows = pending.tasks.map((x, i) => ({
          workspace_id: ws.id, created_by: userId, title: x.title, description: x.description, status: x.status, priority: x.priority, due_date: x.due_date, tags: x.tags, estimate_minutes: x.estimate_minutes,
          project_id: x.project ? resolveProject(x.project, ctx) ?? byName.get(x.project.trim().toLowerCase()) ?? null : null, assignee_id: resolveAssignee(x.assignee, ctx),
          completed_at: x.status === 'done' ? new Date().toISOString() : null, position: Date.now() + i,
        }))
        for (let i = 0; i < rows.length; i += 100) { const { error } = await db.from('tasks').insert(rows.slice(i, i + 100)); if (error) throw error }
        log('tasks.imported', 'task', null, { count: rows.length })
        toast.success(t('csv.imported', { n: rows.length }))
      } else {
        const rows = pending.contacts.map((c) => ({ ...c, workspace_id: ws.id, created_by: userId }))
        for (let i = 0; i < rows.length; i += 100) { const { error } = await db.from('crm_contacts').insert(rows.slice(i, i + 100)); if (error) throw error }
        log('contacts.imported', 'contact', null, { count: rows.length })
        toast.success(t('csv.imported', { n: rows.length }))
      }
      setPending(null); onDone?.()
    } catch { toast.error(t('common.error')) } finally { setBusy(false) }
  }

  const count = pending ? (pending.kind === 'tasks' ? pending.tasks.length : pending.contacts.length) : 0
  const newProjects = pending?.kind === 'tasks' ? Array.from(new Set(pending.tasks.map((x) => x.project).filter((n): n is string => !!n && !resolveProject(n, ctx)))) : []
  const sample = pending ? (pending.kind === 'tasks' ? pending.tasks.slice(0, 5).map((x) => x.title) : pending.contacts.slice(0, 5).map((x) => x.name)) : []
  return (
    <>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <Menu align="end" width={230} trigger={({ toggle }) => <Button onClick={toggle} aria-label={t('csv.menu')}><FileSpreadsheet className="size-4" /><span className="hidden sm:inline">CSV</span></Button>}>
        {(close) => (
          <>
            {canWrite && <MenuItem icon={<FileUp className="size-4" />} onClick={() => { close(); input.current?.click() }}>{t('csv.import')}</MenuItem>}
            <MenuItem icon={<Download className="size-4" />} onClick={() => { close(); void exportCsv() }}>{t('csv.export')}</MenuItem>
          </>
        )}
      </Menu>
      <Dialog open={!!pending} onClose={() => setPending(null)} title={t('csv.import')} size="sm" footer={<><Button onClick={() => setPending(null)}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} disabled={!count} onClick={confirm}>{t('csv.confirm', { n: count })}</Button></>}>
        <div className="space-y-3 text-sm">
          <p>{t(kind === 'tasks' ? 'csv.foundTasks' : 'csv.foundContacts', { n: count })}{pending && pending.skipped > 0 ? ` · ${t('csv.skipped', { n: pending.skipped })}` : ''}</p>
          <ul className="rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-[13px] text-text-2">{sample.map((s, i) => <li key={i} className="truncate">{s}</li>)}{count > 5 && <li className="text-text-3">… +{count - 5}</li>}</ul>
          {newProjects.length > 0 && (
            <label className="flex items-start gap-2.5 text-[13px]"><input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={createProjects} onChange={(e) => setCreateProjects(e.target.checked)} />
              <span>{t('csv.createProjects', { n: newProjects.length })}<span className="block text-xs text-text-3">{newProjects.slice(0, 4).join(', ')}{newProjects.length > 4 ? '…' : ''}</span></span></label>
          )}
          <p className="text-xs text-text-3">{t('csv.hint')}</p>
        </div>
      </Dialog>
    </>
  )
}
