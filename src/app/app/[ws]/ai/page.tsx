'use client'
// Assistant (14/10/2026) : vraie IA (Claude, si la clé ANTHROPIC_API_KEY est configurée) qui répond par une phrase courte
// + des widgets (tâches, clients en attente, vidéo, agenda, productions). Sans clé ou en démo, la compréhension locale prend le relais.
// La bulle « réflexion » se transforme (morphose) en réponse puis en widget.
import { useEffect, useRef, useState } from 'react'
import { ArrowUp, CalendarDays, CheckSquare, Film, Handshake, RotateCcw, Sparkles } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { localAssistant, runAction, type AiAction } from '@/lib/ai-local'
import { useLive } from '@/lib/hooks/use-live'
import { comprendre, type Widget } from '@/lib/ai-widgets'
import { WidgetAssistant } from '@/components/ai/widgets'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'

type Msg = { id: string; role: 'user' | 'assistant'; content: string; widgets?: Widget[] }

function parseActions(text: string): { clean: string; actions: AiAction[] } {
  const actions: AiAction[] = []
  const clean = text.replace(/<action>([\s\S]*?)<\/action>/g, (_, json) => { try { actions.push(JSON.parse(json)) } catch {} return '' }).trim()
  return { clean, actions }
}
const compter = () => { try { const j = new Date().toDateString(), d = JSON.parse(localStorage.getItem('flow_ia_jour') || '{}'); localStorage.setItem('flow_ia_jour', JSON.stringify({ jour: j, n: (d.jour === j ? d.n : 0) + 1 })) } catch {} }


