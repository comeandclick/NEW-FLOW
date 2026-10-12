'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarRange, ChevronLeft, ChevronRight, List, Plus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useT } from '@/i18n/provider'
import { PLATFORM_COLORS, type Platform, type SocialPost } from '@/lib/social/types'
import { PlatformIcon } from '@/components/social/platform-icon'
import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  draft: 'var(--text-3)',
  scheduled: '#6366f1',
  publishing: '#f97316',
  published: '#22c55e',
  failed: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', scheduled: 'Programmé', publishing: 'En cours', published: 'Publié', failed: 'Échec',
}

type ViewMode = 'calendar' | 'list'

function CalendarPage() {
  const t = useT()
  const { ws } = useWorkspace()
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [cursor, setCursor] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('list')
  const weekStartsOn = 1 as const

  async function loadPosts() {
    setLoading(true)
    try {
      const res = await fetch(`/api/social/posts?ws=${ws.slug}&limit=100`)
      if (!res.ok) return
      const { posts: p } = await res.json() as { posts: SocialPost[] }
      setPosts(p)
    } finally { setLoading(false) }
  }

  useEffect(() => { void loadPosts() }, [ws.slug])

  const range = useMemo(() => ({
    from: startOfWeek(startOfMonth(cursor), { weekStartsOn }),
    to: endOfWeek(endOfMonth(cursor), { weekStartsOn }),
  }), [cursor])

  const days = eachDayOfInterval({ start: range.from, end: range.to })
  const weekdays = eachDayOfInterval({ start: startOfWeek(new Date(), { weekStartsOn }), end: endOfWeek(new Date(), { weekStartsOn }) })

  const postsOn = (d: Date) => posts.filter((p) => {
    const date = p.scheduled_at ? new Date(p.scheduled_at) : new Date(p.created_at)
    return isSameDay(date, d)
  })

  const sortedPosts = [...posts].sort((a, b) =>
    new Date(b.scheduled_at ?? b.created_at).getTime() - new Date(a.scheduled_at ?? a.created_at).getTime()
  )

  const PostChip = ({ post }: { post: SocialPost }) => (
    <Link
      href={`/app/${ws.slug}/social/publish`}
      className="flex w-full min-w-0 items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight transition-opacity hover:opacity-80"
      style={{ background: `color-mix(in srgb, ${STATUS_COLORS[post.status] ?? '#6366f1'} 18%, transparent)`, color: STATUS_COLORS[post.status] ?? '#6366f1' }}
    >
      <span className="flex shrink-0 gap-0.5">
        {(post.platforms as Platform[]).slice(0, 2).map((p) => (
          <PlatformIcon key={p} platform={p} className="size-2" color={PLATFORM_COLORS[p]} />
        ))}
      </span>
      <span className="truncate">{post.title || post.caption?.slice(0, 20)}</span>
    </Link>
  )

  return (
    <div className="flex flex-col p-3 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold capitalize tracking-tight">
            {format(cursor, 'LLLL yyyy', { locale: fr })}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            <button
              onClick={() => setView('list')}
              className={cn('flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[12px] font-medium transition-colors', view === 'list' ? 'bg-accent text-white' : 'text-text-2 hover:text-text')}
            >
              <List className="size-3.5" />Liste
            </button>
            <button
              onClick={() => setView('calendar')}
              className={cn('flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[12px] font-medium transition-colors', view === 'calendar' ? 'bg-accent text-white' : 'text-text-2 hover:text-text')}
            >
              <CalendarRange className="size-3.5" />Calendrier
            </button>
          </div>
          {view === 'calendar' && (
            <>
              <Button variant="ghost" size="icon" onClick={() => setCursor((c) => subMonths(c, 1))} aria-label="Mois précédent"><ChevronLeft className="size-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Mois suivant"><ChevronRight className="size-4" /></Button>
            </>
          )}
          <Link href={`/app/${ws.slug}/social/publish`}>
            <Button variant="primary" size="sm"><Plus className="size-4" /><span className="hidden sm:inline">{t('soc.cal.newPost')}</span></Button>
          </Link>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-3">
        {Object.entries(STATUS_LABELS).map(([s, label]) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full" style={{ background: STATUS_COLORS[s] }} />
            {label}
          </span>
        ))}
      </div>

      {/* Calendar view */}
      {view === 'calendar' && (
        <div className="overflow-x-auto">
          <div className="min-w-[320px] overflow-hidden rounded-xl border border-border bg-surface">
            <div className="grid grid-cols-7 border-b border-border bg-surface-2/60">
              {weekdays.map((d) => (
                <div key={d.toISOString()} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-text-3">
                  {format(d, 'EEEEE', { locale: fr })}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${days.length / 7}, auto)` }}>
              {days.map((d) => {
                const dayPosts = postsOn(d)
                return (
                  <div
                    key={d.toISOString()}
                    className={cn(
                      'flex min-h-[56px] flex-col overflow-hidden border-b border-r border-border/60 p-0.5 sm:min-h-[72px] sm:p-1',
                      !isSameMonth(d, cursor) && 'bg-surface-2/40 text-text-3',
                    )}
                  >
                    <span className={cn('mb-0.5 flex size-5 items-center justify-center self-end rounded-full text-[11px] tabular-nums sm:size-6 sm:text-xs', isToday(d) && 'bg-accent font-semibold text-white')}>
                      {format(d, 'd')}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {dayPosts.slice(0, 2).map((p) => <PostChip key={p.id} post={p} />)}
                      {dayPosts.length > 2 && <span className="px-0.5 text-[9px] text-text-3">+{dayPosts.length - 2}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="space-y-2">
          {loading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />
          ))}
          {!loading && sortedPosts.length === 0 && (
            <EmptyState
              icon={<CalendarRange className="size-5" />}
              title={t('soc.cal.empty')}
              hint={t('soc.cal.emptyHint')}
              action={
                <Link href={`/app/${ws.slug}/social/publish`}>
                  <Button variant="primary" size="sm"><Plus className="size-4" />{t('soc.cal.newPost')}</Button>
                </Link>
              }
            />
          )}
          {sortedPosts.map((post) => (
            <Link
              key={post.id}
              href={`/app/${ws.slug}/social/publish`}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3 transition-colors hover:bg-surface-2"
            >
              <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: STATUS_COLORS[post.status] }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{post.title || post.caption?.slice(0, 50) || 'Sans titre'}</p>
                <p className="mt-0.5 text-[12px] text-text-3">
                  {STATUS_LABELS[post.status]}
                  {post.scheduled_at && ` · ${format(new Date(post.scheduled_at), 'dd MMM HH:mm', { locale: fr })}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {(post.platforms as Platform[]).map((p) => (
                  <PlatformIcon key={p} platform={p} className="size-4" color={PLATFORM_COLORS[p]} />
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Page() { return <Suspense><CalendarPage /></Suspense> }
