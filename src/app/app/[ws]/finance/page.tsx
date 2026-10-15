'use client'
 
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { aGestion, modulesActifs } from '@/lib/modules'
import { HubTabs } from '@/components/shell/hub-tabs'
import { useMemo, useState } from 'react'
import { format, startOfMonth, subMonths } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import dynamic from 'next/dynamic'
import { Plus, Printer, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader, Tabs } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import type { Contact, Invoice } from '@/lib/types'

const BarChartView = dynamic(() => import('@/components/common/bar-chart'), { ssr: false, loading: () => <div className="skeleton size-full" /> })

type Draft = { id?: string; kind: Invoice['kind']; number: string; contact_id: string; status: string; issued_at: string; due_at: string; items: Invoice['items'] }
const eur = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)
const sum = (items: Invoice['items']) => items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.price) || 0), 0)
const STATUS_COLOR: Record<string, string | undefined> = { paid: 'var(--success)', sent: 'var(--info)', overdue: 'var(--danger)', draft: undefined }

export default function FinancePage() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { ws, canWrite } = useWorkspace()
  const gestion = aGestion(modulesActifs(ws))
  const { userId } = useSession()
  const inv = useLive<Invoice>('invoices', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['issued_at', false] })
  const contacts = useLive<Contact>('crm_contacts', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const [tab, setTab] = useState<'all' | Invoice['kind']>('all')
  const [draft, setDraft] = useState<Draft | null>(null)

  const stats = useMemo(() => {
    const list = inv.data
    return {
      revenue: list.filter((i) => i.kind === 'invoice' && i.status === 'paid').reduce((a, i) => a + Number(i.total), 0),
      pending: list.filter((i) => i.kind === 'invoice' && ['sent', 'overdue'].includes(i.status)).reduce((a, i) => a + Number(i.total), 0),
      expenses: list.filter((i) => i.kind === 'expense').reduce((a, i) => a + Number(i.total), 0),
    }
  }, [inv.data])
  const chart = useMemo(() => Array.from({ length: 6 }, (_, k) => {
    const m = startOfMonth(subMonths(new Date(), 5 - k)); const key = format(m, 'yyyy-MM')
    const inMonth = inv.data.filter((i) => i.issued_at.startsWith(key))
    return { name: format(m, 'MMM', { locale: dfl }), [t('fin.revenue')]: inMonth.filter((i) => i.kind === 'invoice' && i.status === 'paid').reduce((a, i) => a + Number(i.total), 0), [t('fin.expenses')]: inMonth.filter((i) => i.kind === 'expense').reduce((a, i) => a + Number(i.total), 0) }
  }), [inv.data, dfl, t])
  const list = inv.data.filter((i) => tab === 'all' || i.kind === tab)

  const openNew = (kind: Invoice['kind'] = 'invoice') => setDraft({ kind, number: `${kind === 'invoice' ? 'F' : kind === 'quote' ? 'D' : 'N'}-${new Date().getFullYear()}-${String(inv.data.filter((i) => i.kind === kind).length + 1).padStart(3, '0')}`, contact_id: '', status: 'draft', issued_at: new Date().toISOString().slice(0, 10), due_at: '', items: [{ label: '', qty: 1, price: 0 }] })
  async function save() {
    if (!draft || !userId) return
    const items = draft.items.filter((i) => i.label.trim())
    const row = { number: draft.number, kind: draft.kind, contact_id: draft.contact_id || null, status: draft.status, issued_at: draft.issued_at, due_at: draft.due_at || null, items, total: sum(items) }
    if (draft.id) await getDb().from('invoices').update(row).eq('id', draft.id); else await getDb().from('invoices').insert({ ...row, workspace_id: ws.id, created_by: userId })
    setDraft(null); inv.refresh()
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
      <HubTabs hub="crm" />
      {gestion && <Link href={`/app/${ws.slug}/gestion`} className="mb-4 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft/50 px-4 py-3 text-[13px]"><span className="flex-1">Les devis, factures, interventions et factures reçues se gèrent maintenant dans <b>Gestion</b> (PDF, signature, suivi). Cette page garde l’ancien suivi simple.</span><ArrowRight className="size-4" /></Link>}
      <PageHeader title={t('fin.title')} icon={<Wallet className="size-[18px]" />} actions={canWrite && <Button variant="primary" onClick={() => openNew()}><Plus className="size-4" />{t('fin.new')}</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{[[t('fin.revenue'), stats.revenue, 'text-success'], [t('fin.pending'), stats.pending, 'text-warning'], [t('fin.expenses'), stats.expenses, 'text-danger'], [t('fin.balance'), stats.revenue - stats.expenses, '']].map(([l, v, c]) => (
        <div key={l as string} className="rounded-xl border border-border bg-surface p-4"><div className="text-xs text-text-3">{l}</div><div className={`mt-1 text-xl font-semibold tabular-nums ${c}`}>{eur(v as number)}</div></div>))}</div>
      <div className="mb-5 h-56 rounded-xl border border-border bg-surface p-4">
        <BarChartView grid yAxis data={chart} series={[{ key: t('fin.revenue'), color: 'var(--accent)' }, { key: t('fin.expenses'), color: 'var(--danger)', opacity: 0.7 }]} /></div>
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ value: 'all', label: t('common.all') }, { value: 'invoice', label: t('fin.kind.invoice') }, { value: 'quote', label: t('fin.kind.quote') }, { value: 'expense', label: t('fin.kind.expense') }]} />
      {list.length === 0 ? <EmptyState icon={<Wallet className="size-5" />} title={t('fin.empty')} />
        : <ul className="overflow-hidden rounded-xl border border-border bg-surface">{list.map((i) => (
          <li key={i.id}><button onClick={() => setDraft({ id: i.id, kind: i.kind, number: i.number, contact_id: i.contact_id ?? '', status: i.status, issued_at: i.issued_at, due_at: i.due_at ?? '', items: i.items })} className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left last:border-0 hover:bg-surface-2">
            <Badge>{t(`fin.kind.${i.kind}`)}</Badge><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i.number}</span><span className="block truncate text-xs text-text-3">{contacts.data.find((c) => c.id === i.contact_id)?.name ?? '—'} · {format(new Date(i.issued_at), 'd MMM yyyy', { locale: dfl })}</span></span>
            <Badge color={STATUS_COLOR[i.status]}>{t(`fin.status.${i.status}` as any)}</Badge><span className="w-24 text-right text-sm font-semibold tabular-nums">{eur(Number(i.total))}</span></button></li>))}</ul>}

      <Dialog open={!!draft} onClose={() => setDraft(null)} title={`${draft ? t(`fin.kind.${draft.kind}`) : ''} ${draft?.number ?? ''}`} size="lg"
        footer={draft && <>{draft.id && canWrite && <Button variant="ghost" className="mr-auto text-danger" onClick={async () => { await getDb().from('invoices').update({ deleted_at: new Date().toISOString() }).eq('id', draft.id); setDraft(null); inv.refresh() }}><Trash2 className="size-4" />{t('common.delete')}</Button>}
          <Button onClick={() => window.print()}><Printer className="size-4" />{t('fin.print')}</Button><Button variant="primary" onClick={save} disabled={!canWrite}>{t('common.save')}</Button></>}>
        {draft && <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3"><Field label={t('fin.number')}><Input value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} /></Field>
            <Field label={t('crm.contact')}><Select value={draft.contact_id} onChange={(e) => setDraft({ ...draft, contact_id: e.target.value })}><option value="">—</option>{contacts.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label={t('common.status')}><Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{['draft', 'sent', 'paid', 'overdue'].map((s) => <option key={s} value={s}>{t(`fin.status.${s}` as any)}</option>)}</Select></Field>
            <Field label={t('fin.issued')}><Input type="date" value={draft.issued_at} onChange={(e) => setDraft({ ...draft, issued_at: e.target.value })} /></Field>
            <Field label={t('fin.due')}><Input type="date" value={draft.due_at} onChange={(e) => setDraft({ ...draft, due_at: e.target.value })} /></Field></div>
          <div><div className="mb-1.5 text-[13px] font-medium text-text-2">{t('fin.items')}</div><div className="space-y-2">{draft.items.map((it, k) => (
            <div key={k} className="grid grid-cols-[1fr_64px_96px_32px] gap-2"><Input placeholder={t('fin.label')} value={it.label} onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })} />
              <Input type="number" min={0} aria-label={t('fin.qty')} value={it.qty} onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === k ? { ...x, qty: Number(e.target.value) } : x)) })} />
              <Input type="number" min={0} aria-label={t('fin.price')} value={it.price} onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === k ? { ...x, price: Number(e.target.value) } : x)) })} />
              <button onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== k) })} className="text-text-3 hover:text-danger" aria-label={t('common.delete')}><Trash2 className="size-4" /></button></div>))}</div>
            <Button size="sm" className="mt-2" onClick={() => setDraft({ ...draft, items: [...draft.items, { label: '', qty: 1, price: 0 }] })}><Plus className="size-3.5" />{t('fin.addLine')}</Button></div>
          <div className="flex justify-end border-t border-border pt-3 text-sm"><span className="text-text-2">{t('fin.total')}</span><span className="ml-4 text-lg font-semibold tabular-nums">{eur(sum(draft.items))}</span></div></div>}
      </Dialog>
    </div>
  )
}
