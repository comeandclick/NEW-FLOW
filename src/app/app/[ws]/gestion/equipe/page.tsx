'use client'
// Gestion de l'équipe (15/10/2026) : pour chaque membre, ses interventions (à venir, en cours, clôturées), ses devis
// et ce qu'ils ont rapporté, et le fil de ce qu'il a fait dans la gestion. Rôles et invitations : Paramètres > Membres.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { UserPlus, Users } from 'lucide-react'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Button } from '@/components/ui/button'
import { Avatar, Badge, PageHeader } from '@/components/ui/misc'
import { AvisMigration, Chips, PERIODES, Pastille, dateDoc, useDocs, useFiches, useFiltrePeriode, type Periode } from '@/components/gestion/commun'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useLive } from '@/lib/hooks/use-live'
import { NOM_KIND, eur } from '@/lib/gestion'
import type { Activity } from '@/lib/types'

export default function EquipeGestionPage() {
  const { ws, members, nameOf, isAdmin } = useWorkspace()
  const docs = useDocs()
  const fiches = useFiches()
  const [periode, setPeriode] = useState<Periode>('mois')
  const p = useFiltrePeriode(docs.data, periode)
  const [sel, setSel] = useState<string | null>(null)
  const fil = useLive<Activity>('activity_logs', { eq: { workspace_id: ws.id, entity_type: 'gestion_documents', ...(sel ? { user_id: sel } : {}) }, order: ['created_at', false], limit: 40 })
  const lignes = useMemo(() => members.map((m) => {
    const inter = p.filter((d) => d.kind === 'intervention' && d.assigned_to?.includes(m.user_id))
    const devis = p.filter((d) => d.kind === 'devis' && d.created_by === m.user_id)
    return { m, aVenir: inter.filter((d) => ['a_planifier', 'planifiee'].includes(d.status)).length, enCours: inter.filter((d) => d.status === 'en_cours').length, clot: inter.filter((d) => d.closed_at).length, total: inter.length,
      devis: devis.length, acceptes: devis.filter((d) => d.status === 'accepte').reduce((a, d) => a + Number(d.total_ht), 0), prochaines: inter.filter((d) => !d.closed_at).sort((a, b) => dateDoc(a).getTime() - dateDoc(b).getTime()).slice(0, 3) }
  }), [members, p])
  const nomDoc = (id: string | null) => docs.data.find((d) => d.id === id)
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <HubTabs hub="gestion" />
      <PageHeader title="Équipe" icon={<Users className="size-[18px]" />} actions={isAdmin && <Link href={`/app/${ws.slug}/settings?tab=members`}><Button><UserPlus className="size-4" />Inviter</Button></Link>} />
      {docs.manque ? <AvisMigration /> : <>
        <Chips className="mb-4" value={periode} onChange={setPeriode} items={PERIODES.filter((x) => x.v !== 'perso')} />
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{lignes.map(({ m, aVenir, enCours, clot, total, devis, acceptes, prochaines }) => (
          <li key={m.user_id}><button onClick={() => setSel(sel === m.user_id ? null : m.user_id)} className={`flex h-full w-full flex-col gap-3 rounded-xl border bg-surface p-4 text-left transition-colors ${sel === m.user_id ? 'border-accent' : 'border-border hover:border-border-strong'}`}>
            <div className="flex items-center gap-3"><Avatar name={m.profile?.full_name} src={m.profile?.avatar_url} size={40} /><div className="min-w-0 flex-1"><div className="truncate text-[14px] font-semibold">{m.profile?.full_name ?? m.profile?.email}</div><div className="truncate text-[12px] text-text-3">{m.profile?.email}</div></div><Badge>{m.role}</Badge></div>
            <div className="grid grid-cols-4 gap-1.5 text-center">{[['À venir', aVenir], ['En cours', enCours], ['Clôturées', clot], ['Total', total]].map(([l, v]) => <div key={l} className="rounded-lg bg-surface-2/70 py-1.5"><div className="text-[15px] font-semibold tabular-nums">{v}</div><div className="text-[10.5px] text-text-3">{l}</div></div>)}</div>
            <div className="text-[12.5px] text-text-2">{devis} devis créés · {eur(acceptes)} HT acceptés</div>
            {prochaines.length > 0 && <ul className="space-y-1 border-t border-border pt-2">{prochaines.map((d) => { const f = fiches.data.find((x) => x.id === d.contact_id); return <li key={d.id} className="flex items-center gap-2 text-[12px]"><span className="w-20 shrink-0 text-text-3">{d.start_at ? format(new Date(d.start_at), 'd MMM HH:mm', { locale: fr }) : '—'}</span><span className="min-w-0 flex-1 truncate">{f?.company || f?.name || d.title}</span><Pastille kind="intervention" status={d.status} /></li> })}</ul>}
          </button></li>))}</ul>
        <section className="mt-5 rounded-xl border border-border bg-surface">
          <h2 className="px-4 pb-1 pt-3.5 text-[13px] font-semibold">{sel ? `Ce qu’a fait ${nameOf(sel)}` : 'Dernières actions de l’équipe'}</h2>
          {fil.data.length === 0 ? <p className="px-4 pb-4 text-[12.5px] text-text-3">Rien pour l’instant.</p>
            : <ul className="divide-y divide-border/60">{fil.data.map((a) => { const d = nomDoc(a.entity_id); return (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]"><span className="w-32 shrink-0 text-text-3">{format(new Date(a.created_at), 'd MMM HH:mm', { locale: fr })}</span><span className="min-w-0 flex-1 truncate"><b className="font-medium">{nameOf(a.user_id)}</b> · {a.action === 'create' ? 'a créé' : a.action === 'sent' ? 'a envoyé' : a.action === 'delete' ? 'a supprimé' : a.action.startsWith('status:') ? `a passé à « ${a.action.slice(7)} »` : 'a modifié'} {d ? `${NOM_KIND[d.kind].toLowerCase()} ${d.number}` : String(a.meta?.number ?? '')}</span></li>) })}</ul>}
        </section>
      </>}
    </div>
  )
}
