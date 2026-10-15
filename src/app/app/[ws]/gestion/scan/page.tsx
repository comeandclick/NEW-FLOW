'use client'
// Factures lues par l'IA (15/10/2026) : on dépose une photo ou un PDF, l'assistant lit la facture, reconnaît le client,
// et propose la suite dans un widget : ranger la facture, mettre l'échéance au calendrier, créer une tâche.
// En dessous, toutes les factures reçues, triables par client, date ou montant.
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarPlus, Camera, Check, CheckSquare, FileUp, Loader2, Receipt, ScanLine, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { AvisMigration, Chips, Pastille, useArticles, useDocs, useFiches } from '@/components/gestion/commun'
import { DocEditor } from '@/components/gestion/doc-editor'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { uploadToBucket } from '@/lib/storage'
import { isDemoBrowser } from '@/lib/demo/runtime'
import { fichierEnImages } from '@/lib/gestion-images'
import { eur, prochainNumero, totaux, type GDoc, type Ligne } from '@/lib/gestion'
import { cn } from '@/lib/utils'

type Lu = {
  type?: string; emetteur?: string; destinataire?: string | null; destinataire_adresse?: string | null; numero?: string | null; date?: string | null; echeance?: string | null
  total_ht?: number | null; total_tva?: number | null; total_ttc?: number | null; lignes?: { label: string; qty: number; price_ht: number; tva: number }[]; categorie?: string; paye?: boolean | null; resume?: string
}
type Carte = { id: string; nom: string; etat: 'lecture' | 'pret' | 'erreur' | 'fait'; apercu?: string; fichier: File; lu?: Lu; erreur?: string; sens: 'achat' | 'facture'; client: string; fait: string[]; docId?: string }

const norm = (s?: string | null) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

// lecture de démonstration (mode démo, sans serveur)
const DEMO: Lu = { type: 'facture', emetteur: 'Cedeo Paris 11', numero: 'FC-778812', date: new Date().toISOString().slice(0, 10), echeance: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), total_ht: 890, total_tva: 178, total_ttc: 1068, lignes: [{ label: 'Chauffe-eau 200 L', qty: 1, price_ht: 890, tva: 20 }], categorie: 'Matériel', paye: false, resume: 'Achat d’un chauffe-eau 200 L chez Cedeo.' }

