'use client'
// Tableau de bord de la gestion (15/10/2026) : chiffre d'affaires, gains, encaissements, devis par état, interventions,
// les 6 derniers mois en graphique, prochaines interventions, factures en retard, meilleurs clients, activité par membre.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { format, startOfMonth, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AlertTriangle, ArrowRight, FileSignature, Gauge, Plus, Receipt, ScanLine, Upload, Wrench } from 'lucide-react'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Button } from '@/components/ui/button'
import { Avatar, PageHeader } from '@/components/ui/misc'
import { AvisMigration, Chips, PERIODES, Pastille, Stat, dateDoc, useDocs, useFiches, useFiltrePeriode, type Periode } from '@/components/gestion/commun'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { entrepriseDe, entrepriseManque, eur, STATUTS, type GDoc } from '@/lib/gestion'
import { modulesActifs } from '@/lib/modules'

const BarChartView = dynamic(() => import('@/components/common/bar-chart'), { ssr: false, loading: () => <div className="skeleton size-full" /> })

export default function GestionPage() {
  const { ws, members, canWrite } = useWorkspace()
  const base = `/app/${ws.slug}/gestion`
  const actifs = modulesActifs(ws)
  const docs = useDocs()
  const fiches = useFiches()
  const [periode, setPeriode] = useState<Periode>('mois')
  const p = useFiltrePeriode(docs.data, periode)
  const auj = new Date().toISOString().slice(0, 10)

  const k = useMemo(() => {
    const fac = p.filter((d) => d.kind === 'facture' && d.status !== 'annulee' && d.status !== 'brouillon')
    const ach = p.filter((d) => d.kind === 'achat')
    const dev = p.filter((d) => d.kind === 'devis')
    const inter = p.filter((d) => d.kind === 'intervention')
    const s = (l: GDoc[], f: 'total_ht' | 'total_ttc' = 'total_ttc') => l.reduce((a, d) => a + Number(d[f]), 0)
    return {
      ca: s(fac, 'total_ht'), encaisse: s(fac.filter((d) => d.status === 'payee')), aEncaisser: s(fac.filter((d) => d.status !== 'payee')),
      depenses: s(ach, 'total_ht'), gains: s(fac, 'total_ht') - s(ach, 'total_ht'),
      devis: STATUTS.devis.map((st) => ({ ...st, n: dev.filter((d) => d.status === st.v).length, m: s(dev.filter((d) => d.status === st.v)) })), nbDevis: dev.length,
      inter: STATUTS.intervention.map((st) => ({ ...st, n: inter.filter((d) => d.status === st.v).length })), nbInter: inter.length, clotures: inter.filter((d) => d.closed_at).length,
    }
  }, [p])

  const mois = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const m = startOfMonth(subMonths(new Date(), 5 - i)), key = format(m, 'yyyy-MM')
    const du = docs.data.filter((d) => d.issued_at.startsWith(key))
    return { name: format(m, 'MMM', { locale: fr }), 'CA HT': Math.round(du.filter((d) => d.kind === 'facture' && !['annulee', 'brouillon'].includes(d.status)).reduce((a, d) => a + Number(d.total_ht), 0)), 'Dépenses HT': Math.round(du.filter((d) => d.kind === 'achat').reduce((a, d) => a + Number(d.total_ht), 0)) }
  }), [docs.data])

  const prochaines = docs.data.filter((d) => d.kind === 'intervention' && !d.closed_at && d.status !== 'annulee').sort((a, b) => dateDoc(a).getTime() - dateDoc(b).getTime()).slice(0, 6)
  const retards = docs.data.filter((d) => d.kind === 'facture' && (d.status === 'en_retard' || (d.status === 'envoyee' && d.due_at && d.due_at < auj)))
  const attente = docs.data.filter((d) => d.kind === 'devis' && ['envoye', 'en_attente'].includes(d.status))
  const topClients = (() => {
    const m = new Map<string, number>()
    for (const d of p) if (d.kind === 'facture' && d.contact_id && d.status !== 'annulee') m.set(d.contact_id, (m.get(d.contact_id) ?? 0) + Number(d.total_ht))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ f: fiches.data.find((x) => x.id === id), v }))
  })()
  const equipe = members.map((m) => ({ m, inter: p.filter((d) => d.kind === 'intervention' && d.assigned_to?.includes(m.user_id)).length, faites: p.filter((d) => d.kind === 'intervention' && d.closed_by === m.user_id).length, devis: p.filter((d) => d.kind === 'devis' && d.created_by === m.user_id).length })).filter((x) => x.inter || x.devis || x.faites)
  const manqueEnt = entrepriseManque(entrepriseDe(ws))
  const nomClient = (d: GDoc) => { const f = fiches.data.find((x) => x.id === d.contact_id); return f?.company || f?.name || d.title || '—' }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <HubTabs hub="gestion" />
      <PageHeader title="Gestion" icon={<Gauge className="size-[18px]" />} actions={canWrite && <div className="flex gap-2">
        {actifs.has('facturation') && <Link href={`${base}/devis?new=1`}><Button variant="primary"><Plus className="size-4" />Devis</Button></Link>}
        {actifs.has('interventions') && <Link href={`${base}/interventions?new=1`}><Button><Wrench className="size-4" /><span className="max-sm:hidden">Intervention</span></Button></Link>}
        {actifs.has('factures_ia') && <Link href={`${base}/scan`}><Button><ScanLine className="size-4" /><span className="max-sm:hidden">Facture IA</span></Button></Link>}
      </div>} />
      {docs.manque ? <AvisMigration /> : <>
        {manqueEnt.length > 0 && <Link href={`/app/${ws.slug}/settings?tab=entreprise`} className="mb-4 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px]"><AlertTriangle className="size-4 shrink-0 text-warning" /><span className="flex-1">Complète les infos de l’entreprise (obligatoires sur les PDF) : {manqueEnt.join(', ')}</span><ArrowRight className="size-4" /></Link>}
        <Chips className="mb-4" value={periode} onChange={setPeriode} items={PERIODES.filter((x) => x.v !== 'perso')} />
        <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
          <Stat label="Chiffre d’affaires HT" value={eur(k.ca)} href={`${base}/factures`} />
          <Stat label="Gains (CA − dépenses)" value={eur(k.gains)} tone={k.gains >= 0 ? 'success' : 'danger'} hint={`Dépenses HT ${eur(k.depenses)}`} />
          <Stat label="Encaissé TTC" value={eur(k.encaisse)} tone="success" />
          <Stat label="À encaisser TTC" value={eur(k.aEncaisser)} tone="warning" />
          <Stat label="Interventions" value={k.nbInter} hint={`${k.clotures} clôturée${k.clotures > 1 ? 's' : ''}`} href={`${base}/interventions`} />
        </div>

        <div className="mb-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-xl border border-border bg-surface p-4"><h2 className="mb-3 text-[13px] font-semibold">6 derniers mois</h2><div className="h-56"><BarChartView grid yAxis data={mois} series={[{ key: 'CA HT', color: 'var(--accent)' }, { key: 'Dépenses HT', color: 'var(--danger)', opacity: 0.7 }]} /></div></section>
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold"><FileSignature className="size-4 text-text-3" />Devis ({k.nbDevis})</h2>
            <ul className="space-y-2.5">{k.devis.map((s) => (
              <li key={s.v}><Link href={`${base}/devis`} className="block"><div className="mb-1 flex items-center justify-between text-[12.5px]"><span style={{ color: s.c }}>{s.l}</span><span className="tabular-nums text-text-2">{s.n} · {eur(s.m)}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full" style={{ width: `${(s.n / Math.max(1, k.nbDevis)) * 100}%`, background: s.c }} /></div></Link></li>))}</ul>
            <h2 className="mb-2 mt-5 flex items-center gap-2 text-[13px] font-semibold"><Wrench className="size-4 text-text-3" />Interventions par état</h2>
            <div className="flex flex-wrap gap-1.5">{k.inter.map((s) => <span key={s.v} className="rounded-full px-2.5 py-1 text-[12px]" style={{ background: `color-mix(in srgb, ${s.c} 14%, transparent)`, color: s.c }}>{s.l} · {s.n}</span>)}</div>
          </section>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Bloc titre="Prochaines interventions" lien={`${base}/interventions`} vide="Aucune intervention à venir">
            {prochaines.map((d) => <LigneDoc key={d.id} href={`${base}/interventions?id=${d.id}`} titre={nomClient(d)} sous={`${d.intervention_type ?? ''} · ${d.start_at ? format(new Date(d.start_at), 'EEE d MMM HH:mm', { locale: fr }) : 'à planifier'}`} droite={<Pastille kind="intervention" status={d.status} />} />)}
          </Bloc>
          <Bloc titre="À relancer" lien={`${base}/factures`} vide="Rien en retard, rien en attente">
            {retards.map((d) => <LigneDoc key={d.id} href={`${base}/factures?id=${d.id}`} titre={nomClient(d)} sous={`${d.number} · échue le ${d.due_at ? format(new Date(d.due_at + 'T12:00:00'), 'd MMM', { locale: fr }) : ''}`} droite={<span className="text-[13px] font-semibold tabular-nums text-danger">{eur(d.total_ttc)}</span>} />)}
            {attente.slice(0, 6 - retards.length).map((d) => <LigneDoc key={d.id} href={`${base}/devis?id=${d.id}`} titre={nomClient(d)} sous={`Devis ${d.number} en attente`} droite={<span className="text-[13px] tabular-nums text-warning">{eur(d.total_ttc)}</span>} />)}
          </Bloc>
          <Bloc titre="Meilleurs clients" lien={`${base}/clients`} vide="Pas encore de facture sur la période">
            {topClients.map(({ f, v }) => f && <LigneDoc key={f.id} href={`${base}/clients/${f.id}`} titre={f.company || f.name} sous={f.city ?? ''} droite={<span className="text-[13px] font-semibold tabular-nums">{eur(v)}</span>} />)}
          </Bloc>
        </div>

        {equipe.length > 0 && <section className="mt-3 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-[13px] font-semibold">Équipe sur la période</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{equipe.map(({ m, inter, faites, devis }) => (
            <li key={m.user_id} className="flex items-center gap-3 rounded-lg border border-border p-2.5"><Avatar name={m.profile?.full_name} src={m.profile?.avatar_url} size={32} />
              <div className="min-w-0 text-[12.5px]"><div className="truncate font-medium">{m.profile?.full_name ?? m.profile?.email}</div><div className="text-text-3">{inter} interv. · {faites} clôturées · {devis} devis</div></div></li>))}</ul>
          <Link href={`${base}/equipe`} className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-text-2 hover:text-text">Voir le détail<ArrowRight className="size-3.5" /></Link>
        </section>}

        {canWrite && docs.data.length === 0 && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border-strong p-4 text-[13px]"><Upload className="size-4 text-text-3" /><span className="flex-1">Tu viens de Sphinx ? Importe tes clients, articles, devis et interventions en une fois.</span><Link href={`${base}/import`}><Button size="sm">Importer</Button></Link></div>}
        <div className="mt-4 flex gap-2 text-[12.5px] text-text-3"><Receipt className="size-4" />Les montants viennent des factures émises (hors brouillons et annulées) et des factures reçues.</div>
      </>}
    </div>
  )
}

function Bloc({ titre, lien, vide, children }: { titre: string; lien: string; vide: string; children: React.ReactNode }) {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean)
  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between px-4 pb-1 pt-3.5"><h2 className="text-[13px] font-semibold">{titre}</h2><Link href={lien} className="text-[12px] text-text-3 hover:text-text">Tout voir</Link></div>
      {items.length ? <ul className="divide-y divide-border/60">{children}</ul> : <p className="px-4 pb-4 pt-2 text-[12.5px] text-text-3">{vide}</p>}
    </section>
  )
}
function LigneDoc({ href, titre, sous, droite }: { href: string; titre: string; sous: string; droite: React.ReactNode }) {
  return <li><Link href={href} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{titre}</span><span className="block truncate text-[11.5px] text-text-3">{sous}</span></span>{droite}</Link></li>
}
