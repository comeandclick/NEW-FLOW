'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Circle, PenTool, Square, StickyNote, Trash2, Type } from 'lucide-react'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/misc'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { uid, cn } from '@/lib/utils'
import { useI18n } from '@/i18n/provider'
import type { Whiteboard, WhiteboardItem } from '@/lib/types'

const COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa', '#e5e7eb']

export default function WhiteboardPage() {
  const { t } = useI18n()
  const { ws, canWrite } = useWorkspace()
  const { userId } = useSession()
  const [board, setBoard] = useState<Whiteboard | null | undefined>(undefined)
  const [items, setItems] = useState<WhiteboardItem[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const drag = useRef<{ id: string; dx: number; dy: number; mode: 'move' | 'resize' } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getDb().from('whiteboards').select('*').eq('workspace_id', ws.id).is('deleted_at', null).order('created_at', { ascending: true }).limit(1).then(async ({ data }) => {
      const b = (data as Whiteboard[] | null)?.[0]
      if (b) { setBoard(b); setItems(b.items) }
      else if (canWrite && userId) {
        const { data: row } = await getDb().from('whiteboards').insert({ workspace_id: ws.id, name: t('wb.title'), items: [], created_by: userId }).select().single()
        setBoard(row as Whiteboard); setItems([])
      } else setBoard(null)
    })
  }, [ws.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((next: WhiteboardItem[]) => {
    if (!board) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void getDb().from('whiteboards').update({ items: next }).eq('id', board.id), 500)
  }, [board])
  const update = (next: WhiteboardItem[]) => { setItems(next); persist(next) }

  const add = (type: WhiteboardItem['type']) => {
    const el = stage.current
    const n: WhiteboardItem = { id: uid().slice(0, 8), type, x: (el?.scrollLeft ?? 0) + 80 + Math.random() * 120, y: (el?.scrollTop ?? 0) + 80 + Math.random() * 100, w: type === 'text' ? 200 : type === 'sticky' ? 190 : 160, h: type === 'text' ? 48 : type === 'sticky' ? 130 : 110, text: type === 'sticky' ? '' : type === 'text' ? t('wb.text') : '', color: type === 'text' ? 'transparent' : COLORS[Math.floor(Math.random() * 4)] }
    update([...items, n]); setSel(n.id); if (type === 'sticky' || type === 'text') setEditing(n.id)
  }
  const down = (e: React.PointerEvent, it: WhiteboardItem, mode: 'move' | 'resize') => {
    if (!canWrite || editing === it.id) return
    e.stopPropagation(); setSel(it.id)
    const r = stage.current!.getBoundingClientRect()
    drag.current = { id: it.id, mode, dx: e.clientX - r.left + stage.current!.scrollLeft - (mode === 'move' ? it.x : it.w), dy: e.clientY - r.top + stage.current!.scrollTop - (mode === 'move' ? it.y : it.h) }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return
    const r = stage.current!.getBoundingClientRect()
    const x = e.clientX - r.left + stage.current!.scrollLeft - d.dx
    const y = e.clientY - r.top + stage.current!.scrollTop - d.dy
    setItems((list) => list.map((it) => (it.id === d.id ? (d.mode === 'move' ? { ...it, x: Math.max(0, x), y: Math.max(0, y) } : { ...it, w: Math.max(60, x), h: Math.max(40, y) }) : it)))
  }
  const up = () => { if (drag.current) { drag.current = null; persist(items) } }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !editing && canWrite && !(e.target as HTMLElement).closest('input,textarea')) { update(items.filter((i) => i.id !== sel)); setSel(null) } }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })

  if (board === undefined) return <div className="p-6"><Skeleton className="h-[60dvh]" /></div>
  const tools: [WhiteboardItem['type'], typeof Square, string][] = [['sticky', StickyNote, t('wb.sticky')], ['text', Type, t('wb.text')], ['rect', Square, t('wb.rect')], ['ellipse', Circle, t('wb.ellipse')]]
  return (
    <div className="flex h-full flex-col">
      <HubTabs hub="notes" className="mb-0 px-4" />
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent-ink"><PenTool className="size-4" /></span>
        <h1 className="mr-2 text-[15px] font-semibold">{board?.name ?? t('wb.title')}</h1>
        {canWrite && tools.map(([type, Icon, label]) => <Button key={type} size="sm" onClick={() => add(type)} aria-label={label}><Icon className="size-4" /><span className="hidden sm:inline">{label}</span></Button>)}
        {sel && canWrite && <>
          <span className="mx-1 h-5 w-px bg-border" />
          <div className="flex gap-1">{COLORS.map((c) => <button key={c} aria-label={c} onClick={() => update(items.map((i) => (i.id === sel ? { ...i, color: c } : i)))} className="size-5 rounded-full border border-border-strong" style={{ background: c }} />)}</div>
          <Button size="icon" variant="ghost" onClick={() => { update(items.filter((i) => i.id !== sel)); setSel(null) }} aria-label={t('wb.delete')}><Trash2 className="size-4" /></Button></>}
        <span className="ml-auto hidden text-xs text-text-3 md:block">{t('wb.hint')}</span>
      </div>
      <div ref={stage} className="relative min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto bg-bg-subtle [background-image:radial-gradient(var(--border-strong)_1px,transparent_1px)] [background-size:24px_24px]"
        onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerDown={() => { setSel(null); setEditing(null) }}>
        <div className="relative" style={{ width: 2400, height: 1600 }}>
          {items.length === 0 && <p className="absolute left-1/2 top-40 -translate-x-1/2 text-sm text-text-3">{t('wb.empty')}</p>}
          {items.map((it) => (
            <div key={it.id} onPointerDown={(e) => down(e, it, 'move')} onDoubleClick={() => canWrite && setEditing(it.id)}
              className={cn('absolute select-none shadow-md', canWrite && 'cursor-grab active:cursor-grabbing', sel === it.id && 'outline outline-2 outline-offset-2 outline-accent', it.type === 'sticky' && 'rounded-md', it.type === 'rect' && 'rounded-xl', it.type === 'ellipse' && 'rounded-[50%]', it.type === 'text' && 'shadow-none')}
              style={{ left: it.x, top: it.y, width: it.w, height: it.h, background: it.color, touchAction: 'none', color: it.type === 'text' ? 'var(--text)' : '#1f2937' }}>
              {editing === it.id ? <textarea autoFocus defaultValue={it.text} onBlur={(e) => { update(items.map((i) => (i.id === it.id ? { ...i, text: e.target.value } : i))); setEditing(null) }}
                onPointerDown={(e) => e.stopPropagation()} className="size-full resize-none bg-transparent p-3 text-sm outline-none" />
                : <div className={cn('size-full overflow-hidden whitespace-pre-wrap break-words p-3 text-sm', it.type === 'text' && 'text-lg font-medium', (it.type === 'ellipse') && 'flex items-center justify-center text-center')}>{it.text}</div>}
              {sel === it.id && canWrite && <span onPointerDown={(e) => down(e, it, 'resize')} className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-nwse-resize rounded-sm border-2 border-accent bg-surface" />}
            </div>))}
        </div>
      </div>
    </div>
  )
}
