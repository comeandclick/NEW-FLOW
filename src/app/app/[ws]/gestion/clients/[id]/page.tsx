'use client'
// Fiche d'un client (15/10/2026) : coordonnées, chiffres, et TOUT ce qui le concerne dans le temps :
// devis, factures, interventions (avec leur état, qui les a faites), tâches et événements liés.
import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowLeft, CalendarDays, CheckSquare, FileSignature, Mail, MapPin, Pencil, Phone, Plus, Receipt, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, EmptyState } from '@/components/ui/misc'
import { Chips, Pastille, Stat, dateDoc, useArticles, useDocs, useFiches } from '@/components/gestion/commun'
import { DocEditor, NouveauClient } from '@/components/gestion/doc-editor'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useLive } from '@/lib/hooks/use-live'
import { NOM_KIND, eur, type DocKind, type GDoc } from '@/lib/gestion'
import { modulesActifs } from '@/lib/modules'
import type { Task } from '@/lib/types'

const ICONE: Record<DocKind, typeof Receipt> = { devis: FileSignature, facture: Receipt, intervention: Wrench, achat: Receipt }

export default function FicheClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { ws, nameOf, canWrite } = useWorkspace()
  const actifs = modulesActifs(ws)
  const fiches = useFiches()
  const docs = useDocs()
  const articles = useArticles()
  const f = fiches.data.find((x) => x.id === id)
  const siens = useMemo(() => docs.data.filter((d) => d.contact_id === id).sort((a, b) => dateDoc(b).getTime() - dateDoc(a).getTime()), [docs.data, id])
  const taskIds = siens.map((d) => d.task_id).filter(Boolean) as string[]
  const taches = useLive<Task>('tasks', { eq: { workspace_id: ws.id }, in: { id: taskIds.length ? taskIds : ['00000000-0000-0000-0000-000000000000'] }, is: { deleted_at: null }, enabled: taskIds.length > 0 })
  const [filtre, setFiltre] = useState<'tout' | DocKind>('tout')
  const [edit, setEdit] = useState(false)
  const [ouvert, setOuvert] = useState<{ kind: DocKind; doc: GDoc | null } | null>(null)

  if (fiches.loading && !f) return <div className="mx-auto max-w-5xl p-6"><div className="skeleton h-40 rounded-xl" /></div>
  if (!f) return <div className="p-6"><EmptyState title="Client introuvable" action={<Link href={`/app/${ws.slug}/gestion/clients`}><Button>Retour</Button></Link>} /></div>

  const ca = siens.filter((d) => d.kind === 'facture' && !['annulee', 'brouillon'].includes(d.status)).reduce((a, d) => a + Number(d.total_ht), 0)
  const du = siens.filter((d) => d.kind === 'facture' && ['envoyee', 'en_retard'].includes(d.status)).reduce((a, d) => a + Number(d.total_ttc), 0)
  const liste = siens.filter((d) => filtre === 'tout' || d.kind === filtre)
  const nouveau = (kind: DocKind) => setOuvert({ kind, doc: null })

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Link href={`/app/${ws.slug}/gestion/clients`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-text-3 hover:text-text"><ArrowLeft className="size-4" />Fiches clients</Link>
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar name={f.company || f.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{f.company || f.name}</h1>
          <p className="text-[13px] text-text-3">{f.company ? `${f.name} · ` : ''}{f.kind === 'pro' ? 'Professionnel' : 'Particulier'}{f.siret ? ` · SIRET ${f.siret}` : ''}{f.ref_externe ? ` · code ${f.ref_externe}` : ''}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-text-2">
            {f.phone && <a href={`tel:${f.phone}`} className="flex items-center gap-1.5 hover:text-text"><Phone className="size-3.5" />{f.phone}</a>}
            {f.email && <a href={`mailto:${f.email}`} className="flex items-center gap-1.5 hover:text-text"><Mail className="size-3.5" />{f.email}</a>}
            {(f.address || f.city) && <a href={`https://maps.apple.com/?q=${encodeURIComponent([f.address, f.zip, f.city].filter(Boolean).join(' '))}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-text"><MapPin className="size-3.5" />{[f.address, f.zip, f.city].filter(Boolean).join(', ')}</a>}
          </div>
        </div>
        {canWrite && <Button onClick={() => setEdit(true)}><Pencil className="size-4" />Modifier</Button>}
      </header>
      {f.notes && <p className="mb-4 whitespace-pre-wrap rounded-xl bg-surface-2/60 p-3 text-[13px] text-text-2">{f.notes}</p>}

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Chiffre d’affaires HT" value={eur(ca)} />
        <Stat label="Reste à payer TTC" value={eur(du)} tone={du ? 'warning' : undefined} />
        <Stat label="Devis" value={siens.filter((d) => d.kind === 'devis').length} hint={`${siens.filter((d) => d.kind === 'devis' && d.status === 'accepte').length} acceptés`} />
        <Stat label="Interventions" value={siens.filter((d) => d.kind === 'intervention').length} hint={`${siens.filter((d) => d.kind === 'intervention' && !d.closed_at).length} non clôturées`} />
      </div>

      {canWrite && <div className="mb-4 flex flex-wrap gap-2">
        {actifs.has('facturation') && <><Button size="sm" onClick={() => nouveau('devis')}><Plus className="size-3.5" />Devis</Button><Button size="sm" onClick={() => nouveau('facture')}><Plus className="size-3.5" />Facture</Button></>}
        {actifs.has('interventions') && <Button size="sm" onClick={() => nouveau('intervention')}><Plus className="size-3.5" />Intervention</Button>}
      </div>}

      <Chips className="mb-3" value={filtre} onChange={setFiltre} items={[{ v: 'tout', l: 'Tout', n: siens.length }, ...(['devis', 'facture', 'intervention'] as const).map((k) => ({ v: k, l: { devis: 'Devis', facture: 'Factures', intervention: 'Interventions' }[k], n: siens.filter((d) => d.kind === k).length }))]} />
      {liste.length === 0 ? <EmptyState title="Rien pour ce client" />
        : <ol className="relative space-y-2 border-l border-border pl-5">{liste.map((d) => { const I = ICONE[d.kind]; return (
          <li key={d.id} className="relative">
            <span className="absolute -left-[29px] top-3 flex size-4 items-center justify-center rounded-full border border-border bg-surface"><span className="size-1.5 rounded-full bg-text-3" /></span>
            <button onClick={() => setOuvert({ kind: d.kind, doc: d })} className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:border-border-strong">
              <I className="size-4 shrink-0 text-text-3" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{d.kind === 'intervention' ? d.intervention_type ?? 'Intervention' : NOM_KIND[d.kind]} {d.number}{d.title ? ` · ${d.title}` : ''}</span>
                <span className="block truncate text-[12px] text-text-3">{format(dateDoc(d), 'd MMM yyyy', { locale: fr })} · {d.kind === 'intervention' && d.assigned_to?.length ? `par ${d.assigned_to.map(nameOf).join(', ')}` : `créé par ${nameOf(d.created_by)}`}{d.signer_name ? ` · signé par ${d.signer_name}` : ''}</span></span>
              <span className="flex shrink-0 flex-col items-end gap-1"><Pastille kind={d.kind} status={d.status} />{Number(d.total_ttc) > 0 && <span className="text-[12.5px] font-semibold tabular-nums">{eur(d.total_ttc)}</span>}</span>
            </button>
          </li>) })}</ol>}

      {taches.data.length > 0 && <section className="mt-6"><h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><CheckSquare className="size-4 text-text-3" />Tâches liées</h2>
        <ul className="divide-y divide-border/60 rounded-xl border border-border bg-surface">{taches.data.map((t) => <li key={t.id}><Link href={`/app/${ws.slug}/tasks?task=${t.id}`} className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-surface-2"><span className={t.status === 'done' ? 'flex-1 text-text-3 line-through' : 'flex-1'}>{t.title}</span>{t.due_date && <span className="flex items-center gap-1 text-[12px] text-text-3"><CalendarDays className="size-3.5" />{format(new Date(t.due_date), 'd MMM', { locale: fr })}</span>}<span className="text-[12px] text-text-3">{nameOf(t.assignee_id)}</span></Link></li>)}</ul></section>}

      <NouveauClient open={edit} onClose={() => setEdit(false)} initial={f} onCree={() => fiches.refresh()} />
      {ouvert && <DocEditor open onClose={() => setOuvert(null)} kind={ouvert.kind} doc={ouvert.doc} preset={{ contact_id: f.id, address: f.address ?? null }} docs={docs.data} fiches={fiches.data} articles={articles.data} onSaved={() => docs.refresh()} />}
    </div>
  )
}
