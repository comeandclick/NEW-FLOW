'use client'
import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { motion } from 'framer-motion'
import { FileText, Lightbulb, Pin, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader, Skeleton, Tabs } from '@/components/ui/misc'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import type { Note } from '@/lib/types'

function plain(note: Note): string {
  const out: string[] = []
  const walk = (n: any) => { if (!n) return; if (n.text) out.push(n.text); (n.content ?? []).forEach(walk) }  
  walk(note.content)
  return out.join(' ')
}

function List({ kinds, title, newLabel, icon }: { kinds: Note['kind'][]; title: 'notes.title' | 'docs.title'; newLabel: 'notes.new' | 'docs.new'; icon: 'note' | 'doc' }) {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const router = useRouter()
  const params = useSearchParams()
  const { ws, canWrite, log } = useWorkspace()
  const { userId } = useSession()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [kind, setKind] = useState<'all' | Note['kind']>('all')
  const { data, loading } = useLive<Note>('notes', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['updated_at', false] })
  const base = `/app/${ws.slug}/notes`

  const create = async () => {
    if (!userId) return
    const { data: row, error } = await getDb().from('notes').insert({ workspace_id: ws.id, created_by: userId, kind: icon === 'doc' ? 'doc' : 'note', title: '', content: {} }).select().single()
    if (error || !row) { toast.error(t('common.error')); return }
    log('note.created', 'note', row.id, { title: t('notes.untitled') })
    router.push(`${base}/${row.id}`)
  }
  useEffect(() => { if (params.get('new') === '1' && canWrite) { router.replace(`/app/${ws.slug}/${icon === 'doc' ? 'docs' : 'notes'}`); void create() } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const scoped = useMemo(() => data.filter((n) => kinds.includes(n.kind)), [data, kinds])
  const tags = useMemo(() => [...new Set(scoped.flatMap((n) => n.tags))].slice(0, 12), [scoped])
  const filtered = useMemo(() => scoped.filter((n) => (kind === 'all' || n.kind === kind) && (!tag || n.tags.includes(tag))
    && (!q.trim() || `${n.title} ${plain(n)}`.toLowerCase().includes(q.trim().toLowerCase()))), [scoped, kind, tag, q])
  const pinned = filtered.filter((n) => n.is_pinned)
  const rest = filtered.filter((n) => !n.is_pinned)

  const Card = ({ n, i }: { n: Note; i: number }) => (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
      <Link href={`${base}/${n.id}`} className="group flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md">
        <div className="flex items-center gap-2"><span className="text-lg">{n.icon ?? (n.kind === 'note' ? '📄' : '📘')}</span>{n.is_pinned && <Pin className="size-3 text-accent-ink" />}<span className="flex-1" />
          {n.kind !== 'note' && <Badge>{t(`notes.kind.${n.kind}`)}</Badge>}</div>
        <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug">{n.title || t('notes.untitled')}</h3>
        <p className="line-clamp-3 flex-1 text-[13px] leading-relaxed text-text-2">{plain(n) || '—'}</p>
        <div className="flex items-center gap-1.5 pt-1">{n.tags.slice(0, 2).map((x) => <Badge key={x}>{x}</Badge>)}<span className="flex-1" />
          <span className="text-[11px] text-text-3">{formatDistanceToNow(new Date(n.updated_at), { addSuffix: true, locale: dfl })}</span></div>
      </Link>
    </motion.div>
  )

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <HubTabs hub="notes" />
      <PageHeader title={t(title)} subtitle={`${filtered.length}`} icon={icon === 'doc' ? <Lightbulb className="size-[18px]" /> : <FileText className="size-[18px]" />}
        actions={canWrite && <Button variant="primary" onClick={create}><Plus className="size-4" />{t(newLabel)}</Button>} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-44 flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-text-3" /><Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('notes.search')} /></div>
        
        {tags.map((x) => <button key={x} onClick={() => setTag(tag === x ? null : x)} className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${tag === x ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-text-2 hover:border-border-strong'}`}>{x}</button>)}
      </div>
      {loading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40" />)}</div>
        : filtered.length === 0 ? <EmptyState icon={<FileText className="size-5" />} title={t('notes.empty')} hint={t('notes.emptyHint')} action={canWrite ? <Button variant="primary" onClick={create}><Plus className="size-4" />{t(newLabel)}</Button> : undefined} />
        : <div className="space-y-7">
          {pinned.length > 0 && <section><h2 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-3"><Pin className="size-3" />{t('notes.pinned')}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{pinned.map((n, i) => <Card key={n.id} n={n} i={i} />)}</div></section>}
          {rest.length > 0 && <section>{pinned.length > 0 && <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-text-3">{t('notes.recent')}</h2>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rest.map((n, i) => <Card key={n.id} n={n} i={i} />)}</div></section>}
        </div>}
    </div>
  )
}

export function NotesList(props: Parameters<typeof List>[0]) { return <Suspense><List {...props} /></Suspense> }
