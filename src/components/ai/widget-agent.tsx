'use client'
// Envoyer une consigne à un agent IA depuis l'assistant (14/10/2026) : « notifie les agents de vérifier la note X et de
// faire la demande n° 3 ». La consigne (et le texte complet de la note) part vers l'Atelier du Mac, qui l'écrit dans le
// terminal de l'agent choisi, du premier libre, ou la met en attente jusqu'à ce qu'un agent se libère.
// États : brouillon → envoi → envoyée (agent au travail / en attente du Mac) → erreur.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowUpRight, Bot, Check, FileText, Laptop, Send, WifiOff } from 'lucide-react'
import { getDb } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { createAndSubmit } from '@/lib/studio/launch'
import { studioApi, usePoll, useStudioMode } from '@/lib/studio/api'
import { texteDeNote } from '@/lib/client-notes'
import { cn } from '@/lib/utils'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function WidgetEnvoiAgent({ titre, consigne, agent, note }: { titre: string; consigne: string; agent?: string; note?: string }) {
  const { ws } = useWorkspace()
  const { mode } = useStudioMode()
  const devs = usePoll(studioApi.devices, 15000, mode === 'live')
  const atelier = (devs.data?.devices ?? []).find((d) => d.online) ?? null
  const agents = useMemo(() => atelier?.setup?.atelier?.agents ?? [], [atelier])
  const [texte, setTexte] = useState(consigne)
  const [choix, setChoix] = useState<string>('auto')
  const [laNote, setLaNote] = useState<{ id: string; title: string; texte: string } | null>(null)
  const [etat, setEtat] = useState<'brouillon' | 'envoi' | 'envoyee' | 'erreur'>('brouillon')
  // l'agent cité (« seikqit », « Agent 2 »…) est présélectionné
  useEffect(() => { if (!agent || !agents.length) return; const n = norm(agent); const a = agents.find((x) => norm(x.compte) === n || norm(x.nom) === n || norm(x.nom).includes(n)); if (a) setChoix(a.compte) }, [agent, agents])
  // la note jointe : retrouvée par son titre, texte complet envoyé à l'agent
  useEffect(() => {
    if (!note) return
    let vivant = true
    getDb().from('notes').select('id,title,content').eq('workspace_id', ws.id).is('deleted_at', null).order('updated_at', { ascending: false }).limit(200).then(({ data }) => {
      if (!vivant || !data) return
      const n = norm(note), x = data.find((y) => norm(y.title || '') === n) ?? data.find((y) => norm(y.title || '').includes(n) || n.includes(norm(y.title || '')))
      if (x) setLaNote({ id: x.id, title: x.title || 'Sans titre', texte: texteDeNote(x.content) })
    })
    return () => { vivant = false }
  }, [note, ws.id])

  const ag = agents.find((a) => a.compte === choix)
  async function envoyer() {
    if (!texte.trim()) return
    setEtat('envoi')
    try {
      const prompt = [`Consigne d'Aymen (envoyée depuis l'assistant de Flow, espace ${ws.name}) :`, texte.trim(),
        laNote && `\nNote jointe : « ${laNote.title} » (Flow → Notes, lien ${window.location.origin}/app/${ws.slug}/notes/${laNote.id})\n---\n${laNote.texte}\n---`].filter(Boolean).join('\n')
      if (mode !== 'live') { await new Promise((r) => setTimeout(r, 400)); setEtat('envoyee'); return }
      // type « site » côté base (seuls motion et site existent) ; spec.consigne dit à l'Atelier que c'est une consigne libre
      await createAndSubmit({ kind: 'site', title: titre, spec: { consigne: true, wsSlug: ws.slug, noteId: laNote?.id ?? null, ...(choix !== 'auto' ? { agent: choix } : {}) }, prompt: prompt.padEnd(60, ' '), refs: [], workspaceId: ws.id })
      setEtat('envoyee')
    } catch { setEtat('erreur') }
  }

  const pastille = etat === 'envoyee' ? ['Envoyée', 'bg-success/15 text-success'] : etat === 'erreur' ? ['Erreur', 'bg-danger/15 text-danger'] : etat === 'envoi' ? ['Envoi…', 'bg-info/15 text-info'] : ['À envoyer', 'bg-text/10 text-text-2']
  return (
    <motion.div layout className={cn('overflow-hidden rounded-xl border bg-surface shadow-sm', etat === 'envoyee' ? 'border-success/40' : 'border-border')}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Bot className="size-4 text-text-3" strokeWidth={1.75} /><span className="truncate text-[13px] font-semibold">{titre}</span>
        <span className={cn('ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', pastille[1])}>{pastille[0]}</span>
      </div>
      {etat === 'envoyee' ? (
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="grid size-8 place-items-center rounded-full bg-success text-white"><Check className="size-4" strokeWidth={3} /></span>
          <p className="min-w-0 flex-1 text-[13px] text-text-2">{mode !== 'live' ? 'Mode démo : envoi simulé.' : !atelier ? 'Le Mac n\'est pas connecté : la consigne partira dès que l\'Atelier sera ouvert.'
            : ag && ag.etat !== 'libre' ? `${ag.compte} n'est pas libre : la consigne partira dès qu'il aura fini.` : `Envoyée dans le terminal ${ag ? `de ${ag.compte}` : 'du premier agent libre'} (MXterm Pro).`}</p>
          <Link href={`/app/${ws.slug}/motion`} className="inline-flex shrink-0 items-center gap-1 text-xs text-text-3 hover:text-text">Suivre<ArrowUpRight className="size-3.5" /></Link>
        </div>
      ) : (
        <div className="space-y-3 px-4 py-3">
          <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={Math.min(8, texte.split('\n').length + 2)} aria-label="Consigne pour l'agent"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13.5px] leading-relaxed outline-none focus:border-text/50" />
          {note && <p className="flex items-center gap-1.5 text-xs text-text-2"><FileText className="size-3.5 text-text-3" />{laNote ? <>Note jointe : <Link href={`/app/${ws.slug}/notes/${laNote.id}`} className="font-medium text-text hover:underline">{laNote.title}</Link> (texte complet envoyé)</> : <span className="text-warning">Note « {note} » introuvable : la consigne part sans elle.</span>}</p>}
          <div>
            <p className="mb-1.5 text-[11.5px] font-medium text-text-3">Agent</p>
            <div className="flex flex-wrap gap-1.5">
              {[{ compte: 'auto', nom: 'Le premier libre', etat: 'libre' }, ...agents].map((a) => (
                <button key={a.compte} type="button" onClick={() => setChoix(a.compte)} className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors', choix === a.compte ? 'border-transparent bg-text text-bg' : 'border-border text-text-2 hover:text-text')}>
                  {a.compte !== 'auto' && <span className={cn('size-1.5 rounded-full', a.etat === 'libre' ? 'bg-success' : a.etat === 'occupe' ? 'bg-warning' : a.etat === 'limite' ? 'bg-danger' : 'bg-text-3')} />}
                  {a.compte === 'auto' ? a.nom : `${a.compte}${a.etat !== 'libre' ? ` · ${a.etat === 'occupe' ? 'occupé' : a.etat === 'limite' ? 'limite' : 'fermé'}` : ''}`}
                </button>))}
            </div>
            {ag && ag.etat !== 'libre' && <p className="mt-1.5 text-xs text-text-3">Pas libre : la consigne attendra qu&apos;il ait fini.</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-3">{atelier ? <><Laptop className="size-3.5 text-success" />Atelier connecté</> : <><WifiOff className="size-3.5" />Mac non connecté : elle attendra</>}</span>
            {etat === 'erreur' && <span className="text-xs text-danger">Envoi impossible.</span>}
            <button type="button" disabled={!texte.trim() || etat === 'envoi'} onClick={() => void envoyer()} className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-text px-4 text-[12.5px] font-medium text-bg disabled:opacity-35"><Send className="size-3.5" />{etat === 'envoi' ? 'Envoi…' : 'Envoyer'}</button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
