'use client'
// Liste des devis, factures ou interventions (15/10/2026) : recherche, état, période, membre, vue liste ou frise dans le temps.
// Ouvre la fiche avec ?id=<id>, en crée une avec ?new=1 (&client=<id>).
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarRange, FileSignature, List, Lock, Plus, Receipt, Search, Wrench } from 'lucide-react'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Avatar, EmptyState, PageHeader } from '@/components/ui/misc'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { NOM_KIND, STATUTS, eur, type DocKind, type GDoc } from '@/lib/gestion'
import { cn } from '@/lib/utils'
import { AvisMigration, Chips, PERIODES, Pastille, Stat, dateDoc, useArticles, useDocs, useFiches, useFiltrePeriode, type Periode } from './commun'
import { DocEditor } from './doc-editor'

const ICONE = { devis: FileSignature, facture: Receipt, intervention: Wrench, achat: Receipt }
const TITRE: Record<DocKind, string> = { devis: 'Devis', facture: 'Factures', intervention: 'Interventions', achat: 'Factures reçues' }

function Inner({ kind }: { kind: DocKind }) {
  const { ws, members, nameOf, profileOf, canWrite } = useWorkspace()
  const params = useSearchParams()
  const router = useRouter()
  const tous = useDocs()
  const fiches = useFiches()
  const articles = useArticles()
  const docs = useMemo(() => tous.data.filter((d) => d.kind === kind), [tous.data, kind])
  const [q, setQ] = useState('')
  const [statut, setStatut] = useState('tous')
  const [periode, setPeriode] = useState<Periode>('tout')
  const [du, setDu] = useState(''), [au, setAu] = useState('')
  const [membre, setMembre] = useState('')
  const [type, setType] = useState('')
  const [vue, setVue] = useState<'liste' | 'frise'>('liste')
  const [ouvert, setOuvert] = useState<{ doc: GDoc | null; preset?: Partial<GDoc> } | null>(null)

  // ouverture depuis l'URL (liens de la fiche client, du tableau de bord, des notifications)
  const pid = params.get('id'), pnew = params.get('new'), pclient = params.get('client')
  useEffect(() => {
    if (pid) { const d = tous.data.find((x) => x.id === pid); if (d) setOuvert({ doc: d }) }
    else if (pnew) setOuvert({ doc: null, preset: pclient ? { contact_id: pclient } : undefined })
  }, [pid, pnew, pclient, tous.data.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const fermer = () => { setOuvert(null); if (pid || pnew) router.replace(`/app/${ws.slug}/gestion/${kind === 'devis' ? 'devis' : kind === 'facture' ? 'factures' : 'interventions'}`) }

  const dansPeriode = useFiltrePeriode(docs, periode, du, au)
  const liste = useMemo(() => {
    const s = q.trim().toLowerCase()
    return dansPeriode.filter((d) => {
      if (statut === 'cloturee' ? !d.closed_at : statut === 'ouverte' ? !!d.closed_at : statut !== 'tous' && d.status !== statut) return false
      if (membre && !(d.assigned_to ?? []).includes(membre) && d.created_by !== membre) return false
      if (type && d.intervention_type !== type) return false
      if (!s) return true
      const f = fiches.data.find((x) => x.id === d.contact_id)
      return [d.number, d.title, d.ref_externe, d.intervention_type, f?.name, f?.company, f?.city].some((v) => v?.toLowerCase().includes(s))
    }).sort((a, b) => kind === 'intervention' ? dateDoc(a).getTime() - dateDoc(b).getTime() : dateDoc(b).getTime() - dateDoc(a).getTime())
  }, [dansPeriode, q, statut, membre, type, fiches.data, kind])

  const somme = (l: GDoc[]) => l.reduce((a, d) => a + Number(d.total_ttc), 0)
  const stats = kind === 'devis'
    ? [{ l: 'Devis', v: dansPeriode.length }, { l: 'En attente', v: eur(somme(dansPeriode.filter((d) => ['envoye', 'en_attente'].includes(d.status)))), tone: 'warning' as const }, { l: 'Acceptés', v: eur(somme(dansPeriode.filter((d) => d.status === 'accepte'))), tone: 'success' as const }, { l: 'Taux d’acceptation', v: `${Math.round((dansPeriode.filter((d) => d.status === 'accepte').length / Math.max(1, dansPeriode.filter((d) => ['accepte', 'refuse'].includes(d.status)).length)) * 100)} %` }]
    : kind === 'facture'
      ? [{ l: 'Facturé TTC', v: eur(somme(dansPeriode.filter((d) => d.status !== 'annulee'))) }, { l: 'Encaissé', v: eur(somme(dansPeriode.filter((d) => d.status === 'payee'))), tone: 'success' as const }, { l: 'À encaisser', v: eur(somme(dansPeriode.filter((d) => ['envoyee', 'brouillon'].includes(d.status)))), tone: 'warning' as const }, { l: 'En retard', v: eur(somme(dansPeriode.filter((d) => d.status === 'en_retard' || (d.status === 'envoyee' && d.due_at && d.due_at < new Date().toISOString().slice(0, 10))))), tone: 'danger' as const }]
      : [{ l: 'Interventions', v: dansPeriode.length }, { l: 'À planifier', v: dansPeriode.filter((d) => d.status === 'a_planifier').length, tone: 'warning' as const }, { l: 'Planifiées ou en cours', v: dansPeriode.filter((d) => ['planifiee', 'en_cours'].includes(d.status)).length, tone: 'info' as const }, { l: 'Clôturées', v: dansPeriode.filter((d) => d.closed_at).length, tone: 'success' as const }]

  const chipsStatut = [{ v: 'tous', l: 'Tous', n: dansPeriode.length }, ...STATUTS[kind].map((s) => ({ v: s.v, l: s.l, n: dansPeriode.filter((d) => d.status === s.v).length })),
    ...(kind === 'intervention' ? [{ v: 'ouverte', l: 'Non clôturées', n: dansPeriode.filter((d) => !d.closed_at).length }, { v: 'cloturee', l: 'Clôturées', n: dansPeriode.filter((d) => d.closed_at).length }] : [])]
  const types = [...new Set(docs.map((d) => d.intervention_type).filter(Boolean) as string[])]
  const Icone = ICONE[kind]

  const frise = useMemo(() => {
    const g = new Map<string, GDoc[]>()
    for (const d of liste) { const k = format(dateDoc(d), 'yyyy-MM-dd'); g.set(k, [...(g.get(k) ?? []), d]) }
    return [...g.entries()]
  }, [liste])

  const Ligne = ({ d }: { d: GDoc }) => {
    const f = fiches.data.find((x) => x.id === d.contact_id)
    return (
      <button onClick={() => setOuvert({ doc: d })} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2">
        <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-3 sm:flex"><Icone className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><span className="truncate text-[14px] font-medium">{f?.company || f?.name || d.title || '—'}</span>{d.closed_at && <Lock className="size-3.5 shrink-0 text-success" aria-label="Clôturée" />}</span>
          <span className="block truncate text-[12px] text-text-3">{d.number}{d.title && f ? ` · ${d.title}` : ''}{d.intervention_type ? ` · ${d.intervention_type}` : ''} · {kind === 'intervention' && d.start_at ? format(new Date(d.start_at), 'EEE d MMM HH:mm', { locale: fr }) : format(new Date(d.issued_at + 'T12:00:00'), 'd MMM yyyy', { locale: fr })}</span>
        </span>
        {kind === 'intervention' && d.assigned_to?.length > 0 && <span className="hidden -space-x-1.5 md:flex">{d.assigned_to.slice(0, 3).map((u) => <Avatar key={u} name={nameOf(u)} src={profileOf(u)?.avatar_url} size={24} className="ring-2 ring-surface" />)}</span>}
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Pastille kind={kind} status={d.status} />
          {Number(d.total_ttc) > 0 && <span className="text-[13px] font-semibold tabular-nums">{eur(d.total_ttc)}</span>}
        </span>
      </button>
    )
  }

  if (tous.manque) return <><HubTabs hub={kind === 'intervention' ? 'gestion' : 'facturation'} /><AvisMigration /></>

  return (
    <>
      {kind !== 'intervention' && <HubTabs hub="facturation" />}
      <PageHeader title={TITRE[kind]} icon={<Icone className="size-[18px]" />} actions={canWrite && <Button variant="primary" onClick={() => setOuvert({ doc: null })}><Plus className="size-4" /><span className="max-sm:hidden">{kind === 'intervention' ? 'Nouvelle intervention' : `Nouveau ${NOM_KIND[kind].toLowerCase()}`}</span><span className="sm:hidden">Nouveau</span></Button>} />
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">{stats.map((s) => <Stat key={s.l} label={s.l} value={s.v} tone={'tone' in s ? s.tone : undefined} />)}</div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" /><Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client, numéro, ville, objet…" aria-label="Rechercher" /></div>
        <div className="flex gap-2">
          <Select className="flex-1 sm:w-44" value={membre} onChange={(e) => setMembre(e.target.value)} aria-label="Membre"><option value="">Toute l’équipe</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.full_name ?? m.profile?.email}</option>)}</Select>
          {kind === 'intervention' && types.length > 0 && <Select className="flex-1 sm:w-40" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">Tous types</option>{types.map((t) => <option key={t}>{t}</option>)}</Select>}
          <div className="flex rounded-lg border border-border p-0.5">{([['liste', List], ['frise', CalendarRange]] as const).map(([v, I]) => <button key={v} onClick={() => setVue(v)} aria-label={v === 'liste' ? 'Vue liste' : 'Vue dans le temps'} className={cn('flex size-8 items-center justify-center rounded-md', vue === v ? 'bg-surface-3 text-text' : 'text-text-3')}><I className="size-4" /></button>)}</div>
        </div>
      </div>
      <Chips className="mb-2" value={periode} onChange={setPeriode} items={PERIODES} />
      {periode === 'perso' && <div className="mb-2 flex gap-2"><Input type="date" value={du} onChange={(e) => setDu(e.target.value)} aria-label="Du" /><Input type="date" value={au} onChange={(e) => setAu(e.target.value)} aria-label="Au" /></div>}
      <Chips className="mb-4" value={statut} onChange={setStatut} items={chipsStatut} />

      {tous.loading && !docs.length ? <div className="skeleton h-40 rounded-xl" />
        : liste.length === 0 ? <EmptyState icon={<Icone className="size-5" />} title={docs.length ? 'Rien pour ces filtres' : `Aucun ${kind === 'intervention' ? 'intervention' : NOM_KIND[kind].toLowerCase()} pour l’instant`} hint={docs.length ? undefined : 'Crée le premier, ou importe ta liste depuis Sphinx.'} action={canWrite && <Button variant="primary" onClick={() => setOuvert({ doc: null })}><Plus className="size-4" />Créer</Button>} />
          : vue === 'liste'
            ? <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-surface">{liste.map((d) => <li key={d.id}><Ligne d={d} /></li>)}</ul>
            : <div className="space-y-4">{frise.map(([jour, l]) => (
              <section key={jour} className="grid gap-2 sm:grid-cols-[120px_1fr]">
                <div className="sm:pt-3"><div className="text-[13px] font-semibold capitalize">{format(new Date(jour + 'T12:00:00'), 'EEEE d', { locale: fr })}</div><div className="text-[12px] capitalize text-text-3">{format(new Date(jour + 'T12:00:00'), 'MMMM yyyy', { locale: fr })} · {eur(somme(l))}</div></div>
                <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-surface">{l.map((d) => <li key={d.id}><Ligne d={d} /></li>)}</ul>
              </section>))}</div>}

      <DocEditor open={!!ouvert} onClose={fermer} kind={kind} doc={ouvert?.doc} preset={ouvert?.preset} docs={tous.data} fiches={fiches.data} articles={articles.data} onSaved={() => tous.refresh()} />
    </>
  )
}

export function DocsPage({ kind }: { kind: DocKind }) {
  return <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6"><Suspense><Inner kind={kind} /></Suspense></div>
}
