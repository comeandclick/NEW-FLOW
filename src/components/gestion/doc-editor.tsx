'use client'
// Fiche d'un devis, d'une facture ou d'une intervention (ordre de mission) — 15/10/2026.
// Client, dates, type, intervenants, lignes d'articles (HT / TVA / TTC), signature du client sur place ou par lien,
// accepter / refuser soi-même, PDF (télécharger, imprimer), envoi par e-mail, conversions, tâche + événement, clôture, suivi.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CalendarPlus, Check, CheckCircle2, Copy, Download, FileSignature, Link2, Lock, Mail, Plus, Printer, Receipt, Search, Trash2, Wrench, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { useLive } from '@/lib/hooks/use-live'
import { getDb } from '@/lib/supabase/client'
import { isDemoBrowser } from '@/lib/demo/runtime'
import {
  NOM_KIND, PRIORITES, STATUTS, STATUT_INITIAL, entrepriseDe, entrepriseManque, eur, prochainNumero, totaux, typesIntervention,
  type Article, type DocKind, type Fiche, type GDoc, type Ligne,
} from '@/lib/gestion'
import { imprimerPdf, pdfBase64, telechargerPdf, type ContextePdf } from '@/lib/gestion-pdf'
import { cn } from '@/lib/utils'
import { SignaturePad } from './signature-pad'
import { Pastille } from './commun'

type Draft = Partial<GDoc> & { kind: DocKind; lines: Ligne[] }
const auj = () => new Date().toISOString().slice(0, 10)
const plusJours = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const versLocal = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
const depuisLocal = (v: string) => (v ? new Date(v).toISOString() : null)
const quand = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '')

