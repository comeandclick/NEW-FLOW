'use client'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bookmark } from 'lucide-react'
import { toast } from 'sonner'
import { Select } from '@/components/ui/input'
import { PageHeader, Tabs } from '@/components/ui/misc'
import { AddCapture, CaptureList, useCreateCapture } from '@/components/captures/captures'
import { useLive } from '@/lib/hooks/use-live'
import { useSession } from '@/lib/hooks/use-session'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { CAPTURE_KINDS, cleanCaptureUrl, currentProjectOf, firstUrl, withCurrentProject } from '@/lib/captures'
import { useI18n } from '@/i18n/provider'
import type { Capture } from '@/lib/types'

type StatusFilter = 'all' | 'nouveau' | 'vu'

function CapturesInner() {
  const { t } = useI18n()
  const router = useRouter()
  const params = useSearchParams()
  const { ws, projects, canWrite } = useWorkspace()
  const { profile, updateProfile } = useSession()
  const create = useCreateCapture()
  const captures = useLive<Capture>('captures', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false] })
  const [status, setStatus] = useState<StatusFilter>('all')
  const [kind, setKind] = useState('')
  const [project, setProject] = useState('')
  const current = currentProjectOf(profile?.preferences, ws.id)

  // Arriving from the share sheet (installed app): /captures?share=1&url=…&text=…&title=… saves the capture right away.
  const shared = useRef(false)
  useEffect(() => {
    if (params.get('share') !== '1' || shared.current || !profile) return
    shared.current = true
    const text = [params.get('text'), params.get('title')].filter(Boolean).join('\n')
    const url = cleanCaptureUrl(params.get('url')) ?? cleanCaptureUrl(firstUrl(text))
    const note = text && text !== url ? text : ''
    router.replace(`/app/${ws.slug}/captures`)
    if (!url && !note) { toast.error(t('cap.share.nothing')); return }
    void create({ url, note })
      .then((made) => {
        const name = projects.find((p) => p.id === made?.project_id)?.name
        toast.success(name ? t('cap.addedTo', { p: name }) : t('cap.added'))
        void captures.refresh()
      })
      .catch(() => toast.error(t('common.error')))
  }, [params, profile]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(
    () => captures.data.filter((c) => (status === 'all' || c.status === status) && (!kind || c.kind === kind) && (!project || (project === 'none' ? !c.project_id : c.project_id === project))),
    [captures.data, status, kind, project],
  )
  const fresh = captures.data.filter((c) => c.status === 'nouveau').length

  async function setCurrent(id: string) {
    await updateProfile({ preferences: withCurrentProject(profile?.preferences, ws.id, id || null) })
    const name = projects.find((p) => p.id === id)?.name
    toast.success(name ? t('cap.currentSet', { p: name }) : t('cap.currentUnset'))
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader title={t('cap.title')} subtitle={t('cap.sub')} icon={<Bookmark className="size-[18px]" />} actions={canWrite ? <AddCapture onAdded={captures.refresh} /> : undefined} />

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
        <label htmlFor="cap-current" className="text-[13px] font-medium">{t('cap.current')}</label>
        <Select id="cap-current" className="h-8 w-auto max-w-56 text-[13px]" value={current && projects.some((p) => p.id === current) ? current : ''} onChange={(e) => void setCurrent(e.target.value)}>
          <option value="">{t('common.none')}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <span className="text-xs text-text-3">{current && projects.some((p) => p.id === current) ? t('cap.currentHint') : t('cap.noCurrent')}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={status} onChange={setStatus} items={[{ value: 'all', label: `${t('common.all')} ${captures.data.length}` }, { value: 'nouveau', label: `${t('cap.status.nouveau')} ${fresh}` }, { value: 'vu', label: `${t('cap.status.vu')} ${captures.data.length - fresh}` }]} />
        <Select aria-label={t('cap.filter.kind')} className="h-8 w-auto text-[13px]" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t('cap.allKinds')}</option>{CAPTURE_KINDS.map((k) => <option key={k} value={k}>{t(`cap.kind.${k}`)}</option>)}
        </Select>
        <Select aria-label={t('cap.filter.project')} className="h-8 w-auto max-w-44 text-[13px]" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">{t('cap.allProjects')}</option><option value="none">{t('cap.noProject')}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>

      {captures.loading && captures.data.length === 0 ? <div className="py-10 text-center text-text-3">…</div> : (
        <CaptureList captures={shown} showProject empty={captures.data.length === 0 ? t('cap.empty') : t('cap.emptyFilter')} onChanged={captures.refresh} />
      )}
      {captures.data.length === 0 && !captures.loading && <p className="mt-2 text-center text-[13px] text-text-3">{t('cap.emptyHint')}</p>}
    </div>
  )
}

export default function CapturesPage() {
  return <Suspense><CapturesInner /></Suspense>
}
