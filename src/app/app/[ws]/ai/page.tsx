'use client'
import { useEffect, useRef, useState } from 'react'
import { Bot, RotateCcw, Send, Sparkles, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/misc'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { buildContext, localAssistant, runAction, type AiAction } from '@/lib/ai-local'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'

type Msg = { role: 'user' | 'assistant'; content: string }

function parseActions(text: string): { clean: string; actions: AiAction[] } {
  const actions: AiAction[] = []
  const clean = text.replace(/<action>([\s\S]*?)<\/action>/g, (_, json) => { try { actions.push(JSON.parse(json)) } catch {} return '' }).trim()
  return { clean, actions }
}

export default function AiPage() {
  const { t, locale } = useI18n()
  const { ws } = useWorkspace()
  const { userId, isDemo } = useSession()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [remote, setRemote] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs, busy])

  async function ask(text: string) {
    if (!text.trim() || !userId || busy) return
    const next: Msg[] = [...msgs, { role: 'user', content: text.trim() }]
    setMsgs(next); setInput(''); setBusy(true)
    const ctx = { wsId: ws.id, userId, locale }
    try {
      let reply = ''; let actions: AiAction[] = []
      if (!isDemo) {
        const snap = await buildContext(ws.id, userId)
        const res = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: next, context: snap, locale }) })
        if (res.ok) { const p = parseActions((await res.json()).text); reply = p.clean; actions = p.actions; setRemote(true) }
      }
      if (!reply) { const r = await localAssistant(text, ctx); reply = r.text; actions = r.actions }
      for (const a of actions) await runAction(a, ctx)
      setMsgs([...next, { role: 'assistant', content: reply }])
    } catch { setMsgs([...next, { role: 'assistant', content: t('ai.error') }]) } finally { setBusy(false) }
  }
  const suggestions = [t('ai.s1'), t('ai.s2'), t('ai.s3'), t('ai.s4')]

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-6 sm:px-6">
      <PageHeader title={t('ai.title')} icon={<Sparkles className="size-[18px]" />} actions={msgs.length > 0 && <Button size="sm" variant="ghost" onClick={() => setMsgs([])}><RotateCcw className="size-3.5" />{t('ai.clear')}</Button>} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
        {msgs.length === 0 && (
          <div className="py-8 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink"><Bot className="size-7" /></span>
            <p className="mx-auto mt-4 max-w-md text-sm text-text-2">{t('ai.welcome')}</p>
            <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-2">{suggestions.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-xl border border-border bg-surface px-4 py-3 text-left text-[13px] text-text-2 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:text-text">{s}</button>)}</div>
            {!remote && <p className="mt-6 text-xs text-text-3">{t('ai.simulated')}</p>}</div>)}
        {msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', m.role === 'user' ? 'bg-surface-3' : 'bg-accent text-accent-text')}>{m.role === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}</span>
            <div className={cn('max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed', m.role === 'user' ? 'bg-accent text-accent-text' : 'bg-surface-2')}>{m.content}</div>
          </motion.div>))}
        {busy && <div className="flex items-center gap-3 text-sm text-text-3"><span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-text"><Bot className="size-4" /></span><span className="animate-pulse">{t('ai.thinking')}</span></div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(input) }} className="flex gap-2 rounded-2xl border border-border-strong bg-surface p-1.5 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('ai.placeholder')} className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-text-3" aria-label={t('ai.placeholder')} />
        <Button type="submit" variant="primary" size="icon" disabled={!input.trim() || busy} aria-label={t('msg.send')}><Send className="size-4" /></Button>
      </form>
    </div>
  )
}
