'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, FileUp, Languages, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader } from '@/components/ui/misc'
import { Dialog, Menu, MenuItem } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { coverage, emptyDoc, exportARB, exportCSV, exportFlat, importFlat, isRtl, issues, LOCALE_RE, mergeDocs, parseDoc, parseImport, type L10nDoc } from '@/lib/l10n'
import { useI18n } from '@/i18n/provider'
import { cn, uid } from '@/lib/utils'
import type { FileRow } from '@/lib/types'

const FOLDER = '/Localisation'
const SUFFIX = '.l10n.json'
const PAGE = 40

function save(name: string, text: string, mime = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` })); a.download = name; a.click(); URL.revokeObjectURL(a.href)
}

/** Translation sets for an app: every text in every language, with missing / too-long / broken-placeholder checks and file import/export. */
export default function LocalizationPage() {
  const { t } = useI18n()
  const { ws, canWrite } = useWorkspace()
  const { userId } = useSession()
  const files = useLive<FileRow>('files', { eq: { workspace_id: ws.id, folder: FOLDER }, is: { deleted_at: null }, order: ['created_at', true] })
  const sets = useMemo(() => files.data.filter((f) => f.name.endsWith(SUFFIX)), [files.data])
  const [fileId, setFileId] = useState<string | null>(null)
  const file = sets.find((f) => f.id === fileId) ?? sets[0] ?? null
  const [doc, setDoc] = useState<L10nDoc | null>(null)
  const [status, setStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState('all') // all | missing:<locale> | issues
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('App')
  const [newSource, setNewSource] = useState('fr')
  const [newLocales, setNewLocales] = useState('en, ar')
  const [addKey, setAddKey] = useState<string | null>(null)
  const [pending, setPending] = useState<{ locale: string; flat: Record<string, string>; name: string }[] | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef<L10nDoc | null>(null)
  useEffect(() => { docRef.current = doc }, [doc])

  // Load the selected set from storage.
  useEffect(() => {
    if (!file) { setDoc(null); return }
    let alive = true
    setDoc(null); setStatus('idle')
    getDb().storage.from('files').download(file.storage_path).then(async ({ data }) => {
      if (!alive) return
      const parsed = data ? parseDoc(await data.text()) : null
      if (!parsed) { toast.error(t('l10n.badFile')); return }
      setDoc(parsed)
    })
    return () => { alive = false }
  }, [file?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async () => {
    const local = docRef.current
    if (!local || !file || !canWrite) return
    setStatus('saving')
    try {
      // Merge with what others saved meanwhile, so nobody's edits are lost.
      const { data: remoteBlob } = await getDb().storage.from('files').download(file.storage_path)
      const remote = remoteBlob ? parseDoc(await remoteBlob.text()) : null
      const merged = remote ? mergeDocs(local, remote) : local
      const body = JSON.stringify(merged)
      const { error } = await getDb().storage.from('files').upload(file.storage_path, new Blob([body], { type: 'application/json' }), { upsert: true, contentType: 'application/json' })
      if (error) throw error
      await getDb().from('files').update({ size: body.length }).eq('id', file.id)
      if (JSON.stringify(docRef.current) === JSON.stringify(local)) setDoc(merged)
      setStatus('saved'); setSavedAt(new Date())
    } catch { setStatus('error') }
  }, [file, canWrite])

  const edit = useCallback((fn: (d: L10nDoc) => L10nDoc) => {
    setDoc((d) => (d ? fn(d) : d)); setStatus('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 1400)
  }, [flush])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const setValue = (key: string, locale: string, value: string) => edit((d) => ({ ...d, keys: { ...d.keys, [key]: { ...d.keys[key], v: { ...d.keys[key].v, [locale]: value }, u: new Date().toISOString() } } }))
  const patchEntry = (key: string, p: Partial<L10nDoc['keys'][string]>) => edit((d) => ({ ...d, keys: { ...d.keys, [key]: { ...d.keys[key], ...p, u: new Date().toISOString() } } }))
  const removeKey = (key: string) => edit((d) => { const keys = { ...d.keys }; delete keys[key]; return { ...d, keys } })

  async function create() {
    const locales = Array.from(new Set(newLocales.split(/[,\s]+/).map((s) => s.trim()).filter((s) => LOCALE_RE.test(s))))
    if (!userId || !newName.trim() || !LOCALE_RE.test(newSource)) return
    const d = emptyDoc(newSource.trim(), locales)
    const name = `${newName.trim().replace(/[^\w.\- ]+/g, '').slice(0, 40)}${SUFFIX}`
    const path = `${ws.id}/l10n/${uid().slice(0, 8)}-${name.replace(/[^\w.\-]+/g, '_')}`
    const body = JSON.stringify(d)
    const up = await getDb().storage.from('files').upload(path, new Blob([body], { type: 'application/json' }), { contentType: 'application/json', upsert: false })
    if (up.error) { toast.error(t('common.error')); return }
    const { data, error } = await getDb().from('files').insert({ workspace_id: ws.id, folder: FOLDER, name, size: body.length, mime_type: 'application/json', storage_path: path, uploaded_by: userId }).select('id').single()
    if (error) { toast.error(t('common.error')); return }
    setCreating(false); files.refresh(); setFileId((data as { id: string }).id)
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return
    const out: { locale: string; flat: Record<string, string>; name: string }[] = []
    for (const f of Array.from(list)) {
      const parsed = parseImport(await f.text(), f.name)
      if (!parsed) { toast.error(`${f.name}: ${t('l10n.badFile')}`); continue }
      out.push({ locale: parsed.locale ?? '', flat: parsed.flat, name: f.name })
    }
    if (out.length) setPending(out)
    if (input.current) input.current.value = ''
  }
  function applyImport() {
    if (!pending || !doc) return
    if (pending.some((p) => !LOCALE_RE.test(p.locale))) { toast.error(t('l10n.needLocale')); return }
    let a = 0, u = 0
    edit((d) => pending.reduce((acc, p) => { const r = importFlat(acc, p.locale, p.flat); a += r.added; u += r.updated; return r.doc }, d))
    setPending(null); toast.success(t('l10n.imported', { a, u }))
  }

  const cov = useMemo(() => (doc ? coverage(doc) : {}), [doc])
  const keys = useMemo(() => {
    if (!doc) return []
    const s = q.trim().toLowerCase()
    return Object.keys(doc.keys).sort().filter((k) => {
      if (s && !k.toLowerCase().includes(s) && !Object.values(doc.keys[k].v).some((v) => v.toLowerCase().includes(s))) return false
      if (focus.startsWith('missing:')) return !(doc.keys[k].v[focus.slice(8)] ?? '').trim()
      if (focus === 'issues') return doc.locales.some((l) => issues(doc, k, l).some((i) => i !== 'missing'))
      return true
    })
  }, [doc, q, focus])
  useEffect(() => setPage(0), [q, focus, file?.id])
  const pages = Math.max(1, Math.ceil(keys.length / PAGE))

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <HubTabs hub="product" />
      <PageHeader title={t('l10n.title')} subtitle={t('l10n.sub')} icon={<Languages className="size-[18px]" />} actions={canWrite && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" />{t('l10n.new')}</Button>} />

      {!file ? <EmptyState icon={<Languages className="size-5" />} title={t('l10n.empty')} hint={t('l10n.emptyHint')} action={canWrite ? <Button variant="primary" onClick={() => setCreating(true)}>{t('l10n.new')}</Button> : undefined} /> : !doc ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-2" aria-busy />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {sets.length > 1 && <Select aria-label={t('l10n.set')} className="w-auto" value={file.id} onChange={(e) => setFileId(e.target.value)}>{sets.map((f) => <option key={f.id} value={f.id}>{f.name.replace(SUFFIX, '')}</option>)}</Select>}
            <span className="text-xs text-text-3" role="status">{status === 'saving' ? t('l10n.saving') : status === 'dirty' ? t('l10n.unsaved') : status === 'error' ? t('l10n.saveError') : savedAt ? t('l10n.savedAt', { h: savedAt.toLocaleTimeString() }) : ''}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              {canWrite && <><input ref={input} type="file" multiple accept=".json,.arb,.csv" hidden onChange={(e) => void onFiles(e.target.files)} /><Button onClick={() => input.current?.click()}><FileUp className="size-4" />{t('l10n.import')}</Button></>}
              <Menu align="end" width={250} trigger={({ toggle }) => <Button onClick={toggle}><Download className="size-4" />{t('l10n.export')}</Button>}>
                {(close) => (
                  <>
                    {doc.locales.map((l) => (
                      <div key={l}>
                        <MenuItem onClick={() => { save(`${l}.json`, JSON.stringify(exportFlat(doc, l, { translatedOnly: true }), null, 2)); close() }}>{l.toUpperCase()} · JSON</MenuItem>
                        <MenuItem onClick={() => { save(`app_${l}.arb`, exportARB(doc, l)); close() }}>{l.toUpperCase()} · ARB (Flutter)</MenuItem>
                      </div>
                    ))}
                    <MenuItem onClick={() => { save('translations.csv', exportCSV(doc), 'text/csv'); close() }}>CSV · {t('l10n.allLocales')}</MenuItem>
                    <MenuItem onClick={() => { save(file.name, JSON.stringify(doc, null, 2)); close() }}>{t('l10n.fullFile')}</MenuItem>
                  </>
                )}
              </Menu>
            </div>
          </div>

          <div className="mb-5 grid gap-2 sm:grid-cols-3">
            {doc.locales.map((l) => {
              const c = cov[l]
              return (
                <button key={l} onClick={() => setFocus(focus === `missing:${l}` ? 'all' : `missing:${l}`)} aria-pressed={focus === `missing:${l}`}
                  className={cn('rounded-xl border bg-surface p-3.5 text-left transition-colors hover:border-border-strong', focus === `missing:${l}` ? 'border-accent' : 'border-border')}>
                  <div className="flex items-center justify-between text-sm"><span className="font-medium uppercase">{l}{l === doc.source && <span className="ml-1.5 text-[11px] font-normal normal-case text-text-3">{t('l10n.source')}</span>}</span><span className="tabular-nums text-text-2">{c.pct}%</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={l} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.pct}><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${c.pct}%` }} /></div>
                  <div className="mt-1.5 text-xs text-text-3">{c.missing ? t('l10n.missing', { n: c.missing }) : t('l10n.complete')}</div>
                </button>
              )
            })}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" /><Input aria-label={t('common.search')} className="pl-9" placeholder={t('l10n.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <Select aria-label={t('l10n.filter')} className="w-auto" value={focus} onChange={(e) => setFocus(e.target.value)}>
              <option value="all">{t('l10n.f.all')}</option>
              {doc.locales.map((l) => <option key={l} value={`missing:${l}`}>{t('l10n.f.missing', { l: l.toUpperCase() })}</option>)}
              <option value="issues">{t('l10n.f.issues')}</option>
            </Select>
            {canWrite && <Button onClick={() => setAddKey('')}><Plus className="size-4" />{t('l10n.addKey')}</Button>}
          </div>

          {keys.length === 0 ? <EmptyState icon={<Languages className="size-5" />} title={Object.keys(doc.keys).length ? t('l10n.noMatch') : t('l10n.noKeys')} hint={Object.keys(doc.keys).length ? undefined : t('l10n.noKeysHint')} className="py-10" /> : (
            <ul className="space-y-3">
              {keys.slice(page * PAGE, (page + 1) * PAGE).map((k) => {
                const e = doc.keys[k]
                return (
                  <li key={k} className="rounded-xl border border-border bg-surface p-3.5">
                    <div className="mb-2.5 flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text-2" title={k}>{k}</code>
                      <label className="flex items-center gap-1 text-xs text-text-3">{t('l10n.max')}<input type="number" min={0} aria-label={`${t('l10n.max')} ${k}`} disabled={!canWrite} value={e.max ?? ''} onChange={(ev) => patchEntry(k, { max: ev.target.value ? Number(ev.target.value) : undefined })} className="h-7 w-14 rounded-md border border-border bg-surface-2 px-1.5 text-center text-xs outline-none focus:border-accent" /></label>
                      {canWrite && <button onClick={() => removeKey(k)} aria-label={`${t('common.delete')} ${k}`} className="grid size-7 place-items-center rounded-md text-text-3 hover:bg-surface-2 hover:text-danger"><Trash2 className="size-3.5" /></button>}
                    </div>
                    <div className={cn('grid gap-2.5', doc.locales.length > 2 ? 'md:grid-cols-3' : doc.locales.length === 2 ? 'md:grid-cols-2' : '')}>
                      {doc.locales.map((l) => {
                        const iss = issues(doc, k, l), val = e.v[l] ?? ''
                        return (
                          <label key={l} className="block">
                            <span className="mb-1 flex items-center justify-between text-[11px] font-medium uppercase text-text-3"><span>{l}</span>
                              <span className="flex items-center gap-1.5 normal-case">
                                {e.max ? <span className={cn('tabular-nums', iss.includes('tooLong') && 'font-semibold text-danger')}>{val.length}/{e.max}</span> : null}
                                {iss.includes('placeholders') && <span className="inline-flex items-center gap-0.5 text-warning"><AlertTriangle className="size-3" />{t('l10n.placeholders')}</span>}
                              </span></span>
                            <textarea value={val} rows={val.length > 70 ? 3 : 2} dir={isRtl(l) ? 'rtl' : 'ltr'} readOnly={!canWrite} onChange={(ev) => setValue(k, l, ev.target.value)} aria-label={`${k} (${l})`}
                              className={cn('w-full resize-y rounded-lg border bg-surface-2/60 px-2.5 py-1.5 text-[13.5px] leading-snug outline-none transition-colors focus:border-accent focus:bg-surface', iss.includes('missing') ? 'border-warning/60' : iss.some((i) => i !== 'missing') ? 'border-danger/60' : 'border-border-strong')} />
                          </label>
                        )
                      })}
                    </div>
                    <input value={e.note ?? ''} readOnly={!canWrite} onChange={(ev) => patchEntry(k, { note: ev.target.value })} placeholder={t('l10n.notePh')} aria-label={`${t('l10n.note')} ${k}`} className="mt-2.5 w-full rounded-md bg-transparent px-1 py-0.5 text-xs text-text-2 outline-none placeholder:text-text-3 focus:bg-surface-2" />
                  </li>
                )
              })}
            </ul>
          )}
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t('cal.prev')}</Button><span className="tabular-nums text-text-3">{page + 1} / {pages}</span><Button size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>{t('cal.next')}</Button>
            </div>
          )}
        </>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title={t('l10n.new')} size="sm" footer={<><Button onClick={() => setCreating(false)}>{t('common.cancel')}</Button><Button variant="primary" onClick={create} disabled={!newName.trim() || !LOCALE_RE.test(newSource)}>{t('common.create')}</Button></>}>
        <div className="space-y-4">
          <Field label={t('l10n.name')}><Input autoFocus value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} /></Field>
          <Field label={t('l10n.sourceLocale')} hint={t('l10n.localeHint')}><Input value={newSource} maxLength={10} onChange={(e) => setNewSource(e.target.value)} /></Field>
          <Field label={t('l10n.otherLocales')}><Input value={newLocales} onChange={(e) => setNewLocales(e.target.value)} placeholder="en, ar" /></Field>
        </div>
      </Dialog>

      <Dialog open={addKey !== null} onClose={() => setAddKey(null)} title={t('l10n.addKey')} size="sm" footer={<><Button onClick={() => setAddKey(null)}>{t('common.cancel')}</Button>
        <Button variant="primary" disabled={!addKey?.trim() || !!doc?.keys[addKey?.trim() ?? '']} onClick={() => { const k = addKey!.trim(); edit((d) => ({ ...d, keys: { ...d.keys, [k]: { v: {}, u: new Date().toISOString() } } })); setQ(k); setAddKey(null) }}>{t('common.add')}</Button></>}>
        <Field label={t('l10n.key')} hint={t('l10n.keyHint')}><Input autoFocus value={addKey ?? ''} placeholder="home.title" onChange={(e) => setAddKey(e.target.value.replace(/\s+/g, '_'))} /></Field>
      </Dialog>

      <Dialog open={!!pending} onClose={() => setPending(null)} title={t('l10n.import')} footer={<><Button onClick={() => setPending(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={applyImport}>{t('l10n.import')}</Button></>}>
        <ul className="space-y-3">
          {pending?.map((p, i) => (
            <li key={p.name + i} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.name}</div><div className="text-xs text-text-3">{t('l10n.keysCount', { n: Object.keys(p.flat).length })}</div></div>
              <Input aria-label={t('l10n.locale')} className="w-24" value={p.locale} placeholder="fr" onChange={(e) => setPending((cur) => cur!.map((x, j) => (j === i ? { ...x, locale: e.target.value.trim() } : x)))} />
              {!LOCALE_RE.test(p.locale) && <Badge color="var(--warning)">{t('l10n.locale')}</Badge>}
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  )
}
