'use client'
import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, CheckSquare, FileText, FolderKanban, FolderOpen, MessageSquare, Search as SearchIcon, Target, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader } from '@/components/ui/misc'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'

type Kind = 'tasks' | 'notes' | 'messages' | 'files' | 'contacts' | 'events' | 'goals' | 'projects'
type Hit = { id: string; kind: Kind; title: string; snippet?: string; href: string; meta?: string }
const ICON: Record<Kind, typeof CheckSquare> = { tasks: CheckSquare, notes: FileText, messages: MessageSquare, files: FolderOpen, contacts: Users, events: CalendarDays, goals: Target, projects: FolderKanban }
const LIMIT = 12

/** Escapes % and _ so the user's text is matched literally by ILIKE. */
const like = (s: string) => `%${s.replace(/[\\%_,()]/g, ' ').trim()}%`

function Mark({ text, q }: { text: string; q: string }) {
  const term = q.trim()
  if (!term) return <>{text}</>
  const i = text.toLowerCase().indexOf(term.toLowerCase())
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark className="rounded bg-accent-soft px-0.5 text-accent-ink">{text.slice(i, i + term.length)}</mark>{text.slice(i + term.length)}</>
}
const around = (text: string, q: string) => { const i = text.toLowerCase().indexOf(q.trim().toLowerCase()); const s = Math.max(0, i - 40); return (s > 0 ? '…' : '') + text.slice(s, s + 140) + (text.length > s + 140 ? '…' : '') }
const plain = (doc: unknown): string => { const out: string[] = []; const walk = (n: any) => { if (!n) return; if (n.text) out.push(n.text); (n.content ?? []).forEach(walk) }; walk(doc); return out.join(' ') }

