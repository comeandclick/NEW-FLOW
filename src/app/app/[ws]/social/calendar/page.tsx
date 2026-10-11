'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'
import { motion } from 'framer-motion'
import { CalendarRange, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, PageHeader } from '@/components/ui/misc'
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

function statusLabel(s: string): string {
  return ({ draft: 'Brouillon', scheduled: 'Programmé', publishing: 'En cours', published: 'Publié', failed: 'Échec' }[s] ?? s)
}

function CalendarPage() {
  const t = useT()
  const { ws } = useWorkspace()
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [cursor, setCursor] = useState(new Date())
  const [loading, setLoading] = useState(true)
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

  const PostChip = ({ post }: { post: SocialPost }) => (
    <Link
      href={`/app/${ws.slug}/social/publish`}
      className="flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium transition-opacity hover:opacity-80"
      style={{ background: `color-mix(in srgb, ${STATUS_COLORS[post.status] ?? '#6366f1'} 18%, transparent)`, color: STATUS_COLORS[post.status] ?? '#6366f1' }}
    >
      <span className="flex shrink-0 gap-0.5">
        {(post.platforms as Platform[]).slice(0, 2).map((p) => (
          <PlatformIcon key={p} platform={p} className="size-2.5" color={PLATFORM_COLORS[p]} />
        ))}
      </span>
      <span className="truncate">{post.title || post.caption?.slice(0, 30)}</span>
    </Link>
  )

  const allPosts = [...posts].sort((a, b) => {
    const da = new Date(a.scheduled_at ?? a.created_at)
    const db = new Date(b.scheduled_at ?? b.created_at)
    return db.getTime() - da.getTime()
  })

  return (
    <div className="flex min-h-full flex-col px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="hidden size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink sm:flex"><CalendarRange className="size-[18px]" /></span>
          <h1 className="text-xl font-semibold capitalize tracking-tight">{format(cursor, 'LLLL yyyy', { locale: fr })}</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>{t('cal.today')}</Button>
          <Button variant="ghost" size="icon" onClick={() => setCursor((c) => subMonths(c, 1))} aria-label={t('cal.prev')}><ChevronLeft className="size-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label={t('cal.next')}><ChevronRight className="size-4" /></Button>
          <Link href={`/app/${ws.slug}/social/publish`}><Button variant="primary" size="sm"><Plus className="size-4" />{t('soc.cal.newPost')}</Button></Link>
        </div>
      </div>

      {/* Status legend */}
      <div className="mb-3 flex flex-wrap gap-3 text-[12px] text-text-2">
        {Object.entries(STATUS_COLORS).map(([s, c]) => (
          <span key={s} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: c }} />{statusLabel(s)}</span>
        ))}
      </div>

      <motion.div key={format(cursor, 'yyyy-MM')} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface sm:min-h-0 sm:flex-1">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2/60">
          {weekdays.map((d) => (
            <div key={d.toISOString()} className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-text-3">
              {format(d, 'EEE', { locale: fr })}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 sm:min-h-0 sm:flex-1" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}>
          {days.map((d) => {
            const dayPosts = postsOn(d)
            return (
              <div key={d.toISOString()}
                className={cn('flex min-h-[64px] flex-col overflow-hidden border-b border-r border-border/70 p-1 sm:min-h-[80px]', !isSameMonth(d, cursor) && 'bg-bg-subtle/60 text-text-3')}>
                <span className={cn('mb-0.5 flex size-6 items-center justify-center self-start rounded-full text-xs tabular-nums', isToday(d) && 'bg-accent font-semibold text-white')}>{format(d, 'd')}</span>
                <div className="flex flex-col gap-0.5">
                  {dayPosts.slice(0, 3).map((p) => <PostChip key={p.id} post={p} />)}
                  {dayPosts.length > 3 && <span className="px-1 text-[10px] text-text-3">+{dayPosts.length - 3}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* List below calendar on mobile */}
      {!loading && posts.length === 0 && (
        <Card className="mt-4">
          <EmptyState
            icon={<CalendarRange className="size-5" />}
            title={t('soc.cal.empty')}
            hint={t('soc.cal.emptyHint')}
            action={<Link href={`/app/${ws.slug}/social/publish`}><Button variant="primary" size="sm"><Plus className="size-4" />{t('soc.cal.newPost')}</Button></Link>}
          />
        </Card>
      )}

      {allPosts.length > 0 && (
        <div className="mt-4 space-y-2 sm:hidden">
          {allPosts.slice(0, 10).map((post) => (
            <Link key={post.id} href={`/app/${ws.slug}/social/publish`}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: STATUS_COLORS[post.status] }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{post.title || post.caption?.slice(0, 40)}</span>
                <span className="block text-xs text-text-3">{statusLabel(post.status)} · {post.scheduled_at ? format(new Date(post.scheduled_at), 'dd/MM HH:mm') : format(new Date(post.created_at), 'dd/MM')}</span>
              </span>
              <div className="flex gap-1">
                {(post.platforms as Platform[]).map((p) => <PlatformIcon key={p} platform={p} className="size-4" color={PLATFORM_COLORS[p]} />)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Page() { return <Suspense><CalendarPage /></Suspense> }
