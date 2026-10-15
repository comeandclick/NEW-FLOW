'use client'
// Catalogue d'articles (15/10/2026) : pièces, fournitures, main d'œuvre, forfaits, utilisés pour remplir devis,
// factures et interventions. Grande liste importable depuis Sphinx (page Import).
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Package, Plus, Search, Trash2, Upload } from 'lucide-react'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { AvisMigration, Chips, useArticles } from '@/components/gestion/commun'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { entrepriseDe, eur, type Article } from '@/lib/gestion'

type Brouillon = Partial<Article> & { label: string }

export default function ArticlesPage() {
  const { ws, canWrite, log } = useWorkspace()
  const { userId } = useSession()
  const arts = useArticles()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('toutes')
  const [b, setB] = useState<Brouillon | null>(null)
  const cats = useMemo(() => [...new Set(arts.data.map((a) => a.category).filter(Boolean) as string[])].sort(), [arts.data])
  const liste = arts.data.filter((a) => (cat === 'toutes' || a.category === cat) && (!q.trim() || `${a.ref ?? ''} ${a.label} ${a.description ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const AFF = 300 // au-delà, on affine par la recherche (les grandes listes Sphinx font des milliers de lignes)

  async function save() {
    if (!b?.label.trim() || !userId) return
    const row = { ref: b.ref?.trim() || null, label: b.label.trim(), description: b.description?.trim() || null, category: b.category?.trim() || null, unit: b.unit?.trim() || 'u', price_ht: Number(b.price_ht) || 0, tva: Number(b.tva ?? 20) }
    const r = b.id ? await getDb().from('gestion_articles').update(row).eq('id', b.id) : await getDb().from('gestion_articles').insert({ ...row, workspace_id: ws.id, created_by: userId })
    if (r.error) { toast.error('Enregistrement impossible'); return }
    log(b.id ? 'update' : 'create', 'gestion_articles', b.id ?? null, { label: row.label }); setB(null); arts.refresh()
  }
  async function supprimer() {
    if (!b?.id) return
    await getDb().from('gestion_articles').update({ deleted_at: new Date().toISOString() }).eq('id', b.id); setB(null); arts.refresh()
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <HubTabs hub="gestion" />
      <PageHeader title="Articles" icon={<Package className="size-[18px]" />} actions={canWrite && <div className="flex gap-2"><Link href={`/app/${ws.slug}/gestion/import`}><Button><Upload className="size-4" /><span className="max-sm:hidden">Importer</span></Button></Link><Button variant="primary" onClick={() => setB({ label: '', unit: 'u', tva: entrepriseDe(ws).tva_defaut ?? 20, price_ht: 0 })}><Plus className="size-4" />Article</Button></div>} />
      {arts.manque ? <AvisMigration /> : <>
        <div className="relative mb-3"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" /><Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Chercher parmi ${arts.data.length} articles (référence, nom…)`} aria-label="Chercher un article" /></div>
        {cats.length > 0 && <Chips className="mb-4" value={cat} onChange={setCat} items={[{ v: 'toutes', l: 'Toutes', n: arts.data.length }, ...cats.map((c) => ({ v: c, l: c, n: arts.data.filter((a) => a.category === c).length }))]} />}
        {liste.length === 0 ? <EmptyState icon={<Package className="size-5" />} title={arts.data.length ? 'Aucun article trouvé' : 'Catalogue vide'} hint="Ajoute tes pièces, fournitures et forfaits, ou importe ta liste Sphinx." />
          : <>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block"><table className="w-full text-[13px]"><thead className="bg-surface-2/60 text-left text-[12px] text-text-3"><tr><th className="px-4 py-2 font-medium">Réf.</th><th className="px-4 py-2 font-medium">Désignation</th><th className="px-4 py-2 font-medium">Catégorie</th><th className="px-4 py-2 text-right font-medium">PU HT</th><th className="px-4 py-2 text-right font-medium">TVA</th><th className="px-4 py-2 text-right font-medium">PU TTC</th></tr></thead>
              <tbody className="divide-y divide-border/60">{liste.slice(0, AFF).map((a) => <tr key={a.id} onClick={() => canWrite && setB(a)} className="cursor-pointer hover:bg-surface-2"><td className="px-4 py-2.5 text-text-3">{a.ref}</td><td className="px-4 py-2.5 font-medium">{a.label}<span className="ml-1.5 text-text-3">/ {a.unit}</span></td><td className="px-4 py-2.5 text-text-2">{a.category}</td><td className="px-4 py-2.5 text-right tabular-nums">{eur(a.price_ht)}</td><td className="px-4 py-2.5 text-right tabular-nums text-text-2">{a.tva} %</td><td className="px-4 py-2.5 text-right tabular-nums">{eur(a.price_ht * (1 + a.tva / 100))}</td></tr>)}</tbody></table></div>
            <ul className="space-y-2 md:hidden">{liste.slice(0, AFF).map((a) => <li key={a.id}><button onClick={() => canWrite && setB(a)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left"><span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium">{a.label}</span><span className="block truncate text-[12px] text-text-3">{[a.ref, a.category, `TVA ${a.tva} %`].filter(Boolean).join(' · ')}</span></span><span className="text-right text-[13px] font-semibold tabular-nums">{eur(a.price_ht)}<span className="block text-[11px] font-normal text-text-3">HT / {a.unit}</span></span></button></li>)}</ul>
            {liste.length > AFF && <p className="mt-3 text-center text-[12.5px] text-text-3">{liste.length - AFF} autres articles : affine la recherche.</p>}
          </>}
      </>}
      <Dialog open={!!b} onClose={() => setB(null)} title={b?.id ? 'Article' : 'Nouvel article'} footer={<>{b?.id && <Button variant="ghost" className="mr-auto text-danger" onClick={supprimer}><Trash2 className="size-4" />Supprimer</Button>}<Button onClick={() => setB(null)}>Annuler</Button><Button variant="primary" disabled={!b?.label.trim()} onClick={save}>Enregistrer</Button></>}>
        {b && <div className="grid grid-cols-2 gap-3">
          <Field label="Référence"><Input value={b.ref ?? ''} onChange={(e) => setB({ ...b, ref: e.target.value })} /></Field>
          <Field label="Catégorie"><Input list="cats" value={b.category ?? ''} onChange={(e) => setB({ ...b, category: e.target.value })} placeholder="Plomberie, Main d’œuvre…" /><datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></Field>
          <Field label="Désignation *" className="col-span-2"><Input autoFocus value={b.label} onChange={(e) => setB({ ...b, label: e.target.value })} /></Field>
          <Field label="Description" className="col-span-2"><Textarea rows={2} value={b.description ?? ''} onChange={(e) => setB({ ...b, description: e.target.value })} /></Field>
          <Field label="Prix unitaire HT (€)"><Input type="number" min={0} step="any" value={b.price_ht ?? 0} onChange={(e) => setB({ ...b, price_ht: Number(e.target.value) })} /></Field>
          <Field label="Unité"><Input value={b.unit ?? 'u'} onChange={(e) => setB({ ...b, unit: e.target.value })} placeholder="u, h, m², forfait" /></Field>
          <Field label="TVA"><Select value={String(b.tva ?? 20)} onChange={(e) => setB({ ...b, tva: Number(e.target.value) })}>{[20, 10, 5.5, 2.1, 0].map((v) => <option key={v} value={v}>{v} %</option>)}</Select></Field>
          <Field label="Prix TTC"><Input readOnly value={eur((Number(b.price_ht) || 0) * (1 + (Number(b.tva ?? 20)) / 100))} /></Field>
        </div>}
      </Dialog>
    </div>
  )
}
