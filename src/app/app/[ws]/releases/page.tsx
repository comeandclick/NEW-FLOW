'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Check, Copy, Download, FileText, MessageSquare, Rocket, Save } from 'lucide-react'
import { toast } from 'sonner'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { collect, render, type RnLang } from '@/lib/release-notes'
import { mdToDoc } from '@/lib/md-doc'
import { useI18n } from '@/i18n/provider'
import type { Conversation, Note, Task } from '@/lib/types'

const RELEASE_TAG = 'release'

/** Writes the notes of a version from the tasks finished since the previous one, then saves / shares them. */
export default function ReleasesPage() {
  const { t, locale } = useI18n()
  const { ws, projects, canWrite, log } = useWorkspace()
  const { userId } = useSession()
  const tasks = useLive<Task>('tasks', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const notes = useLive<Note>('notes', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false], limit: 200 })
  const channels = useLive<Conversation>('conversations', { eq: { workspace_id: ws.id, type: 'channel' }, order: ['name', true] })
  const releases = useMemo(() => notes.data.filter((n) => n.tags?.includes(RELEASE_TAG)), [notes.data])

  const lastDate = releases[0]?.created_at
  const [since, setSince] = useState<string>('')
  const [until, setUntil] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [version, setVersion] = useState('')
  const [lang, setLang] = useState<RnLang>(locale === 'en' ? 'en' : 'fr')
  const [projectId, setProjectId] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [edited, setEdited] = useState<string | null>(null)
  const [channel, setChannel] = useState('')
  const sinceStr = since || (lastDate ? format(new Date(lastDate), 'yyyy-MM-dd') : format(new Date(Date.now() - 14 * 864e5), 'yyyy-MM-dd'))

  const sections = useMemo(() => collect(tasks.data, new Date(`${sinceStr}T00:00:00`), new Date(`${until}T23:59:59`), { projectId: projectId || null }), [tasks.data, sinceStr, until, projectId])
  const generated = useMemo(() => render(sections, lang, version, excluded), [sections, lang, version, excluded])
  const text = edited ?? generated
  const count = sections.reduce((a, s) => a + s.items.filter((x) => !excluded.has(x.id)).length, 0)
  const title = `${lang === 'fr' ? 'Notes de version' : 'Release notes'}${version.trim() ? ` ${version.trim()}` : ''}`

  const reset = (fn: () => void) => { fn(); setEdited(null) }
  const toggle = (id: string) => reset(() => setExcluded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }))

  async function copy() { await navigator.clipboard.writeText(text); toast.success(t('rel.copied')) }
  function download() {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' })); a.download = `release-${version.trim() || sinceStr}.md`; a.click(); URL.revokeObjectURL(a.href)
  }
  async function saveNote() {
    if (!userId) return
    const { data, error } = await getDb().from('notes').insert({ workspace_id: ws.id, title, kind: 'doc', icon: null, content: mdToDoc(text), tags: [RELEASE_TAG], is_pinned: false, created_by: userId }).select('id').single()
    if (error) { toast.error(t('common.error')); return }
    log('note.created', 'note', (data as { id: string }).id, { title }); notes.refresh(); toast.success(t('rel.saved'))
  }
  async function post() {
    if (!userId || !channel) return
    const { error } = await getDb().from('messages').insert({ conversation_id: channel, user_id: userId, kind: 'text', content: text })
    if (error) toast.error(t('common.error')); else toast.success(t('rel.posted'))
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <HubTabs hub="product" />
      <PageHeader title={t('rel.title')} subtitle={t('rel.sub')} icon={<Rocket className="size-[18px]" />} />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('rel.version')}><Input value={version} placeholder="2.0.3" maxLength={30} onChange={(e) => reset(() => setVersion(e.target.value))} /></Field>
            <Field label={t('rel.lang')}><Select value={lang} onChange={(e) => reset(() => setLang(e.target.value as RnLang))}><option value="fr">Français</option><option value="en">English</option></Select></Field>
            <Field label={t('rel.since')} hint={lastDate && !since ? t('rel.sinceHint') : undefined}><Input type="date" value={sinceStr} max={until} onChange={(e) => reset(() => setSince(e.target.value))} /></Field>
            <Field label={t('rel.until')}><Input type="date" value={until} min={sinceStr} onChange={(e) => reset(() => setUntil(e.target.value))} /></Field>
          </div>
          <Field className="mt-3" label={t('common.project')}><Select value={projectId} onChange={(e) => reset(() => setProjectId(e.target.value))}><option value="">{t('rel.allProjects')}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>

          <h2 className="mb-2 mt-6 text-sm font-semibold">{t('rel.included')} <span className="font-normal text-text-3">{count}</span></h2>
          {sections.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-text-3">{t('rel.noneInRange')}</p> : (
            <div className="space-y-4">
              {sections.map((s) => (
                <div key={s.key}>
                  <div className="mb-1 text-xs font-medium text-text-3">{t(`rel.sec.${s.key}`)}</div>
                  <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                    {s.items.map((x) => (
                      <li key={x.id}><label className="flex cursor-pointer items-center gap-3 border-b border-border/60 px-3.5 py-2.5 last:border-0 hover:bg-surface-2">
                        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!excluded.has(x.id)} onChange={() => toggle(x.id)} aria-label={x.title} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px]">{x.title}</span></label></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{t('rel.preview')}</h2>{edited !== null && <button className="text-xs text-accent-ink hover:underline" onClick={() => setEdited(null)}>{t('rel.regenerate')}</button>}</div>
          <Textarea aria-label={t('rel.preview')} rows={14} className="font-mono text-[13px] leading-relaxed" value={text} onChange={(e) => setEdited(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={copy}><Copy className="size-4" />{t('rel.copy')}</Button>
            <Button onClick={download}><Download className="size-4" />.md</Button>
            {canWrite && <Button variant="primary" onClick={saveNote} disabled={!count && edited === null}><Save className="size-4" />{t('rel.saveNote')}</Button>}
          </div>
          {canWrite && channels.data.length > 0 && (
            <div className="mt-4 flex gap-2 border-t border-border pt-4">
              <Select aria-label={t('rel.channel')} value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">{t('rel.channel')}</option>{channels.data.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}</Select>
              <Button onClick={post} disabled={!channel}><MessageSquare className="size-4" />{t('rel.post')}</Button>
            </div>
          )}
        </div>
      </div>

      <h2 className="mb-2 mt-10 text-sm font-semibold">{t('rel.history')}</h2>
      {releases.length === 0 ? <EmptyState icon={<FileText className="size-5" />} title={t('rel.noHistory')} hint={t('rel.noHistoryHint')} className="py-8" /> : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {releases.map((n) => <li key={n.id}><Link href={`/app/${ws.slug}/notes/${n.id}`} className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 text-[13.5px] last:border-0 hover:bg-surface-2"><span className="flex items-center gap-2 truncate"><Check className="size-3.5 text-success" />{n.title}</span><span className="shrink-0 text-xs text-text-3">{new Date(n.created_at).toLocaleDateString(locale)}</span></Link></li>)}
        </ul>
      )}
    </div>
  )
}
