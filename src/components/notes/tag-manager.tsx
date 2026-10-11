'use client'
import { useMemo, useState } from 'react'
import { ChevronDown, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/overlay'
import { PeoplePicker } from '@/components/common/people-picker'
import { getDb } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { cleanTagName, renameInTags, renameTag, TAG_COLORS, tagColor, visibleTags, type TagMeta } from '@/lib/note-tags'
import { useT } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { Note } from '@/lib/types'

/** Create, rename, recolour, delete tags and choose who is notified when one is used. */
export function TagManager({ open, onClose, notes, meta, save, onChanged }: {
  open: boolean; onClose: () => void; notes: Note[]; meta: TagMeta; save: (m: TagMeta) => Promise<boolean>; onChanged: () => void
}) {
  const t = useT()
  const { canWrite } = useWorkspace()
  const [newName, setNewName] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const n of notes) for (const x of visibleTags(n.tags)) c.set(x, (c.get(x) ?? 0) + 1)
    return c
  }, [notes])
  const names = useMemo(() => [...new Set([...counts.keys(), ...Object.keys(meta)])].sort((a, b) => a.localeCompare(b)), [counts, meta])

  async function persist(next: TagMeta) { if (!(await save(next))) toast.error(t('common.error')) }
  async function add() {
    const n = cleanTagName(newName)
    if (!n) return
    if (names.includes(n)) { toast.error(t('tag.exists')); return }
    setNewName(''); await persist({ ...meta, [n]: { color: TAG_COLORS[names.length % TAG_COLORS.length], users: [] } })
  }
  async function rename(from: string, to: string) {
    if (cleanTagName(to) === from) return
    const next = renameTag({ ...meta, [from]: meta[from] ?? { users: [] } }, from, to)
    if (!next) { toast.error(t('tag.exists')); return }
    const target = cleanTagName(to)
    for (const n of notes.filter((x) => x.tags.includes(from))) await getDb().from('notes').update({ tags: renameInTags(n.tags, from, target) }).eq('id', n.id)
    await persist(next); onChanged()
  }
  async function remove(name: string) {
    for (const n of notes.filter((x) => x.tags.includes(name))) await getDb().from('notes').update({ tags: n.tags.filter((x) => x !== name) }).eq('id', n.id)
    const { [name]: _gone, ...rest } = meta
    setConfirm(null); await persist(rest); onChanged()
  }
  const patch = (name: string, p: Partial<TagMeta[string]>) => persist({ ...meta, [name]: { ...meta[name], ...p } })

  return (
    <Dialog open={open} onClose={onClose} title={t('tag.title')} size="md">
      <div className="space-y-4">
        {canWrite && (
          <form onSubmit={(e) => { e.preventDefault(); void add() }} className="flex gap-2">
            <Input value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} placeholder={t('tag.new')} aria-label={t('tag.new')} />
            <Button type="submit" variant="primary" disabled={!cleanTagName(newName)}><Plus className="size-4" />{t('common.create')}</Button>
          </form>
        )}
        {names.length === 0 ? <p className="py-6 text-center text-sm text-text-3">{t('tag.empty')}</p> : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {names.map((name) => {
              const users = meta[name]?.users ?? []
              return (
                <li key={name} className="p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="size-3.5 shrink-0 rounded-full" style={{ background: tagColor(meta, name) }} aria-hidden />
                    <input key={name} defaultValue={name} disabled={!canWrite} maxLength={40} aria-label={t('tag.rename')}
                      onBlur={(e) => { if (e.target.value !== name) void rename(name, e.target.value) }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-sm font-medium outline-none focus:bg-surface-2" />
                    <span className="shrink-0 text-xs tabular-nums text-text-3">{(counts.get(name) ?? 0) === 1 ? t('tag.used1') : t('tag.used', { n: counts.get(name) ?? 0 })}</span>
                    <button onClick={() => setExpanded(expanded === name ? null : name)} aria-expanded={expanded === name} aria-label={t('tag.people')} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-3 hover:bg-surface-2 hover:text-text"><Users className="size-3.5" />{users.length || ''}<ChevronDown className={cn('size-3 transition-transform', expanded === name && 'rotate-180')} /></button>
                    {canWrite && <button onClick={() => setConfirm(confirm === name ? null : name)} aria-label={t('tag.delete')} className="rounded-md p-1.5 text-text-3 hover:bg-surface-2 hover:text-danger"><Trash2 className="size-3.5" /></button>}
                  </div>
                  {confirm === name && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs"><span className="flex-1">{t('tag.deleteConfirm', { t: name, n: counts.get(name) ?? 0 })}</span>
                      <Button size="xs" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button><Button size="xs" variant="danger" onClick={() => void remove(name)}>{t('common.delete')}</Button></div>
                  )}
                  {expanded === name && (
                    <div className="mt-2.5 space-y-2.5 pl-5">
                      <div><div className="mb-1 text-xs font-medium text-text-2">{t('tag.color')}</div>
                        <div className="flex flex-wrap gap-1.5">{TAG_COLORS.map((c) => <button key={c} disabled={!canWrite} aria-label={c} onClick={() => void patch(name, { color: c })} className={cn('size-6 rounded-full ring-offset-2 ring-offset-surface transition', tagColor(meta, name) === c && 'ring-2 ring-text')} style={{ background: c }} />)}</div></div>
                      <div><div className="mb-1 text-xs font-medium text-text-2">{t('tag.people')}</div>
                        <PeoplePicker label={t('tag.people')} value={users} disabled={!canWrite} onChange={(ids) => void patch(name, { users: ids })} /></div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
