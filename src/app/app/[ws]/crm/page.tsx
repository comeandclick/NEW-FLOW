'use client'
 
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { aGestion, modulesActifs } from '@/lib/modules'
import { HubTabs } from '@/components/shell/hub-tabs'
import { useMemo, useState } from 'react'
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Building2, Mail, Phone, Plus, Search, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Avatar, Badge, EmptyState, PageHeader, Tabs } from '@/components/ui/misc'
import { CsvMenu } from '@/components/common/csv-menu'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { Contact, Deal } from '@/lib/types'

const STAGES = ['prospection', 'qualification', 'proposition', 'négociation', 'gagné', 'perdu'] as const
const STATUSES = ['lead', 'prospect', 'customer', 'churned'] as const
const STATUS_COLOR: Record<string, string> = { lead: 'var(--info)', prospect: 'var(--warning)', customer: 'var(--success)', churned: 'var(--text-3)' }

function DealCard({ d, contact, onOpen }: { d: Deal; contact?: Contact; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: d.id })
  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: d.currency, maximumFractionDigits: 0 }).format(d.value)
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onOpen} className={cn('cursor-grab touch-manipulation rounded-xl border border-border bg-surface p-3 shadow-sm hover:border-border-strong', isDragging && 'opacity-40')}>
      <div className="text-[13px] font-medium leading-snug">{d.title}</div>
      <div className="mt-1 flex items-center justify-between text-xs text-text-3"><span className="truncate">{contact?.name ?? '—'}</span><span className="font-semibold tabular-nums text-text">{money}</span></div>
    </div>
  )
}
function Stage({ id, children, count, total }: { id: string; children: React.ReactNode; count: number; total: string }) {
  const t = useI18n().t
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn('flex w-[min(280px,82vw)] shrink-0 snap-start scroll-ml-3 flex-col rounded-2xl border bg-surface-2/50 transition-colors', isOver ? 'border-accent/60 bg-accent-soft/40' : 'border-border')}>
      <div className="flex items-center justify-between px-3 py-2.5"><span className="text-[13px] font-medium">{t(`crm.stage.${id}` as any)} <span className="text-xs font-normal text-text-3">{count}</span></span><span className="text-xs tabular-nums text-text-3">{total}</span></div>
      <div className="flex min-h-24 flex-col gap-2 px-2 pb-2">{children}</div>
    </div>
  )
}

