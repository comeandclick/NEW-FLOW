'use client'
// Vue « Tableau » des tâches d'après 21st.dev « table-editable » (14/10/2026) : cellules modifiables sur place (titre, statut,
// priorité, échéance, responsable), tri par colonne, sélection multiple avec actions groupées (terminer, supprimer).
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, Check, ExternalLink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getDb } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useI18n } from '@/i18n/provider'
import type { Priority, Task, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const STATUTS: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']
const PRIOS: Priority[] = ['urgent', 'high', 'medium', 'low']
const COUL_STATUT: Record<TaskStatus, string> = { backlog: 'bg-text/10 text-text-3', todo: 'bg-text/10 text-text-2', in_progress: 'bg-warning/15 text-warning', in_review: 'bg-info/10 text-info', done: 'bg-success/10 text-success', cancelled: 'bg-text/5 text-text-3' }
const COUL_PRIO: Record<Priority, string> = { urgent: 'bg-danger', high: 'bg-warning', medium: 'bg-info', low: 'bg-text/30' }
type Cle = 'title' | 'status' | 'priority' | 'due_date' | 'assignee_id'
const champ = 'w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] outline-none transition-colors hover:border-border focus:border-text/30 focus:bg-surface'

export function TableauTaches({ tasks, onOpen, canWrite, refresh }: { tasks: Task[]; onOpen: (id: string) => void; canWrite: boolean; refresh: () => void }) {
  const { t } = useI18n()
  const { members } = useWorkspace()
  const [tri, setTri] = useState<{ cle: Cle; sens: 1 | -1 }>({ cle: 'due_date', sens: 1 })
  const [sel, setSel] = useState<string[]>([])
  const [local, setLocal] = useState<Record<string, Partial<Task>>>({})
  const lignes = useMemo(() => tasks.map((x) => ({ ...x, ...local[x.id] })).sort((a, b) => {
    const va = a[tri.cle] ?? '', vb = b[tri.cle] ?? ''
    const ordre = tri.cle === 'status' ? STATUTS.indexOf(a.status) - STATUTS.indexOf(b.status) : tri.cle === 'priority' ? PRIOS.indexOf(a.priority) - PRIOS.indexOf(b.priority) : String(va).localeCompare(String(vb), 'fr')
    return ordre * tri.sens
  }), [tasks, local, tri])
  const maj = async (id: string, patch: Partial<Task>) => {
    setLocal((l) => ({ ...l, [id]: { ...l[id], ...patch } }))
    const extra = patch.status ? { completed_at: patch.status === 'done' ? new Date().toISOString() : null } : {}
    const { error } = await getDb().from('tasks').update({ ...patch, ...extra }).eq('id', id)
    if (error) { toast.error(t('common.error')); setLocal((l) => { const n = { ...l }; delete n[id]; return n }) }
  }
  const groupe = async (quoi: 'done' | 'delete') => {
    const ids = sel; setSel([])
    if (quoi === 'done') await getDb().from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).in('id', ids)
    else await getDb().from('tasks').update({ deleted_at: new Date().toISOString() }).in('id', ids)
    toast.success(quoi === 'done' ? `${ids.length} tâche(s) terminée(s)` : `${ids.length} tâche(s) dans la corbeille`); refresh()
  }
  const entete = (cle: Cle, nom: string, cls = '') => (
    <th className={cn('px-2 py-2.5 font-medium', cls)}>
      <button onClick={() => setTri((x) => ({ cle, sens: x.cle === cle ? (x.sens === 1 ? -1 : 1) : 1 }))} className="inline-flex items-center gap-1 rounded px-1 hover:text-text">
        {nom}{tri.cle === cle && (tri.sens === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}</button>
    </th>
  )
  const tous = lignes.length > 0 && sel.length === lignes.length
  return (
    <div className="space-y-2">
      <div className="flex h-8 items-center gap-2 text-xs text-text-3">
        {sel.length ? (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
            <span className="font-medium text-text">{sel.length} sélectionnée(s)</span>
            <button onClick={() => void groupe('done')} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-surface-2"><Check className="size-3.5" />Terminer</button>
            <button onClick={() => void groupe('delete')} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-danger hover:bg-danger/10"><Trash2 className="size-3.5" />Supprimer</button>
          </motion.div>
        ) : <span>{lignes.length} tâche(s) · clique dans une case pour la modifier</span>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="bg-surface-2 text-xs text-text-3">
            <tr>
              <th className="w-10 px-3 py-2.5"><input type="checkbox" aria-label="Tout sélectionner" checked={tous} onChange={() => setSel(tous ? [] : lignes.map((l) => l.id))} className="size-3.5 accent-[var(--text)]" /></th>
              {entete('title', t('common.name'), 'w-[40%]')}{entete('status', 'Statut')}{entete('priority', 'Priorité')}{entete('due_date', 'Échéance')}{entete('assignee_id', 'Responsable')}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lignes.map((x) => (
              <tr key={x.id} className={cn('group transition-colors hover:bg-surface-2/50', sel.includes(x.id) && 'bg-text/[0.04]')}>
                <td className="px-3"><input type="checkbox" aria-label="Sélectionner" checked={sel.includes(x.id)} onChange={() => setSel((s) => (s.includes(x.id) ? s.filter((y) => y !== x.id) : [...s, x.id]))} className="size-3.5 accent-[var(--text)]" /></td>
                <td className="px-1 py-1"><input disabled={!canWrite} defaultValue={x.title} onBlur={(e) => e.target.value.trim() && e.target.value !== x.title && void maj(x.id, { title: e.target.value.trim() })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={cn(champ, x.status === 'done' && 'text-text-3 line-through')} /></td>
                <td className="px-1 py-1"><select disabled={!canWrite} value={x.status} onChange={(e) => void maj(x.id, { status: e.target.value as TaskStatus })} className={cn('cursor-pointer rounded-md border-0 px-2 py-1 text-[11.5px] font-medium outline-none', COUL_STATUT[x.status])}>{STATUTS.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select></td>
                <td className="px-1 py-1"><span className="flex items-center gap-1.5 pl-2"><span className={cn('size-2 shrink-0 rounded-full', COUL_PRIO[x.priority])} /><select disabled={!canWrite} value={x.priority} onChange={(e) => void maj(x.id, { priority: e.target.value as Priority })} className="cursor-pointer bg-transparent py-1 text-[13px] outline-none">{PRIOS.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</select></span></td>
                <td className="px-1 py-1"><input disabled={!canWrite} type="date" value={x.due_date?.slice(0, 10) ?? ''} onChange={(e) => void maj(x.id, { due_date: e.target.value || null })} className={cn(champ, 'w-36', x.due_date && new Date(x.due_date) < new Date(new Date().toDateString()) && x.status !== 'done' && 'text-danger')} /></td>
                <td className="px-1 py-1"><select disabled={!canWrite} value={x.assignee_id ?? ''} onChange={(e) => void maj(x.id, { assignee_id: e.target.value || null })} className="max-w-40 cursor-pointer truncate bg-transparent px-2 py-1 text-[13px] outline-none"><option value="">—</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.full_name ?? m.profile?.email}</option>)}</select></td>
                <td className="pr-2"><button onClick={() => onOpen(x.id)} aria-label="Ouvrir" className="grid size-7 place-items-center rounded-md text-text-3 opacity-0 transition-opacity hover:bg-text/5 hover:text-text group-hover:opacity-100"><ExternalLink className="size-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
