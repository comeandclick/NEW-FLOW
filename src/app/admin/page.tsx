'use client'
// Admin de Flow (14/10/2026) : visites anonymes, inscriptions, utilisation des fonctionnalités, abonnements, support, Atelier.
// Accès séparé des comptes Flow (aymenfadil264@gmail.com), mot de passe à changer à la première connexion.
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, BarChart3, CreditCard, Eye, Globe, KeyRound, Laptop, LifeBuoy, LogOut, RefreshCw, Shield, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

type Ligne = [string, number]
type Demande = { id: string; type: string; sujet: string; message: string; email: string | null; page: string | null; statut: string; note_admin: string | null; cree_le: string }
type Stats = {
  genere: string
  comptes: { total: number; actifs7: number; actifs30: number; nouveaux30: number; inscriptionsParJour: { jour: string; n: number }[]; fournisseurs: Ligne[] }
  espaces: number; membres: number; fonctions: { nom: string; total: number; mois: number | null }[]; stockageGo: number; macs: number
  visites: null | { vues: number; visiteurs: number; parJour: { jour: string; vues: number; visiteurs: number }[]; pagesSite: Ligne[]; pagesApp: Ligne[]; provenances: Ligne[]; appareils: Ligne[]; pays: Ligne[] }
  support: Demande[] | null
}
type Section = 'apercu' | 'visites' | 'inscriptions' | 'utilisation' | 'abonnements' | 'support' | 'atelier' | 'compte'
const SECTIONS: { id: Section; nom: string; I: typeof Eye; groupe?: string }[] = [
  { id: 'apercu', nom: 'Vue d\'ensemble', I: BarChart3 }, { id: 'visites', nom: 'Visites', I: Eye, groupe: 'Audience' }, { id: 'inscriptions', nom: 'Inscriptions', I: UserPlus, groupe: 'Audience' },
  { id: 'utilisation', nom: 'Utilisation', I: Activity, groupe: 'Produit' }, { id: 'abonnements', nom: 'Abonnements', I: CreditCard, groupe: 'Produit' }, { id: 'atelier', nom: 'Atelier', I: Laptop, groupe: 'Produit' },
  { id: 'support', nom: 'Aide & support', I: LifeBuoy, groupe: 'Clients' }, { id: 'compte', nom: 'Mon compte', I: KeyRound, groupe: 'Admin' },
]
const fmt = (n: number) => n.toLocaleString('fr-FR')
const champ = 'w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-neutral-400'

