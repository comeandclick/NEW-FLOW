'use client'
import { useMemo, useState } from 'react'
import { Archive, Download, ExternalLink, Info, Search, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Card, EmptyState, PageHeader, Tabs } from '@/components/ui/misc'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { useStudio, useStudioReady } from '@/lib/studio/store'
import { studioApi, useStudioMode, usePoll } from '@/lib/studio/api'
import { ModeBanner } from '@/components/studio/mode-banner'
import type { LibraryItem, LibraryKind } from '@/lib/studio/types'
import { refIcon } from '@/components/studio/ref-dropzone'
import { formatBytes } from '@/lib/utils'

type Filter = 'all' | LibraryKind

export default function LibraryPage() {
  const { locale } = useI18n()
  const c = studioCopy(locale)
  const ready = useStudioReady()
  const { mode, reason } = useStudioMode()
  const simItems = useStudio((s) => s.library)
  const live = usePoll(studioApi.library, 5000, mode === 'live')
  const items: LibraryItem[] = mode === 'live' ? (live.data?.items ?? []).map((i) => ({ id: i.id, kind: i.kind, refKind: i.kind === 'site' ? 'site' : i.kind === 'render' ? 'render-video' : i.mime?.startsWith('video/') ? 'video' : i.mime?.startsWith('image/') ? 'image' : 'file', name: i.name, size: i.size ?? undefined, url: i.url ?? undefined, jobId: i.jobId ?? undefined, jobTitle: i.jobTitle ?? undefined, at: new Date(i.at).getTime() })) : simItems
  const seed = useStudio((s) => s.seedLibrary)
  const clear = useStudio((s) => s.clearLibrary)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const counts = useMemo(() => ({
    all: items.length,
    sent: items.filter((i) => i.kind === 'sent').length,
    render: items.filter((i) => i.kind === 'render').length,
    site: items.filter((i) => i.kind === 'site').length,
  }), [items])
  const shown = items.filter((i) => (filter === 'all' || i.kind === filter) && (!q.trim() || `${i.name} ${i.jobTitle ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; title: string; at: number; items: LibraryItem[] }>()
    for (const it of shown) {
      const key = it.jobId ?? 'other'
      const g = m.get(key) ?? { key, title: it.jobTitle ?? (locale === 'en' ? 'Other' : 'Autres'), at: it.at, items: [] }
      g.items.push(it); g.at = Math.max(g.at, it.at); m.set(key, g)
    }
    return [...m.values()].sort((a, b) => b.at - a.at)
  }, [shown, locale])
  const kindLabel = { sent: c.library.kindSent, render: c.library.kindRender, site: c.library.kindSite }
  const kindColor: Record<LibraryKind, string | undefined> = { sent: undefined, render: '#15803d', site: '#4d59c7' }

  return (
    <div className="mx-auto max-w-6xl p-6 max-md:p-4">
      <PageHeader icon={<Archive className="size-4" />} title={c.library.title} subtitle={c.library.subtitle}
        actions={<>
          {mode !== 'live' && <Button size="sm" variant="outline" onClick={seed}><Sparkles className="size-3.5" />{c.library.sample}</Button>}
          {mode !== 'live' && items.length > 0 && <Button size="sm" variant="ghost" onClick={clear}><Trash2 className="size-3.5" />{c.library.clear}</Button>}
        </>} />
      <ModeBanner mode={mode} reason={reason} />
      {mode !== 'live' && c.library.storageNote && <p className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-2"><Info className="mt-0.5 size-4 shrink-0 text-text-3" />{c.library.storageNote}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs<Filter> value={filter} onChange={setFilter} items={[
          { value: 'all', label: `${c.library.all} ${counts.all}` }, { value: 'sent', label: `${c.library.sent} ${counts.sent}` },
          { value: 'render', label: `${c.library.renders} ${counts.render}` }, { value: 'site', label: `${c.library.sites} ${counts.site}` },
        ]} />
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.library.search} className="pl-9" aria-label={c.library.search} />
        </div>
      </div>

      {!ready ? null : shown.length === 0 ? (
        <Card><EmptyState icon={<Archive className="size-5" />} title={c.library.empty} hint={c.library.emptyHint} action={mode === 'live' ? undefined : <Button variant="primary" onClick={seed}><Sparkles className="size-4" />{c.library.sample}</Button>} /></Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.title}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{g.title}</h2>
                <span className="text-xs text-text-3">{new Date(g.at).toLocaleDateString(locale, { dateStyle: 'medium' })} · {g.items.length}</span>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((it) => {
                  const Icon = refIcon(it.refKind)
                  const link = !!it.url && /^https?:/.test(it.url)
                  const video = !!it.url && (it.refKind === 'render-video' || it.refKind === 'video') && /\.(mp4|mov|webm)(\?|$)/i.test(it.name + (it.url.includes('?') ? '' : ''))
                  const image = !!it.url && it.refKind === 'image'
                  return (
                    <li key={it.id}>
                      <Card className="flex h-full flex-col overflow-hidden">
                        {video && <video src={it.url} controls preload="metadata" playsInline className="aspect-video w-full bg-black object-contain" aria-label={it.name} />}
                        {image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.url} alt={it.name} loading="lazy" className="aspect-video w-full bg-surface-2 object-cover" />}
                        <div className="flex flex-1 flex-col gap-3 p-4">
                          <div className="flex items-start gap-3">
                            {!video && !image && <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-2"><Icon className="size-5" /></span>}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium text-text" title={it.name}>{it.name}</p>
                              <p className="truncate text-xs text-text-3">{it.size ? `${formatBytes(it.size)} · ` : ''}{new Date(it.at).toLocaleDateString(locale, { dateStyle: 'medium' })}</p>
                            </div>
                            <Badge color={kindColor[it.kind]}>{kindLabel[it.kind]}</Badge>
                          </div>
                          <div className="mt-auto flex gap-2">
                            {link ? <><a href={it.url} target="_blank" rel="noreferrer"><Button size="xs" variant="glass"><ExternalLink className="size-3.5" />{c.common.open}</Button></a>{it.kind === 'render' && <a href={it.url} download={it.name}><Button size="xs" variant="outline"><Download className="size-3.5" />{c.common.download}</Button></a>}</>
                              : it.kind === 'render' ? <Button size="xs" variant="glass" disabled><Download className="size-3.5" />{c.common.download}</Button>
                              : <span className="text-xs text-text-3">{c.library.noPreview}</span>}
                          </div>
                        </div>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
