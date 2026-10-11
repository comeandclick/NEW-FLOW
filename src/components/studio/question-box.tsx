'use client'
import { useState } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { studioApi, type LiveQuestion } from '@/lib/studio/api'

/** Question de Claude : réponses cliquables ou libre. Le travail continue pendant ce temps (sans réponse, Claude décide seul après 20 min). */
export function QuestionBox({ jobId, q, onAnswered }: { jobId: string; q: LiveQuestion; onAnswered: () => void }) {
  const { locale } = useI18n()
  const c = studioCopy(locale).site
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const answer = async (a: string) => {
    if (!a.trim() || busy) return
    setBusy(true)
    try { await studioApi.answer(jobId, q.id, a.trim()); setReply(''); toast.success(c.replied); onAnswered() } catch { toast.error('Erreur') } finally { setBusy(false) }
  }
  return (
    <div className="rounded-lg border border-[#c2410c]/30 bg-[#c2410c]/5 p-3 animate-fade-in">
      <div className="flex items-start gap-2.5">
        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-[#c2410c]" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[13px] font-medium text-text">{c.questionTitle}</p>
          <p className="text-[13px] text-text-2">{q.text}</p>
          {q.choices && <div className="flex flex-wrap gap-1.5">{q.choices.map((x) => <Button key={x} size="xs" variant="outline" onClick={() => void answer(x)}>{x}</Button>)}</div>}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void answer(reply) }}>
            <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={c.answerPlaceholder} aria-label={c.reply} />
            <Button type="submit" variant="primary" disabled={!reply.trim()} loading={busy}>{c.reply}</Button>
          </form>
        </div>
      </div>
    </div>
  )
}
