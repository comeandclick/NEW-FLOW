'use client'
 
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Bell, BellRing, Check } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useSession } from '@/lib/hooks/use-session'
import { useI18n } from '@/i18n/provider'
import { getDb } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Notification } from '@/lib/types'
import { enablePush, pushPermission, showSystemNotification } from '@/lib/push'

export function NotificationsMenu() {
  const { userId, isDemo } = useSession()
  const { t, locale } = useI18n()
  const router = useRouter()
  const { data, setData } = useLive<Notification>('notifications', { eq: { user_id: userId ?? undefined }, order: ['created_at', false], limit: 30, enabled: !!userId, channelFilter: userId ? `user_id=eq.${userId}` : undefined })
  const unread = data.filter((n) => !n.is_read).length
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default')
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => { setPerm(pushPermission()) }, [])

  // System notification for each new unread item (when the tab is hidden or not focused).
  useEffect(() => {
    if (!data.length) return
    if (seen.current === null) { seen.current = new Set(data.map((n) => n.id)); return }
    for (const n of data) {
      if (seen.current.has(n.id)) continue
      seen.current.add(n.id)
      if (!n.is_read) showSystemNotification(n.title, n.body ?? '', n.url ?? undefined)
    }
  }, [data])

  async function markAll() {
    setData((d) => d.map((n) => ({ ...n, is_read: true })))
    await getDb().from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false)
  }
  async function open(n: Notification, close: () => void) {
    close()
    if (!n.is_read) {
      setData((d) => d.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      await getDb().from('notifications').update({ is_read: true }).eq('id', n.id)
    }
    if (n.url) router.push(n.url)
  }

  return (
    <Menu align="end" width={360} className="p-0" trigger={({ toggle }) => (
      <Button variant="ghost" size="icon" onClick={toggle} aria-label={t('shell.notifications')} className="relative">
        {unread ? <BellRing className="size-4" /> : <Bell className="size-4" />}
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger-bg px-1 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
      </Button>
    )}>
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <span className="text-sm font-semibold">{t('shell.notifications')}</span>
            {unread > 0 && <button onClick={markAll} className="flex items-center gap-1 text-xs text-accent-ink hover:underline"><Check className="size-3" />{t('shell.markAllRead')}</button>}
          </div>
          <div className="max-h-[50dvh] overflow-y-auto">
            {data.length === 0 && <p className="px-4 py-10 text-center text-sm text-text-3">{t('shell.noNotifications')}</p>}
            {data.map((n) => (
              <button key={n.id} onClick={() => open(n, close)} className={cn('flex w-full gap-3 border-b border-border/60 px-3.5 py-3 text-left transition-colors last:border-0 hover:bg-surface-2', !n.is_read && 'bg-accent-soft/40')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-accent')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{n.title}</span>
                  {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-text-2">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-text-3">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: locale === 'fr' ? fr : enUS })}</span>
                </span>
              </button>
            ))}
          </div>
          {perm !== 'granted' && perm !== 'unsupported' && (
            <div className="border-t border-border p-2.5">
              <Button size="sm" variant="outline" className="w-full" disabled={perm === 'denied'} onClick={async () => { setPerm(await enablePush(isDemo)) }}>
                <BellRing className="size-3.5" />{perm === 'denied' ? t('shell.pushDenied') : t('shell.enablePush')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Menu>
  )
}