export default function CrmPage() {
  const gestion = aGestion(modulesActifs(useWorkspace().ws))
  const { t } = useI18n()
  const { ws, canWrite, log } = useWorkspace()
  const { userId } = useSession()
  const contacts = useLive<Contact>('crm_contacts', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['name', true] })
  const deals = useLive<Deal>('crm_deals', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['position', true] })
  const [tab, setTab] = useState<'pipeline' | 'contacts'>('pipeline')
  const [q, setQ] = useState('')
  const [cDraft, setCDraft] = useState<(Partial<Contact> & { name: string }) | null>(null)
  const [dDraft, setDDraft] = useState<(Partial<Deal> & { title: string }) | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }))
  const fmt = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

  const stats = useMemo(() => {
    const open = deals.data.filter((d) => !['gagné', 'perdu'].includes(d.stage))
    const gagnees = deals.data.filter((d) => d.stage === 'gagné').length, perdues = deals.data.filter((d) => d.stage === 'perdu').length
    return { total: open.reduce((a, d) => a + d.value, 0), weighted: open.reduce((a, d) => a + (d.value * d.probability) / 100, 0), won: deals.data.filter((d) => d.stage === 'gagné').reduce((a, d) => a + d.value, 0),
      ouvertes: open.length, conversion: gagnees + perdues ? Math.round((gagnees / (gagnees + perdues)) * 100) : null, moyenne: open.length ? open.reduce((a, d) => a + d.value, 0) / open.length : 0 }
  }, [deals.data])

  async function saveContact() {
    if (!cDraft?.name.trim() || !userId) return
    const row = { name: cDraft.name.trim(), email: cDraft.email || null, phone: cDraft.phone || null, company: cDraft.company || null, position: cDraft.position || null, status: cDraft.status ?? 'lead', notes: cDraft.notes || null }
    if (cDraft.id) await getDb().from('crm_contacts').update(row).eq('id', cDraft.id); else await getDb().from('crm_contacts').insert({ ...row, workspace_id: ws.id, created_by: userId })
    setCDraft(null); contacts.refresh()
  }
  async function saveDeal() {
    if (!dDraft?.title.trim() || !userId) return
    const row = { title: dDraft.title.trim(), value: Number(dDraft.value) || 0, stage: dDraft.stage ?? 'prospection', contact_id: dDraft.contact_id || null, close_date: dDraft.close_date || null, probability: dDraft.stage === 'gagné' ? 100 : dDraft.stage === 'perdu' ? 0 : Number(dDraft.probability) || 20 }
    if (dDraft.id) await getDb().from('crm_deals').update(row).eq('id', dDraft.id)
    else { const { data } = await getDb().from('crm_deals').insert({ ...row, workspace_id: ws.id, created_by: userId, position: Date.now() }).select().single(); log('deal.created', 'deal', (data as any)?.id, { title: row.title }) }
    setDDraft(null); deals.refresh()
  }
  async function onDragEnd(e: DragEndEvent) {
    const stage = e.over?.id as string | undefined; const id = e.active.id as string
    const d = deals.data.find((x) => x.id === id)
    if (!stage || !d || d.stage === stage || !canWrite) return
    deals.setData((list) => list.map((x) => (x.id === id ? { ...x, stage } : x)))
    await getDb().from('crm_deals').update({ stage, probability: stage === 'gagné' ? 100 : stage === 'perdu' ? 0 : d.probability }).eq('id', id); deals.refresh()
  }
  const list = contacts.data.filter((c) => !q.trim() || `${c.name} ${c.company ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
      <HubTabs hub="crm" />
      <PageHeader title={t('crm.title')} icon={<Users className="size-[18px]" />} actions={<>
        {tab === 'contacts' && <CsvMenu kind="contacts" onDone={() => contacts.refresh()} />}
        <Tabs value={tab} onChange={setTab} items={[{ value: 'pipeline', label: t('crm.pipeline') }, { value: 'contacts', label: t('crm.contacts') }]} />
        {canWrite && (tab === 'pipeline' ? <Button variant="primary" onClick={() => setDDraft({ title: '', stage: 'prospection', value: 0 })}><Plus className="size-4" />{t('crm.newDeal')}</Button>
          : <Button variant="primary" onClick={() => setCDraft({ name: '', status: 'lead' })}><Plus className="size-4" />{t('crm.newContact')}</Button>)}</>} />
      {tab === 'pipeline' ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{([[t('crm.total'), fmt(stats.total)], [t('crm.weighted'), fmt(stats.weighted)], [t('crm.won'), fmt(stats.won)],
            ['Affaires ouvertes', String(stats.ouvertes)], ['Taux de conversion', stats.conversion === null ? '—' : `${stats.conversion} %`], ['Panier moyen', fmt(stats.moyenne)]] as [string, string][]).map(([l, v]) => (
            <div key={l} className="rounded-xl border border-border bg-surface p-4 shadow-sm"><div className="text-xs text-text-3">{l}</div><div className="mt-1 text-lg font-semibold tabular-nums tracking-tight sm:text-2xl">{v}</div></div>))}</div>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="flex snap-x snap-proximity gap-3 overflow-x-auto pb-3">{STAGES.map((s) => {
              const ds = deals.data.filter((d) => d.stage === s)
              return <Stage key={s} id={s} count={ds.length} total={fmt(ds.reduce((a, d) => a + d.value, 0))}>{ds.map((d) => <DealCard key={d.id} d={d} contact={contacts.data.find((c) => c.id === d.contact_id)} onOpen={() => setDDraft(d)} />)}</Stage>
            })}</div>
          </DndContext>
        </>
      ) : (
        <>
          <div className="relative mb-4 max-w-sm"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-text-3" /><Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} /></div>
          {list.length === 0 ? <EmptyState icon={<Users className="size-5" />} title={t('crm.emptyContacts')} />
            : <ul className="overflow-hidden rounded-xl border border-border bg-surface">{list.map((c) => (
              <li key={c.id}><button onClick={() => setCDraft(c)} className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left last:border-0 hover:bg-surface-2">
                <Avatar name={c.name} size={36} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="flex items-center gap-3 truncate text-xs text-text-3">{c.company && <span className="flex items-center gap-1"><Building2 className="size-3" />{c.company}</span>}{c.email && <span className="hidden items-center gap-1 sm:flex"><Mail className="size-3" />{c.email}</span>}{c.phone && <span className="hidden items-center gap-1 md:flex"><Phone className="size-3" />{c.phone}</span>}</span></span>
                <Badge color={STATUS_COLOR[c.status]}>{t(`crm.status.${c.status}` as any)}</Badge></button></li>))}</ul>}
        </>
      )}

      <Dialog open={!!cDraft} onClose={() => setCDraft(null)} title={cDraft?.id ? cDraft.name : t('crm.newContact')}
        footer={<>{cDraft?.id && canWrite && <Button variant="ghost" className="mr-auto text-danger" onClick={async () => { await getDb().from('crm_contacts').update({ deleted_at: new Date().toISOString() }).eq('id', cDraft.id); setCDraft(null); contacts.refresh() }}><Trash2 className="size-4" />{t('common.delete')}</Button>}
          <Button onClick={() => setCDraft(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={saveContact} disabled={!cDraft?.name.trim() || !canWrite}>{t('common.save')}</Button></>}>
        {cDraft && <div className="space-y-4"><Field label={t('common.name')}><Input autoFocus value={cDraft.name} onChange={(e) => setCDraft({ ...cDraft, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label={t('crm.company')}><Input value={cDraft.company ?? ''} onChange={(e) => setCDraft({ ...cDraft, company: e.target.value })} /></Field><Field label={t('crm.position')}><Input value={cDraft.position ?? ''} onChange={(e) => setCDraft({ ...cDraft, position: e.target.value })} /></Field>
            <Field label={t('crm.email')}><Input type="email" value={cDraft.email ?? ''} onChange={(e) => setCDraft({ ...cDraft, email: e.target.value })} /></Field><Field label={t('crm.phone')}><Input value={cDraft.phone ?? ''} onChange={(e) => setCDraft({ ...cDraft, phone: e.target.value })} /></Field></div>
          <Field label={t('common.status')}><Select value={cDraft.status ?? 'lead'} onChange={(e) => setCDraft({ ...cDraft, status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{t(`crm.status.${s}`)}</option>)}</Select></Field>
          <Field label={t('crm.notes')}><Textarea rows={3} value={cDraft.notes ?? ''} onChange={(e) => setCDraft({ ...cDraft, notes: e.target.value })} /></Field>
          {cDraft.id && gestion && <Link href={`/app/${ws.slug}/gestion/clients/${cDraft.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium hover:bg-surface-2">Fiche client : devis, factures, interventions<ArrowUpRight className="size-3.5 text-text-3" /></Link>}</div>}
      </Dialog>
      <Dialog open={!!dDraft} onClose={() => setDDraft(null)} title={dDraft?.id ? dDraft.title : t('crm.newDeal')}
        footer={<>{dDraft?.id && canWrite && <Button variant="ghost" className="mr-auto text-danger" onClick={async () => { await getDb().from('crm_deals').update({ deleted_at: new Date().toISOString() }).eq('id', dDraft.id); setDDraft(null); deals.refresh() }}><Trash2 className="size-4" />{t('common.delete')}</Button>}
          <Button onClick={() => setDDraft(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={saveDeal} disabled={!dDraft?.title.trim() || !canWrite}>{t('common.save')}</Button></>}>
        {dDraft && <div className="space-y-4"><Field label={t('common.title')}><Input autoFocus value={dDraft.title} onChange={(e) => setDDraft({ ...dDraft, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label={t('crm.value')}><Input type="number" min={0} value={dDraft.value ?? 0} onChange={(e) => setDDraft({ ...dDraft, value: Number(e.target.value) })} /></Field>
            <Field label={t('crm.stage')}><Select value={dDraft.stage ?? 'prospection'} onChange={(e) => setDDraft({ ...dDraft, stage: e.target.value })}>{STAGES.map((s) => <option key={s} value={s}>{t(`crm.stage.${s}`)}</option>)}</Select></Field>
            <Field label={t('crm.contact')}><Select value={dDraft.contact_id ?? ''} onChange={(e) => setDDraft({ ...dDraft, contact_id: e.target.value || null })}><option value="">—</option>{contacts.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label={t('crm.closeDate')}><Input type="date" value={dDraft.close_date ?? ''} onChange={(e) => setDDraft({ ...dDraft, close_date: e.target.value })} /></Field></div></div>}
      </Dialog>
    </div>
  )
}
