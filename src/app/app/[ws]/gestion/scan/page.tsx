'use client'
// Factures lues par l'IA (15/10/2026) : on dépose une photo ou un PDF, l'assistant lit la facture, reconnaît le client,
// et propose la suite dans un widget : ranger la facture, mettre l'échéance au calendrier, créer une tâche.
// En dessous, toutes les factures reçues, triables par client, date ou montant.
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Receipt, ScanLine } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { AvisMigration, Chips, Pastille, useArticles, useDocs, useFiches } from '@/components/gestion/commun'
import { DocEditor } from '@/components/gestion/doc-editor'
import { AssistantFactures } from '@/components/gestion/assistant-factures'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { eur, type GDoc } from '@/lib/gestion'

export default function ScanPage() {
  const { canWrite } = useWorkspace()
  const docs = useDocs()
  const fiches = useFiches()
  const articles = useArticles()
  const [tri, setTri] = useState<'date' | 'client' | 'montant'>('date')
  const [ouvert, setOuvert] = useState<GDoc | null>(null)
  const recues = useMemo(() => {
    const l = docs.data.filter((d) => d.kind === 'achat' || (d.kind === 'facture' && d.ai_data))
    const nom = (d: GDoc) => { const f = fiches.data.find((x) => x.id === d.contact_id); return (f?.company || f?.name || d.title || '').toLowerCase() }
    return [...l].sort((a, b) => tri === 'montant' ? Number(b.total_ttc) - Number(a.total_ttc) : tri === 'client' ? nom(a).localeCompare(nom(b)) : b.issued_at.localeCompare(a.issued_at))
  }, [docs.data, fiches.data, tri])
  const groupes = useMemo(() => {
    const g = new Map<string, GDoc[]>()
    for (const d of recues) {
      const f = fiches.data.find((x) => x.id === d.contact_id)
      const k = tri === 'client' ? f?.company || f?.name || 'Sans client' : tri === 'date' ? format(new Date(d.issued_at + 'T12:00:00'), 'MMMM yyyy', { locale: fr }) : 'Par montant'
      g.set(k, [...(g.get(k) ?? []), d])
    }
    return [...g.entries()]
  }, [recues, fiches.data, tri])

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6">
      <PageHeader title="Factures lues par l’IA" icon={<ScanLine className="size-[18px]" />} />
      {docs.manque ? <AvisMigration /> : <>
        {canWrite && <div className="mb-6"><AssistantFactures onOuvrir={(id) => setOuvert(docs.data.find((d) => d.id === id) ?? null)} /></div>}

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-[15px] font-semibold">Factures rangées <span className="font-normal text-text-3">({recues.length})</span></h2>
          <Chips value={tri} onChange={setTri} items={[{ v: 'date', l: 'Par date' }, { v: 'client', l: 'Par client' }, { v: 'montant', l: 'Par montant' }]} /></div>
        {recues.length === 0 ? <EmptyState icon={<Receipt className="size-5" />} title="Aucune facture rangée" hint="Les factures lues par l’IA apparaissent ici, triées comme tu veux." />
          : <div className="space-y-4">{groupes.map(([g, l]) => (
            <section key={g}><h3 className="mb-1.5 flex justify-between text-[12.5px] font-medium capitalize text-text-3"><span>{g}</span><span className="tabular-nums">{eur(l.reduce((a, d) => a + Number(d.total_ttc), 0))}</span></h3>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-surface">{l.map((d) => { const f = fiches.data.find((x) => x.id === d.contact_id); return (
                <li key={d.id}><button onClick={() => setOuvert(d)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2"><span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{d.title || d.number}</span><span className="block truncate text-[12px] text-text-3">{format(new Date(d.issued_at + 'T12:00:00'), 'd MMM yyyy', { locale: fr })}{f ? ` · ${f.company || f.name}` : ''}{d.ref_externe ? ` · n° ${d.ref_externe}` : ''}</span></span>
                  <Pastille kind={d.kind} status={d.status} /><span className="w-24 text-right text-[13px] font-semibold tabular-nums">{eur(d.total_ttc)}</span></button></li>) })}</ul></section>))}</div>}
      </>}
      {ouvert && <DocEditor open onClose={() => setOuvert(null)} kind={ouvert.kind} doc={ouvert} docs={docs.data} fiches={fiches.data} articles={articles.data} onSaved={() => docs.refresh()} />}
    </div>
  )
}

