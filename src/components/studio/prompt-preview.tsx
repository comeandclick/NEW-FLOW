'use client'
import { useState } from 'react'
import { Check, ChevronDown, Copy, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Le prompt réel qui sera transmis à Claude Code (relisible et copiable). */
export function PromptPreview({ title, hint, prompt, show, hide, copy, copied, defaultOpen = false }: {
  title: string; hint?: string; prompt: string; show: string; hide: string; copy: string; copied: string; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [done, setDone] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-surface">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-2"><Terminal className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-text">{title}</span>
          {hint && <span className="block truncate text-xs text-text-3">{hint}</span>}
        </span>
        <span className="flex items-center gap-1 text-xs text-text-3">{open ? hide : show}<ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} /></span>
      </button>
      {open && (
        <div className="border-t border-border p-3">
          <div className="mb-2 flex justify-end">
            <Button size="xs" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(prompt); setDone(true); toast.success(copied); setTimeout(() => setDone(false), 1500) } catch {} }}>
              {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{done ? copied : copy}
            </Button>
          </div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed text-text-2" tabIndex={0}>{prompt}</pre>
        </div>
      )}
    </div>
  )
}
