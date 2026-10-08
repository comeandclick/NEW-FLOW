'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { HubTabs } from '@/components/shell/hub-tabs'
import { useState } from 'react'
import { Plus, Trash2, Workflow, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader, Switch } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import type { Automation } from '@/lib/types'

const TRIGGERS = ['task_created', 'task_done', 'member_joined'] as const
const ACTIONS = ['notify', 'send_message'] as const

export default function AutomationsPage() {
  const { t } = useI18n()
  const { ws, canWrite } = useWorkspace()
  const { userId } = useSession()
  const list = useLive<Automation>('automations', { eq: { workspace_id: ws.id }, order: ['created_at', false] })
  const [d, setD] = useState<{ name: string; trigger_type: string; action_type: string; message: string } | null>(null)
  const presets = [
    { name: t('auto.trigger.task_done'), trigger_type: 'task_done', action_type: 'notify', message: '✅' },
    { name: t('auto.trigger.member_joined'), trigger_type: 'member_joined', action_type: 'send_message', message: '👋' },
    { name: t('auto.trigger.task_created'), trigger_type: 'task_created', action_type: 'notify', message: '🆕' },
  ]
  async function save() {
    if (!d || !userId || !d.name.trim()) return
    await getDb().from('automations').insert({ workspace_id: ws.id, name: d.name.trim(), trigger_type: d.trigger_type, action_type: d.action_type, action_config: { message: d.message }, created_by: userId })
    setD(null); list.refresh()
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <HubTabs hub="settings" />
      <PageHeader title={t('auto.title')} icon={<Workflow className="size-[18px]" />} actions={canWrite && <Button variant="primary" onClick={() => setD({ name: '', trigger_type: 'task_done', action_type: 'notify', message: '' })}><Plus className="size-4" />{t('auto.new')}</Button>} />
      {list.data.length === 0 && !list.loading ? <EmptyState icon={<Workflow className="size-5" />} title={t('auto.empty')} hint={t('auto.emptyHint')}
        action={canWrite ? <div className="flex flex-wrap justify-center gap-2">{presets.map((p) => <Button key={p.name} size="sm" onClick={() => setD(p)}><Zap className="size-3.5" />{p.name}</Button>)}</div> : undefined} />
        : <ul className="space-y-2">{list.data.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><Zap className="size-4" /></span>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{a.name}</div><div className="truncate text-xs text-text-3">{t(`auto.trigger.${a.trigger_type}` as any)} → {t(`auto.action.${a.action_type}` as any)}</div></div>
            <Badge>{t('auto.runs', { n: a.run_count })}</Badge>
            {canWrite && <><Switch checked={a.is_active} label={a.name} onChange={async (v) => { await getDb().from('automations').update({ is_active: v }).eq('id', a.id); list.refresh() }} />
              <Button variant="ghost" size="icon" onClick={async () => { await getDb().from('automations').delete().eq('id', a.id); list.refresh() }} aria-label={t('common.delete')}><Trash2 className="size-4" /></Button></>}
          </li>))}</ul>}
      <Dialog open={!!d} onClose={() => setD(null)} title={t('auto.new')} size="sm" footer={<><Button onClick={() => setD(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={save} disabled={!d?.name.trim()}>{t('common.create')}</Button></>}>
        {d && <div className="space-y-4"><Field label={t('common.name')}><Input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label={t('auto.trigger')}><Select value={d.trigger_type} onChange={(e) => setD({ ...d, trigger_type: e.target.value })}>{TRIGGERS.map((x) => <option key={x} value={x}>{t(`auto.trigger.${x}`)}</option>)}</Select></Field>
          <Field label={t('auto.action')}><Select value={d.action_type} onChange={(e) => setD({ ...d, action_type: e.target.value })}>{ACTIONS.map((x) => <option key={x} value={x}>{t(`auto.action.${x}`)}</option>)}</Select></Field>
          <Field label={t('auto.message')}><Input value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} /></Field></div>}
      </Dialog>
    </div>
  )
}
