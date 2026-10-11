'use client'
import { Database, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import type { Mode } from '@/lib/studio/api'

export function ModeBanner({ mode, reason }: { mode: Mode; reason: string | null }) {
  const { locale } = useI18n()
  const c = studioCopy(locale)
  if (mode === 'live' || mode === 'loading') return null
  if (mode === 'setup') {
    const copy = async () => { try { const sql = await (await fetch('/studio/studio.sql')).text(); await navigator.clipboard.writeText(sql); toast.success(c.common.copied) } catch { toast.error('Erreur') } }
    return (
      <div className="mb-5 flex flex-wrap items-start gap-3 rounded-lg border border-[#c2410c]/30 bg-[#c2410c]/5 px-3 py-3 text-[13px] text-text">
        <Database className="mt-0.5 size-4 shrink-0 text-[#c2410c]" />
        <div className="min-w-0 flex-1"><p className="font-medium">{c.live.setupTitle}</p><p className="text-text-2">{c.live.setupBody}</p>{reason && reason !== 'tables_missing' && <p className="mt-1 text-xs text-text-3">{reason}</p>}</div>
        <Button size="sm" variant="primary" onClick={copy}>{c.live.setupCopy}</Button>
      </div>
    )
  }
  return <p className="mb-5 flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-2"><Info className="mt-0.5 size-4 shrink-0 text-text-3" />{mode === 'demo' ? c.live.demoBanner : c.common.previewNote}</p>
}
