'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { format } from 'date-fns'
import { ClipboardList, Copy, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader, Switch, Tabs } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { uid } from '@/lib/utils'
import { useI18n } from '@/i18n/provider'
import type { FormField, FormRow } from '@/lib/types'

const TYPES: FormField['type'][] = ['text', 'textarea', 'select', 'email', 'number']

export default function FormsPage() {
  const { t } = useI18n()
  const { ws, canWrite } = useWorkspace()
  const { userId } = useSession()
  const forms = useLive<FormRow>('forms', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false] })
  const [d, setD] = useState<(Partial<FormRow> & { title: string; fields: FormField[] }) | null>(null)
  const [tab, setTab] = useState<'editor' | 'responses'>('editor')
  const responses = useLive<any>('form_responses', { eq: { form_id: d?.id ?? undefined }, order: ['created_at', false], enabled: !!d?.id && tab === 'responses' })
  const link = (slug: string) => `${window.location.origin}/f/${slug}`

  async function save() {
    if (!d || !userId || !d.title.trim()) return
    const row = { title: d.title.trim(), description: d.description || null, fields: d.fields, is_public: d.is_public ?? false }
    if (d.id) await getDb().from('forms').update(row).eq('id', d.id); else await getDb().from('forms').insert({ ...row, workspace_id: ws.id, created_by: userId })
    setD(null); forms.refresh(); toast.success(t('common.saved'))
  }
  const setField = (i: number, patch: Partial<FormField>) => d && setD({ ...d, fields: d.fields.map((f, k) => (k === i ? { ...f, ...patch } : f)) })

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader title={t('forms.title')} icon={<ClipboardList className="size-[18px]" />} actions={canWrite && <Button variant="primary" onClick={() => { setTab('editor'); setD({ title: '', fields: [{ id: uid().slice(0, 6), type: 'text', label: '', required: true }], is_public: false }) }}><Plus className="size-4" />{t('forms.new')}</Button>} />
      {forms.data.length === 0 && !forms.loading ? <EmptyState icon={<ClipboardList className="size-5" />} title={t('forms.empty')} />
        : <ul className="space-y-2">{forms.data.map((f) => (
          <li key={f.id}><button onClick={() => { setTab('editor'); setD(f) }} className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent"><ClipboardList className="size-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{f.title}</span><span className="text-xs text-text-3">{f.fields.length} · {f.is_public ? t('forms.public') : t('forms.private')}</span></span>
            {f.is_public && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(link(f.slug)); toast.success(t('common.copied')) }} className="rounded-md p-2 text-text-3 hover:bg-surface-2 hover:text-text" aria-label={t('forms.copyLink')}><Copy className="size-4" /></span>}
            <Badge color={f.is_public ? 'var(--success)' : undefined}>{f.is_public ? t('forms.public') : t('forms.private')}</Badge></button></li>))}</ul>}

      <Dialog open={!!d} onClose={() => setD(null)} title={d?.title || t('forms.new')} size="lg"
        footer={d && <>{d.id && canWrite && <Button variant="ghost" className="mr-auto text-danger" onClick={async () => { await getDb().from('forms').update({ deleted_at: new Date().toISOString() }).eq('id', d.id); setD(null); forms.refresh() }}><Trash2 className="size-4" />{t('common.delete')}</Button>}
          <Button onClick={() => setD(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={save} disabled={!d.title.trim() || !canWrite}>{t('common.save')}</Button></>}>
        {d && <div className="space-y-4">
          {d.id && <Tabs value={tab} onChange={setTab} items={[{ value: 'editor', label: t('forms.editor') }, { value: 'responses', label: `${t('forms.responses')}` }]} />}
          {tab === 'editor' ? <>
            <Field label={t('common.title')}><Input autoFocus value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
            <Field label={t('common.description')}><Textarea rows={2} value={d.description ?? ''} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><span className="text-sm">{t('forms.public')}</span><Switch checked={d.is_public ?? false} onChange={(v) => setD({ ...d, is_public: v })} label={t('forms.public')} /></div>
            <div className="space-y-3">{d.fields.map((f, i) => (
              <div key={f.id} className="space-y-2 rounded-xl border border-border p-3"><div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                <Input value={f.label} placeholder={t('common.name')} onChange={(e) => setField(i, { label: e.target.value })} aria-label={t('common.name')} />
                <Select value={f.type} onChange={(e) => setField(i, { type: e.target.value as FormField['type'] })} aria-label={t('forms.fieldType')}>{TYPES.map((x) => <option key={x} value={x}>{t(`forms.type.${x}`)}</option>)}</Select>
                <div className="flex items-center gap-2"><label className="flex items-center gap-1.5 text-xs text-text-2"><input type="checkbox" checked={f.required ?? false} onChange={(e) => setField(i, { required: e.target.checked })} />{t('forms.required')}</label>
                  <button onClick={() => setD({ ...d, fields: d.fields.filter((_, k) => k !== i) })} className="text-text-3 hover:text-danger" aria-label={t('common.delete')}><Trash2 className="size-4" /></button></div></div>
                {f.type === 'select' && <Textarea rows={3} placeholder={t('forms.options')} value={(f.options ?? []).join('\n')} onChange={(e) => setField(i, { options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />}</div>))}
              <Button size="sm" onClick={() => setD({ ...d, fields: [...d.fields, { id: uid().slice(0, 6), type: 'text', label: '' }] })}><Plus className="size-3.5" />{t('forms.addField')}</Button></div>
          </> : (responses.data.length === 0 ? <p className="py-8 text-center text-sm text-text-3">{t('forms.noResponses')}</p>
            : <div className="space-y-3">{responses.data.map((r: any) => <div key={r.id} className="rounded-xl border border-border p-3"><div className="mb-2 text-xs text-text-3">{format(new Date(r.created_at), 'PPp')}</div>
              {d.fields.map((f) => <div key={f.id} className="text-[13px]"><span className="text-text-3">{f.label}: </span>{String(r.answers?.[f.id] ?? '—')}</div>)}</div>)}</div>)}
        </div>}
      </Dialog>
    </div>
  )
}
