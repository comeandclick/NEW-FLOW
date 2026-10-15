'use client'
// Fiches clients de la gestion (15/10/2026) : les contacts du CRM avec adresse, SIRET, et pour chacun
// le nombre de devis, factures et interventions et le chiffre d'affaires.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MapPin, Phone, Plus, Search, Users } from 'lucide-react'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, EmptyState, PageHeader } from '@/components/ui/misc'
import { AvisMigration, Chips, useDocs, useFiches } from '@/components/gestion/commun'
import { NouveauClient } from '@/components/gestion/doc-editor'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { eur } from '@/lib/gestion'

export default function ClientsGestionPage() {
  const { ws, canWrite } = useWorkspace()
  const fiches = useFiches()
  const docs = useDocs()
  const [q, setQ] = useState('')
  const [type, setType] = useState<'tous' | 'particulier' | 'pro'>('tous')
  const [nouveau, setNouveau] = useState(false)
  const parClient = useMemo(() => {
    const m = new Map<string, { devis: number; factures: number; inter: number; ca: number; ouvertes: number }>()
    for (const d of docs.data) {
      if (!d.contact_id) continue
      const x = m.get(d.contact_id) ?? { devis: 0, factures: 0, inter: 0, ca: 0, ouvertes: 0 }
      if (d.kind === 'devis') x.devis++
      if (d.kind === 'facture') { x.factures++; if (d.status !== 'annulee' && d.status !== 'brouillon') x.ca += Number(d.total_ht) }
      if (d.kind === 'intervention') { x.inter++; if (!d.closed_at && d.status !== 'annulee') x.ouvertes++ }
      m.set(d.contact_id, x)
    }
    return m
  }, [docs.data])
  const liste = fiches.data.filter((f) => (type === 'tous' || (f.kind ?? 'particulier') === type) && (!q.trim() || [f.name, f.company, f.city, f.email, f.phone, f.ref_externe].some((v) => v?.toLowerCase().includes(q.toLowerCase()))))
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <HubTabs hub="gestion" />
      <PageHeader title="Fiches clients" icon={<Users className="size-[18px]" />} actions={canWrite && <Button variant="primary" onClick={() => setNouveau(true)}><Plus className="size-4" />Client</Button>} />
      {docs.manque ? <AvisMigration /> : <>
        <div className="relative mb-3"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" /><Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, société, ville, téléphone, code Sphinx…" aria-label="Rechercher un client" /></div>
        <Chips className="mb-4" value={type} onChange={setType} items={[{ v: 'tous', l: 'Tous', n: fiches.data.length }, { v: 'particulier', l: 'Particuliers' }, { v: 'pro', l: 'Professionnels' }]} />
        {liste.length === 0 ? <EmptyState icon={<Users className="size-5" />} title={fiches.data.length ? 'Aucun client pour cette recherche' : 'Aucun client pour l’instant'} hint="Ajoute-les un par un ou importe ta liste depuis Sphinx." action={canWrite && <Link href={`/app/${ws.slug}/gestion/import`}><Button>Importer</Button></Link>} />
          : <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{liste.map((f) => { const s = parClient.get(f.id); return (
            <li key={f.id}><Link href={`/app/${ws.slug}/gestion/clients/${f.id}`} className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong">
              <div className="flex items-center gap-3"><Avatar name={f.company || f.name} size={36} /><div className="min-w-0 flex-1"><div className="truncate text-[14px] font-medium">{f.company || f.name}</div><div className="truncate text-[12px] text-text-3">{f.company ? f.name : f.kind === 'pro' ? 'Professionnel' : 'Particulier'}{f.ref_externe ? ` · ${f.ref_externe}` : ''}</div></div>{s?.ca ? <span className="text-[13px] font-semibold tabular-nums">{eur(s.ca)}</span> : null}</div>
              {(f.city || f.phone) && <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-text-2">{f.city && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{f.city}</span>}{f.phone && <span className="flex items-center gap-1"><Phone className="size-3.5" />{f.phone}</span>}</div>}
              <div className="mt-auto flex flex-wrap gap-1.5 text-[11.5px] text-text-3">{[['devis', s?.devis], ['factures', s?.factures], ['interventions', s?.inter]].map(([l, n]) => <span key={l as string} className="rounded-full bg-surface-2 px-2 py-0.5">{n ?? 0} {l}</span>)}{s?.ouvertes ? <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">{s.ouvertes} en cours</span> : null}</div>
            </Link></li>) })}</ul>}
      </>}
      <NouveauClient open={nouveau} onClose={() => setNouveau(false)} onCree={() => fiches.refresh()} />
    </div>
  )
}
