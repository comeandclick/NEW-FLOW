'use client'
import { useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'

export function CopyBox({ text, label, copied, share }: { text: string; label: string; copied: string; share?: { title: string; url: string } }) {
  const [done, setDone] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600) } catch {} }
  return (
    <div className="rounded-xl border border-border bg-surface-2">
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-text" tabIndex={0}>{text}</pre>
      <div className="flex gap-2 border-t border-border px-3 py-2">
        <button type="button" onClick={copy} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-text px-3 text-[13px] font-medium text-bg">{done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{done ? copied : label}</button>
        {share && typeof navigator !== 'undefined' && 'share' in navigator && (
          <button type="button" onClick={() => navigator.share(share).catch(() => {})} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-[13px] font-medium text-text"><Share2 className="size-3.5" />{share.title}</button>
        )}
      </div>
    </div>
  )
}