export function DocEditor({ open, onClose, kind, doc, preset, docs, fiches, articles, onSaved }: {
  open: boolean; onClose: () => void; kind: DocKind; doc?: GDoc | null; preset?: Partial<GDoc>
  docs: GDoc[]; fiches: Fiche[]; articles: Article[]; onSaved?: (d: GDoc) => void
}) {
  const { ws, members, nameOf, canWrite, log, notifyUser } = useWorkspace()
  const { userId } = useSession()
  const entreprise = entrepriseDe(ws)
  const types = typesIntervention(ws)
  const [d, setD] = useState<Draft>({ kind, lines: [] })
  const [busy, setBusy] = useState(false)
  const [signer, setSigner] = useState(false)
  const [sig, setSig] = useState<string | null>(null)
  const [sigNom, setSigNom] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [nouveauClient, setNouveauClient] = useState(false)
  const [rech, setRech] = useState('')

  useEffect(() => {
    if (!open) return
    if (doc) setD({ ...doc, lines: doc.lines ?? [] })
    else setD({
      kind, status: STATUT_INITIAL[kind], issued_at: auj(), priority: 'normale', discount: 0, assigned_to: kind === 'intervention' && userId ? [userId] : [],
      due_at: kind === 'devis' ? plusJours(entreprise.validite_jours ?? 30) : kind === 'facture' ? plusJours(30) : null,
      intervention_type: kind === 'intervention' ? types[0] : null,
      lines: kind === 'intervention' ? [] : [{ label: '', qty: 1, unit: 'u', price_ht: 0, tva: entreprise.tva_defaut ?? 20 }],
      ...preset,
    })
    setSigner(false); setSig(null); setSigNom(''); setRech('')
  }, [open, doc?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const t = useMemo(() => totaux(d.lines, d.discount), [d.lines, d.discount])
  const client = fiches.find((f) => f.id === d.contact_id) ?? null
  const parent = d.parent_id ? docs.find((x) => x.id === d.parent_id) : null
  const enfants = d.id ? docs.filter((x) => x.parent_id === d.id) : []
  const historique = useLive<{ id: string; action: string; user_id: string; created_at: string; meta: Record<string, unknown> }>('activity_logs', { eq: { workspace_id: ws.id, entity_id: d.id ?? '' }, order: ['created_at', false], limit: 30, enabled: open && !!d.id, live: false })
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const setLigne = (i: number, p: Partial<Ligne>) => setD((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) }))
  const ctxPdf = (dd: GDoc): ContextePdf => ({ entreprise, logoUrl: ws.logo_url, client: fiches.find((f) => f.id === dd.contact_id) ?? null, nomMembre: nameOf, devisOrigine: docs.find((x) => x.id === dd.parent_id)?.number ?? null })
  const manqueEnt = entrepriseManque(entreprise)

  async function enregistrer(patch: Partial<GDoc> = {}, fermer = false): Promise<GDoc | null> {
    if (!userId) return null
    const x = { ...d, ...patch }
    if (x.kind !== 'achat' && x.kind !== 'intervention' && !x.contact_id) { toast.error('Choisis un client'); return null }
    if (x.kind === 'intervention' && !x.contact_id && !x.title?.trim()) { toast.error('Donne un titre ou choisis un client'); return null }
    setBusy(true)
    const lines = x.lines.filter((l) => l.label.trim())
    const tt = totaux(lines, x.discount)
    const row = {
      kind: x.kind, number: x.number || prochainNumero(x.kind, docs.filter((y) => y.kind === x.kind).map((y) => y.number)), contact_id: x.contact_id || null, parent_id: x.parent_id ?? null,
      title: x.title?.trim() || null, status: x.status, intervention_type: x.intervention_type ?? null, priority: x.priority ?? 'normale',
      issued_at: x.issued_at || auj(), due_at: x.due_at || null, start_at: x.start_at ?? null, end_at: x.end_at ?? null, address: x.address?.trim() || null,
      lines, discount: Number(x.discount) || 0, total_ht: tt.ht, total_tva: tt.tva, total_ttc: tt.ttc, travaux: x.travaux?.trim() || null, notes: x.notes?.trim() || null,
      assigned_to: x.assigned_to ?? [], task_id: x.task_id ?? null, event_id: x.event_id ?? null,
      signer_name: x.signer_name ?? null, signature: x.signature ?? null, signed_at: x.signed_at ?? null, signed_via: x.signed_via ?? null,
      decided_by: x.decided_by ?? null, decided_at: x.decided_at ?? null, paid_at: x.paid_at ?? null, closed_at: x.closed_at ?? null, closed_by: x.closed_by ?? null,
      sent_at: x.sent_at ?? null, sent_to: x.sent_to ?? null, ref_externe: x.ref_externe ?? null, updated_by: userId,
    }
    const db = getDb()
    let res = x.id ? await db.from('gestion_documents').update(row).eq('id', x.id).select().single()
      : await db.from('gestion_documents').insert({ ...row, workspace_id: ws.id, created_by: userId }).select().single()
    if (res.error?.code === '23505' && !x.id) { // numéro pris entre-temps par quelqu'un d'autre
      row.number = prochainNumero(x.kind, [...docs.map((y) => y.number), row.number])
      res = await db.from('gestion_documents').insert({ ...row, workspace_id: ws.id, created_by: userId }).select().single()
    }
    setBusy(false)
    if (res.error || !res.data) { toast.error(res.error?.code === '23505' ? 'Ce numéro existe déjà' : 'Enregistrement impossible'); return null }
    const saved = res.data as GDoc
    log(x.id ? (patch.status && patch.status !== d.status ? `status:${patch.status}` : 'update') : 'create', 'gestion_documents', saved.id, { number: saved.number, kind: saved.kind })
    // les intervenants nouvellement ajoutés sont prévenus
    if (saved.kind === 'intervention') for (const m of saved.assigned_to.filter((u) => !(doc?.assigned_to ?? []).includes(u)))
      void notifyUser(m, { type: 'gestion', title: `Intervention ${saved.number}`, body: saved.title ?? client?.name ?? '', url: `/app/${ws.slug}/gestion/interventions?id=${saved.id}` })
    setD({ ...saved, lines: saved.lines ?? [] })
    onSaved?.(saved)
    if (fermer) onClose(); else toast.success('Enregistré')
    return saved
  }

  async function decider(statut: 'accepte' | 'refuse') {
    if (!sigNom.trim() && statut === 'accepte' && sig) { toast.error('Indique le nom du signataire'); return }
    await enregistrer({ status: statut, decided_by: userId, decided_at: new Date().toISOString(), ...(sig ? { signature: sig, signer_name: sigNom.trim(), signed_at: new Date().toISOString(), signed_via: 'sur_place' } : sigNom.trim() ? { signer_name: sigNom.trim() } : {}) })
    setSigner(false)
  }
  async function signerIntervention(cloturer: boolean) {
    if (!sig || !sigNom.trim()) { toast.error('Signature et nom du signataire nécessaires'); return }
    const now = new Date().toISOString()
    await enregistrer({ signature: sig, signer_name: sigNom.trim(), signed_at: now, signed_via: 'sur_place', ...(cloturer ? { status: 'terminee', closed_at: now, closed_by: userId } : {}) })
    setSigner(false)
  }
  async function convertir(vers: 'facture' | 'intervention') {
    const src = d.id ? d : await enregistrer()
    if (!src?.id || !userId) return
    const lines = (src.lines ?? []).filter((l) => l.label.trim()), tt = totaux(lines, src.discount)
    const row = {
      workspace_id: ws.id, kind: vers, number: prochainNumero(vers, docs.filter((y) => y.kind === vers).map((y) => y.number)), contact_id: src.contact_id, parent_id: src.id,
      title: src.title, status: STATUT_INITIAL[vers], issued_at: auj(), due_at: vers === 'facture' ? plusJours(30) : null, address: src.address ?? client?.address ?? null,
      lines, discount: src.discount ?? 0, total_ht: tt.ht, total_tva: tt.tva, total_ttc: tt.ttc, travaux: src.travaux, assigned_to: vers === 'intervention' && userId ? [userId] : [],
      intervention_type: vers === 'intervention' ? types[0] : null, created_by: userId,
    }
    const { data, error } = await getDb().from('gestion_documents').insert(row).select().single()
    if (error || !data) { toast.error('Création impossible'); return }
    log('create', 'gestion_documents', (data as GDoc).id, { number: (data as GDoc).number, kind: vers, depuis: src.number })
    toast.success(`${NOM_KIND[vers]} ${(data as GDoc).number} créée`, { action: { label: 'Ouvrir', onClick: () => { window.location.href = `/app/${ws.slug}/gestion/${vers === 'facture' ? 'factures' : 'interventions'}?id=${(data as GDoc).id}` } } })
    onSaved?.(data as GDoc)
  }
  /** Ordre de mission : une tâche pour le premier intervenant + un événement au calendrier, liés à l'intervention. */
  async function planifier() {
    const src = d.id ? d : await enregistrer()
    if (!src?.id || !userId) return
    if (!src.start_at) { toast.error('Indique la date et l’heure de début'); return }
    const titre = `${src.intervention_type ?? 'Intervention'} · ${client?.company || client?.name || src.title || ''} (${src.number})`.trim()
    const desc = [src.travaux, src.address || client?.address, client?.phone && `Tél. ${client.phone}`].filter(Boolean).join('\n')
    const fin = src.end_at ?? new Date(new Date(src.start_at).getTime() + 2 * 3600_000).toISOString()
    const db = getDb()
    let task_id = src.task_id, event_id = src.event_id
    if (!task_id) { const r = await db.from('tasks').insert({ workspace_id: ws.id, title: titre, description: desc || null, status: 'todo', priority: src.priority === 'urgente' ? 'urgent' : src.priority === 'haute' ? 'high' : 'medium', assignee_id: src.assigned_to?.[0] ?? null, due_date: src.start_at.slice(0, 10), created_by: userId, tags: ['intervention'] }).select('id').single(); task_id = (r.data as { id: string } | null)?.id ?? null }
    if (!event_id) { const r = await db.from('events').insert({ workspace_id: ws.id, title: titre, description: desc || null, start_at: src.start_at, end_at: fin, location: src.address || client?.address || null, attendees: src.assigned_to ?? [], task_id, created_by: userId }).select('id').single(); event_id = (r.data as { id: string } | null)?.id ?? null }
    await enregistrer({ task_id, event_id, status: src.status === 'a_planifier' ? 'planifiee' : src.status })
    toast.success('Tâche et événement ajoutés au calendrier')
  }
  async function supprimer() {
    if (!d.id || !confirm(`Supprimer ${NOM_KIND[d.kind].toLowerCase()} ${d.number} ? Il ira dans la corbeille.`)) return
    await getDb().from('gestion_documents').update({ deleted_at: new Date().toISOString() }).eq('id', d.id)
    log('delete', 'gestion_documents', d.id, { number: d.number }); onClose()
  }
  async function pdf(action: 'dl' | 'print') {
    if (manqueEnt.length) { toast.error(`Complète d’abord Paramètres > Entreprise : ${manqueEnt.join(', ')}`); return }
    const saved = d.id ? (d as GDoc) : await enregistrer()
    if (!saved) return
    try { if (action === 'dl') await telechargerPdf(saved, ctxPdf(saved)); else await imprimerPdf(saved, ctxPdf(saved)) } catch (e) { toast.error((e as Error).message) }
  }
  const lienSignature = d.public_token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/s/${d.public_token}` : ''

  const ajouterArticle = (a: Article) => { setD((x) => ({ ...x, lines: [...x.lines.filter((l) => l.label.trim()), { article_id: a.id, ref: a.ref ?? '', label: a.label, qty: 1, unit: a.unit, price_ht: Number(a.price_ht), tva: Number(a.tva) }] })); setRech('') }
  const trouves = rech.trim() ? articles.filter((a) => `${a.ref ?? ''} ${a.label} ${a.category ?? ''}`.toLowerCase().includes(rech.toLowerCase())).slice(0, 8) : []
  const statuts = STATUTS[d.kind]
  const lecture = !canWrite

  return (
    <>
      <Dialog open={open} onClose={onClose} size="xl" title={`${d.kind === 'intervention' ? 'Intervention' : NOM_KIND[d.kind]} ${d.number ?? '(nouveau)'}`}
        description={d.id ? `Créé par ${nameOf(d.created_by)} le ${quand(d.created_at)}${d.updated_by ? ` · modifié par ${nameOf(d.updated_by)} le ${quand(d.updated_at)}` : ''}` : undefined}
        footer={<>
          {d.id && canWrite && <Button variant="ghost" className="mr-auto text-danger" onClick={supprimer}><Trash2 className="size-4" /><span className="max-sm:hidden">Supprimer</span></Button>}
          {d.kind !== 'achat' && <>
            <Button onClick={() => pdf('dl')} aria-label="Télécharger le PDF"><Download className="size-4" /><span className="max-sm:hidden">PDF</span></Button>
            <Button onClick={() => pdf('print')} aria-label="Imprimer"><Printer className="size-4" /><span className="max-sm:hidden">Imprimer</span></Button>
            {canWrite && <Button onClick={async () => { if (!d.id && !(await enregistrer())) return; setEnvoi(true) }}><Mail className="size-4" /><span className="max-sm:hidden">Envoyer</span></Button>}
          </>}
          {canWrite && <Button variant="primary" loading={busy} onClick={() => enregistrer({}, true)}>Enregistrer</Button>}
        </>}>
        <div className="space-y-5">
          {/* statut + client */}
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px]">
            <Field label={d.kind === 'achat' ? 'Fournisseur / client lié' : 'Client'}>
              <div className="flex gap-1.5">
                <Select value={d.contact_id ?? ''} disabled={lecture} onChange={(e) => { const f = fiches.find((x) => x.id === e.target.value); setD((x) => ({ ...x, contact_id: e.target.value || null, address: x.address || f?.address || null })) }}>
                  <option value="">— Choisir —</option>{fiches.map((f) => <option key={f.id} value={f.id}>{f.company ? `${f.company} · ${f.name}` : f.name}</option>)}
                </Select>
                {canWrite && <Button size="icon" onClick={() => setNouveauClient(true)} aria-label="Nouveau client"><Plus className="size-4" /></Button>}
              </div>
            </Field>
            <Field label="Titre / objet"><Input value={d.title ?? ''} disabled={lecture} onChange={(e) => set('title', e.target.value)} placeholder={d.kind === 'intervention' ? 'Fuite sous évier' : 'Rénovation salle de bain'} /></Field>
            <Field label="État"><Select value={d.status ?? ''} disabled={lecture} onChange={(e) => set('status', e.target.value)}>{statuts.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</Select></Field>
          </div>
          {client && <div className="-mt-2 text-[12.5px] text-text-3"><Link href={`/app/${ws.slug}/gestion/clients/${client.id}`} className="hover:text-text hover:underline">Fiche de {client.name}</Link>{client.phone && ` · ${client.phone}`}{client.email && ` · ${client.email}`}</div>}

          {/* dates et intervention */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Numéro"><Input value={d.number ?? ''} disabled={lecture} placeholder="automatique" onChange={(e) => set('number', e.target.value)} /></Field>
            <Field label="Date"><Input type="date" value={d.issued_at ?? ''} disabled={lecture} onChange={(e) => set('issued_at', e.target.value)} /></Field>
            {(d.kind === 'devis' || d.kind === 'facture' || d.kind === 'achat') && <Field label={d.kind === 'devis' ? 'Valable jusqu’au' : 'Échéance'}><Input type="date" value={d.due_at ?? ''} disabled={lecture} onChange={(e) => set('due_at', e.target.value)} /></Field>}
            {d.kind === 'facture' && <Field label="Payée le"><Input type="date" value={d.paid_at ?? ''} disabled={lecture} onChange={(e) => setD((x) => ({ ...x, paid_at: e.target.value || null, status: e.target.value ? 'payee' : x.status }))} /></Field>}
            {d.kind === 'intervention' && <>
              <Field label="Type"><Select value={d.intervention_type ?? ''} disabled={lecture} onChange={(e) => set('intervention_type', e.target.value)}>{[...new Set([...types, d.intervention_type].filter(Boolean) as string[])].map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Priorité"><Select value={d.priority ?? 'normale'} disabled={lecture} onChange={(e) => set('priority', e.target.value)}>{PRIORITES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}</Select></Field>
              <Field label="Début" className="col-span-2 sm:col-span-2"><Input type="datetime-local" value={versLocal(d.start_at)} disabled={lecture} onChange={(e) => set('start_at', depuisLocal(e.target.value))} /></Field>
              <Field label="Fin" className="col-span-2 sm:col-span-2"><Input type="datetime-local" value={versLocal(d.end_at)} disabled={lecture} onChange={(e) => set('end_at', depuisLocal(e.target.value))} /></Field>
            </>}
          </div>
          {(d.kind === 'intervention' || d.kind === 'devis') && <Field label="Adresse du chantier / de l’intervention"><Input value={d.address ?? ''} disabled={lecture} placeholder={client?.address ?? '12 rue des Lilas, 75011 Paris'} onChange={(e) => set('address', e.target.value)} /></Field>}

          {d.kind === 'intervention' && (
            <Field label="Intervenants">
              <div className="flex flex-wrap gap-1.5">{members.map((m) => { const on = (d.assigned_to ?? []).includes(m.user_id); return (
                <button key={m.user_id} type="button" disabled={lecture} onClick={() => set('assigned_to', on ? (d.assigned_to ?? []).filter((u) => u !== m.user_id) : [...(d.assigned_to ?? []), m.user_id])}
                  className={cn('flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12.5px] transition-colors', on ? 'border-accent bg-accent-soft text-text' : 'border-border text-text-2 hover:border-border-strong')}>
                  <Avatar name={m.profile?.full_name} src={m.profile?.avatar_url} size={20} />{m.profile?.full_name ?? m.profile?.email}{on && <Check className="size-3.5 text-accent" />}</button>) })}</div>
            </Field>)}

          <Field label={d.kind === 'intervention' ? 'Travaux à réaliser / compte rendu' : 'Description des travaux'}><Textarea rows={3} value={d.travaux ?? ''} disabled={lecture} onChange={(e) => set('travaux', e.target.value)} /></Field>

          {/* lignes */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[13px] font-medium text-text-2">{d.kind === 'intervention' ? 'Pièces et main d’œuvre' : 'Lignes'}</span>
              {canWrite && articles.length > 0 && <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-3" /><Input className="pl-8" value={rech} onChange={(e) => setRech(e.target.value)} placeholder="Ajouter un article du catalogue…" aria-label="Chercher un article" />
                {trouves.length > 0 && <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg">{trouves.map((a) => (
                  <li key={a.id}><button type="button" onClick={() => ajouterArticle(a)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-surface-2"><span className="min-w-0 flex-1 truncate">{a.ref && <span className="mr-1.5 text-text-3">{a.ref}</span>}{a.label}</span><span className="tabular-nums text-text-2">{eur(a.price_ht)}</span></button></li>))}</ul>}</div>}
            </div>
            <div className="space-y-2">
              {d.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_64px_72px_104px_88px_32px] sm:border-0 sm:p-0">
                  <Input value={l.label} disabled={lecture} placeholder="Désignation" aria-label="Désignation" onChange={(e) => setLigne(i, { label: e.target.value })} className="max-sm:col-span-2" />
                  <div className="col-span-2 grid grid-cols-4 gap-2 sm:contents">
                    <Input type="number" min={0} step="any" value={l.qty} disabled={lecture} aria-label="Quantité" onChange={(e) => setLigne(i, { qty: Number(e.target.value) })} />
                    <Input value={l.unit ?? ''} disabled={lecture} aria-label="Unité" placeholder="u" onChange={(e) => setLigne(i, { unit: e.target.value })} />
                    <Input type="number" min={0} step="any" value={l.price_ht} disabled={lecture} aria-label="Prix unitaire HT" onChange={(e) => setLigne(i, { price_ht: Number(e.target.value) })} />
                    <Select value={String(l.tva)} disabled={lecture} aria-label="TVA" onChange={(e) => setLigne(i, { tva: Number(e.target.value) })}>{[...new Set([20, 10, 5.5, 2.1, 0, Number(l.tva)])].map((v) => <option key={v} value={v}>{v} %</option>)}</Select>
                  </div>
                  {canWrite && <button type="button" onClick={() => set('lines', d.lines.filter((_, j) => j !== i))} className="row-start-1 self-center justify-self-end text-text-3 hover:text-danger sm:row-auto" aria-label="Retirer la ligne"><Trash2 className="size-4" /></button>}
                  <div className="col-span-2 -mt-1 text-right text-[11.5px] tabular-nums text-text-3 sm:hidden">{eur(l.qty * l.price_ht)} HT</div>
                </div>))}
            </div>
            {canWrite && <Button size="sm" className="mt-2" onClick={() => set('lines', [...d.lines, { label: '', qty: 1, unit: 'u', price_ht: 0, tva: entreprise.tva_defaut ?? 20 }])}><Plus className="size-3.5" />Ligne libre</Button>}
            <div className="mt-4 flex flex-col items-end gap-1 border-t border-border pt-3 text-[13.5px] tabular-nums">
              <label className="mb-1 flex items-center gap-2 text-text-2">Remise <Input type="number" min={0} max={100} step="any" className="h-8 w-20" value={d.discount ?? 0} disabled={lecture} onChange={(e) => set('discount', Number(e.target.value))} aria-label="Remise en %" />%</label>
              <div className="flex w-60 justify-between text-text-2"><span>Total HT</span><span>{eur(t.ht)}</span></div>
              {Object.entries(t.parTaux).filter(([k]) => Number(k)).map(([k, v]) => <div key={k} className="flex w-60 justify-between text-text-2"><span>TVA {k} %</span><span>{eur(v.tva)}</span></div>)}
              <div className="flex w-60 justify-between text-[16px] font-semibold"><span>Total TTC</span><span>{eur(t.ttc)}</span></div>
            </div>
          </div>

          <Field label="Notes internes (jamais sur le PDF)"><Textarea rows={2} value={d.notes ?? ''} disabled={lecture} onChange={(e) => set('notes', e.target.value)} /></Field>

          {/* décision et signature */}
          {(d.kind === 'devis' || d.kind === 'intervention') && (
            <section className="rounded-2xl border border-border bg-surface-2/40 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2"><FileSignature className="size-4 text-text-3" /><h3 className="text-[14px] font-semibold">{d.kind === 'devis' ? 'Accord du client' : 'Signature et clôture'}</h3>{d.status && <Pastille kind={d.kind} status={d.status} />}</div>
              {d.signature && <div className="mb-3 flex flex-wrap items-end gap-4"><img src={d.signature} alt={`Signature de ${d.signer_name ?? 'client'}`} className="h-16 rounded-lg border border-border bg-white p-1" />
                <div className="text-[12.5px] text-text-2">Signé par <b>{d.signer_name}</b><br />{quand(d.signed_at)} · {d.signed_via === 'lien' ? 'en ligne par le client' : 'sur place'}</div></div>}
              {d.decided_by && <p className="mb-3 text-[12.5px] text-text-3">Décision enregistrée par {nameOf(d.decided_by)} le {quand(d.decided_at)}</p>}
              {d.closed_at && <p className="mb-3 flex items-center gap-1.5 text-[12.5px] text-success"><Lock className="size-3.5" />Clôturée par {nameOf(d.closed_by)} le {quand(d.closed_at)}</p>}
              {canWrite && !signer && <div className="flex flex-wrap gap-2">
                <Button onClick={() => setSigner(true)}><FileSignature className="size-4" />Faire signer ici</Button>
                {d.kind === 'devis' && <><Button onClick={() => decider('accepte')}><CheckCircle2 className="size-4 text-success" />Accepter</Button><Button onClick={() => decider('refuse')}><XCircle className="size-4 text-danger" />Refuser</Button></>}
                {d.kind === 'intervention' && (d.closed_at
                  ? <Button onClick={() => enregistrer({ closed_at: null, closed_by: null, status: 'en_cours' })}>Rouvrir</Button>
                  : <Button onClick={() => enregistrer({ closed_at: new Date().toISOString(), closed_by: userId, status: 'terminee' })}><Lock className="size-4" />Clôturer</Button>)}
                {d.id && <Button onClick={() => { void navigator.clipboard.writeText(lienSignature); toast.success('Lien copié : le client peut lire et signer depuis son téléphone ou son PC') }}><Link2 className="size-4" />Lien de signature</Button>}
              </div>}
              {signer && <div className="space-y-3">
                <Field label="Nom du signataire"><Input autoFocus value={sigNom} onChange={(e) => setSigNom(e.target.value)} placeholder={client?.name ?? 'Prénom Nom'} /></Field>
                <SignaturePad onChange={setSig} />
                <div className="flex flex-wrap gap-2">
                  {d.kind === 'devis' ? <><Button variant="primary" disabled={!sig || !sigNom.trim()} onClick={() => decider('accepte')}><Check className="size-4" />Signé : devis accepté</Button><Button onClick={() => decider('refuse')}>Refusé</Button></>
                    : <><Button variant="primary" disabled={!sig || !sigNom.trim()} onClick={() => signerIntervention(true)}><Check className="size-4" />Signer et clôturer</Button><Button disabled={!sig || !sigNom.trim()} onClick={() => signerIntervention(false)}>Signer seulement</Button></>}
                  <Button variant="ghost" onClick={() => setSigner(false)}><X className="size-4" />Annuler</Button>
                </div>
              </div>}
            </section>)}

          {/* suite : conversions, planification */}
          {canWrite && d.id && d.kind !== 'achat' && (
            <div className="flex flex-wrap gap-2">
              {d.kind === 'devis' && <><Button size="sm" onClick={() => convertir('facture')}><Receipt className="size-4" />Créer la facture</Button><Button size="sm" onClick={() => convertir('intervention')}><Wrench className="size-4" />Créer l’intervention</Button></>}
              {d.kind === 'intervention' && <><Button size="sm" onClick={planifier} disabled={!!d.task_id && !!d.event_id}><CalendarPlus className="size-4" />{d.task_id && d.event_id ? 'Tâche et calendrier liés' : 'Ordre de mission : tâche + calendrier'}</Button><Button size="sm" onClick={() => convertir('facture')}><Receipt className="size-4" />Facturer</Button></>}
              {d.kind === 'facture' && d.status !== 'payee' && <Button size="sm" onClick={() => enregistrer({ status: 'payee', paid_at: auj() })}><CheckCircle2 className="size-4" />Marquer payée</Button>}
            </div>)}

          {(parent || enfants.length > 0 || d.task_id || d.event_id) && (
            <div className="flex flex-wrap gap-2 text-[12.5px]">
              {parent && <Link href={`/app/${ws.slug}/gestion/${parent.kind === 'devis' ? 'devis' : parent.kind === 'facture' ? 'factures' : 'interventions'}?id=${parent.id}`} className="rounded-full border border-border px-2.5 py-1 hover:bg-surface-2">Issu de {NOM_KIND[parent.kind].toLowerCase()} {parent.number}</Link>}
              {enfants.map((e) => <Link key={e.id} href={`/app/${ws.slug}/gestion/${e.kind === 'facture' ? 'factures' : 'interventions'}?id=${e.id}`} className="rounded-full border border-border px-2.5 py-1 hover:bg-surface-2">{NOM_KIND[e.kind]} {e.number}</Link>)}
              {d.task_id && <Link href={`/app/${ws.slug}/tasks?task=${d.task_id}`} className="rounded-full border border-border px-2.5 py-1 hover:bg-surface-2">Tâche liée</Link>}
              {d.event_id && <Link href={`/app/${ws.slug}/calendar`} className="rounded-full border border-border px-2.5 py-1 hover:bg-surface-2">Au calendrier</Link>}
            </div>)}

          {d.id && historique.data.length > 0 && (
            <details className="rounded-xl border border-border p-3 text-[12.5px]"><summary className="cursor-pointer font-medium text-text-2">Suivi ({historique.data.length})</summary>
              <ul className="mt-2 space-y-1.5">{historique.data.map((h) => <li key={h.id} className="flex gap-2 text-text-2"><span className="w-36 shrink-0 text-text-3">{quand(h.created_at)}</span><span><b className="font-medium text-text">{nameOf(h.user_id)}</b> · {libelleAction(h.action)}</span></li>)}</ul></details>)}
        </div>
      </Dialog>

      <NouveauClient open={nouveauClient} onClose={() => setNouveauClient(false)} onCree={(f) => setD((x) => ({ ...x, contact_id: f.id, address: x.address || f.address || null }))} />
      {d.id && <EnvoiDialog open={envoi} onClose={() => setEnvoi(false)} doc={d as GDoc} client={client} lien={lienSignature} ctx={ctxPdf(d as GDoc)} onEnvoye={(to) => enregistrer({ sent_at: new Date().toISOString(), sent_to: to, status: d.status === 'brouillon' ? (d.kind === 'devis' ? 'envoye' : 'envoyee') : d.status })} />}
    </>
  )
}

const libelleAction = (a: string) => a === 'create' ? 'a créé' : a === 'update' ? 'a modifié' : a === 'delete' ? 'a supprimé' : a === 'sent' ? 'a envoyé par e-mail' : a.startsWith('status:') ? `a passé l’état à « ${a.slice(7)} »` : a

export function NouveauClient({ open, onClose, onCree, initial }: { open: boolean; onClose: () => void; onCree?: (f: Fiche) => void; initial?: Fiche | null }) {
  const { ws, log } = useWorkspace()
  const { userId } = useSession()
  const vide = { name: '', company: '', email: '', phone: '', address: '', zip: '', city: '', siret: '', kind: 'particulier', notes: '' }
  const [f, setF] = useState(vide)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF(initial ? { name: initial.name, company: initial.company ?? '', email: initial.email ?? '', phone: initial.phone ?? '', address: initial.address ?? '', zip: initial.zip ?? '', city: initial.city ?? '', siret: initial.siret ?? '', kind: initial.kind ?? 'particulier', notes: initial.notes ?? '' } : vide) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    if (!f.name.trim() || !userId) return
    setBusy(true)
    const row = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v])) as Record<string, string | null>
    row.name = f.name.trim(); row.kind = f.kind
    const q = initial ? getDb().from('crm_contacts').update(row).eq('id', initial.id).select().single() : getDb().from('crm_contacts').insert({ ...row, workspace_id: ws.id, created_by: userId, status: 'customer' }).select().single()
    const { data, error } = await q
    setBusy(false)
    if (error || !data) { toast.error(/column/.test(error?.message ?? '') ? 'La migration de la gestion n’est pas encore passée' : 'Enregistrement impossible'); return }
    log(initial ? 'update' : 'create', 'crm_contacts', (data as Fiche).id, { name: row.name })
    onCree?.(data as Fiche); onClose()
  }
  const c = (k: keyof typeof vide, l: string, p: { type?: string; ph?: string; cls?: string } = {}) => <Field label={l} className={p.cls}><Input type={p.type ?? 'text'} value={f[k]} placeholder={p.ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
  return (
    <Dialog open={open} onClose={onClose} title={initial ? 'Modifier la fiche client' : 'Nouveau client'} size="lg" footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={busy} disabled={!f.name.trim()} onClick={save}>Enregistrer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" className="sm:col-span-2"><div className="flex gap-2">{[['particulier', 'Particulier'], ['pro', 'Professionnel']].map(([v, l]) => <button key={v} type="button" onClick={() => setF({ ...f, kind: v })} className={cn('flex-1 rounded-lg border px-3 py-2 text-[13px]', f.kind === v ? 'border-accent bg-accent-soft font-medium' : 'border-border text-text-2')}>{l}</button>)}</div></Field>
        {c('name', 'Nom et prénom *', { ph: 'Jean Dupont' })}{f.kind === 'pro' && c('company', 'Société', { ph: 'Boulangerie Petit' })}
        {c('phone', 'Téléphone', { type: 'tel' })}{c('email', 'E-mail', { type: 'email' })}
        {c('address', 'Adresse', { cls: 'sm:col-span-2' })}{c('zip', 'Code postal')}{c('city', 'Ville')}
        {f.kind === 'pro' && c('siret', 'SIRET')}
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  )
}

function EnvoiDialog({ open, onClose, doc, client, lien, ctx, onEnvoye }: { open: boolean; onClose: () => void; doc: GDoc; client: Fiche | null; lien: string; ctx: ContextePdf; onEnvoye: (to: string) => void }) {
  const { ws, log } = useWorkspace()
  const e = entrepriseDe(ws)
  const nom = doc.kind === 'intervention' ? 'ordre de mission' : NOM_KIND[doc.kind].toLowerCase()
  const [to, setTo] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setTo(client?.email ?? '')
    setMsg(`Bonjour${client?.name ? ` ${client.name}` : ''},\n\nVous trouverez ci-joint ${doc.kind === 'facture' ? 'la' : 'le'} ${nom} ${doc.number} d’un montant de ${eur(doc.total_ttc)} TTC.${doc.kind === 'devis' ? '\nVous pouvez le lire et le signer en ligne depuis votre téléphone ou votre ordinateur avec le lien ci-dessous.' : ''}\n\nBien cordialement,\n${e.nom ?? ws.name}`)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  async function envoyer() {
    setBusy(true)
    try {
      const pdf = await pdfBase64(doc, ctx)
      const r = isDemoBrowser() ? null : await fetch('/api/gestion/envoyer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wsId: ws.id, docId: doc.id, to: to.trim(), message: msg, pdf }) }).catch(() => null)
      if (r?.ok) { toast.success(`Envoyé à ${to}`); log('sent', 'gestion_documents', doc.id, { to }); onEnvoye(to.trim()); onClose(); return }
      // pas de service d'e-mail branché : on ouvre la messagerie de l'appareil avec le lien de signature, et on télécharge le PDF à joindre
      const corps = `${msg}\n\n${doc.kind === 'devis' ? 'Lire et signer en ligne' : 'Voir le document'} : ${lien}`
      window.location.href = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(`${NOM_KIND[doc.kind]} ${doc.number} · ${e.nom ?? ws.name}`)}&body=${encodeURIComponent(corps)}`
      await telechargerPdf(doc, ctx)
      toast.info('Ta messagerie s’ouvre avec le message ; le PDF vient d’être téléchargé pour le joindre.')
      log('sent', 'gestion_documents', doc.id, { to, via: 'mailto' }); onEnvoye(to.trim()); onClose()
    } catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title={`Envoyer ${doc.kind === 'facture' ? 'la' : 'le'} ${nom} ${doc.number}`} size="lg"
      footer={<><Button onClick={() => { void navigator.clipboard.writeText(lien); toast.success('Lien copié') }}><Copy className="size-4" />Copier le lien</Button><Button variant="primary" loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(to.trim())} onClick={envoyer}><Mail className="size-4" />Envoyer</Button></>}>
      <div className="space-y-3">
        <Field label="E-mail du client"><Input type="email" value={to} onChange={(ev) => setTo(ev.target.value)} placeholder="client@exemple.fr" /></Field>
        <Field label="Message"><Textarea rows={7} value={msg} onChange={(ev) => setMsg(ev.target.value)} /></Field>
        <p className="text-[12px] text-text-3">Le PDF est joint et le message contient le lien pour {doc.kind === 'devis' ? 'lire et signer le devis' : 'voir le document'} en ligne.</p>
      </div>
    </Dialog>
  )
}
