'use client'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertCircle, Clock, ImageIcon, Send, Trash2, X, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Card, PageHeader, Switch } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useT } from '@/i18n/provider'
import { PLATFORM_COLORS, PLATFORM_LABELS, PLATFORM_LIMITS, type Platform, type SocialAccount, type SocialPost } from '@/lib/social/types'
import { PlatformIcon } from '@/components/social/platform-icon'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const CHAR_LIMITS: Record<Platform, number> = { instagram: 2200, facebook: 63206, tiktok: 2200, linkedin: 3000 }

function todayNoon(): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  if (d <= new Date()) d.setDate(d.getDate() + 1)
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

function PublishPage() {
  const t = useT()
  const { ws } = useWorkspace()
  const router = useRouter()

  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [drafts, setDrafts] = useState<SocialPost[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)

  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  const [scheduled, setScheduled] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [failDetail, setFailDetail] = useState<Record<string, { ok: boolean; error?: string }> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function loadData() {
    setLoadingAccounts(true)
    const [accRes, draftRes] = await Promise.all([
      fetch(`/api/social/accounts?ws=${ws.slug}`),
      fetch(`/api/social/posts?ws=${ws.slug}&status=draft&limit=20`),
    ])
    if (accRes.ok) { const { accounts: a } = await accRes.json() as { accounts: SocialAccount[] }; setAccounts(a) }
    if (draftRes.ok) { const { posts: p } = await draftRes.json() as { posts: SocialPost[] }; setDrafts(p) }
    setLoadingAccounts(false)
  }

  useEffect(() => { void loadData() }, [ws.slug])

  function toggleAccount(id: string) {
    setSelectedAccounts((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const selectedPlatforms = Array.from(selectedAccounts).map((id) => accounts.find((a) => a.id === id)?.platform).filter(Boolean) as Platform[]
  const needsMedia = selectedPlatforms.some((p) => PLATFORM_LIMITS[p].requiresMedia)
  const captionLimit = selectedPlatforms.length ? Math.min(...selectedPlatforms.map((p) => CHAR_LIMITS[p])) : 63206
  const captionOk = caption.trim().length >= 3 && caption.length <= captionLimit
  const canSubmit = captionOk && selectedAccounts.size > 0 && (!needsMedia || mediaUrls.length > 0) && (!scheduled || !!scheduledAt)

  async function uploadFiles(files: File[]) {
    if (!files.length) return
    setUploading(true)
    const uploaded: string[] = []
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('ws', ws.slug)
        const res = await fetch('/api/social/upload', { method: 'POST', body: fd })
        if (!res.ok) {
          const { error } = await res.json() as { error?: string }
          toast.error(error ?? 'Erreur lors du téléversement.')
          continue
        }
        const { url } = await res.json() as { url: string }
        uploaded.push(url)
      }
      setMediaUrls((m) => [...m, ...uploaded])
    } finally { setUploading(false) }
  }

  const handleFiles = useCallback((list: FileList | null) => {
    if (!list) return
    void uploadFiles(Array.from(list))
  }, [ws.slug])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      const payload = {
        ws: ws.slug,
        title: title.trim() || null,
        caption: caption.trim(),
        mediaUrls,
        platforms: selectedPlatforms,
        accountIds: Array.from(selectedAccounts),
        scheduledAt: scheduled ? new Date(scheduledAt).toISOString() : null,
      }

      let postId: string

      if (editingDraftId) {
        const res = await fetch(`/api/social/posts?id=${editingDraftId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) throw new Error('Update failed')
        const { post } = await res.json() as { post: SocialPost }
        postId = post.id
      } else {
        const res = await fetch('/api/social/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) throw new Error('Create failed')
        const { post } = await res.json() as { post: SocialPost }
        postId = post.id
      }

      if (!scheduled) {
        const pubRes = await fetch('/api/social/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postId }) })
        const result = await pubRes.json() as { status: string; results: Record<string, { ok: boolean; error?: string }> }
        if (result.status === 'failed') {
          setFailDetail(result.results)
          toast.error('Publication échouée. Consultez les détails.')
        } else {
          toast.success(t('soc.pub.success'))
          resetForm()
          router.push(`/app/${ws.slug}/social/calendar`)
        }
      } else {
        toast.success(t('soc.pub.scheduled'))
        resetForm()
        router.push(`/app/${ws.slug}/social/calendar`)
      }
    } catch { toast.error(t('common.error')) } finally { setBusy(false) }
  }

  async function saveDraft() {
    if (caption.trim().length < 1) { toast.error(t('soc.pub.needCaption')); return }
    try {
      const payload = { ws: ws.slug, title: title.trim() || null, caption: caption.trim(), mediaUrls, platforms: selectedPlatforms, accountIds: Array.from(selectedAccounts), scheduledAt: null }
      if (editingDraftId) {
        await fetch(`/api/social/posts?id=${editingDraftId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, status: 'draft' }) })
      } else {
        await fetch('/api/social/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      }
      toast.success(t('soc.pub.saved')); resetForm(); void loadData()
    } catch { toast.error(t('common.error')) }
  }

  function resetForm() {
    setTitle(''); setCaption(''); setMediaUrls([]); setSelectedAccounts(new Set()); setScheduled(false); setScheduledAt(''); setEditingDraftId(null)
  }

  function loadDraft(post: SocialPost) {
    setEditingDraftId(post.id)
    setTitle(post.title ?? '')
    setCaption(post.caption ?? '')
    setMediaUrls(post.media_urls ?? [])
    setSelectedAccounts(new Set(post.account_ids ?? []))
    setScheduled(!!post.scheduled_at)
    setScheduledAt(post.scheduled_at ? format(new Date(post.scheduled_at), "yyyy-MM-dd'T'HH:mm") : '')
  }

  const minDateTime = format(new Date(Date.now() + 60000), "yyyy-MM-dd'T'HH:mm")

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <PageHeader title={t('soc.pub.title')} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Composer */}
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <Field label={t('soc.pub.postTitle')}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('soc.pub.postTitlePh')} />
            </Field>
            <Field label={t('soc.pub.caption')} hint={`${caption.length} / ${captionLimit}`}>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t('soc.pub.captionPh')}
                className="min-h-36"
              />
              {caption.length > captionLimit && (
                <p className="mt-1 text-xs text-danger-bg">{t('soc.pub.charLimit', { n: String(captionLimit) })}</p>
              )}
            </Field>
          </Card>

          {/* Media */}
          <Card className="space-y-3 p-5">
            <p className="text-sm font-medium text-text">{t('soc.pub.media')}</p>
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => !uploading && fileRef.current?.click()}
              className={cn('flex min-h-[90px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm text-text-3 transition-colors hover:border-accent hover:text-text-2', uploading && 'cursor-wait opacity-70')}
            >
              {uploading ? <><Loader2 className="size-5 animate-spin" /><span>Téléversement…</span></> : <><ImageIcon className="size-5" /><span>{t('soc.pub.mediaHint')}</span></>}
            </div>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*" hidden onChange={(e) => handleFiles(e.target.files)} />

            {mediaUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {mediaUrls.map((url, i) => (
                  <div key={i} className="group relative size-20 overflow-hidden rounded-lg border border-border bg-surface-2">
                    {/\.(mp4|mov|webm)$/i.test(url) ? (
                      <video src={url} className="size-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="size-full object-cover" />
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setMediaUrls((m) => m.filter((_, j) => j !== i)) }}
                      className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-bg/90 text-text opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={t('common.delete')}
                    ><X className="size-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Timing */}
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text">{t('soc.pub.when')}</p>
              {scheduled && (
                <button onClick={() => { setScheduled(true); setScheduledAt(todayNoon()) }} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] text-text-2 hover:border-accent hover:text-accent transition-colors">
                  <Clock className="size-3" />Aujourd'hui à midi
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={scheduled} onChange={setScheduled} label={t('soc.pub.later')} />
              <span className="text-sm text-text-2">{scheduled ? t('soc.pub.later') : t('soc.pub.now')}</span>
            </div>
            {scheduled && (
              <Field label={t('soc.pub.scheduledAt')}>
                <Input type="datetime-local" value={scheduledAt} min={minDateTime} onChange={(e) => setScheduledAt(e.target.value)} />
              </Field>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <p className="text-sm font-medium text-text">{t('soc.pub.networks')}</p>
            {loadingAccounts ? (
              <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
            ) : accounts.length === 0 ? (
              <div className="py-2 text-center text-sm text-text-3">
                <p>{t('soc.pub.noAccounts')}</p>
                <Link href={`/app/${ws.slug}/social/accounts`} className="mt-1 inline-block text-accent underline underline-offset-2">{t('soc.pub.noAccountsLink')}</Link>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {accounts.map((acc) => {
                  const on = selectedAccounts.has(acc.id)
                  return (
                    <li key={acc.id}>
                      <button
                        onClick={() => toggleAccount(acc.id)}
                        className={cn('flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left text-[13px] transition-colors', on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-text-2 hover:border-border-strong hover:text-text')}
                      >
                        <PlatformIcon platform={acc.platform} className="size-4 shrink-0" color={on ? 'currentColor' : PLATFORM_COLORS[acc.platform]} />
                        <span className="flex-1 truncate">{PLATFORM_LABELS[acc.platform]} · @{acc.username}</span>
                        {on && <span className="size-4 rounded-full bg-accent flex items-center justify-center"><svg viewBox="0 0 12 12" fill="none" className="size-2.5"><path d="M2 6l2.5 2.5L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card className="space-y-2 p-4">
            <Button variant="primary" size="lg" className="w-full justify-center" onClick={submit} loading={busy} disabled={!canSubmit}>
              <Send className="size-4" />{scheduled ? t('soc.pub.schedule') : t('soc.pub.publish')}
            </Button>
            {!canSubmit && caption.trim().length < 3 && caption.length > 0 && <p className="text-xs text-text-3">{t('soc.pub.needCaption')}</p>}
            {!canSubmit && selectedAccounts.size === 0 && captionOk && <p className="text-xs text-text-3">{t('soc.pub.needNetwork')}</p>}
            {!canSubmit && needsMedia && mediaUrls.length === 0 && <p className="text-xs text-text-3">{t('soc.pub.needMedia')}</p>}
            <Button variant="outline" size="sm" className="w-full justify-center" onClick={saveDraft}>{t('soc.pub.draft')}</Button>
            {editingDraftId && (
              <button onClick={resetForm} className="flex w-full items-center justify-center gap-1.5 py-1 text-[12px] text-text-3 hover:text-text transition-colors">
                <X className="size-3" />Annuler la modification
              </button>
            )}
          </Card>

          {drafts.length > 0 && (
            <Card className="p-4 space-y-2">
              <p className="text-sm font-medium text-text">{t('soc.pub.drafts')}</p>
              <ul className="space-y-1">
                {drafts.map((d) => (
                  <li key={d.id} className="flex items-center gap-1">
                    <button onClick={() => loadDraft(d)} className={cn('flex-1 truncate rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2', editingDraftId === d.id && 'bg-accent-soft text-accent-ink')}>
                      {d.title || d.caption?.slice(0, 40) || 'Brouillon'}
                    </button>
                    <button onClick={async () => { await fetch(`/api/social/posts?id=${d.id}`, { method: 'DELETE' }); setDrafts((x) => x.filter((p) => p.id !== d.id)) }} className="shrink-0 p-1 text-text-3 hover:text-danger" aria-label={t('common.delete')}><Trash2 className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={!!failDetail} onClose={() => setFailDetail(null)} title={t('soc.pub.failInfo')}
        footer={<Button onClick={() => setFailDetail(null)}>{t('common.close')}</Button>}>
        {failDetail && (
          <ul className="space-y-2">
            {Object.entries(failDetail).map(([id, r]) => (
              <li key={id} className={cn('flex items-start gap-2 rounded-lg border p-3 text-[13px]', r.ok ? 'border-success/30 bg-success/5 text-success' : 'border-danger-bg/30 bg-danger-bg/5 text-danger-bg')}>
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div><span className="font-medium">{accounts.find((a) => a.id === id)?.username ?? id}</span>{r.error && <p className="mt-0.5 text-text-2">{r.error}</p>}</div>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  )
}

export default function Page() { return <Suspense><PublishPage /></Suspense> }
