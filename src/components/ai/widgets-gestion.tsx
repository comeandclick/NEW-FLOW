'use client'
// Widgets de l'assistant pour la gestion (15/10/2026) : bilan chiffré, devis / factures / interventions filtrés,
// fiche client complète, catalogue, formulaire de devis / facture / intervention prérempli, action sur un document
// (payer, accepter, clôturer…), lecture d'une facture en photo ou PDF. Tout est en direct et cliquable.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format, isSameDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Check, FileSignature, Gauge, Package, Plus, Receipt, ScanLine, Trash2, Users, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Cadre, Vide } from '@/components/ai/widgets'
import { Pastille, dateDoc, useArticles, useDocs, useFiches } from '@/components/gestion/commun'
import { AssistantFactures } from '@/components/gestion/assistant-factures'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { NOM_KIND, STATUT_INITIAL, entrepriseDe, eur, prochainNumero, totaux, typesIntervention, type Fiche, type GDoc, type Ligne } from '@/lib/gestion'
import { espaceClient, synchroniser } from '@/lib/gestion-sync'
import type { ActionDoc, BrouillonDoc, VueGestion } from '@/lib/ai-widgets'
import { cn } from '@/lib/utils'

const norm = (s?: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
/** le client dont parle l'utilisateur, même mal orthographié ou partiel (« Dupont », « atelier nord ») */
export function trouverFiche(fiches: Fiche[], nom?: string) {
  const n = norm(nom)
  if (!n) return null
  return fiches.find((f) => [f.name, f.company].some((v) => norm(v) === n))
    ?? fiches.find((f) => [f.name, f.company].some((v) => v && (norm(v).includes(n) || n.includes(norm(v)))))
    ?? fiches.find((f) => n.split(' ').filter((m) => m.length > 2).some((m) => norm(`${f.name} ${f.company ?? ''}`).split(' ').includes(m))) ?? null
}
const page = (k: GDoc['kind']) => (k === 'devis' ? 'devis' : k === 'facture' ? 'factures' : k === 'intervention' ? 'interventions' : 'scan')

function LigneDoc({ d, fiches }: { d: GDoc; fiches: Fiche[] }) {
  const { ws, nameOf } = useWorkspace()
  const f = fiches.find((x) => x.id === d.contact_id)
  return (
    <li><Link href={`/app/${ws.slug}/gestion/${page(d.kind)}?id=${d.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
      <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{f?.company || f?.name || d.title || '—'}</span>
        <span className="block truncate text-[11.5px] text-text-3">{d.number}{d.intervention_type ? ` · ${d.intervention_type}` : d.title && f ? ` · ${d.title}` : ''} · {format(dateDoc(d), d.kind === 'intervention' && d.start_at ? 'EEE d MMM HH:mm' : 'd MMM', { locale: fr })}{d.assigned_to?.length ? ` · ${d.assigned_to.map(nameOf).join(', ')}` : ''}</span></span>
      <span className="flex shrink-0 flex-col items-end gap-0.5"><Pastille kind={d.kind} status={d.status} />{Number(d.total_ttc) > 0 && <span className="text-[12px] font-semibold tabular-nums">{eur(d.total_ttc)}</span>}</span>
    </Link></li>
  )
}

export function WidgetGestion({ vue, filtre, periode = 'mois', client, membre }: { vue: VueGestion; filtre?: string; periode?: string; client?: string; membre?: string }) {
  const { ws, members } = useWorkspace()
  const docs = useDocs(), fiches = useFiches()
  const auj = new Date().toISOString().slice(0, 10)
  const fiche = trouverFiche(fiches.data, client)
  const m = membre ? members.find((x) => norm(x.profile?.full_name).includes(norm(membre)) || norm(membre).includes(norm(x.profile?.full_name).split(' ')[0] ?? '_')) : null
  const debut = useMemo(() => { const d = new Date(); if (periode === 'semaine') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); else if (periode === 'mois') d.setDate(1); else if (periode === 'annee') d.setMonth(0, 1); else return '0000'; return d.toISOString().slice(0, 10) }, [periode])
  const base = docs.data.filter((d) => (!fiche || d.contact_id === fiche.id) && (!m || d.assigned_to?.includes(m.user_id) || d.created_by === m.user_id))

  if (vue === 'bilan') {
    const p = base.filter((d) => (d.kind === 'intervention' && d.start_at ? d.start_at.slice(0, 10) : d.issued_at) >= debut)
    const fac = p.filter((d) => d.kind === 'facture' && !['annulee', 'brouillon'].includes(d.status))
    const s = (l: GDoc[], k: 'total_ht' | 'total_ttc' = 'total_ttc') => l.reduce((a, d) => a + Number(d[k]), 0)
    const ca = s(fac, 'total_ht'), dep = s(p.filter((d) => d.kind === 'achat'), 'total_ht')
    const tuiles: [string, string, string?][] = [['Chiffre d’affaires HT', eur(ca)], ['Gains (CA − dépenses)', eur(ca - dep), ca - dep >= 0 ? 'text-success' : 'text-danger'], ['Encaissé', eur(s(fac.filter((d) => d.status === 'payee'))), 'text-success'], ['À encaisser', eur(s(base.filter((d) => d.kind === 'facture' && ['envoyee', 'en_retard'].includes(d.status)))), 'text-warning'],
      ['Devis acceptés', `${p.filter((d) => d.kind === 'devis' && d.status === 'accepte').length} · ${eur(s(p.filter((d) => d.kind === 'devis' && d.status === 'accepte')))}`], ['Devis en attente', `${base.filter((d) => d.kind === 'devis' && ['envoye', 'en_attente'].includes(d.status)).length}`, 'text-warning'],
      ['Interventions', `${p.filter((d) => d.kind === 'intervention').length}`], ['Clôturées', `${p.filter((d) => d.kind === 'intervention' && d.closed_at).length}`, 'text-success']]
    return (
      <Cadre icone={Gauge} titre={`Bilan ${{ semaine: 'de la semaine', mois: 'du mois', annee: 'de l’année', tout: 'total' }[periode] ?? ''}${fiche ? ` · ${fiche.company || fiche.name}` : ''}${m ? ` · ${m.profile?.full_name}` : ''}`} lien={{ href: `/app/${ws.slug}/gestion`, lib: 'Tableau de bord' }}>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">{tuiles.map(([l, v, c]) => <div key={l} className="bg-surface px-3.5 py-3"><div className="text-[11px] text-text-3">{l}</div><div className={cn('mt-0.5 text-[15px] font-semibold tabular-nums', c)}>{v}</div></div>)}</div>
      </Cadre>
    )
  }
  const kind = ({ devis: 'devis', factures: 'facture', interventions: 'intervention', achats: 'achat' } as const)[vue]
  const f = filtre ?? ''
  const liste = base.filter((d) => d.kind === kind).filter((d) => {
    if (kind === 'devis') return f === 'en_attente' ? ['envoye', 'en_attente'].includes(d.status) : f === 'acceptes' ? d.status === 'accepte' : f === 'refuses' ? d.status === 'refuse' : f === 'brouillons' ? d.status === 'brouillon' : true
    if (kind === 'facture') return f === 'en_retard' ? d.status === 'en_retard' || (d.status === 'envoyee' && !!d.due_at && d.due_at < auj) : f === 'payees' ? d.status === 'payee' : f === 'toutes' ? true : ['envoyee', 'en_retard', 'brouillon'].includes(d.status)
    if (kind === 'intervention') return f === 'aujourdhui' ? !!d.start_at && isSameDay(new Date(d.start_at), new Date()) : f === 'cloturees' ? !!d.closed_at : f === 'a_planifier' ? d.status === 'a_planifier' : f === 'toutes' ? true : f === 'non_cloturees' ? !d.closed_at && d.status !== 'annulee' : !d.closed_at && d.status !== 'annulee' && (!d.start_at || d.start_at.slice(0, 10) >= auj)
    return true
  }).sort((a, b) => kind === 'intervention' ? dateDoc(a).getTime() - dateDoc(b).getTime() : dateDoc(b).getTime() - dateDoc(a).getTime()).slice(0, 12)
  const total = liste.reduce((a, d) => a + Number(d.total_ttc), 0)
  const titres: Record<string, string> = { en_attente: 'Devis en attente', acceptes: 'Devis acceptés', refuses: 'Devis refusés', brouillons: 'Devis en brouillon', en_retard: 'Factures en retard', payees: 'Factures payées', toutes: kind === 'facture' ? 'Toutes les factures' : 'Toutes les interventions', aujourdhui: 'Interventions du jour', cloturees: 'Interventions clôturées', a_planifier: 'Interventions à planifier', non_cloturees: 'Interventions non clôturées' }
  const titre = titres[f] ?? { devis: 'Devis', facture: 'Factures à encaisser', intervention: 'Interventions à venir', achat: 'Factures reçues' }[kind]
  const I = kind === 'intervention' ? Wrench : kind === 'devis' ? FileSignature : Receipt
  return (
    <Cadre icone={I} titre={`${titre}${fiche ? ` · ${fiche.company || fiche.name}` : ''}${m ? ` · ${m.profile?.full_name}` : ''}`} compte={liste.length} lien={{ href: `/app/${ws.slug}/gestion/${page(kind)}`, lib: 'Tout voir' }}>
      {!docs.loading && !liste.length ? <Vide texte="Rien ici pour l’instant." /> : <ul className="divide-y divide-border">{liste.map((d) => <LigneDoc key={d.id} d={d} fiches={fiches.data} />)}</ul>}
      {liste.length > 1 && total > 0 && <div className="flex justify-between border-t border-border px-4 py-2 text-[12.5px] text-text-2"><span>Total</span><span className="font-semibold tabular-nums text-text">{eur(total)} TTC</span></div>}
    </Cadre>
  )
}

export function WidgetFicheGestion({ nom }: { nom: string }) {
  const { ws } = useWorkspace()
  const docs = useDocs(), fiches = useFiches()
  const f = trouverFiche(fiches.data, nom)
  if (!f) return <Cadre icone={Users} titre="Fiche client">{fiches.loading ? <div className="skeleton m-4 h-16 rounded-lg" /> : <Vide texte={`Aucune fiche client ne correspond à « ${nom} ».`} />}</Cadre>
  const siens = docs.data.filter((d) => d.contact_id === f.id).sort((a, b) => dateDoc(b).getTime() - dateDoc(a).getTime())
  const ca = siens.filter((d) => d.kind === 'facture' && !['annulee', 'brouillon'].includes(d.status)).reduce((a, d) => a + Number(d.total_ht), 0)
  const du = siens.filter((d) => d.kind === 'facture' && ['envoyee', 'en_retard'].includes(d.status)).reduce((a, d) => a + Number(d.total_ttc), 0)
  const base = `/app/${ws.slug}/gestion`
  return (
    <Cadre icone={Users} titre={f.company || f.name} lien={{ href: `${base}/clients/${f.id}`, lib: 'Fiche' }}>
      <div className="space-y-1 px-4 py-3 text-[12.5px] text-text-2">
        <div>{[f.company && f.name, [f.address, f.zip, f.city].filter(Boolean).join(' '), f.phone, f.email].filter(Boolean).join(' · ')}</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 tabular-nums"><span>CA <b className="text-text">{eur(ca)}</b> HT</span><span>Reste à payer <b className={du ? 'text-warning' : 'text-text'}>{eur(du)}</b></span><span>{siens.filter((d) => d.kind === 'intervention').length} interventions</span></div>
      </div>
      {siens.length > 0 && <ul className="divide-y divide-border border-t border-border">{siens.slice(0, 8).map((d) => <LigneDoc key={d.id} d={d} fiches={fiches.data} />)}</ul>}
      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-2.5">
        <Link href={`${base}/devis?new=1&client=${f.id}`}><Button size="xs"><Plus className="size-3" />Devis</Button></Link>
        <Link href={`${base}/interventions?new=1&client=${f.id}`}><Button size="xs"><Plus className="size-3" />Intervention</Button></Link>
        <Link href={`${base}/factures?new=1&client=${f.id}`}><Button size="xs"><Plus className="size-3" />Facture</Button></Link>
      </div>
    </Cadre>
  )
}

export function WidgetArticles({ recherche }: { recherche?: string }) {
  const { ws } = useWorkspace()
  const arts = useArticles()
  const mots = norm(recherche).split(' ').filter((m) => m.length > 1)
  const liste = arts.data.filter((a) => !mots.length || mots.every((m) => norm(`${a.ref ?? ''} ${a.label} ${a.category ?? ''}`).includes(m))).slice(0, 10)
  return (
    <Cadre icone={Package} titre={recherche ? `Articles « ${recherche} »` : 'Catalogue'} compte={liste.length} lien={{ href: `/app/${ws.slug}/gestion/articles`, lib: 'Articles' }}>
      {!arts.loading && !liste.length ? <Vide texte="Aucun article trouvé." /> : <ul className="divide-y divide-border">{liste.map((a) => (
        <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]"><span className="min-w-0 flex-1 truncate">{a.ref && <span className="mr-1.5 text-text-3">{a.ref}</span>}{a.label}</span><span className="tabular-nums text-text-2">{eur(a.price_ht)} HT / {a.unit}</span></li>))}</ul>}
    </Cadre>
  )
}

/** Formulaire prérempli par l'assistant : on vérifie, on complète, « Créer » enregistre le document (et sa tâche, son événement, son PDF). */
export function WidgetDocument({ d: init }: { d: BrouillonDoc }) {
  const { ws, members, log } = useWorkspace()
  const { userId } = useSession()
  const router = useRouter()
  const docs = useDocs(), fiches = useFiches(), arts = useArticles()
  const ent = entrepriseDe(ws)
  const [kind, setKind] = useState(init.kind)
  const [clientId, setClientId] = useState<string | null>(null)
  const [titre, setTitre] = useState(init.titre ?? '')
  const [date, setDate] = useState(init.date ?? '')
  const [heure, setHeure] = useState(init.heure ?? '')
  const [type, setType] = useState(init.type_intervention ?? typesIntervention(ws)[0])
  const [interv, setInterv] = useState<string | null>(null)
  const [lignes, setLignes] = useState<Ligne[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [cree, setCree] = useState<GDoc | null>(null)

  // valeurs déduites tant que l'utilisateur n'a rien changé
  const fiche = clientId !== null ? fiches.data.find((f) => f.id === clientId) ?? null : trouverFiche(fiches.data, init.client)
  const intervenant = interv ?? members.find((m) => init.intervenant && norm(m.profile?.full_name).includes(norm(init.intervenant)))?.user_id ?? (kind === 'intervention' ? userId ?? '' : '')
  const lignesEff: Ligne[] = lignes ?? (init.lignes ?? []).map((l) => {
    const a = arts.data.find((x) => norm(x.label) === norm(l.label)) ?? arts.data.find((x) => norm(x.label).includes(norm(l.label)) || norm(l.label).includes(norm(x.label)))
    return { article_id: a?.id ?? null, ref: a?.ref ?? '', label: a?.label ?? l.label, qty: l.qty, unit: a?.unit ?? 'u', price_ht: l.price_ht ?? Number(a?.price_ht ?? 0), tva: Number(a?.tva ?? ent.tva_defaut ?? 20) }
  })
  const t = totaux(lignesEff)
  const setL = (i: number, p: Partial<Ligne>) => setLignes(lignesEff.map((l, j) => (j === i ? { ...l, ...p } : l)))

  async function creer() {
    if (!userId) return
    setBusy(true)
    let contact = fiche?.id ?? null
    if (!contact && init.client && clientId === null) { // client inconnu : on crée sa fiche
      const { data } = await getDb().from('crm_contacts').insert({ workspace_id: ws.id, name: init.client, status: 'customer', created_by: userId }).select('id').single()
      contact = (data as { id: string } | null)?.id ?? null
      if (contact) void espaceClient(ws.id, userId, [{ name: init.client }])
    }
    if (kind !== 'intervention' && !contact) { toast.error('Choisis un client'); setBusy(false); return }
    const debut = kind === 'intervention' && date ? new Date(`${date}T${heure || '09:00'}:00`) : null
    const row = {
      workspace_id: ws.id, kind, number: prochainNumero(kind, docs.data.filter((x) => x.kind === kind).map((x) => x.number)), contact_id: contact, title: titre.trim() || null,
      status: kind === 'intervention' && debut ? 'planifiee' : STATUT_INITIAL[kind], issued_at: kind !== 'intervention' && date ? date : new Date().toISOString().slice(0, 10),
      due_at: kind === 'devis' ? new Date(Date.now() + (ent.validite_jours ?? 30) * 864e5).toISOString().slice(0, 10) : kind === 'facture' ? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) : null,
      start_at: debut?.toISOString() ?? null, end_at: debut ? new Date(debut.getTime() + (init.duree ?? 120) * 60000).toISOString() : null, address: fiche?.address ?? null,
      intervention_type: kind === 'intervention' ? type : null, priority: ['basse', 'haute', 'urgente'].includes(init.priorite ?? '') ? init.priorite : 'normale',
      assigned_to: kind === 'intervention' && intervenant ? [intervenant] : [], travaux: init.travaux ?? null, lines: lignesEff, total_ht: t.ht, total_tva: t.tva, total_ttc: t.ttc, created_by: userId,
    }
    const { data, error } = await getDb().from('gestion_documents').insert(row).select().single()
    setBusy(false)
    if (error || !data) { toast.error('Création impossible'); return }
    const doc = data as GDoc
    log('create', 'gestion_documents', doc.id, { number: doc.number, kind, via: 'assistant' })
    await synchroniser(doc, { wsId: ws.id, userId, client: fiche, entreprise: ent, pdf: { entreprise: ent, logoUrl: ws.logo_url, client: fiche, nomMembre: () => '' } })
    setCree(doc); toast.success(`${NOM_KIND[kind]} ${doc.number} créé`)
  }

  if (cree) return (
    <Cadre icone={Check} titre={`${kind === 'intervention' ? 'Intervention' : NOM_KIND[kind]} ${cree.number} créé`}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-[13px] text-text-2"><span className="flex-1">{fiche?.company || fiche?.name || init.client} · {eur(cree.total_ttc)} TTC{kind === 'intervention' && cree.start_at ? ' · dans Tâches et au Calendrier' : ''}</span>
        <Button size="sm" variant="primary" onClick={() => router.push(`/app/${ws.slug}/gestion/${page(kind)}?id=${cree.id}`)}>Ouvrir</Button></div>
    </Cadre>
  )
  return (
    <Cadre icone={kind === 'intervention' ? Wrench : kind === 'devis' ? FileSignature : Receipt} titre={`Nouveau ${kind === 'intervention' ? 'intervention' : NOM_KIND[kind].toLowerCase()}`}>
      <div className="space-y-2.5 px-4 py-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <Select value={kind} onChange={(e) => setKind(e.target.value as BrouillonDoc['kind'])} aria-label="Type de document"><option value="devis">Devis</option><option value="facture">Facture</option><option value="intervention">Intervention</option></Select>
          <Select className="sm:col-span-2" value={fiche?.id ?? ''} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
            <option value="">{init.client && !fiche ? `Nouveau client : ${init.client}` : '— Client —'}</option>{fiches.data.map((f) => <option key={f.id} value={f.id}>{f.company || f.name}</option>)}</Select>
        </div>
        <Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Objet (ex. Remplacement chauffe-eau)" aria-label="Objet" />
        {kind === 'intervention' && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" /><Input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} aria-label="Heure" />
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">{[...new Set([...typesIntervention(ws), type])].map((x) => <option key={x}>{x}</option>)}</Select>
          <Select value={intervenant} onChange={(e) => setInterv(e.target.value)} aria-label="Intervenant"><option value="">— Intervenant —</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.full_name ?? m.profile?.email}</option>)}</Select>
        </div>}
        {(lignesEff.length > 0 || kind !== 'intervention') && <div className="space-y-1.5">
          {lignesEff.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_56px_80px_28px] items-center gap-1.5">
              <Input className="h-8" value={l.label} onChange={(e) => setL(i, { label: e.target.value })} aria-label="Désignation" />
              <Input className="h-8" type="number" min={0} step="any" value={l.qty} onChange={(e) => setL(i, { qty: Number(e.target.value) })} aria-label="Quantité" />
              <Input className="h-8" type="number" min={0} step="any" value={l.price_ht} onChange={(e) => setL(i, { price_ht: Number(e.target.value) })} aria-label="Prix HT" />
              <button onClick={() => setLignes(lignesEff.filter((_, j) => j !== i))} aria-label="Retirer" className="text-text-3 hover:text-danger"><Trash2 className="size-3.5" /></button>
            </div>))}
          <button onClick={() => setLignes([...lignesEff, { label: '', qty: 1, unit: 'u', price_ht: 0, tva: ent.tva_defaut ?? 20 }])} className="inline-flex items-center gap-1 text-[12px] text-text-3 hover:text-text"><Plus className="size-3.5" />Ligne</button>
        </div>}
        <div className="flex items-center gap-3 border-t border-border pt-2.5"><span className="flex-1 text-[12.5px] tabular-nums text-text-2">{eur(t.ht)} HT · <b className="text-text">{eur(t.ttc)} TTC</b></span><Button variant="primary" size="sm" loading={busy} onClick={creer}>Créer</Button></div>
      </div>
    </Cadre>
  )
}

/** Action demandée sur un document existant : résumé du document + bouton de confirmation. */
export function WidgetActionDoc({ numero, action }: { numero: string; action: ActionDoc }) {
  const { ws, log } = useWorkspace()
  const { userId } = useSession()
  const router = useRouter()
  const docs = useDocs(), fiches = useFiches()
  const [fait, setFait] = useState(false)
  const n = norm(numero)
  const d = docs.data.find((x) => norm(x.number) === n) ?? docs.data.find((x) => norm(x.number).endsWith(n) || norm(x.ref_externe) === n)
  if (!d) return <Cadre icone={Receipt} titre={numero}>{docs.loading ? <div className="skeleton m-4 h-12 rounded-lg" /> : <Vide texte={`Aucun document « ${numero} ».`} />}</Cadre>
  const f = fiches.data.find((x) => x.id === d.contact_id) ?? null
  const ent = entrepriseDe(ws)
  const ctxPdf = { entreprise: ent, logoUrl: ws.logo_url, client: f, nomMembre: () => '' }
  const libelle: Record<ActionDoc, string> = { payer: 'Marquer payée', accepter: 'Marquer accepté', refuser: 'Marquer refusé', cloturer: 'Clôturer', envoyer: 'Ouvrir pour envoyer', pdf: 'Télécharger le PDF', ouvrir: 'Ouvrir', facturer: 'Créer la facture' }
  async function faire() {
    if (!userId || !d) return
    const now = new Date().toISOString()
    const patch: Partial<GDoc> | null = action === 'payer' ? { status: 'payee', paid_at: now.slice(0, 10) } : action === 'accepter' ? { status: 'accepte', decided_by: userId, decided_at: now } : action === 'refuser' ? { status: 'refuse', decided_by: userId, decided_at: now } : action === 'cloturer' ? { status: 'terminee', closed_at: now, closed_by: userId } : null
    if (patch) {
      const { data, error } = await getDb().from('gestion_documents').update(patch).eq('id', d.id).select().single()
      if (error || !data) { toast.error('Modification impossible'); return }
      log(`status:${patch.status}`, 'gestion_documents', d.id, { number: d.number, via: 'assistant' })
      await synchroniser(data as GDoc, { wsId: ws.id, userId, client: f, entreprise: ent, pdf: ctxPdf })
      setFait(true); toast.success('C’est fait'); return
    }
    if (action === 'pdf') { const { telechargerPdf } = await import('@/lib/gestion-pdf'); try { await telechargerPdf(d, ctxPdf) } catch (e) { toast.error((e as Error).message) } return }
    if (action === 'facturer') {
      const lines = d.lines ?? [], tt = totaux(lines, d.discount)
      const { data, error } = await getDb().from('gestion_documents').insert({ workspace_id: ws.id, kind: 'facture', number: prochainNumero('facture', docs.data.filter((x) => x.kind === 'facture').map((x) => x.number)), contact_id: d.contact_id, parent_id: d.id, title: d.title, status: 'brouillon', issued_at: now.slice(0, 10), due_at: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), lines, discount: d.discount, total_ht: tt.ht, total_tva: tt.tva, total_ttc: tt.ttc, travaux: d.travaux, created_by: userId }).select().single()
      if (error || !data) { toast.error('Création impossible'); return }
      log('create', 'gestion_documents', (data as GDoc).id, { number: (data as GDoc).number, kind: 'facture', depuis: d.number })
      router.push(`/app/${ws.slug}/gestion/factures?id=${(data as GDoc).id}`); return
    }
    router.push(`/app/${ws.slug}/gestion/${page(d.kind)}?id=${d.id}`)
  }
  return (
    <Cadre icone={d.kind === 'intervention' ? Wrench : d.kind === 'devis' ? FileSignature : Receipt} titre={`${d.kind === 'intervention' ? 'Intervention' : NOM_KIND[d.kind]} ${d.number}`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 text-[13px] text-text-2">{f?.company || f?.name || d.title || '—'} · {eur(d.total_ttc)} TTC</span>
        <Pastille kind={d.kind} status={d.status} />
        <Button size="sm" variant="primary" disabled={fait} onClick={faire}>{fait ? <><Check className="size-3.5" />Fait</> : libelle[action]}</Button>
      </div>
    </Cadre>
  )
}

export function WidgetLireFacture({ cle }: { cle?: string }) {
  const { ws } = useWorkspace()
  const router = useRouter()
  return (
    <div className="space-y-2">
      <AssistantFactures cle={cle} onOuvrir={() => router.push(`/app/${ws.slug}/gestion/scan`)} />
      <Link href={`/app/${ws.slug}/gestion/scan`} className="inline-flex items-center gap-1.5 text-[12px] text-text-3 hover:text-text"><ScanLine className="size-3.5" />Toutes les factures lues</Link>
    </div>
  )
}