export default function AiPage() {
  const { t, locale } = useI18n()
  const { ws } = useWorkspace()
  const { userId, isDemo } = useSession()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [attente, setAttente] = useState<string | null>(null) // id de la réponse en cours (bulle qui se transforme)
  const [ia, setIa] = useState<boolean | null>(null)
  const end = useRef<HTMLDivElement>(null)
  // suggestions tirées de CET espace (pas d'exemples venus d'autres projets)
  const clientsQ = useLive<{ name: string }>('clients', { select: 'name', eq: { workspace_id: ws.id }, is: { deleted_at: null }, limit: 1 })
  const videosQ = useLive<{ titre: string; video_nom: string | null }>('motion_projets', { select: 'titre,video_nom', eq: { workspace_id: ws.id }, limit: 20 })
  const video = videosQ.data.find((v) => v.video_nom)
  const SUGGESTIONS = [
    { I: CheckSquare, t: 'Qu\'est-ce que je dois faire aujourd\'hui ?' },
    clientsQ.data[0] ? { I: Handshake, t: `Où en est ${clientsQ.data[0].name} ?` } : { I: Handshake, t: 'Quels clients attendent quelque chose ?' },
    video ? { I: Film, t: `Montre-moi la vidéo « ${video.titre} »` } : { I: Film, t: 'Résume ma semaine' },
    { I: CalendarDays, t: 'Mon agenda de la semaine' },
  ]
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs, attente])

  async function ask(text: string) {
    if (!text.trim() || !userId || attente) return
    const id = crypto.randomUUID()
    const next: Msg[] = [...msgs, { id: id + 'q', role: 'user', content: text.trim() }]
    setMsgs(next); setInput(''); setAttente(id); compter()
    const ctx = { wsId: ws.id, userId, locale }
    try {
      let reply = '', actions: AiAction[] = [], widgets: Widget[] = []
      if (!isDemo) {
        // l'historique garde la trace des widgets déjà montrés, pour que la conversation continue normalement
        const histo = next.map(({ role, content, widgets }) => ({ role, content: content || (widgets?.length ? `[widget affiché : ${widgets.map((w) => w.type).join(', ')}]` : '…') }))
        const res = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: histo, wsId: ws.id, locale }) })
        if (res.ok) { const j = await res.json(); const p = parseActions(j.text ?? ''); reply = p.clean; actions = p.actions; widgets = j.widgets ?? []; setIa(true) } else setIa(false)
      } else setIa(false)
      if (!reply && !widgets.length) {
        const c = comprendre(text)
        if (c) { reply = c.texte; widgets = c.widgets }
        else { await new Promise((r) => setTimeout(r, 450)); const r = await localAssistant(text, ctx); reply = r.text; actions = r.actions }
      }
      for (const a of actions) await runAction(a, ctx)
      setMsgs([...next, { id, role: 'assistant', content: reply, widgets }])
    } catch { setMsgs([...next, { id, role: 'assistant', content: t('ai.error') }]) } finally { setAttente(null) }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1100px] flex-col px-4 pt-6 sm:px-6">
      <div className="mb-2 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-text text-bg"><Sparkles className="size-[18px]" strokeWidth={1.75} /></span>
        <div className="min-w-0 flex-1"><h1 className="text-lg font-semibold tracking-tight">{t('ai.title')}</h1><p className="text-xs text-text-3">{ia === false ? 'Mode local : compréhension des demandes courantes, sans service externe.' : 'Connaît ton espace à jour : tâches, agenda, clients, discussions, fichiers…'}</p></div>
        {msgs.length > 0 && <Button size="sm" variant="ghost" onClick={() => setMsgs([])}><RotateCcw className="size-3.5" />{t('ai.clear')}</Button>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <LayoutGroup>
          {msgs.length === 0 && !attente && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-[50vh] flex-col items-center justify-center text-center">
              <h2 className="mk-titre-ia bg-gradient-to-br from-text from-30% to-text/40 bg-clip-text text-3xl font-semibold tracking-tighter text-transparent sm:text-4xl">Que veux-tu savoir ?</h2>
              <p className="mt-2 text-sm text-text-3">Demande en langage naturel : je réponds avec ce qu&apos;il faut voir.</p>
              <div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s, i) => (
                  <motion.button key={s.t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} onClick={() => void ask(s.t)}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left text-[13.5px] text-text-2 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:text-text">
                    <s.I className="size-4 shrink-0 text-text-3" strokeWidth={1.75} />{s.t}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
          <div className="space-y-5">
            {msgs.map((m) => m.role === 'user' ? (
              <motion.div key={m.id} layout initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-text px-4 py-2.5 text-[14px] leading-relaxed text-bg">{m.content}</div>
              </motion.div>
            ) : (
              // même layoutId que la bulle « réflexion » : elle se transforme en réponse (morphose)
              <motion.div key={m.id} layoutId={`ia-${m.id}`} transition={{ type: 'spring', stiffness: 260, damping: 30 }} className="space-y-3">
                {m.content && <motion.p initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.35 }} className="max-w-[85%] whitespace-pre-wrap text-[14.5px] leading-relaxed text-text">{m.content}</motion.p>}
                {m.widgets?.map((w, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 14, scale: 0.96, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                    transition={{ delay: 0.15 + i * 0.1, type: 'spring', stiffness: 260, damping: 26 }} className="max-w-3xl origin-top-left">
                    <WidgetAssistant w={w} />
                  </motion.div>
                ))}
              </motion.div>
            ))}
            <AnimatePresence>
              {attente && (
                <motion.div key={attente} layoutId={`ia-${attente}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className="inline-flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
                  <span className="relative grid size-5 place-items-center"><Sparkles className="size-4 animate-pulse text-text-2" strokeWidth={1.75} /></span>
                  <span className="bg-[linear-gradient(90deg,var(--text-3),var(--text),var(--text-3))] bg-[length:200%_100%] bg-clip-text text-[13.5px] text-transparent animate-shimmer">Je regarde ton espace…</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </LayoutGroup>
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void ask(input) }} className="sticky bottom-0 mb-3 flex items-end gap-2 rounded-2xl border border-border-strong bg-surface p-2 shadow-md transition-shadow focus-within:border-text/40 max-md:mb-[calc(64px+env(safe-area-inset-bottom))]">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} placeholder="Demande-moi tes tâches, un client, une vidéo…" aria-label={t('ai.placeholder')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input) } }}
          className="max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-[14px] outline-none placeholder:text-text-3" />
        <button type="submit" disabled={!input.trim() || !!attente} aria-label={t('msg.send')} className={cn('grid size-9 shrink-0 place-items-center rounded-xl bg-text text-bg transition-opacity', (!input.trim() || attente) && 'opacity-30')}><ArrowUp className="size-4" /></button>
      </form>
    </div>
  )
}
