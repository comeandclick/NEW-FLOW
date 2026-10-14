'use client'
import { ReglagesCadre } from '@/components/shell/reglages-cadre'
import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { Activity as ActivityIcon } from 'lucide-react'
import { Avatar, EmptyState, PageHeader, Skeleton } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { actionKey } from '@/lib/activity'
import { useI18n } from '@/i18n/provider'
import type { Activity } from '@/lib/types'

export default function ActivityPage() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { ws, profileOf, nameOf } = useWorkspace()
  const [limit, setLimit] = useState(40)
  const { data, loading } = useLive<Activity>('activity_logs', { eq: { workspace_id: ws.id }, order: ['created_at', false], limit })
  return (
    <ReglagesCadre actif="activity">
      <PageHeader title={t('activity.title')} subtitle={t('activity.subtitle')} icon={<ActivityIcon className="size-[18px]" />} />
      {loading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        : data.length === 0 ? <EmptyState icon={<ActivityIcon className="size-5" />} title={t('activity.empty')} />
        : <ol className="relative space-y-1 border-l border-border pl-5">{data.map((a) => (
          <li key={a.id} className="relative flex items-center gap-3 rounded-lg py-2 pr-2">
            <span className="absolute -left-[26px] top-1/2 size-2 -translate-y-1/2 rounded-full bg-border-strong" />
            <Avatar name={profileOf(a.user_id)?.full_name} src={profileOf(a.user_id)?.avatar_url} size={28} />
            <p className="min-w-0 flex-1 text-[13px]"><span className="font-medium">{nameOf(a.user_id)}</span> <span className="text-text-2">{t(actionKey(a.action))}</span> <span className="font-medium">{(a.meta as { title?: string })?.title}</span></p>
            <span className="shrink-0 text-[11px] text-text-3">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: dfl })}</span>
          </li>))}</ol>}
      {data.length >= limit && <div className="mt-4 text-center"><Button onClick={() => setLimit((l) => l + 40)}>{t('common.more')}</Button></div>}
    </ReglagesCadre>
  )
}
