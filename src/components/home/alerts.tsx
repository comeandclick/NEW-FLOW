'use client'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { AtSign, Bell, CalendarDays, Check, MessageSquare, ShieldAlert, UserCheck, Video } from 'lucide-react'
import { Card } from '@/components/ui/misc'
import { useLive } from '@/lib/hooks/use-live'
import { useSession } from '@/lib/hooks/use-session'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import { safePath } from '@/lib/utils'
import { cn } from '@/lib/utils'

type Notif = { id: string; type: string; title: string; body: string | null; url: string | null; is_read: boolean; created_at: string; workspace_id: string | null }
const ICONS: Record<string, typeof Bell> = { assign: UserCheck, mention: AtSign, message: MessageSquare, event: CalendarDays, meeting: Video, security: ShieldAlert }

/** Dashboard widget: what is waiting for me (assignments, mentions, invitations, alerts), unread first. */
export function AlertsWidget() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { userId } = useSession()
  const { ws } = useWorkspace()
  const q = useLive<Notif>('notifications', { eq: { user_id: userId ?? undefined }, order: ['created_at', false], limit: 30, enabled: !!userId, channelFilter: userId ? `user_id=eq.${userId}` : undefined })
  const mine = q.data.filter((n) => !n.workspace_id || n.workspace_id === ws.id)
  const unread = mine.filter((n) => !n.is_read)
  const shown = [...unread, ...mine.filter((n) => n.is_read)].slice(0, unread.length ? Math.max(4, Math.min(unread.length, 6)) : 3)

  const markAll = async () => { if (userId) { await getDb().from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false); q.refresh() } }
  const open = (n: Notif) => { if (!n.is_read) void getDb().from('notifications').update({ is_read: true }).eq('id', n.id) }

  return (
    <Card className="overflow-hidden" data-testid="alerts-widget">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Bell className="size-4 text-text-3" />{t('alw.title')}{unread.length > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-white tabular-nums">{unread.length}</span>}</h2>
        <div className="flex items-center gap-3 text-xs">
          {unread.length > 0 && <button onClick={markAll} className="inline-flex items-center gap-1 text-text-3 hover:text-text"><Check className="size-3" />{t('inbox.markAll')}</button>}
          <Link href={`/app/${ws.slug}/inbox`} className="text-text-3 hover:text-text">{t('common.all')}</Link>
        </div>
      </div>
      {shown.length === 0 ? <p className="px-4 py-5 text-center text-[13px] text-text-3">{t('alw.none')}</p> : (
        <ul>{shown.map((n) => {
          const Icon = ICONS[n.type] ?? Bell
          const body = (
            <>
              <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg', n.is_read ? 'bg-surface-3 text-text-3' : 'bg-accent-soft text-accent-ink')}><Icon className="size-3.5" /></span>
              <span className="min-w-0 flex-1"><span className={cn('block text-[13px] leading-snug', !n.is_read && 'font-medium')}>{n.title}</span>{n.body && <span className="block truncate text-xs text-text-3">{n.body}</span>}</span>
              <span className="shrink-0 text-[11px] text-text-3">{formatDistanceToNow(new Date(n.created_at), { locale: dfl })}</span>
            </>
          )
          const cls = 'flex items-start gap-3 border-b border-border/60 px-4 py-2.5 last:border-0 hover:bg-surface-2'
          return <li key={n.id}>{n.url ? <Link href={safePath(n.url)} onClick={() => open(n)} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>
        })}</ul>
      )}
    </Card>
  )
}
