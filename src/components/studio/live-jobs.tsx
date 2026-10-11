'use client'
import { Film, Globe } from 'lucide-react'
import { Card, EmptyState } from '@/components/ui/misc'
import { studioApi, usePoll } from '@/lib/studio/api'
import { LiveJobCard } from './live-job-card'

export function LiveJobsList({ kind, title, hint }: { kind: 'motion' | 'site'; title: string; hint: string }) {
  const { data, refresh } = usePoll(studioApi.jobs, 3000)
  if (!data) return null
  const jobs = data.jobs.filter((j) => j.kind === kind)
  if (!jobs.length) return <Card><EmptyState icon={kind === 'motion' ? <Film className="size-5" /> : <Globe className="size-5" />} title={title} hint={hint} /></Card>
  return <div className="space-y-3">{jobs.map((j, i) => <div id={`job-${j.id}`} key={j.id}><LiveJobCard job={j} defaultOpen={i === 0} onChanged={() => void refresh()} /></div>)}</div>
}
