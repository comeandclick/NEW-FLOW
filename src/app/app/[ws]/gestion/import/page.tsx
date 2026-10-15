'use client'
// Import Sphinx (15/10/2026) : fiches clients, articles (grandes listes), devis, factures, interventions.
// 1. on choisit quoi importer, 2. on dépose l'export Excel/CSV, 3. on vérifie les colonnes reconnues, 4. on importe.
// Rien n'est créé en double : un code client, une référence d'article ou un numéro déjà présent est ignoré.
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CheckCircle2, FileSpreadsheet, Package, Receipt, FileSignature, Upload, Users, Wrench } from 'lucide-react'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/misc'
import { AvisMigration, useArticles, useDocs, useFiches } from '@/components/gestion/commun'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { CHAMPS, devinerColonnes, lireFichier, preparer, type TypeImport } from '@/lib/gestion-import'
import { espaceClient, synchroniser } from '@/lib/gestion-sync'
import { cn } from '@/lib/utils'
import type { DocKind, GDoc } from '@/lib/gestion'

const TYPES: { v: TypeImport; l: string; d: string; I: typeof Users; href: string }[] = [
  { v: 'clients', l: 'Fiches clients', d: 'Codes, coordonnées, adresses, SIRET', I: Users, href: 'clients' },
  { v: 'articles', l: 'Articles', d: 'Catalogue, même de plusieurs milliers de lignes', I: Package, href: 'articles' },
  { v: 'devis', l: 'Devis', d: 'Numéros, montants, états', I: FileSignature, href: 'devis' },
  { v: 'facture', l: 'Factures', d: 'Montants, échéances, paiements', I: Receipt, href: 'factures' },
  { v: 'intervention', l: 'Interventions (OI / BI)', d: 'Dates, techniciens, types, états', I: Wrench, href: 'interventions' },
]
const PAQUET = 400