function Ecran({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" className="relative grid min-h-dvh place-items-center bg-[#121212] px-4 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(255_255_255/0.07),transparent_70%)]" />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-sm rounded-3xl bg-gradient-to-r from-white/[0.07] to-[#121212] p-8 shadow-2xl backdrop-blur-sm">{children}</motion.div>
    </div>
  )
}

function Connexion({ ok }: { ok: (doitChanger: boolean) => void }) {
  const [email, setEmail] = useState(''), [mdp, setMdp] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const envoyer = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    const r = await fetch('/api/admin/connexion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, mdp }) })
    const j = await r.json().catch(() => ({})); setBusy(false)
    if (r.ok) ok(!!j.doitChanger); else setErr(j.error === 'bloque' || r.status === 429 ? 'Trop d\'essais : réessaie dans 15 minutes.' : 'Identifiant ou mot de passe incorrect.')
  }
  return (
    <Ecran>
      <div className="mx-auto mb-5 grid size-12 place-items-center rounded-full bg-white/20"><Shield className="size-5" /></div>
      <h1 className="text-center text-2xl font-semibold">Admin Flow</h1>
      <p className="mb-6 mt-1 text-center text-sm text-neutral-400">Accès réservé</p>
      <form onSubmit={envoyer} className="space-y-3">
        <input className={champ} type="email" autoComplete="username" placeholder="Identifiant (e-mail)" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={champ} type="password" autoComplete="current-password" placeholder="Mot de passe" value={mdp} onChange={(e) => setMdp(e.target.value)} required />
        {err && <p className="text-center text-xs text-red-400">{err}</p>}
        <button disabled={busy} className="mt-2 w-full rounded-full bg-white py-3 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50">{busy ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </Ecran>
  )
}

function Changer({ ok, premiere }: { ok: () => void; premiere: boolean }) {
  const [a, setA] = useState(''), [b, setB] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const envoyer = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    if (a !== b) return setErr('Les deux mots de passe ne sont pas identiques.')
    setBusy(true)
    const r = await fetch('/api/admin/mot-de-passe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nouveau: a }) }); setBusy(false)
    if (r.ok) ok(); else setErr('Au moins 10 caractères, avec des lettres et des chiffres.')
  }
  const formulaire = (
    <form onSubmit={envoyer} className="space-y-3">
      <input className={champ} type="password" autoComplete="new-password" placeholder="Nouveau mot de passe" value={a} onChange={(e) => setA(e.target.value)} required />
      <input className={champ} type="password" autoComplete="new-password" placeholder="Confirme le mot de passe" value={b} onChange={(e) => setB(e.target.value)} required />
      <p className="text-xs text-neutral-400">10 caractères minimum, avec des lettres et des chiffres.</p>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button disabled={busy} className="w-full rounded-full bg-white py-3 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
    </form>
  )
  if (!premiere) return <div className="max-w-sm">{formulaire}</div>
  return <Ecran><h1 className="text-xl font-semibold">Première connexion</h1><p className="mb-5 mt-1 text-sm text-neutral-400">Choisis ton propre mot de passe pour remplacer le mot de passe provisoire.</p>{formulaire}</Ecran>
}

/* ── petits composants de tableau de bord (DA 21st.dev / Skymetrics) ── */
const Carte = ({ titre, valeur, sous, className }: { titre: string; valeur: ReactNode; sous?: string; className?: string }) => (
  <div className={cn('rounded-xl border border-border bg-surface p-4 shadow-sm', className)}><div className="text-xs text-text-3">{titre}</div><div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{valeur}</div>{sous && <div className="mt-1 text-xs text-text-3">{sous}</div>}</div>
)
function Barres({ donnees, titre }: { donnees: { jour: string; v: number }[]; titre: string }) {
  const max = Math.max(1, ...donnees.map((d) => d.v))
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between text-xs text-text-3"><span>{titre}</span><span>30 derniers jours</span></div>
      <div className="flex h-36 items-end gap-[3px]">
        {donnees.map((d, i) => (
          <motion.div key={d.jour} title={`${d.jour} : ${d.v}`} initial={{ height: 0 }} animate={{ height: `${Math.max(2, (d.v / max) * 100)}%` }} transition={{ delay: i * 0.012, type: 'spring', stiffness: 200, damping: 24 }}
            className={cn('flex-1 rounded-t-[3px]', i === donnees.length - 1 ? 'bg-success' : 'bg-text/15 hover:bg-text/30')} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-text-3"><span>{donnees[0]?.jour.slice(5)}</span><span>Aujourd&apos;hui</span></div>
    </div>
  )
}
function Liste({ titre, lignes, vide = 'Pas encore de données.' }: { titre: string; lignes: Ligne[]; vide?: string }) {
  const max = Math.max(1, ...lignes.map((l) => l[1]))
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 text-xs text-text-3">{titre}</div>
      {!lignes.length ? <p className="py-4 text-center text-xs text-text-3">{vide}</p> : (
        <ul className="space-y-1.5">{lignes.map(([k, v]) => (
          <li key={k} className="relative flex items-center justify-between overflow-hidden rounded-md px-2.5 py-1.5 text-[13px]">
            <span className="absolute inset-y-0 left-0 rounded-md bg-text/[0.06]" style={{ width: `${(v / max) * 100}%` }} />
            <span className="relative truncate">{k}</span><span className="relative tabular-nums text-text-2">{fmt(v)}</span>
          </li>))}</ul>
      )}
    </div>
  )
}
const AVertir = ({ children }: { children: ReactNode }) => <div className="rounded-xl border border-dashed border-border-strong bg-surface-2/50 p-4 text-[13px] text-text-2">{children}</div>
const TABLES_A_CREER = <AVertir>Les tables « site_visites » et « support_demandes » ne sont pas encore créées dans la base. Colle le fichier <code className="rounded bg-text/10 px-1">supabase/admin.sql</code> dans Supabase → SQL Editor → Run.</AVertir>

function Tableau({ s, recharger, section }: { s: Stats; recharger: () => void; section: Section }) {
  const [filtre, setFiltre] = useState<'ouverte' | 'en_cours' | 'resolue' | 'toutes'>('ouverte')
  const majDemande = async (id: string, statut: string) => { await fetch('/api/admin/support', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, statut }) }); recharger() }
  const v = s.visites, interets = (s.support ?? []).filter((d) => d.type === 'abonnement')
  if (section === 'apercu') return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Carte titre="Visiteurs (30 j)" valeur={v ? fmt(v.visiteurs) : '—'} sous={v ? `${fmt(v.vues)} pages vues` : 'table à créer'} />
        <Carte titre="Comptes" valeur={fmt(s.comptes.total)} sous={`+${s.comptes.nouveaux30} en 30 jours`} />
        <Carte titre="Actifs (7 j)" valeur={fmt(s.comptes.actifs7)} sous={`${fmt(s.comptes.actifs30)} sur 30 jours`} />
        <Carte titre="Espaces" valeur={fmt(s.espaces)} sous={`${fmt(s.membres)} membres`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {v ? <Barres titre="Visiteurs par jour" donnees={v.parJour.map((d) => ({ jour: d.jour, v: d.visiteurs }))} /> : TABLES_A_CREER}
        <Barres titre="Inscriptions par jour" donnees={s.comptes.inscriptionsParJour.map((d) => ({ jour: d.jour, v: d.n }))} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Liste titre="Fonctionnalités les plus utilisées (30 j)" lignes={s.fonctions.filter((f) => f.mois).slice(0, 8).map((f) => [f.nom, f.mois ?? 0])} />
        <Liste titre="Pages les plus vues (application)" lignes={v?.pagesApp ?? []} vide="Table des visites à créer." />
        <Liste titre="Demandes de support ouvertes" lignes={(s.support ?? []).filter((d) => d.statut !== 'resolue').slice(0, 8).map((d) => [d.sujet, 1])} vide="Aucune demande ouverte." />
      </div>
    </div>
  )
  if (section === 'visites') return !v ? TABLES_A_CREER : (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Carte titre="Visiteurs uniques" valeur={fmt(v.visiteurs)} /><Carte titre="Pages vues" valeur={fmt(v.vues)} /><Carte titre="Pages par visiteur" valeur={v.visiteurs ? (v.vues / v.visiteurs).toFixed(1) : '—'} /><Carte titre="Aujourd'hui" valeur={fmt(v.parJour.at(-1)?.visiteurs ?? 0)} /></div>
      <Barres titre="Pages vues par jour" donnees={v.parJour.map((d) => ({ jour: d.jour, v: d.vues }))} />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3"><Liste titre="Pages du site" lignes={v.pagesSite} /><Liste titre="Pages de l'application" lignes={v.pagesApp} /><Liste titre="Provenance" lignes={v.provenances} /><Liste titre="Appareils" lignes={v.appareils} /><Liste titre="Pays" lignes={v.pays} /></div>
      <p className="text-xs text-text-3">Mesure anonyme, sans cookie ni adresse IP conservée (conforme RGPD, pas de bandeau nécessaire).</p>
    </div>
  )
  if (section === 'inscriptions') return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Carte titre="Comptes" valeur={fmt(s.comptes.total)} /><Carte titre="Nouveaux (30 j)" valeur={fmt(s.comptes.nouveaux30)} /><Carte titre="Actifs (7 j)" valeur={fmt(s.comptes.actifs7)} /><Carte titre="Actifs (30 j)" valeur={fmt(s.comptes.actifs30)} /></div>
      <Barres titre="Inscriptions par jour" donnees={s.comptes.inscriptionsParJour.map((d) => ({ jour: d.jour, v: d.n }))} />
      <div className="grid gap-4 lg:grid-cols-2"><Liste titre="Mode d'inscription" lignes={s.comptes.fournisseurs} /><Carte titre="Taux d'activation (actifs 30 j / comptes)" valeur={s.comptes.total ? `${Math.round((s.comptes.actifs30 / s.comptes.total) * 100)} %` : '—'} /></div>
    </div>
  )
  if (section === 'utilisation') return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Carte titre="Espaces" valeur={fmt(s.espaces)} /><Carte titre="Membres" valeur={fmt(s.membres)} /><Carte titre="Stockage" valeur={`${s.stockageGo.toFixed(2)} Go`} /><Carte titre="Fonctionnalités utilisées (30 j)" valeur={s.fonctions.filter((f) => f.mois).length} /></div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[480px] text-left text-[13px]"><thead className="bg-surface-2 text-xs text-text-3"><tr><th className="px-4 py-2.5 font-medium">Fonctionnalité</th><th className="px-4 py-2.5 text-right font-medium">Créés (30 j)</th><th className="px-4 py-2.5 text-right font-medium">Total</th></tr></thead>
          <tbody className="divide-y divide-border">{s.fonctions.map((f) => <tr key={f.nom}><td className="px-4 py-2.5">{f.nom}</td><td className="px-4 py-2.5 text-right tabular-nums">{f.mois === null ? '—' : fmt(f.mois)}</td><td className="px-4 py-2.5 text-right tabular-nums text-text-2">{fmt(f.total)}</td></tr>)}</tbody></table>
      </div>
    </div>
  )
  if (section === 'abonnements') return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Carte titre="Abonnés payants" valeur="0" sous="Paiement pas encore ouvert" /><Carte titre="Revenu mensuel" valeur="0 €" /><Carte titre="Intéressés (« Me prévenir »)" valeur={fmt(interets.length)} /><Carte titre="Comptes gratuits" valeur={fmt(s.comptes.total)} /></div>
      <Liste titre="Offres demandées" lignes={Object.entries(interets.reduce<Record<string, number>>((m, d) => { m[d.sujet] = (m[d.sujet] ?? 0) + 1; return m }, {}))} vide="Personne n'a encore demandé à être prévenu." />
      <AVertir>Quand tu ouvriras les abonnements, le paiement (Stripe ou autre) remplira ces chiffres automatiquement.</AVertir>
    </div>
  )
  if (section === 'atelier') return <div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><Carte titre="Mac reliés" valeur={fmt(s.macs)} />{s.fonctions.filter((f) => /Atelier|Motion/.test(f.nom)).map((f) => <Carte key={f.nom} titre={f.nom} valeur={fmt(f.total)} sous={`${f.mois ?? 0} ces 30 jours`} />)}</div>
  if (section === 'support') {
    if (!s.support) return TABLES_A_CREER
    const liste = s.support.filter((d) => filtre === 'toutes' || d.statut === filtre)
    return (
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">{([['ouverte', 'Ouvertes'], ['en_cours', 'En cours'], ['resolue', 'Résolues'], ['toutes', 'Toutes']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFiltre(k)} className={cn('h-8 rounded-md px-3 text-[13px] font-medium', filtre === k ? 'bg-surface shadow-sm' : 'text-text-3')}>{l} <span className="text-text-3">{s.support!.filter((d) => k === 'toutes' || d.statut === k).length}</span></button>))}</div>
        {!liste.length ? <p className="py-10 text-center text-sm text-text-3">Aucune demande ici.</p> : liste.map((d) => (
          <div key={d.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-text/10 px-1.5 py-0.5 text-[11px] font-medium">{d.type}</span><b className="text-sm">{d.sujet}</b><span className="ml-auto text-xs text-text-3">{new Date(d.cree_le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] text-text-2">{d.message}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-3">{d.email && <a href={`mailto:${d.email}?subject=${encodeURIComponent('Re : ' + d.sujet)}`} className="underline">{d.email}</a>}{d.page && <span>· {d.page}</span>}
              <span className="ml-auto flex gap-1">{(['ouverte', 'en_cours', 'resolue'] as const).map((st) => <button key={st} onClick={() => void majDemande(d.id, st)} className={cn('rounded-md border px-2 py-1', d.statut === st ? 'border-transparent bg-text text-bg' : 'border-border hover:bg-surface-2')}>{{ ouverte: 'Ouverte', en_cours: 'En cours', resolue: 'Résolue' }[st]}</button>)}</span></div>
          </div>))}
      </div>
    )
  }
  return <div className="space-y-3"><h3 className="text-sm font-semibold">Changer le mot de passe</h3><div className="rounded-xl border border-border bg-surface p-5 shadow-sm [&_input]:bg-surface-2 [&_input]:text-text [&_button]:bg-text [&_button]:text-bg [&_p]:text-text-3"><Changer premiere={false} ok={() => alert('Mot de passe changé.')} /></div></div>
}