function SearchInner() {
  const { t } = useI18n()
  const router = useRouter()
  const params = useSearchParams()
  const { ws } = useWorkspace()
  const base = `/app/${ws.slug}`
  const [q, setQ] = useState(params.get('q') ?? '')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [kind, setKind] = useState<Kind | 'all'>('all')

  useEffect(() => {
    const term = q.trim()
    router.replace(term ? `${base}/search?q=${encodeURIComponent(term)}` : `${base}/search`, { scroll: false })
    if (term.length < 2) { setHits([]); setLoading(false); return }
    let alive = true
    setLoading(true)
    const id = setTimeout(async () => {
      const db = getDb(), p = like(term)
      const wsq = (table: string, select: string) => db.from(table).select(select).eq('workspace_id', ws.id)
      const { data: convs } = await db.from('conversations').select('id,name,type').eq('workspace_id', ws.id)
      const convMap = new Map(((convs ?? []) as { id: string; name: string | null; type: string }[]).map((c) => [c.id, c]))
      const [tasks, notes, files, contacts, events, goals, projects, msgs] = await Promise.all([
        wsq('tasks', 'id,title,description,status').is('deleted_at', null).or(`title.ilike.${p},description.ilike.${p}`).limit(LIMIT),
        wsq('notes', 'id,title,icon,content').is('deleted_at', null).ilike('title', p).limit(LIMIT),
        wsq('files', 'id,name,folder').is('deleted_at', null).ilike('name', p).limit(LIMIT),
        wsq('crm_contacts', 'id,name,company,email').is('deleted_at', null).or(`name.ilike.${p},company.ilike.${p},email.ilike.${p}`).limit(LIMIT),
        wsq('events', 'id,title,start_at,location').is('deleted_at', null).or(`title.ilike.${p},location.ilike.${p}`).limit(LIMIT),
        wsq('goals', 'id,title').is('deleted_at', null).ilike('title', p).limit(LIMIT),
        wsq('projects', 'id,name,description').is('deleted_at', null).or(`name.ilike.${p},description.ilike.${p}`).limit(LIMIT),
        convMap.size ? db.from('messages').select('id,content,conversation_id,created_at').in('conversation_id', [...convMap.keys()]).is('deleted_at', null).ilike('content', p).order('created_at', { ascending: false }).limit(LIMIT) : Promise.resolve({ data: [] }),
      ])
      if (!alive) return
      const out: Hit[] = []
      for (const r of (tasks.data ?? []) as any[]) out.push({ id: r.id, kind: 'tasks', title: r.title, snippet: r.description ? around(r.description, term) : undefined, href: `${base}/tasks?open=${r.id}`, meta: t(`status.${r.status}` as 'status.todo') })
      for (const r of (notes.data ?? []) as any[]) out.push({ id: r.id, kind: 'notes', title: `${r.icon ?? ''} ${r.title || t('notes.untitled')}`.trim(), snippet: around(plain(r.content), term), href: `${base}/notes/${r.id}` })
      for (const r of (files.data ?? []) as any[]) out.push({ id: r.id, kind: 'files', title: r.name, meta: r.folder, href: `${base}/files` })
      for (const r of (contacts.data ?? []) as any[]) out.push({ id: r.id, kind: 'contacts', title: r.name, meta: [r.company, r.email].filter(Boolean).join(' · '), href: `${base}/crm` })
      for (const r of (events.data ?? []) as any[]) out.push({ id: r.id, kind: 'events', title: r.title, meta: new Date(r.start_at).toLocaleDateString(), href: `${base}/calendar` })
      for (const r of (goals.data ?? []) as any[]) out.push({ id: r.id, kind: 'goals', title: r.title, href: `${base}/goals` })
      for (const r of (projects.data ?? []) as any[]) out.push({ id: r.id, kind: 'projects', title: r.name, snippet: r.description ? around(r.description, term) : undefined, href: `${base}/projects/${r.id}` })
      for (const r of (msgs.data ?? []) as any[]) { const c = convMap.get(r.conversation_id); out.push({ id: r.id, kind: 'messages', title: around(r.content, term), meta: c ? (c.type === 'channel' ? `#${c.name}` : t('nav.messages')) : undefined, href: `${base}/messages/${r.conversation_id}` }) }
      setHits(out); setLoading(false)
    }, 220)
    return () => { alive = false; clearTimeout(id) }
  }, [q, ws.id, base]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => { const c: Partial<Record<Kind, number>> = {}; hits.forEach((h) => { c[h.kind] = (c[h.kind] ?? 0) + 1 }); return c }, [hits])
  const shown = kind === 'all' ? hits : hits.filter((h) => h.kind === kind)
  const kinds = (Object.keys(ICON) as Kind[]).filter((k) => counts[k])

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader title={t('search.title')} subtitle={t('search.sub')} icon={<SearchIcon className="size-[18px]" />} />
      <div className="relative"><SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-3" />
        <Input autoFocus type="search" aria-label={t('search.title')} className="h-11 pl-10 text-[15px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search.placeholder')} /></div>

      {kinds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t('search.filter')}>
          {(['all', ...kinds] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={cn('rounded-full border px-3 py-1 text-[13px] transition-colors', kind === k ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-text-2 hover:border-border-strong')}>
              {k === 'all' ? `${t('search.all')} ${hits.length}` : `${t(`search.kind.${k}`)} ${counts[k]}`}</button>
          ))}
        </div>
      )}

      <div className="mt-5" aria-live="polite">
        {q.trim().length < 2 ? <EmptyState icon={<SearchIcon className="size-5" />} title={t('search.start')} hint={t('search.startHint')} className="py-12" />
          : loading && hits.length === 0 ? <div className="h-32 animate-pulse rounded-xl bg-surface-2" aria-busy />
          : shown.length === 0 ? <EmptyState icon={<SearchIcon className="size-5" />} title={t('search.none', { q: q.trim() })} className="py-12" />
          : (
            <ul className="overflow-hidden rounded-xl border border-border bg-surface">
              {shown.map((h) => { const I = ICON[h.kind]; return (
                <li key={`${h.kind}-${h.id}`}>
                  <Link href={h.href} className="flex items-start gap-3 border-b border-border/60 px-4 py-3 last:border-0 hover:bg-surface-2">
                    <I className="mt-0.5 size-4 shrink-0 text-text-3" aria-label={t(`search.kind.${h.kind}`)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium"><Mark text={h.title} q={q} /></span>
                      {h.snippet && <span className="mt-0.5 line-clamp-2 block text-[13px] text-text-2"><Mark text={h.snippet} q={q} /></span>}
                    </span>
                    {h.meta && <Badge className="shrink-0">{h.meta}</Badge>}
                  </Link>
                </li>) })}
            </ul>
          )}
      </div>
    </div>
  )
}

export default function SearchPage() { return <Suspense><SearchInner /></Suspense> }
