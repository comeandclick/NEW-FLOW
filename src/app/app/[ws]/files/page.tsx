'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { Download, Folder, FolderPlus, MoreHorizontal, Pencil, Search, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import { ElementFinder, IconeDossier, Visionneuse } from '@/components/common/finder'
import { Miniature } from '@/components/common/miniature'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc'
import { Dialog, Menu, MenuItem } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { MAX_FILE_BYTES, signedUrl, uploadToBucket } from '@/lib/storage'
import { useI18n } from '@/i18n/provider'
import { cn, formatBytes } from '@/lib/utils'
import type { FileRow } from '@/lib/types'


export default function FilesPage() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { ws, canWrite, nameOf, log } = useWorkspace()
  const { userId } = useSession()
  const { data, loading, refresh } = useLive<FileRow>('files', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false] })
  const [folder, setFolder] = useState('/')
  const [extraFolders, setExtraFolders] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(0)
  const [preview, setPreview] = useState<{ file: FileRow; url: string } | null>(null)
  const [dlg, setDlg] = useState<{ kind: 'folder' } | { kind: 'rename'; file: FileRow } | { kind: 'move'; file: FileRow } | null>(null)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const folders = useMemo(() => {
    const all = new Set<string>(['/', ...extraFolders, ...data.map((f) => f.folder)])
    return [...all].sort()
  }, [data, extraFolders])
  const childFolders = folders.filter((f) => f !== '/' && f.startsWith(folder === '/' ? '/' : folder + '/') && f.slice(folder === '/' ? 1 : folder.length + 1).split('/').length === 1 && f !== folder)
  const files = data.filter((f) => (q.trim() ? f.name.toLowerCase().includes(q.trim().toLowerCase()) : f.folder === folder))
  const total = data.reduce((a, f) => a + (f.size ?? 0), 0)

  const upload = useCallback(async (list: FileList | File[]) => {
    if (!userId || !canWrite) return
    const arr = Array.from(list).filter((f) => f.size <= MAX_FILE_BYTES || (toast.error(t('files.tooBig', { name: f.name })), false))
    if (!arr.length) return
    setBusy(arr.length)
    let ok = 0
    for (const f of arr) {
      try {
        const path = await uploadToBucket('files', ws.id, f, f.name)
        await getDb().from('files').insert({ workspace_id: ws.id, folder, name: f.name, size: f.size, mime_type: f.type || null, storage_path: path, uploaded_by: userId })
        log('file.uploaded', 'file', null, { title: f.name }); ok++
      } catch { toast.error(`${f.name}: ${t('common.error')}`) }
    }
    setBusy(0); refresh()
    if (ok) toast.success(t('files.uploaded', { n: ok }))
  }, [userId, canWrite, ws.id, folder, log, refresh, t])

  useEffect(() => {
    const prevent = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
    window.addEventListener('dragover', prevent); window.addEventListener('drop', prevent)
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent) }
  }, [])

  async function open(f: FileRow) {
    const url = await signedUrl('files', f.storage_path)
    setPreview({ file: f, url })
  }
  async function download(f: FileRow) {
    const url = await signedUrl('files', f.storage_path)
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: f.mime_type ?? blob.type }))
      const a = document.createElement('a'); a.href = blobUrl; a.download = f.name; a.click()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000)
    } catch {
      // Fallback : ouvre dans l'onglet courant (laisse le navigateur décider)
      const a = document.createElement('a'); a.href = url; a.download = f.name; a.click()
    }
  }
  async function remove(f: FileRow) {
    await getDb().from('files').update({ deleted_at: new Date().toISOString() }).eq('id', f.id)
    toast.success(t('files.deletedToast')); refresh()
  }
  async function submit() {
    const v = text.trim()
    if (!dlg || !v) return
    if (dlg.kind === 'folder') {
      const path = (folder === '/' ? '' : folder) + '/' + v.replace(/\//g, '-')
      setExtraFolders((x) => [...x, path]); setFolder(path)
    } else if (dlg.kind === 'rename') await getDb().from('files').update({ name: v }).eq('id', dlg.file.id)
    setDlg(null); setText(''); refresh()
  }
  const crumbs = folder === '/' ? [] : folder.slice(1).split('/')

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6"
      onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files')) setDrag(true) }} onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false) }} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files) }}>
      <PageHeader title={t('files.title')} subtitle={t('files.storage', { used: formatBytes(total) })} icon={<Folder className="size-[18px]" />}
        actions={canWrite && <><Button onClick={() => { setText(''); setDlg({ kind: 'folder' }) }} aria-label={t('files.newFolder')}><FolderPlus className="size-4" /><span className="hidden sm:inline">{t('files.newFolder')}</span></Button>
          <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
          <Button variant="primary" loading={busy > 0} onClick={() => input.current?.click()}><Upload className="size-4" />{t('files.upload')}</Button></>} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm" aria-label="Breadcrumb">
          <button onClick={() => setFolder('/')} className={cn('rounded-md px-2 py-1 hover:bg-surface-2', folder === '/' ? 'font-medium' : 'text-text-3')}>{t('files.root')}</button>
          {crumbs.map((c, i) => <span key={i} className="flex items-center gap-1 text-text-3">/<button onClick={() => setFolder('/' + crumbs.slice(0, i + 1).join('/'))} className="rounded-md px-2 py-1 hover:bg-surface-2 hover:text-text">{c}</button></span>)}
        </nav>
        <div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-text-3" /><Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('files.search')} /></div>
      </div>

      <div className={cn('relative rounded-2xl border-2 border-dashed border-transparent transition-colors', drag && 'border-accent bg-accent-soft/40')}>
        {drag && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm font-medium text-accent-ink">{t('files.drop')}</div>}
        {loading ? <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="mx-auto h-24 w-20" />)}</div>
          : childFolders.length + files.length === 0 ? <EmptyState icon={<Folder className="size-5" />} title={t('files.empty')} hint={canWrite ? t('files.emptyHint') : undefined} />
          : (
            <AnimatePresence mode="wait">
            {/* changement de dossier : la grille « s'ouvre » (zoom léger), comme dans le Finder */}
            <motion.div key={folder + '|' + q} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 2xl:grid-cols-10">
              {!q && childFolders.map((f, k) => (
                <ElementFinder key={f} i={k} icone={<IconeDossier className="h-[60px] w-[74px]" />} nom={f.split('/').pop() ?? f}
                  sous={`${data.filter((x) => x.folder === f || x.folder.startsWith(f + '/')).length} élément(s)`} onOuvrir={() => setFolder(f)} />
              ))}
              {files.map((f, k) => (
                <ElementFinder key={f.id} i={childFolders.length + k} nom={f.name} onOuvrir={() => open(f)}
                  sous={q ? `${f.folder} · ${formatBytes(f.size)}` : `${formatBytes(f.size)} · ${format(new Date(f.created_at), 'd MMM', { locale: dfl })}`}
                  icone={<Miniature path={f.storage_path} mime={f.mime_type} nom={f.name} />}
                  menu={<Menu align="end" width={190} trigger={({ toggle }) => <button onClick={toggle} className="grid size-7 place-items-center rounded-full bg-surface/90 text-text-2 shadow-sm backdrop-blur hover:text-text" aria-label={t('common.more')}><MoreHorizontal className="size-4" /></button>}>
                    {(close) => <><MenuItem icon={<Download className="size-4" />} onClick={() => { close(); void download(f) }}>{t('common.download')}</MenuItem>
                      {canWrite && <><MenuItem icon={<Pencil className="size-4" />} onClick={() => { close(); setText(f.name); setDlg({ kind: 'rename', file: f }) }}>{t('files.rename')}</MenuItem>
                        <MenuItem icon={<Folder className="size-4" />} onClick={() => { close(); setDlg({ kind: 'move', file: f }) }}>{t('files.move')}</MenuItem>
                        <MenuItem icon={<Trash2 className="size-4" />} danger onClick={() => { close(); void remove(f) }}>{t('common.delete')}</MenuItem></>}</>}
                  </Menu>} />
              ))}
            </motion.div>
            </AnimatePresence>
          )}
      </div>

      <AnimatePresence>
        {preview && <Visionneuse key={preview.file.id} titre={preview.file.name} url={preview.url} mime={preview.file.mime_type} onFermer={() => setPreview(null)}
          onTelecharger={() => void download(preview.file)} libTelecharger={t('common.download')} sansApercu={t('files.noPreview')} />}
      </AnimatePresence>
      <Dialog open={!!dlg && dlg.kind !== 'move'} onClose={() => setDlg(null)} title={dlg?.kind === 'rename' ? t('files.rename') : t('files.newFolder')} size="sm"
        footer={<><Button onClick={() => setDlg(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={submit} disabled={!text.trim()}>{t('common.save')}</Button></>}>
        <Field label={dlg?.kind === 'rename' ? t('common.name') : t('files.folderName')}><Input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></Field>
      </Dialog>
      <Dialog open={dlg?.kind === 'move'} onClose={() => setDlg(null)} title={t('files.moveTo')} size="sm">
        <ul className="space-y-1">{folders.map((f) => <li key={f}><button onClick={async () => { if (dlg?.kind === 'move') { await getDb().from('files').update({ folder: f }).eq('id', dlg.file.id); setDlg(null); refresh() } }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"><Folder className="size-4 text-accent-ink" />{f === '/' ? t('files.root') : f}</button></li>)}</ul>
      </Dialog>
    </div>
  )
}
