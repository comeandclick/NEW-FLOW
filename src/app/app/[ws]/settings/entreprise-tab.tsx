'use client'
// Paramètres > Entreprise (15/10/2026) : infos imprimées sur les devis, factures et ordres de mission.
// Les champs marqués * sont obligatoires : sans eux, Flow refuse de créer le PDF.
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Plus, X } from 'lucide-react'
import { Avatar } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { uploadToBucket } from '@/lib/storage'
import { CHAMPS_OBLIGATOIRES, entrepriseDe, entrepriseManque, typesIntervention, type Entreprise } from '@/lib/gestion'
import { Section } from './section'

const CHAMPS: { k: keyof Entreprise; l: string; ph?: string; type?: string; large?: boolean }[] = [
  { k: 'nom', l: 'Nom de l’entreprise', ph: 'Martin Plomberie' }, { k: 'forme', l: 'Forme juridique', ph: 'SARL, SAS, EI…' },
  { k: 'adresse', l: 'Adresse', ph: '12 rue des Lilas', large: true }, { k: 'cp', l: 'Code postal', ph: '75011' }, { k: 'ville', l: 'Ville', ph: 'Paris' },
  { k: 'siret', l: 'SIRET', ph: '123 456 789 00012' }, { k: 'tva_intra', l: 'N° TVA intracommunautaire', ph: 'FR12 123456789' },
  { k: 'rcs', l: 'RCS / RM', ph: 'RCS Paris B 123 456 789' }, { k: 'capital', l: 'Capital social', ph: '10 000 €' },
  { k: 'tel', l: 'Téléphone', ph: '01 23 45 67 89', type: 'tel' }, { k: 'email', l: 'E-mail', ph: 'contact@entreprise.fr', type: 'email' },
  { k: 'site', l: 'Site web', ph: 'entreprise.fr' }, { k: 'iban', l: 'IBAN', ph: 'FR76 …' }, { k: 'bic', l: 'BIC' },
]
const OBLIG = new Set(CHAMPS_OBLIGATOIRES.map(([k]) => k))

async function fusionner(wsId: string, patch: Record<string, unknown>) {
  const { data: cur } = await getDb().from('workspaces').select('settings').eq('id', wsId).single()
  const settings = { ...((cur as { settings?: object } | null)?.settings ?? {}), ...patch }
  const { error } = await getDb().from('workspaces').update({ settings }).eq('id', wsId)
  if (error) throw error
}

export function EntrepriseTab() {
  const { ws, isAdmin } = useWorkspace()
  const { userId } = useSession()
  const [e, setE] = useState<Entreprise>(() => ({ validite_jours: 30, tva_defaut: 20, ...entrepriseDe(ws) }))
  const [types, setTypes] = useState<string[]>(() => typesIntervention(ws))
  const [nouveau, setNouveau] = useState('')
  const [logo, setLogo] = useState(ws.logo_url)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const manque = entrepriseManque(e)
  const set = (k: keyof Entreprise, v: string | number) => setE((x) => ({ ...x, [k]: v }))

  async function save() {
    setBusy(true)
    try {
      const gestion = { ...((ws.settings as { gestion?: object })?.gestion ?? {}), types_intervention: types }
      await fusionner(ws.id, { entreprise: e, gestion }); toast.success('Infos de l’entreprise enregistrées'); window.location.reload()
    } catch { toast.error('Enregistrement impossible'); setBusy(false) }
  }
  async function pickLogo(f: File) {
    if (!userId || f.size > 2 * 1024 * 1024 || !f.type.startsWith('image/')) { toast.error('Image de 2 Mo maximum'); return }
    try {
      const path = await uploadToBucket('avatars', userId, f, f.name)
      const url = getDb().storage.from('avatars').getPublicUrl(path).data.publicUrl
      await getDb().from('workspaces').update({ logo_url: url }).eq('id', ws.id); setLogo(url); toast.success('Logo enregistré')
    } catch { toast.error('Envoi du logo impossible') }
  }

  return (
    <>
      {manque.length > 0 && <div className="mb-5 rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-[13px]"><b>À compléter pour créer des devis et factures :</b> {manque.join(', ')}.</div>}
      <Section title="Logo" hint="Imprimé en haut de chaque devis, facture et ordre de mission.">
        <div className="flex items-center gap-4"><Avatar name={e.nom || ws.name} src={logo} size={64} />
          {isAdmin && <><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(ev) => ev.target.files?.[0] && pickLogo(ev.target.files[0])} /><Button onClick={() => input.current?.click()}><Camera className="size-4" />Changer le logo</Button></>}</div>
      </Section>
      <Section title="Identité de l’entreprise" hint="Les champs marqués * sont obligatoires sur les documents.">
        <div className="grid gap-3 sm:grid-cols-2">
          {CHAMPS.map((c) => (
            <Field key={c.k} label={`${c.l}${OBLIG.has(c.k) ? ' *' : ''}`} className={c.large ? 'sm:col-span-2' : undefined}>
              <Input type={c.type ?? 'text'} value={String(e[c.k] ?? '')} placeholder={c.ph} disabled={!isAdmin} onChange={(ev) => set(c.k, ev.target.value)} />
            </Field>))}
        </div>
      </Section>
      <Section title="Devis et factures">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Validité des devis (jours)"><Input type="number" min={1} value={e.validite_jours ?? 30} disabled={!isAdmin} onChange={(ev) => set('validite_jours', Number(ev.target.value))} /></Field>
          <Field label="TVA par défaut (%)"><Input type="number" min={0} step="0.1" value={e.tva_defaut ?? 20} disabled={!isAdmin} onChange={(ev) => set('tva_defaut', Number(ev.target.value))} /></Field>
        </div>
        <Field label="Conditions de paiement" hint="Imprimées en bas des devis et factures."><Textarea rows={2} value={e.conditions ?? ''} disabled={!isAdmin} placeholder="Paiement à 30 jours. Acompte de 30 % à la commande." onChange={(ev) => set('conditions', ev.target.value)} /></Field>
        <Field label="Mentions légales" hint="Pénalités de retard, indemnité forfaitaire de 40 €, assurance décennale…"><Textarea rows={3} value={e.mentions ?? ''} disabled={!isAdmin} onChange={(ev) => set('mentions', ev.target.value)} /></Field>
      </Section>
      <Section title="Types d’intervention" hint="Proposés à la création d’une intervention. Ajoute les tiens.">
        <div className="flex flex-wrap gap-2">{types.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-[13px]">{t}
            {isAdmin && <button onClick={() => setTypes((l) => l.filter((x) => x !== t))} aria-label={`Retirer ${t}`} className="text-text-3 hover:text-danger"><X className="size-3.5" /></button>}</span>))}</div>
        {isAdmin && <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); const v = nouveau.trim(); if (v && !types.includes(v)) setTypes((l) => [...l, v]); setNouveau('') }}>
          <Input value={nouveau} onChange={(ev) => setNouveau(ev.target.value)} placeholder="Ex. Ramonage" aria-label="Nouveau type d’intervention" /><Button type="submit"><Plus className="size-4" />Ajouter</Button></form>}
      </Section>
      {isAdmin && <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-border bg-bg/95 px-4 py-3 backdrop-blur safe-bottom"><Button variant="primary" loading={busy} onClick={save}>Enregistrer</Button></div>}
    </>
  )
}