export default function ImportPage() {
  const { ws, members, canWrite, log } = useWorkspace()
  const { userId } = useSession()
  const fiches = useFiches()
  const articles = useArticles()
  const docs = useDocs()
  const [type, setType] = useState<TypeImport>('clients')
  const [fichier, setFichier] = useState<string | null>(null)
  const [data, setData] = useState<string[][] | null>(null)
  const [col, setCol] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [avance, setAvance] = useState(0)
  const [fini, setFini] = useState<{ n: number; ignores: number; clients: number } | null>(null)
  const [survol, setSurvol] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function charger(f: File) {
    setFini(null)
    try {
      const rows = await lireFichier(f)
      if (rows.length < 2) { toast.error('Le fichier ne contient pas de lignes'); return }
      setData(rows); setFichier(f.name); setCol(devinerColonnes(type, rows[0]))
    } catch (e) { toast.error((e as Error).message || 'Fichier illisible') }
  }
  const changerType = (t: TypeImport) => { setType(t); setFini(null); if (data) setCol(devinerColonnes(t, data[0])) }

  const nums = (k: DocKind) => docs.data.filter((d) => d.kind === k).flatMap((d) => [d.number, d.ref_externe ?? ''])
  const prep = useMemo(() => data && userId ? preparer(type, data, col, {
    wsId: ws.id, userId, fiches: fiches.data, articles: articles.data,
    numeros: { devis: nums('devis'), facture: nums('facture'), intervention: nums('intervention'), achat: nums('achat') },
    membres: members.map((m) => ({ user_id: m.user_id, nom: m.profile?.full_name ?? m.profile?.email ?? '' })),
  }) : null, [data, type, col, userId, ws.id, fiches.data, articles.data, docs.data, members]) // eslint-disable-line react-hooks/exhaustive-deps
  const manquants = CHAMPS[type].filter((c) => c.requis && (col[c.k] === undefined || col[c.k] < 0))

  async function importer() {
    if (!prep || !userId) return
    setBusy(true); setAvance(0)
    const db = getDb()
    try {
      // 1. clients cités dans les devis / factures / interventions mais absents : créés d'abord
      const ids = new Map<string, string>()
      for (let i = 0; i < prep.clientsACreer.length; i += PAQUET) {
        const lot = prep.clientsACreer.slice(i, i + PAQUET)
        const { data: crees, error } = await db.from('crm_contacts').insert(lot.map((c) => ({ workspace_id: ws.id, created_by: userId, status: 'customer', name: c.name, ref_externe: c.ref_externe }))).select('id')
        if (error) throw error
        lot.forEach((c, j) => ids.set(c.cle, (crees as { id: string }[])[j].id))
      }
      const ouverts: GDoc[] = []
      const rows = prep.rows.map((r) => (typeof r.contact_id === 'string' && r.contact_id.startsWith('@') ? { ...r, contact_id: ids.get(r.contact_id.slice(1)) ?? null } : r))
      // 2. les lignes, par paquets (les grandes listes d'articles passent sans bloquer)
      for (let i = 0; i < rows.length; i += PAQUET) {
        const { data: lot, error } = await db.from(prep.table).insert(rows.slice(i, i + PAQUET)).select('*')
        if (error) throw error
        if (prep.table === 'gestion_documents') ouverts.push(...((lot ?? []) as GDoc[]).filter((d) => (d.kind === 'intervention' && !d.closed_at && d.status !== 'annulee' && (!d.start_at || d.start_at >= new Date().toISOString())) || (d.kind === 'facture' && !['payee', 'annulee'].includes(d.status) && d.due_at) || (d.kind === 'devis' && ['envoye', 'en_attente'].includes(d.status))))
        setAvance(Math.min(rows.length, i + PAQUET) / rows.length)
      }
      // les clients importés ou créés ont aussi leur espace dans Clients
      await espaceClient(ws.id, userId, [...prep.clientsACreer.map((c) => ({ name: c.name })), ...(prep.table === 'crm_contacts' ? rows.map((r) => ({ name: String(r.name), company: (r.company as string | null) ?? null, notes: (r.notes as string | null) ?? null })) : [])])
      // ce qui est encore ouvert (interventions à venir, factures à encaisser, devis en attente) arrive dans Tâches et au Calendrier
      for (const d of ouverts.slice(0, 300)) await synchroniser(d, { wsId: ws.id, userId, entreprise: {} })
      log('import', prep.table, null, { type, fichier, lignes: rows.length })
      setFini({ n: rows.length, ignores: prep.ignores, clients: prep.clientsACreer.length })
      setData(null); fiches.refresh(); articles.refresh(); docs.refresh()
    } catch (e) {
      const m = (e as { message?: string }).message ?? ''
      toast.error(/column|relation|schema/.test(m) ? 'La migration de la gestion n’est pas encore passée' : `Import arrêté : ${m}`)
    } finally { setBusy(false) }
  }

  const titres = data?.[0] ?? []
  const apercu = data?.slice(1, 6) ?? []
  const cible = TYPES.find((t) => t.v === type)!

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
      <HubTabs hub="gestion" />
      <PageHeader title="Import Sphinx" icon={<Upload className="size-[18px]" />} />
      {docs.manque ? <AvisMigration /> : !canWrite ? <p className="text-[13px] text-text-3">Les lecteurs ne peuvent pas importer.</p> : <>
        <p className="mb-4 max-w-2xl text-[13.5px] text-text-2">Dans Sphinx Manager, exporte la liste voulue en Excel (.xlsx) ou CSV, puis dépose le fichier ici. Flow reconnaît les colonnes ; tu peux corriger chaque correspondance avant d’importer. Les éléments déjà présents (même code, référence ou numéro) ne sont pas recréés.</p>

        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-3">1. Quoi importer</h2>
        <div className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-5">{TYPES.map((t) => (
          <button key={t.v} onClick={() => changerType(t.v)} className={cn('flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors', type === t.v ? 'border-accent bg-accent-soft/50' : 'border-border bg-surface hover:border-border-strong')}>
            <t.I className="size-4 text-text-2" /><span className="text-[13.5px] font-medium">{t.l}</span><span className="text-[11.5px] leading-snug text-text-3">{t.d}</span></button>))}</div>

        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-3">2. Le fichier</h2>
        <input ref={input} type="file" accept=".xlsx,.csv,.txt,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void charger(f); e.target.value = '' }} />
        <button onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setSurvol(true) }} onDragLeave={() => setSurvol(false)} onDrop={(e) => { e.preventDefault(); setSurvol(false); const f = e.dataTransfer.files[0]; if (f) void charger(f) }}
          className={cn('mb-6 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors', survol ? 'border-accent bg-accent-soft/40' : 'border-border-strong hover:bg-surface-2')}>
          <FileSpreadsheet className="size-7 text-text-3" />
          <span className="text-[14px] font-medium">{fichier ? `${fichier} · ${(data?.length ?? 1) - 1} lignes` : 'Dépose ton export Excel ou CSV, ou clique pour le choisir'}</span>
          <span className="text-[12px] text-text-3">.xlsx, .csv (séparateur ; ou ,)</span>
        </button>

        {fini && <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-4 text-[13.5px]"><CheckCircle2 className="size-5 text-success" /><span className="flex-1"><b>{fini.n}</b> {cible.l.toLowerCase()} importé{fini.n > 1 ? 's' : ''}{fini.clients ? `, ${fini.clients} fiche${fini.clients > 1 ? 's' : ''} client créée${fini.clients > 1 ? 's' : ''}` : ''}{fini.ignores ? ` · ${fini.ignores} ignoré${fini.ignores > 1 ? 's' : ''} (déjà présents ou vides)` : ''}.</span>
          <Link href={`/app/${ws.slug}/gestion/${cible.href}`}><Button size="sm">Voir</Button></Link></div>}

        {data && <>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-3">3. Les colonnes</h2>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{CHAMPS[type].map((c) => (
            <label key={c.k} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
              <span className="w-36 shrink-0 text-[12.5px] font-medium">{c.l}{c.requis && ' *'}</span>
              <Select className="h-8 min-w-0 flex-1" value={col[c.k] ?? -1} onChange={(e) => setCol({ ...col, [c.k]: Number(e.target.value) })} aria-label={c.l}>
                <option value={-1}>— Ignorer —</option>{titres.map((t, i) => <option key={i} value={i}>{t || `Colonne ${i + 1}`}</option>)}</Select>
            </label>))}</div>
          <div className="mb-4 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[600px] text-[12px]"><thead className="bg-surface-2/60 text-left text-text-3"><tr>{titres.map((t, i) => <th key={i} className={cn('whitespace-nowrap px-3 py-2 font-medium', Object.values(col).includes(i) && 'text-accent')}>{t}</th>)}</tr></thead>
            <tbody className="divide-y divide-border/60">{apercu.map((r, i) => <tr key={i}>{titres.map((_, j) => <td key={j} className="max-w-48 truncate whitespace-nowrap px-3 py-1.5 text-text-2">{r[j]}</td>)}</tr>)}</tbody></table></div>

          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-3">4. Importer</h2>
          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur safe-bottom sm:mx-0 sm:rounded-xl sm:border">
            <span className="mr-auto text-[13px] text-text-2">{manquants.length ? `Choisis la colonne : ${manquants.map((m) => m.l).join(', ')}` : `${prep?.rows.length ?? 0} à importer${prep?.ignores ? ` · ${prep.ignores} ignorés` : ''}${prep?.clientsACreer.length ? ` · ${prep.clientsACreer.length} nouveaux clients` : ''}`}</span>
            {busy && <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-accent transition-[width]" style={{ width: `${avance * 100}%` }} /></div>}
            <Button variant="ghost" disabled={busy} onClick={() => { setData(null); setFichier(null) }}>Annuler</Button>
            <Button variant="primary" loading={busy} disabled={!!manquants.length || !prep?.rows.length} onClick={importer}>Importer</Button>
          </div>
        </>}
      </>}
    </div>
  )
}