export default function Admin() {
  const [phase, setPhase] = useState<'chargement' | 'connexion' | 'changer' | 'tableau'>('chargement')
  const [s, setS] = useState<Stats | null>(null)
  const [section, setSection] = useState<Section>('apercu')
  const charger = useCallback(async () => {
    const r = await fetch('/api/admin/stats', { cache: 'no-store' })
    if (r.status === 401) return setPhase('connexion')
    if (r.status === 403) return setPhase('changer')
    if (r.ok) { setS(await r.json()); setPhase('tableau') }
  }, [])
  useEffect(() => { void charger() }, [charger])
  if (phase === 'chargement') return <div className="grid min-h-dvh place-items-center bg-bg"><span className="size-6 animate-spin rounded-full border-2 border-text/20 border-t-text" /></div>
  if (phase === 'connexion') return <Connexion ok={(changer) => (changer ? setPhase('changer') : void charger())} />
  if (phase === 'changer') return <Changer premiere ok={() => void charger()} />
  const groupes = [...new Set(SECTIONS.map((x) => x.groupe ?? ''))]
  const titre = SECTIONS.find((x) => x.id === section)!.nom
  return (
    <div className="flex min-h-dvh bg-bg text-text">
      <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-border bg-surface p-2.5 md:flex dark:bg-bg-subtle">
        <div className="flex items-center gap-2.5 p-1.5"><span className="grid size-8 place-items-center rounded-md bg-text text-[13px] font-semibold text-bg">F</span><span className="leading-tight"><span className="block text-[13px] font-semibold">Flow</span><span className="block text-[11px] text-text-3">Administration</span></span></div>
        <nav className="mt-3 flex-1 space-y-5 overflow-y-auto">
          {groupes.map((g) => (
            <div key={g}>{g && <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3/70">{g}</div>}
              {SECTIONS.filter((x) => (x.groupe ?? '') === g).map((x) => (
                <button key={x.id} onClick={() => setSection(x.id)} className={cn('relative flex h-[34px] w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors', section === x.id ? 'font-medium text-text' : 'text-text-2 hover:bg-text/5')}>
                  {section === x.id && <motion.span layoutId="admin-actif" className="absolute inset-0 rounded-md bg-text/[0.06] dark:bg-text/10" />}
                  <x.I className="relative size-4 text-text-3" strokeWidth={1.75} /><span className="relative">{x.nom}</span>
                  {x.id === 'support' && !!s?.support?.filter((d) => d.statut === 'ouverte').length && <span className="relative ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-text/10 px-1.5 text-[10px] font-medium">{s.support.filter((d) => d.statut === 'ouverte').length}</span>}
                </button>))}
            </div>))}
        </nav>
        <button onClick={async () => { await fetch('/api/admin/deconnexion', { method: 'POST' }); setPhase('connexion') }} className="flex h-[34px] items-center gap-2.5 rounded-md px-2.5 text-[13px] text-text-2 hover:bg-text/5"><LogOut className="size-4 text-text-3" />Se déconnecter</button>
      </aside>
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur md:px-6">
          <select className="rounded-md border border-border bg-surface px-2 py-1 text-sm md:hidden" value={section} onChange={(e) => setSection(e.target.value as Section)}>{SECTIONS.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</select>
          <span className="hidden text-[13px] text-text-3 md:inline">Admin</span><span className="hidden text-text-3/60 md:inline">/</span><span className="hidden text-[13px] font-medium md:inline">{titre}</span>
          <span className="ml-auto hidden text-xs text-text-3 sm:inline">Mis à jour {s ? new Date(s.genere).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          <button onClick={() => void charger()} aria-label="Actualiser" className="grid size-8 place-items-center rounded-md text-text-3 hover:bg-text/5 hover:text-text"><RefreshCw className="size-4" /></button>
          <a href="/" className="grid size-8 place-items-center rounded-md text-text-3 hover:bg-text/5 hover:text-text" aria-label="Voir le site"><Globe className="size-4" /></a>
        </header>
        <div className="p-4 md:p-6">
          <h1 className="mb-1 text-[26px] font-semibold tracking-tight">{titre}</h1>
          <p className="mb-6 text-[13px] text-text-3">Toutes les données de Flow, dans les limites du RGPD : rien de personnel n&apos;est suivi sur les visiteurs.</p>
          <AnimatePresence mode="wait"><motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>{s && <Tableau s={s} section={section} recharger={() => void charger()} />}</motion.div></AnimatePresence>
        </div>
      </main>
    </div>
  )
}
