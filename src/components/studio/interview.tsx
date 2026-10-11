'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Check, Send, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/misc'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { questionsFor, understandingOf } from '@/lib/studio/prompts'
import type { SiteKind } from '@/lib/studio/types'
import { cn } from '@/lib/utils'

export type Answer = { id: string; q: string; a: string }

/** Session de questions : une question à la fois, réponses libres ou cliquables, jauge de compréhension. */
export function Interview({ kind, answers, onAnswers, onDone }: { kind: SiteKind; answers: Answer[]; onAnswers: (a: Answer[]) => void; onDone?: () => void }) {
  const { locale } = useI18n()
  const c = studioCopy(locale)
  const all = useMemo(() => questionsFor(kind), [kind])
  const pending = all.filter((q) => !answers.some((a) => a.id === q.id))
  const current = pending[0]
  const pct = understandingOf(kind, answers.map((a) => a.id))
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [answers.length])

  const give = (a: string) => {
    if (!current || !a.trim()) return
    const next = [...answers, { id: current.id, q: current.text, a: a.trim() }]
    onAnswers(next)
    setText('')
    if (all.every((q) => next.some((x) => x.id === q.id))) onDone?.()
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4 max-md:px-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text">{c.site.interviewTitle}</h2>
            <p className="text-[13px] text-text-3">{c.site.interviewHint}</p>
          </div>
          <div className="text-right"><p className="text-xs text-text-3">{c.site.understanding}</p><p className="text-lg font-semibold tabular-nums text-text">{pct}%</p></div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={c.site.understanding}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="max-h-[420px] space-y-4 overflow-y-auto px-5 py-4 max-md:px-4" aria-live="polite">
        {answers.map((a) => (
          <div key={a.id} className="space-y-2">
            <Bubble who="bot">{a.q}</Bubble>
            <Bubble who="me">{a.a}</Bubble>
          </div>
        ))}
        {current ? <Bubble who="bot" live>{current.text}</Bubble> : (
          <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-[13px] font-medium text-text"><Check className="size-4 text-success" />{c.site.interviewDone}</div>
        )}
        <div ref={end} />
      </div>

      {current && (
        <div className="space-y-2 border-t border-border bg-surface-2/50 px-5 py-4 max-md:px-4">
          <div className="flex flex-wrap gap-1.5">
            {(current.choices ?? []).map((x) => <Button key={x} size="xs" variant="outline" onClick={() => give(x)}>{x}</Button>)}
            {!(current.choices ?? []).some((x) => /décides/i.test(x)) && <Button size="xs" variant="ghost" onClick={() => give(c.site.youDecide)}>{c.site.youDecide}</Button>}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); give(text) }}>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={c.site.answerPlaceholder} aria-label={c.site.answerPlaceholder} />
            <Button type="submit" variant="primary" disabled={!text.trim()}><Send className="size-3.5" />{c.site.send}</Button>
          </form>
        </div>
      )}
    </Card>
  )
}

function Bubble({ who, children, live }: { who: 'bot' | 'me'; children: React.ReactNode; live?: boolean }) {
  const me = who === 'me'
  return (
    <div className={cn('flex gap-2.5', me && 'flex-row-reverse', live && 'animate-fade-in')}>
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', me ? 'bg-text text-bg' : 'bg-accent-soft text-accent-ink')}>{me ? <User className="size-3.5" /> : <Bot className="size-3.5" />}</span>
      <p className={cn('max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed', me ? 'rounded-tr-md bg-text text-bg' : 'rounded-tl-md bg-surface-2 text-text')}>{children}</p>
    </div>
  )
}
