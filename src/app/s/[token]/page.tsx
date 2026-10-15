'use client'
// Le client lit son devis (ou ordre de mission) et le signe depuis son téléphone ou son ordinateur, sans compte (15/10/2026).
import { use, useEffect, useState } from 'react'
import { CheckCircle2, Download, FileSignature, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { SignaturePad } from '@/components/gestion/signature-pad'
import { NOM_KIND, eur, statutDe, totaux, type Entreprise, type Fiche, type GDoc } from '@/lib/gestion'
import { creerPdf, nomFichier } from '@/lib/gestion-pdf'

type Data = { doc: GDoc; entreprise: Entreprise; logo: string | null; client: Partial<Fiche> | null }
const jour = (d?: string | null) => (d ? new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

export default function SignaturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [erreur, setErreur] = useState(false)
  const [nom, setNom] = useState('')
  const [sig, setSig] = useState<string | null>(null)
  const [refus, setRefus] = useState(false)
  const [motif, setMotif] = useState('')
  const [busy, setBusy] = useState(false)
  const [fait, setFait] = useState<'signe' | 'refuse' | null>(null)
  const [accord, setAccord] = useState(false)

  const charger = () => fetch(`/api/gestion/public/${token}`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setErreur(true))
  useEffect(() => { void charger() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  async function envoyer(action: 'signer' | 'refuser') {
    setBusy(true)
    const r = await fetch(`/api/gestion/public/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, nom, signature: sig, motif }) }).catch(() => null)
    setBusy(false)
    if (r?.ok) { setFait(action === 'signer' ? 'signe' : 'refuse'); void charger() } else alert(r?.status === 409 ? 'Ce document a déjà été traité.' : 'L’envoi n’a pas abouti, réessayez.')
  }
  async function pdf() {
    if (!data) return
    const d = { ...data.doc, assigned_to: [], notes: null } as GDoc
    try { (await creerPdf(d, { entreprise: data.entreprise, logoUrl: data.logo, client: data.client as Fiche, nomMembre: () => '' })).save(nomFichier(d)) } catch { alert('PDF indisponible pour le moment') }
  }

  if (erreur) return <Centre><p className="text-[15px] font-medium">Ce lien n’est plus valable.</p><p className="mt-1 text-[13px] text-text-3">Demandez un nouveau lien à l’entreprise qui vous l’a envoyé.</p></Centre>
  if (!data) return <Centre><div className="skeleton h-6 w-40 rounded" /></Centre>
  const { doc: d, entreprise: e, client: c } = data
  const t = totaux(d.lines ?? [], d.discount)
  const signable = (d.kind === 'devis' && !['accepte', 'refuse'].includes(d.status)) || (d.kind === 'intervention' && !d.signature)
  const titre = d.kind === 'intervention' ? 'Ordre de mission' : NOM_KIND[d.kind]

  return (
    <div className="min-h-dvh bg-bg-subtle px-3 py-6 sm:px-6 sm:py-10">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <header className="flex flex-col gap-5 border-b border-border p-5 sm:flex-row sm:justify-between sm:p-8">
          <div className="text-[12.5px] leading-relaxed text-text-2">
            {data.logo && <img src={data.logo} alt="" className="mb-3 h-12 w-auto object-contain" />}
            <div className="text-[15px] font-semibold text-text">{e.nom}</div>
            <div>{e.adresse}</div><div>{[e.cp, e.ville].filter(Boolean).join(' ')}</div>{e.tel && <div>Tél. {e.tel}</div>}{e.email && <div>{e.email}</div>}{e.siret && <div>SIRET {e.siret}</div>}
          </div>
          <div className="sm:text-right"><h1 className="text-2xl font-semibold tracking-tight">{titre}</h1><div className="mt-1 text-[13px] text-text-2">N° {d.number}<br />du {jour(d.issued_at)}{d.kind === 'devis' && d.due_at && <><br />valable jusqu’au {jour(d.due_at)}</>}{d.kind === 'intervention' && d.start_at && <><br />prévue le {new Date(d.start_at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}</>}</div>
            <span className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={{ background: `color-mix(in srgb, ${statutDe(d.kind, d.status).c} 14%, transparent)`, color: statutDe(d.kind, d.status).c }}>{statutDe(d.kind, d.status).l}</span></div>
        </header>
        <div className="space-y-5 p-5 sm:p-8">
          {c && <div className="rounded-xl bg-surface-2/60 p-4 text-[13px]"><div className="text-[11px] font-semibold uppercase tracking-wide text-text-3">Client</div><div className="mt-1 font-medium">{c.company || c.name}</div>{c.company && <div className="text-text-2">{c.name}</div>}<div className="text-text-2">{d.address || c.address}</div><div className="text-text-2">{[c.zip, c.city].filter(Boolean).join(' ')}</div></div>}
          {d.title && <h2 className="text-[16px] font-semibold">{d.title}</h2>}
          {d.travaux && <p className="whitespace-pre-wrap text-[13.5px] text-text-2">{d.travaux}</p>}
          {d.lines?.length > 0 && <>
            <ul className="divide-y divide-border rounded-xl border border-border">{d.lines.map((l, i) => (
              <li key={i} className="flex gap-3 px-4 py-3 text-[13.5px]"><span className="min-w-0 flex-1"><span className="block">{l.label}</span><span className="block text-[12px] text-text-3">{l.qty} {l.unit} × {eur(l.price_ht)} HT · TVA {l.tva} %</span></span><span className="font-medium tabular-nums">{eur(l.qty * l.price_ht * (1 - (Number(d.discount) || 0) / 100))}</span></li>))}</ul>
            <div className="ml-auto max-w-xs space-y-1 text-[13.5px] tabular-nums">
              {Number(d.discount) > 0 && <div className="flex justify-between text-text-2"><span>Remise</span><span>{d.discount} %</span></div>}
              <div className="flex justify-between text-text-2"><span>Total HT</span><span>{eur(t.ht)}</span></div>
              {Object.entries(t.parTaux).filter(([k]) => Number(k)).map(([k, v]) => <div key={k} className="flex justify-between text-text-2"><span>TVA {k} %</span><span>{eur(v.tva)}</span></div>)}
              <div className="flex justify-between border-t border-border pt-1.5 text-[17px] font-semibold"><span>Total TTC</span><span>{eur(t.ttc)}</span></div>
            </div></>}
          {(e.conditions || e.mentions) && <p className="whitespace-pre-wrap text-[11.5px] text-text-3">{[e.conditions, e.mentions].filter(Boolean).join('\n')}</p>}
          <Button onClick={pdf}><Download className="size-4" />Télécharger le PDF</Button>
        </div>

        <section className="border-t border-border bg-surface-2/40 p-5 sm:p-8">
          {d.signature ? <div className="flex flex-wrap items-end gap-4"><img src={d.signature} alt="Signature" className="h-20 rounded-lg border border-border bg-white p-1" /><div className="text-[13px] text-text-2"><div className="flex items-center gap-1.5 font-medium text-success"><CheckCircle2 className="size-4" />Signé par {d.signer_name}</div>{d.signed_at && new Date(d.signed_at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}</div></div>
            : d.status === 'refuse' ? <div className="flex items-center gap-2 text-[14px] font-medium text-danger"><XCircle className="size-5" />Devis refusé{d.signer_name ? ` par ${d.signer_name}` : ''}</div>
            : signable && (
              <div className="space-y-4">
                <h2 className="flex items-center gap-2 text-[16px] font-semibold"><FileSignature className="size-5" />{d.kind === 'devis' ? 'Bon pour accord' : 'Signature du client'}</h2>
                <Field label="Votre nom et prénom"><Input value={nom} onChange={(ev) => setNom(ev.target.value)} placeholder="Jean Dupont" autoComplete="name" /></Field>
                {!refus && <>
                  <SignaturePad onChange={setSig} height={180} />
                  <label className="flex items-start gap-2.5 text-[13px] text-text-2"><input type="checkbox" checked={accord} onChange={(ev) => setAccord(ev.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />{d.kind === 'devis' ? `J’accepte ce devis de ${eur(t.ttc)} TTC et les conditions indiquées.` : 'Je confirme les informations de cet ordre de mission.'}</label>
                  <div className="flex flex-wrap gap-2"><Button variant="primary" size="lg" loading={busy} disabled={!nom.trim() || !sig || !accord} onClick={() => envoyer('signer')}><CheckCircle2 className="size-4" />Signer{d.kind === 'devis' ? ' et accepter' : ''}</Button>
                    {d.kind === 'devis' && <Button size="lg" variant="ghost" onClick={() => setRefus(true)}>Refuser le devis</Button>}</div>
                </>}
                {refus && <>
                  <Field label="Motif (facultatif)"><Textarea rows={3} value={motif} onChange={(ev) => setMotif(ev.target.value)} /></Field>
                  <div className="flex gap-2"><Button variant="danger" loading={busy} disabled={!nom.trim()} onClick={() => envoyer('refuser')}>Confirmer le refus</Button><Button variant="ghost" onClick={() => setRefus(false)}>Retour</Button></div>
                </>}
              </div>)}
          {fait && <p className="mt-4 text-[13.5px] text-text-2">{fait === 'signe' ? 'Merci, votre signature a bien été transmise.' : 'Votre réponse a bien été transmise.'} Vous pouvez fermer cette page.</p>}
        </section>
      </article>
      <p className="mt-4 text-center text-[11.5px] text-text-3">Document transmis via Flow</p>
    </div>
  )
}

function Centre({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center bg-bg-subtle px-6 text-center">{children}</div>
}
