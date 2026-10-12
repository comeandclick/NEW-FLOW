'use client'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertCircle, Clock, ImageIcon, Send, Trash2, X, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
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

  const selectedPlatforms = Array.from(selectedAccounts)
    .map((id) => accounts.find((a) => a.id === id)?.platform)
    .filter(Boolean) as Platform[]
  const needsMedia = selectedPlatforms.some((p) => PLATFORM_LIMITS[p].requiresMedia)
  const captionLimit = selectedPlatforms.length ? Math.min(...selectedPlatforms.map((p) => PLATFORM_LIMITS[p].caption)) : 63206
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
          toast.error(error ?? 'Erreur de téléversement.')
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
          toast.error('Publication échouée.')
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const minDateTime = format(new Date(Date.now() + 60000), "yyyy-MM-dd'T'HH:mm")

  return (
    <div className="mx-auto max-w-3xl p-4 pb-28 md:p-6 md:pb-6">
      <PageHeader title={t('soc.pub.title')} />

      {/* Réseaux — en haut sur mobile */}
      <Card className="mb-4 p-4">
        <p className="mb-2.5 text-sm font-medium text-text">{t('soc.pub.networks')}</p>
        {loadingAccounts ? (
          <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
        ) : accounts.length === 0 ? (
          <div className="py-1 text-sm text-text-3">
            Aucun réseau.{' '}
            <Link href={`/app/${ws.slug}/social/accounts`} className="text-accent underline underline-offset-2">
              {t('soc.pub.noAccountsLink')}
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {accounts.map((acc) => {
              const on = selectedAccounts.has(acc.id)
              return (
                <button
                  key={acc.id}
                  onClick={() => toggleAccount(acc.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors',
                    on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-text-2 hover:border-border-strong',
                  )}
                >
                  <PlatformIcon platform={acc.platform} className="size-4 shrink-0" color={on ? 'currentColor' : PLATFORM_COLORS[acc.platform]} />
                  <span className="max-w-[100px] truncate">{PLATFORM_LABELS[acc.platform]}</span>
                  {on && (
                    <svg viewBox="0 0 12 12" fill="none" className="size-3.5 shrink-0">
                      <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </Card>

      {/* Composer */}
      <div className="space-y-4">
        <Card className="space-y-4 p-4">
          <Field label={t('soc.pub.postTitle')}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('soc.pub.postTitlePh')} />
          </Field>
          <Field label={t('soc.pub.caption')} hint={`${caption.length} / ${captionLimit.toLocaleString('fr-FR')}`}>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={t('soc.pub.captionPh')}
              className="min-h-32"
            />
            {caption.length > captionLimit && (
              <p className="mt-1 text-xs text-danger-bg">{t('soc.pub.charLimit', { n: String(captionLimit) })}</p>
            )}
          </Field>
        </Card>

        {/* Media */}
        <Card className="space-y-3 p-4">
          <p className="text-sm font-medium text-text">{t('soc.pub.media')}</p>
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => !uploading && fileRef.current?.click()}
            className={cn(
              'flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm text-text-3 transition-colors hover:border-accent hover:text-text-2',
              uploading && 'cursor-wait opacity-60',
            )}
          >
            {uploading
              ? <><Loader2 className="size-5 animate-spin" /><span>Téléversement…</span></>
              : <><ImageIcon className="size-5" /><span>{t('soc.pub.mediaHint')}</span></>
            }
          </div>
          <input ref={fileRef} type="file" multiple accept="image/*,video/*" hidden onChange={(e) => handleFiles(e.target.files)} />
          {mediaUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {mediaUrls.map((url, i) => (
                <div key={i} className="group relative size-20 overflow-hidden rounded-lg border border-border bg-surface-2">
                  {/\.(mp4|mov|webm)$/i.test(url)
                    ? <video src={url} className="size-full object-cover" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={url} alt="" className="size-full object-cover" />}
                  <button
                    onClick={(e) => { e.stopPropagation(); setMediaUrls((m) => m.filter((_, j) => j !== i)) }}
                    className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-bg/90 text-text opacity-0 transition-opacity group-hover:opacity-100 active:opacity-100"
                    aria-label="Supprimer"
                  ><X className="size-3" /></button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Programmation */}
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text">{t('soc.pub.when')}</p>
            <button
              onClick={() => { setScheduled(true); setScheduledAt(todayNoon()) }}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] text-text-2 transition-colors hover:border-accent hover:text-accent"
            >
              <Clock className="size-3" />Aujourd'hui à midi
            </button>
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

        {/* Brouillons */}
        {drafts.length > 0 && (
          <Card className="p-4">
            <p className="mb-2 text-sm font-medium text-text">{t('soc.pub.drafts')}</p>
            <ul className="space-y-1">
              {drafts.map((d) => (
                <li key={d.id} className="flex items-center gap-1">
                  <button
                    onClick={() => loadDraft(d)}
                    className={cn('flex-1 truncate rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2', editingDraftId === d.id && 'bg-accent-soft text-accent-ink')}
                  >
                    {d.title || d.caption?.slice(0, 40) || 'Brouillon'}
                    {d.scheduled_at && <span className="ml-1.5 text-[11px] text-text-3">{format(new Date(d.scheduled_at), 'dd/MM HH:mm', { locale: fr })}</span>}
                  </button>
                  <button
                    onClick={async () => { await fetch(`/api/social/posts?id=${d.id}`, { method: 'DELETE' }); setDrafts((x) => x.filter((p) => p.id !== d.id)) }}
                    className="shrink-0 rounded p-1.5 text-text-3 transition-colors hover:text-danger"
                    aria-label="Supprimer"
                  ><Trash2 className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Actions desktop */}
      <div className="mt-4 hidden gap-2 md:flex">
        <Button variant="outline" onClick={saveDraft}>{t('soc.pub.draft')}</Button>
        {editingDraftId && (
          <button onClick={resetForm} className="flex items-center gap-1.5 text-[13px] text-text-3 transition-colors hover:text-text">
            <X className="size-3.5" />Annuler modification
          </button>
        )}
        <div className="flex-1" />
        {!canSubmit && selectedAccounts.size === 0 && captionOk && (
          <p className="self-center text-xs text-text-3">{t('soc.pub.needNetwork')}</p>
        )}
        {!canSubmit && needsMedia && mediaUrls.length === 0 && (
          <p className="self-center text-xs text-text-3">{t('soc.pub.needMedia')}</p>
        )}
        <Button variant="primary" size="lg" onClick={submit} loading={busy} disabled={!canSubmit}>
          <Send className="size-4" />
          {scheduled ? t('soc.pub.schedule') : t('soc.pub.publish')}
        </Button>
      </div>

      {/* Sticky bar mobile */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur-sm md:hidden">
        <Button variant="outline" size="sm" onClick={saveDraft} className="shrink-0">{t('soc.pub.draft')}</Button>
        <Button variant="primary" size="lg" className="flex-1 justify-center" onClick={submit} loading={busy} disabled={!canSubmit}>
          <Send className="size-4" />
          {scheduled ? t('soc.pub.schedule') : t('soc.pub.publish')}
        </Button>
      </div>

      <Dialog open={!!failDetail} onClose={() => setFailDetail(null)} title={t('soc.pub.failInfo')}
        footer={<Button onClick={() => setFailDetail(null)}>{t('common.close')}</Button>}>
        {failDetail && (
          <ul className="space-y-2">
            {Object.entries(failDetail).map(([id, r]) => (
              <li key={id} className={cn('flex items-start gap-2 rounded-lg border p-3 text-[13px]', r.ok ? 'border-success/30 bg-success/5 text-success' : 'border-danger-bg/30 bg-danger-bg/5 text-danger-bg')}>
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div>
                  <span className="font-medium">{accounts.find((a) => a.id === id)?.username ?? id}</span>
                  {r.error && <p className="mt-0.5 text-text-2">{r.error}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  )
}

export default function Page() { return <Suspense><PublishPage /></Suspense> }