export default function ScanPage() {
  const { ws, canWrite, log } = useWorkspace()
  const { userId } = useSession()
  const docs = useDocs()
  const fiches = useFiches()
  const articles = useArticles()
  const [cartes, setCartes] = useState<Carte[]>([])
  const [tri, setTri] = useState<'date' | 'client' | 'montant'>('date')
  const [ouvert, setOuvert] = useState<GDoc | null>(null)
  const input = useRef<HTMLInputElement>(null), photo = useRef<HTMLInputElement>(null)
  const maj = (id: string, p: Partial<Carte>) => setCartes((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)))

  const devinerClient = (lu: Lu) => {
    const cibles = [lu.destinataire, lu.emetteur].map(norm).filter((x) => x.length > 2)
    return fiches.data.find((f) => cibles.some((c) => [f.name, f.company].some((v) => v && (norm(v).includes(c) || c.includes(norm(v))) && norm(v).length > 2)))?.id ?? ''
  }

  async function analyser(files: FileList | File[]) {
    for (const f of Array.from(files).slice(0, 10)) {
      const id = Math.random().toString(36).slice(2)
      setCartes((l) => [{ id, nom: f.name, etat: 'lecture', fichier: f, sens: 'achat', client: '', fait: [] }, ...l])
      try {
        const images = await fichierEnImages(f)
        maj(id, { apercu: images[0] })
        let lu: Lu
        if (isDemoBrowser()) { await new Promise((r) => setTimeout(r, 1200)); lu = DEMO }
        else {
          const r = await fetch('/api/gestion/analyse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wsId: ws.id, images }) })
          const j = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error(j.error === 'no_key' ? 'IA non configurée sur le serveur' : j.error === 'rate_limited' ? 'Trop de lectures d’un coup, attends une minute' : 'L’IA n’a pas réussi à lire ce document')
          lu = j.data
        }
        // émise par mon entreprise = facture client, sinon facture reçue (dépense)
        const moi = norm(String((ws.settings as { entreprise?: { nom?: string } })?.entreprise?.nom ?? ws.name))
        const sens = moi.length > 2 && norm(lu.emetteur).includes(moi) ? 'facture' : 'achat'
        maj(id, { etat: 'pret', lu, sens, client: devinerClient(lu) })
      } catch (e) { maj(id, { etat: 'erreur', erreur: (e as Error).message }) }
    }
  }

  async function ranger(c: Carte) {
    if (!userId || !c.lu) return
    const lu = c.lu
    const lignes: Ligne[] = lu.lignes?.length ? lu.lignes.map((l) => ({ label: l.label, qty: Number(l.qty) || 1, unit: 'u', price_ht: Number(l.price_ht) || 0, tva: Number(l.tva) || 20 }))
      : [{ label: lu.resume || lu.emetteur || 'Facture', qty: 1, unit: 'u', price_ht: Number(lu.total_ht ?? (lu.total_ttc ?? 0) / 1.2), tva: lu.total_ht && lu.total_tva ? Math.round((lu.total_tva / lu.total_ht) * 1000) / 10 : 20 }]
    let t = totaux(lignes)
    if (lu.total_ttc && Math.abs(t.ttc - lu.total_ttc) > 1) t = { ...t, ht: Number(lu.total_ht ?? t.ht), tva: Number(lu.total_tva ?? t.tva), ttc: Number(lu.total_ttc) } // on garde les totaux imprimés
    let file_path: string | null = null
    if (!isDemoBrowser()) try { file_path = await uploadToBucket('files', `${ws.id}/gestion`, c.fichier, c.fichier.name) } catch { /* le document reste enregistré sans le fichier */ }
    const kind = c.sens
    const { data, error } = await getDb().from('gestion_documents').insert({
      workspace_id: ws.id, created_by: userId, kind, number: kind === 'facture' && lu.numero ? lu.numero : prochainNumero(kind, docs.data.filter((d) => d.kind === kind).map((d) => d.number)),
      ref_externe: lu.numero ?? null, contact_id: c.client || null, title: kind === 'achat' ? `${lu.emetteur ?? 'Fournisseur'}${lu.categorie ? ` · ${lu.categorie}` : ''}` : lu.resume ?? null,
      status: kind === 'achat' ? (lu.paye ? 'payee' : 'a_verifier') : lu.paye ? 'payee' : 'envoyee', issued_at: lu.date ?? new Date().toISOString().slice(0, 10), due_at: lu.echeance ?? null,
      lines: lignes, total_ht: t.ht, total_tva: t.tva, total_ttc: t.ttc, file_path, ai_data: lu as Record<string, unknown>, notes: lu.resume ?? null,
    }).select().single()
    if (error || !data) { toast.error(error?.code === '23505' ? 'Cette facture est déjà rangée' : 'Enregistrement impossible'); return }
    log('create', 'gestion_documents', (data as GDoc).id, { number: (data as GDoc).number, kind, via: 'ia' })
    maj(c.id, { fait: [...c.fait, 'rangee'], docId: (data as GDoc).id }); docs.refresh(); toast.success('Facture rangée')
  }
  async function calendrier(c: Carte) {
    if (!userId || !c.lu) return
    const jour = c.lu.echeance ?? c.lu.date
    if (!jour) { toast.error('Pas de date d’échéance sur ce document'); return }
    const titre = `${c.sens === 'achat' ? 'Payer' : 'Encaisser'} ${c.lu.emetteur ?? 'facture'} · ${eur(c.lu.total_ttc ?? 0)}`
    const { error } = await getDb().from('events').insert({ workspace_id: ws.id, created_by: userId, title: titre, description: c.lu.resume ?? null, start_at: new Date(`${jour}T09:00:00`).toISOString(), end_at: new Date(`${jour}T09:30:00`).toISOString(), all_day: true, attendees: [userId] })
    if (error) { toast.error('Ajout impossible'); return }
    maj(c.id, { fait: [...c.fait, 'calendrier'] }); toast.success(`Ajouté au calendrier le ${format(new Date(jour + 'T12:00:00'), 'd MMMM', { locale: fr })}`)
  }
  async function tache(c: Carte) {
    if (!userId || !c.lu) return
    const { error } = await getDb().from('tasks').insert({ workspace_id: ws.id, created_by: userId, assignee_id: userId, title: `${c.sens === 'achat' ? 'Régler' : 'Relancer le paiement de'} ${c.lu.emetteur ?? 'la facture'} ${c.lu.numero ?? ''} (${eur(c.lu.total_ttc ?? 0)})`.trim(), description: c.lu.resume ?? null, due_date: c.lu.echeance ?? null, status: 'todo', priority: 'medium', tags: ['facture'] })
    if (error) { toast.error('Création impossible'); return }
    maj(c.id, { fait: [...c.fait, 'tache'] }); toast.success('Tâche créée')
  }

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
        {canWrite && <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3"><span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent"><Sparkles className="size-4" /></span><div><div className="text-[14px] font-semibold">Assistant factures</div><div className="text-[12px] text-text-3">Envoie une photo ou un PDF : je lis tout et je te propose la suite.</div></div></div>
          <div className="space-y-3 p-4">
            <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { if (e.target.files?.length) void analyser(e.target.files); e.target.value = '' }} />
            <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files?.length) void analyser(e.target.files); e.target.value = '' }} />
            <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) void analyser(e.dataTransfer.files) }}
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border-strong px-4 py-6 text-center">
              <FileUp className="size-6 text-text-3" /><p className="text-[13.5px] text-text-2">Dépose une ou plusieurs factures (photo, scan, PDF)</p>
              <div className="flex flex-wrap justify-center gap-2"><Button onClick={() => input.current?.click()}><FileUp className="size-4" />Choisir des fichiers</Button><Button className="md:hidden" onClick={() => photo.current?.click()}><Camera className="size-4" />Prendre en photo</Button></div>
            </div>
            <AnimatePresence initial={false}>{cartes.map((c) => (
              <motion.div key={c.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl border border-border bg-surface-2/40 p-3">
                <div className="flex gap-3">
                  {c.apercu ? <img src={c.apercu} alt="" className="h-24 w-[72px] shrink-0 rounded-md border border-border bg-white object-cover object-top" /> : <div className="flex h-24 w-[72px] shrink-0 items-center justify-center rounded-md bg-surface-3"><Receipt className="size-5 text-text-3" /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2"><span className="min-w-0 flex-1 truncate text-[13px] text-text-3">{c.nom}</span><button onClick={() => setCartes((l) => l.filter((x) => x.id !== c.id))} aria-label="Retirer" className="text-text-3 hover:text-text"><X className="size-4" /></button></div>
                    {c.etat === 'lecture' && <p className="mt-2 flex items-center gap-2 text-[13px] text-text-2"><Loader2 className="size-4 animate-spin" />Je lis la facture…</p>}
                    {c.etat === 'erreur' && <p className="mt-2 text-[13px] text-danger">{c.erreur}</p>}
                    {c.lu && c.etat !== 'lecture' && <>
                      <p className="mt-1 text-[14px] font-semibold">{c.lu.emetteur ?? 'Document'}{c.lu.numero ? ` · n° ${c.lu.numero}` : ''}</p>
                      <p className="text-[12.5px] text-text-2">{c.lu.resume}</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] tabular-nums text-text-2">
                        {c.lu.date && <span>Date {format(new Date(c.lu.date + 'T12:00:00'), 'd MMM yyyy', { locale: fr })}</span>}{c.lu.echeance && <span>Échéance {format(new Date(c.lu.echeance + 'T12:00:00'), 'd MMM', { locale: fr })}</span>}
                        {c.lu.total_ht != null && <span>HT {eur(c.lu.total_ht)}</span>}{c.lu.total_tva != null && <span>TVA {eur(c.lu.total_tva)}</span>}<b className="text-text">TTC {eur(c.lu.total_ttc ?? 0)}</b>{c.lu.categorie && <span className="rounded-full bg-surface-3 px-2">{c.lu.categorie}</span>}
                      </div>
                    </>}
                  </div>
                </div>
                {c.lu && c.etat !== 'lecture' && <div className="mt-3 space-y-2.5 border-t border-border pt-3">
                  {!c.fait.includes('rangee') && <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="C’est"><Select value={c.sens} onChange={(e) => maj(c.id, { sens: e.target.value as Carte['sens'] })}><option value="achat">Une facture reçue (dépense)</option><option value="facture">Une facture de mon entreprise (vente)</option></Select></Field>
                    <Field label="Client lié"><Select value={c.client} onChange={(e) => maj(c.id, { client: e.target.value })}><option value="">— Aucun —</option>{fiches.data.map((f) => <option key={f.id} value={f.id}>{f.company || f.name}</option>)}</Select></Field>
                  </div>}
                  <div className="flex flex-wrap gap-2">
                    <Action fait={c.fait.includes('rangee')} onClick={() => ranger(c)} I={Receipt}>{c.fait.includes('rangee') ? 'Rangée' : c.sens === 'achat' ? 'Ranger dans les factures reçues' : 'Ranger dans mes factures'}</Action>
                    <Action fait={c.fait.includes('calendrier')} onClick={() => calendrier(c)} I={CalendarPlus}>Échéance au calendrier</Action>
                    <Action fait={c.fait.includes('tache')} onClick={() => tache(c)} I={CheckSquare}>{c.sens === 'achat' ? 'Tâche : régler' : 'Tâche : relancer'}</Action>
                    {c.docId && <Button size="sm" variant="ghost" onClick={() => setOuvert(docs.data.find((d) => d.id === c.docId) ?? null)}>Ouvrir</Button>}
                  </div>
                </div>}
              </motion.div>))}</AnimatePresence>
          </div>
        </section>}

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

function Action({ fait, onClick, I, children }: { fait: boolean; onClick: () => void; I: typeof Receipt; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={fait} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors', fait ? 'border-success/40 bg-success/10 text-success' : 'border-accent/40 bg-accent-soft text-text hover:border-accent')}>{fait ? <Check className="size-3.5" /> : <I className="size-3.5" />}{children}</button>
}
