'use client'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Dialog } from '@/components/ui/overlay'
import { useI18n } from '@/i18n/provider'
import type { Key } from '@/i18n/dict'
import { CADENCES, type ClientCadence, type ClientRow } from '@/lib/clients'

export type ClientFields = Pick<ClientRow, 'name' | 'company' | 'cadence' | 'per_period' | 'notes'>

/** Création ou modification d'un client (nom, rythme, notes internes). */
export function ClientFormDialog({ open, onClose, initial, onSubmit, submitLabel, title }: {
  open: boolean; onClose: () => void; initial?: Partial<ClientFields>; onSubmit: (v: ClientFields) => Promise<void>; submitLabel: string; title: string
}) {
  const { t } = useI18n()
  const [v, setV] = useState<ClientFields>({ name: '', company: null, cadence: 'week', per_period: null, notes: null })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setV({ name: initial?.name ?? '', company: initial?.company ?? null, cadence: initial?.cadence ?? 'week', per_period: initial?.per_period ?? null, notes: initial?.notes ?? null })
  }, [open, initial])
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!v.name.trim()) return
    setBusy(true)
    try { await onSubmit({ ...v, name: v.name.trim(), company: v.company?.trim() || null, notes: v.notes?.trim() || null }) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t('cli.name')}><Input autoFocus required maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label={t('cli.company')}><Input maxLength={120} value={v.company ?? ''} onChange={(e) => setV({ ...v, company: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('cli.cadence')}>
            <Select value={v.cadence} onChange={(e) => setV({ ...v, cadence: e.target.value as ClientCadence })}>
              {CADENCES.map((c) => <option key={c} value={c}>{t(`cli.cad.${c}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('cli.perPeriod')} hint={t('cli.perPeriodHint')}>
            <Input type="number" min={1} max={31} value={v.per_period ?? ''} onChange={(e) => setV({ ...v, per_period: e.target.value ? Math.max(1, Math.min(31, Number(e.target.value))) : null })} />
          </Field>
        </div>
        <Field label={t('cli.notes')} hint={t('cli.notesHint')}><Textarea rows={3} maxLength={2000} value={v.notes ?? ''} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        <div className="flex justify-end gap-2 pt-1"><Button onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" variant="primary" loading={busy} disabled={!v.name.trim()}>{submitLabel}</Button></div>
      </form>
    </Dialog>
  )
}

/** « Chaque semaine · 3 par semaine » */
export function cadenceLabel(t: (k: Key, vars?: Record<string, string | number>) => string, c: Pick<ClientRow, 'cadence' | 'per_period'>) {
  const base = t(`cli.cad.${c.cadence}`)
  return c.per_period && c.cadence === 'week' ? `${base} · ${t('cli.perWeek', { n: c.per_period })}` : base
}
