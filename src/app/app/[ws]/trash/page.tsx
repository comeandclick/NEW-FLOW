'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import type { Key } from '@/i18n/dict'

const SOURCES: { table: string; type: string; label: string }[] = [
  { table: 'tasks', type: 'task', label: 'title' }, { table: 'notes', type: 'note', label: 'title' }, { table: 'events', type: 'event', label: 'title' },
  { table: 'projects', type: 'project', label: 'name' }, { table: 'files', type: 'file', label: 'name' }, { table: 'meetings', type: 'meeting', label: 'title' },
  { table: 'goals', type: 'goal', label: 'title' }, { table: 'crm_contacts', type: 'contact', label: 'name' }, { table: 'crm_deals', type: 'deal', label: 'title' },
  { table: 'whiteboards', type: 'whiteboard', label: 'name' }, { table: 'forms', type: 'form', label: 'title' }, { table: 'invoices', type: 'invoice', label: 'number' },
]
type Item = { id: string; table: string; type: string; title: string; deleted_at: string; path?: string }

export default function TrashPage() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { ws, canWrite, isAdmin } = useWorkspace()
  const [items, setItems] = useState<Item[] | null>(null)
  const [confirm, setConfirm] = useState<Item | 'all' | null>(null)

  const load = useCallback(async () => {
    const db = getDb()
    const res = await Promise.all(SOURCES.map(async (s) => {
      const { data } = await db.from(s.table).select('*').eq('workspace_id', ws.id).not('deleted_at', 'is', null)
      return ((data ?? []) as any[]).map((r) => ({ id: r.id, table: s.table, type: s.type, title: r[s.label] || '—', deleted_at: r.deleted_at, path: r.storage_path }))
    }))
    const all = res.flat().sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
    // Auto-purge items older than 30 days (admins only).
    if (isAdmin) {
      const cutoff = Date.now() - 30 * 864e5
      const old = all.filter((i) => new Date(i.deleted_at).getTime() < cutoff)
      await Promise.all(old.map((i) => db.from(i.table).delete().eq('id', i.id)))
      setItems(all.filter((i) => !old.includes(i)))
    } else setItems(all)
  }, [ws.id, isAdmin])
  useEffect(() => { void load() }, [load])

  async function restore(i: Item) {
    await getDb().from(i.table).update({ deleted_at: null }).eq('id', i.id)
    toast.success(t('common.restored')); void load()
  }
  async function purge(list: Item[]) {
    const db = getDb()
    for (const i of list) {
      if (i.table === 'files' && i.path) await db.storage.from('files').remove([i.path])
      await db.from(i.table).delete().eq('id', i.id)
    }
    toast.success(t('common.deleted')); setConfirm(null); void load()
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader title={t('trash.title')} subtitle={t('trash.subtitle')} icon={<Trash2 className="size-[18px]" />}
        actions={canWrite && items && items.length > 0 && <Button variant="danger" onClick={() => setConfirm('all')}><Trash2 className="size-4" />{t('trash.purgeAll')}</Button>} />
      {!items ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        : items.length === 0 ? <EmptyState icon={<Trash2 className="size-5" />} title={t('trash.empty')} />
        : <ul className="overflow-hidden rounded-xl border border-border bg-surface">{items.map((i) => (
          <li key={`${i.table}-${i.id}`} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
            <Badge>{t(`trash.type.${i.type}` as Key)}</Badge>
            <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px]">{i.title}</span>
              <span className="block text-[11px] text-text-3">{t('trash.deletedAgo', { when: formatDistanceToNow(new Date(i.deleted_at), { addSuffix: true, locale: dfl }) })}</span></span>
            {canWrite && <><Button size="xs" variant="outline" onClick={() => restore(i)}><RotateCcw className="size-3" />{t('trash.restore')}</Button>
              <Button size="icon" variant="ghost" onClick={() => setConfirm(i)} aria-label={t('trash.purge')}><Trash2 className="size-4 text-danger" /></Button></>}
          </li>))}</ul>}
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={t('trash.purge')} size="sm"
        footer={<><Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => purge(confirm === 'all' ? items ?? [] : confirm ? [confirm] : [])}>{t('trash.purge')}</Button></>}>
        <p className="text-sm text-text-2">{t('trash.confirm')}</p>
      </Dialog>
    </div>
  )
}
