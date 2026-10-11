'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { File as FileIcon, FileText, Film, Image as ImageIcon, Link2, Music, Plus, StickyNote, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { uid, cn, formatBytes } from '@/lib/utils'
import type { RefItem, RefKind } from '@/lib/studio/types'

const MAX = 200 * 1024 * 1024

export function kindOfFile(f: File): RefKind {
  if (f.type.startsWith('video/')) return 'video'
  if (f.type.startsWith('image/')) return /screen|capture|screenshot/i.test(f.name) ? 'screen' : 'image'
  return 'file'
}

export const refIcon = (k: RefKind | string) => (k === 'video' || k === 'render-video' ? Film : k === 'image' || k === 'screen' || k === 'render-image' ? ImageIcon : k === 'link' || k === 'site' ? Link2 : k === 'note' ? StickyNote : k === 'audio' ? Music : k === 'file' ? FileText : FileIcon)

type Copy = { drop: string; addLink: string; linkPlaceholder: string; addNote: string; notePlaceholder: string; remove: string }

/** Zone d'envoi : fichiers, vidéos, captures (glisser, coller ou parcourir), liens et notes. Les fichiers restent dans le navigateur (aperçu) : seule leur fiche est enregistrée. */
export function RefDropzone({ refs, onChange, copy, className }: { refs: RefItem[]; onChange: (r: RefItem[]) => void; copy: Copy; className?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [mode, setMode] = useState<null | 'link' | 'note'>(null)
  const [text, setText] = useState('')
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const urls = useRef<Record<string, string>>({})
  const latest = useRef(refs)
  useEffect(() => { latest.current = refs }, [refs])
  useEffect(() => { urls.current = previews }, [previews])
  useEffect(() => () => { Object.values(urls.current).forEach((u) => URL.revokeObjectURL(u)) }, [])

  const addFiles = useCallback((list: FileList | File[]) => {
    const add: RefItem[] = []
    const pv: Record<string, string> = {}
    for (const f of Array.from(list)) {
      if (f.size > MAX) continue
      const id = uid()
      if (f.type.startsWith('image/') || f.type.startsWith('video/')) pv[id] = URL.createObjectURL(f)
      add.push({ id, kind: kindOfFile(f), name: f.name, size: f.size, mime: f.type })
    }
    if (add.length) { setPreviews((p) => ({ ...p, ...pv })); onChange([...latest.current, ...add]) }
  }, [onChange])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (!files.length) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') && !(t as HTMLInputElement).dataset.pasteOk) { /* texte collé normalement */ }
      addFiles(files.map((f, i) => new File([f], f.name && f.name !== 'image.png' ? f.name : `capture-${Date.now()}-${i + 1}.png`, { type: f.type })))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  const commit = () => {
    const v = text.trim()
    if (!v) return
    if (mode === 'link') onChange([...refs, { id: uid(), kind: 'link', name: v.replace(/^https?:\/\//, ''), url: /^https?:\/\//.test(v) ? v : `https://${v}` }])
    if (mode === 'note') onChange([...refs, { id: uid(), kind: 'note', name: v.slice(0, 40), note: v }])
    setText(''); setMode(null)
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div
        role="button" tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click() } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
        className={cn('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition-colors',
          drag ? 'border-accent bg-accent-soft' : 'border-border-strong bg-surface-2/50 hover:bg-surface-2')}
      >
        <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-text-3"><Upload className="size-4" /></span>
        <p className="max-w-sm text-[13px] text-text-2">{copy.drop}</p>
        <input ref={input} type="file" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} aria-label={copy.drop} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => { setMode(mode === 'link' ? null : 'link'); setText('') }}><Link2 className="size-3.5" />{copy.addLink}</Button>
        <Button size="sm" variant="outline" onClick={() => { setMode(mode === 'note' ? null : 'note'); setText('') }}><StickyNote className="size-3.5" />{copy.addNote}</Button>
      </div>

      {mode && (
        <div className="flex gap-2 animate-fade-in">
          <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'link' ? copy.linkPlaceholder : copy.notePlaceholder}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }} aria-label={mode === 'link' ? copy.addLink : copy.addNote} />
          <Button variant="primary" size="md" onClick={commit} disabled={!text.trim()} aria-label="OK"><Plus className="size-4" /></Button>
        </div>
      )}

      {refs.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {refs.map((r) => {
            const Icon = refIcon(r.kind)
            const pv = previews[r.id]
            return (
              <li key={r.id} className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-2">
                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-3 text-text-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {pv && r.kind !== 'video' ? <img src={pv} alt="" className="size-full object-cover" /> : pv && r.kind === 'video' ? <video src={pv} className="size-full object-cover" muted /> : <Icon className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text">{r.kind === 'note' ? r.note : r.name}</span>
                  <span className="block truncate text-[11px] text-text-3">{r.kind === 'link' ? r.url : r.kind === 'note' ? 'Note' : `${r.kind === 'video' ? 'Vidéo' : r.kind === 'image' ? 'Image' : r.kind === 'screen' ? 'Capture' : 'Fichier'} · ${formatBytes(r.size)}`}</span>
                </span>
                <button type="button" className="rounded-md p-1.5 text-text-3 hover:bg-surface-2 hover:text-text" aria-label={`${copy.remove} ${r.name}`}
                  onClick={() => { const u = previews[r.id]; if (u) { URL.revokeObjectURL(u); setPreviews((p) => { const n = { ...p }; delete n[r.id]; return n }) } onChange(refs.filter((x) => x.id !== r.id)) }}>
                  <X className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
