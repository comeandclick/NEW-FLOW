'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Paperclip, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { studioApi, uploadFile, type LiveStatus } from '@/lib/studio/api'
import { cn, formatBytes } from '@/lib/utils'

type Mode = 'now' | 'next' | 'after'

/** Message à Claude Code, pendant le travail ou après la livraison, avec images, vidéos et fichiers. */
export function MessageComposer({ jobId, status, onSent }: { jobId: string; status: string; onSent: () => void }) {
  const { locale } = useI18n()
  const c = studioCopy(locale).live
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [mode, setMode] = useState<Mode>('next')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const finished = (['done', 'failed', 'cancelled'] as LiveStatus[]).includes(status as LiveStatus)

  const add = useCallback((l: FileList | File[]) => setFiles((f) => [...f, ...Array.from(l)].slice(0, 20)), [])
  useEffect(() => { if (finished) setMode('next') }, [finished])

  const send = async () => {
    if (busy || (!text.trim() && !files.length)) return
    setBusy(true)
    try {
      const ids: string[] = []
      for (const f of files) ids.push(await uploadFile(jobId, f, f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : 'file'))
      await studioApi.message(jobId, { text: text.trim(), mode, assetIds: ids })
      setText(''); setFiles([]); onSent()
      toast.success(c.msgSent)
    } catch (e) { toast.error(e instanceof Error && e.message === 'no_device' ? c.noDevice : 'Erreur') } finally { setBusy(false) }
  }

  const modes: { id: Mode; t: string; d: string }[] = [{ id: 'now', t: c.modeNow, d: c.modeNowD }, { id: 'next', t: c.modeNext, d: c.modeNextD }, { id: 'after', t: c.modeAfter, d: c.modeAfterD }]
  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-surface-2/50 p-3"
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files) }}>
      <div><p className="text-[13px] font-medium text-text">{c.messageTitle}</p><p className="text-xs text-text-3">{finished ? c.afterDone : c.messageHint}</p></div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={c.messagePlaceholder} className="min-h-16"
        onPaste={(e) => { const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/')); if (imgs.length) { e.preventDefault(); add(imgs) } }}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send() } }} aria-label={c.messageTitle} />
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text-2">
              <span className="max-w-40 truncate">{f.name}</span><span className="text-text-3">{formatBytes(f.size)}</span>
              <button type="button" aria-label={`${c.remove} ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="text-text-3 hover:text-text"><X className="size-3" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!finished && (
          <div role="radiogroup" aria-label={c.messageTitle} className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            {modes.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} title={m.d} onClick={() => setMode(m.id)}
                className={cn('h-7 rounded-md px-2.5 text-xs font-medium transition-colors', mode === m.id ? 'bg-text text-bg' : 'text-text-3 hover:text-text')}>{m.t}</button>
            ))}
          </div>
        )}
        <span className="flex-1" />
        <input ref={input} type="file" multiple hidden accept="image/*,video/*,.pdf,.zip,.txt,.md,.json,.fig" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = '' }} aria-label={c.attach} />
        <Button size="sm" variant="outline" onClick={() => input.current?.click()}><Paperclip className="size-3.5" />{c.attach}</Button>
        <Button size="sm" variant="primary" onClick={send} loading={busy} disabled={!text.trim() && !files.length}><Send className="size-3.5" />{busy ? c.sending : c.send}</Button>
      </div>
    </div>
  )
}
