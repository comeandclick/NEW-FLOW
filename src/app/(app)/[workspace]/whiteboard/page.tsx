'use client'

import { use, useEffect, useRef, useState, useCallback } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  MousePointer2, StickyNote, Square, Circle, Minus, Pencil as PencilIcon,
  Trash2, ZoomIn, ZoomOut, RotateCcw, Triangle, ArrowRight, Type,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WhiteboardItem } from '@/types/database'

interface Props { params: Promise<{ workspace: string }> }

type Tool = 'select' | 'note' | 'rect' | 'circle' | 'triangle' | 'pencil' | 'arrow' | 'text' | 'eraser'
type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'

const NOTE_COLORS = [
  '#fef08a', '#86efac', '#93c5fd', '#f9a8d4', '#fca5a5', '#c4b5fd', '#fdba74', '#e2e8f0',
]

interface CanvasItem extends WhiteboardItem {
  isEditing?: boolean
}

interface ResizeState {
  id: string; handle: ResizeHandle
  startX: number; startY: number
  origX: number; origY: number; origW: number; origH: number
}

interface DragState {
  id: string; startX: number; startY: number; origX: number; origY: number
  multiIds?: string[]; multiOrigPositions?: { id: string; x: number; y: number }[]
}

interface SelectBox { startX: number; startY: number; x: number; y: number; w: number; h: number }

export default function WhiteboardPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const canvasRef = useRef<HTMLDivElement>(null)

  const [items, setItems] = useState<CanvasItem[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const draggingRef = useRef<DragState | null>(null)
  const panningRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizingRef = useRef<ResizeState | null>(null)
  const drawingRef = useRef<{ points: [number, number][] } | null>(null)
  const arrowStartRef = useRef<string | null>(null)
  const selectBoxRef = useRef<SelectBox | null>(null)
  const [drawingPath, setDrawingPath] = useState<string>('')
  const [selectBox, setSelectBox] = useState<SelectBox | null>(null)

  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemsRef = useRef<CanvasItem[]>([])

  // Keep ref in sync
  useEffect(() => { itemsRef.current = items }, [items])

  useEffect(() => {
    if (!currentWorkspace?.id) return
    getSupabaseClient()
      .from('whiteboard_items')
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .eq('board_id', 'main')
      .order('z_index', { ascending: true })
      .then(({ data }) => setItems((data ?? []) as CanvasItem[]))
  }, [currentWorkspace?.id])

  function scheduleSave(current: CanvasItem[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persistItems(current), 1200)
  }

  async function persistItems(current: CanvasItem[]) {
    if (!currentWorkspace?.id || saving) return
    setSaving(true)
    if (current.length > 0) {
      const payload = current.map(({ isEditing, ...item }) => ({
        ...item,
        workspace_id: currentWorkspace.id!,
        board_id: 'main',
        created_by: user?.id ?? null,
      }))
      await getSupabaseClient().from('whiteboard_items').upsert(payload, { onConflict: 'id' })
        .then(r => { if (r.error) toast.error('Erreur de sauvegarde') })
    }
    setSaving(false)
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  function canvasCoords(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (clientX - rect.left - pan.x) / scale,
      y: (clientY - rect.top - pan.y) / scale,
    }
  }

  // ── Add items ──────────────────────────────────────────────────────────────
  function addItem(type: CanvasItem['type'], clientX: number, clientY: number, extra?: Partial<CanvasItem>) {
    const { x, y } = canvasCoords(clientX, clientY)
    const defaults: Record<string, { w: number; h: number }> = {
      note: { w: 200, h: 120 }, rect: { w: 140, h: 90 }, circle: { w: 100, h: 100 },
      triangle: { w: 120, h: 100 }, text: { w: 200, h: 60 },
    }
    const sz = defaults[type] ?? { w: 120, h: 80 }
    const newItem: CanvasItem = {
      id: crypto.randomUUID(),
      workspace_id: currentWorkspace?.id ?? '',
      board_id: 'main',
      type,
      content: '',
      x: x - sz.w / 2,
      y: y - sz.h / 2,
      width: sz.w,
      height: sz.h,
      color: selectedColor,
      style: { stroke: '#6366f1', strokeWidth: 2 },
      from_id: null,
      to_id: null,
      z_index: itemsRef.current.length,
      created_by: user?.id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      isEditing: type === 'note' || type === 'text',
      ...extra,
    }
    const next = [...itemsRef.current, newItem]
    setItems(next)
    setSelectedIds(new Set([newItem.id]))
    scheduleSave(next)
  }

  function deleteSelected() {
    if (!selectedIds.size) return
    const ids = [...selectedIds]
    const next = itemsRef.current.filter(it => !ids.includes(it.id))
    setItems(next)
    setSelectedIds(new Set())
    Promise.all(ids.map(id => getSupabaseClient().from('whiteboard_items').delete().eq('id', id))).catch(console.error)
    scheduleSave(next)
  }

  function deleteItem(id: string) {
    const next = itemsRef.current.filter(it => it.id !== id)
    setItems(next)
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s })
    getSupabaseClient().from('whiteboard_items').delete().eq('id', id).then(() => {})
    scheduleSave(next)
  }

  function updateContent(id: string, content: string) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, content, updated_at: new Date().toISOString() } : it))
  }

  function finishEdit(id: string) {
    const next = itemsRef.current.map(it => it.id === id ? { ...it, isEditing: false } : it)
    setItems(next)
    scheduleSave(next)
  }

  // ── Pointer events ─────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent, itemId?: string, resizeHandle?: ResizeHandle) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)

    if (tool === 'eraser' && itemId) { deleteItem(itemId); return }

    if (tool === 'arrow') {
      if (itemId) {
        if (!arrowStartRef.current) {
          arrowStartRef.current = itemId
          setSelectedIds(new Set([itemId]))
        } else if (arrowStartRef.current !== itemId) {
          // Create arrow connector
          const next = [...itemsRef.current, {
            id: crypto.randomUUID(),
            workspace_id: currentWorkspace?.id ?? '',
            board_id: 'main',
            type: 'arrow' as const,
            content: '',
            x: 0, y: 0, width: 0, height: 0,
            color: selectedColor,
            style: { stroke: '#6366f1', strokeWidth: 2 },
            from_id: arrowStartRef.current,
            to_id: itemId,
            z_index: itemsRef.current.length,
            created_by: user?.id ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as CanvasItem]
          setItems(next)
          scheduleSave(next)
          arrowStartRef.current = null
          setSelectedIds(new Set())
        }
      }
      return
    }

    if (tool === 'pencil') {
      const { x, y } = canvasCoords(e.clientX, e.clientY)
      drawingRef.current = { points: [[x, y]] }
      setDrawingPath(`M ${x} ${y}`)
      return
    }

    if (tool === 'select') {
      if (resizeHandle && itemId) {
        // Start resize
        e.stopPropagation()
        const item = itemsRef.current.find(it => it.id === itemId)
        if (!item) return
        resizingRef.current = {
          id: itemId, handle: resizeHandle,
          startX: e.clientX, startY: e.clientY,
          origX: item.x, origY: item.y, origW: item.width, origH: item.height,
        }
        return
      }

      if (itemId) {
        e.stopPropagation()
        const isShift = e.shiftKey
        if (isShift) {
          setSelectedIds(prev => {
            const s = new Set(prev)
            if (s.has(itemId)) s.delete(itemId)
            else s.add(itemId)
            return s
          })
        } else {
          if (!selectedIds.has(itemId)) setSelectedIds(new Set([itemId]))
        }
        const item = itemsRef.current.find(it => it.id === itemId)
        if (!item) return
        const ids = e.shiftKey ? [...selectedIds, itemId] : selectedIds.has(itemId) ? [...selectedIds] : [itemId]
        draggingRef.current = {
          id: itemId, startX: e.clientX, startY: e.clientY,
          origX: item.x, origY: item.y,
          multiIds: ids,
          multiOrigPositions: ids.map(id => {
            const it = itemsRef.current.find(n => n.id === id)
            return { id, x: it?.x ?? 0, y: it?.y ?? 0 }
          }),
        }
        return
      }

      // Click on empty canvas → start select box or deselect
      if (!e.shiftKey) setSelectedIds(new Set())
      const { x, y } = canvasCoords(e.clientX, e.clientY)
      selectBoxRef.current = { startX: x, startY: y, x, y, w: 0, h: 0 }
      setSelectBox(selectBoxRef.current)
      panningRef.current = null
      return
    }

  }, [tool, selectedIds, pan, scale, selectedColor, currentWorkspace?.id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (tool === 'pencil') { handlePointerDown(e); return }

    // Pan canvas when in non-draw, non-item-click context
    if (tool === 'select') {
      const target = e.target as HTMLElement
      const isCanvasBg = target === canvasRef.current || target.closest('.canvas-bg') === canvasRef.current || target.classList.contains('canvas-bg')
      if (isCanvasBg) {
        handlePointerDown(e)
        return
      }
      // Will be handled by item
      return
    }

    // Shape tools — add on canvas click (up event)
  }, [tool, handlePointerDown])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (drawingRef.current && tool === 'pencil') {
      const { x, y } = canvasCoords(e.clientX, e.clientY)
      drawingRef.current.points.push([x, y])
      setDrawingPath(prev => prev + ` L ${x} ${y}`)
      return
    }

    if (resizingRef.current) {
      const r = resizingRef.current
      const dx = (e.clientX - r.startX) / scale
      const dy = (e.clientY - r.startY) / scale
      let nx = r.origX, ny = r.origY, nw = r.origW, nh = r.origH

      if (r.handle.includes('e')) nw = Math.max(40, r.origW + dx)
      if (r.handle.includes('s')) nh = Math.max(40, r.origH + dy)
      if (r.handle.includes('w')) { nx = r.origX + dx; nw = Math.max(40, r.origW - dx) }
      if (r.handle.includes('n')) { ny = r.origY + dy; nh = Math.max(40, r.origH - dy) }

      setItems(prev => prev.map(it => it.id === r.id ? { ...it, x: nx, y: ny, width: nw, height: nh } : it))
      return
    }

    if (draggingRef.current) {
      const d = draggingRef.current
      const dx = (e.clientX - d.startX) / scale
      const dy = (e.clientY - d.startY) / scale
      setItems(prev => prev.map(it => {
        const orig = d.multiOrigPositions?.find(p => p.id === it.id)
        if (orig) return { ...it, x: orig.x + dx, y: orig.y + dy }
        return it
      }))
      return
    }

    if (panningRef.current) {
      const p = panningRef.current
      setPan({ x: p.origX + e.clientX - p.startX, y: p.origY + e.clientY - p.startY })
      return
    }

    if (selectBoxRef.current) {
      const { x, y } = canvasCoords(e.clientX, e.clientY)
      const sb = selectBoxRef.current
      const newSb = {
        startX: sb.startX, startY: sb.startY,
        x: Math.min(sb.startX, x), y: Math.min(sb.startY, y),
        w: Math.abs(x - sb.startX), h: Math.abs(y - sb.startY),
      }
      selectBoxRef.current = newSb
      setSelectBox({ ...newSb })
    }
  }, [tool, scale]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    // Finish freehand
    if (drawingRef.current && tool === 'pencil') {
      const pts = drawingRef.current.points
      if (pts.length > 2) {
        const pathD = `M ${pts.map(p => `${p[0]} ${p[1]}`).join(' L ')}`
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
        const minX = Math.min(...xs), minY = Math.min(...ys)
        const newItem: CanvasItem = {
          id: crypto.randomUUID(),
          workspace_id: currentWorkspace?.id ?? '',
          board_id: 'main',
          type: 'pencil',
          content: pathD,
          x: minX, y: minY,
          width: Math.max(...xs) - minX,
          height: Math.max(...ys) - minY,
          color: selectedColor,
          style: { stroke: selectedColor === NOTE_COLORS[7] ? '#374151' : selectedColor, strokeWidth: 3 },
          from_id: null, to_id: null,
          z_index: itemsRef.current.length,
          created_by: user?.id ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        const next = [...itemsRef.current, newItem]
        setItems(next)
        scheduleSave(next)
      }
      drawingRef.current = null
      setDrawingPath('')
      return
    }

    if (resizingRef.current) {
      resizingRef.current = null
      scheduleSave(itemsRef.current)
      return
    }

    if (draggingRef.current) {
      draggingRef.current = null
      scheduleSave(itemsRef.current)
      return
    }

    panningRef.current = null

    if (selectBoxRef.current) {
      const sb = selectBoxRef.current
      if (sb.w > 5 || sb.h > 5) {
        // Select all items in box
        const inBox = itemsRef.current.filter(it =>
          it.type !== 'pencil' && it.type !== 'arrow' &&
          it.x + it.width > sb.x && it.x < sb.x + sb.w &&
          it.y + it.height > sb.y && it.y < sb.y + sb.h
        )
        setSelectedIds(new Set(inBox.map(it => it.id)))
      }
      selectBoxRef.current = null
      setSelectBox(null)
      return
    }

    // Shape placement on canvas click (no drag)
    if (tool !== 'select' && tool !== 'pencil' && tool !== 'arrow' && tool !== 'eraser') {
      const targetEl = e.target as HTMLElement
      const isCanvasBg = targetEl === canvasRef.current || targetEl.closest('.canvas-inner') || targetEl.classList.contains('canvas-bg')
      if (isCanvasBg) {
        const typeMap: Record<string, CanvasItem['type']> = {
          note: 'note', rect: 'rect', circle: 'circle', triangle: 'triangle', text: 'text',
        }
        const t = typeMap[tool]
        if (t) addItem(t, e.clientX, e.clientY)
      }
    }
  }, [tool, selectedColor, currentWorkspace?.id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    // ctrlKey = pinch zoom on trackpad
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    setScale(s => Math.min(4, Math.max(0.1, s * factor)))
  }

  // Touch pinch zoom
  const lastTouchDistRef = useRef<number | null>(null)
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastTouchDistRef.current = Math.sqrt(dx * dx + dy * dy)
    }
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && lastTouchDistRef.current) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const factor = dist / lastTouchDistRef.current
      setScale(s => Math.min(4, Math.max(0.1, s * factor)))
      lastTouchDistRef.current = dist
    }
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size) deleteSelected()
      if (e.key === 'Escape') { setSelectedIds(new Set()); arrowStartRef.current = null }
      if (e.key === 'v') setTool('select')
      if (e.key === 'p') setTool('pencil')
      if (e.key === 'r') setTool('rect')
      if (e.key === 'c') setTool('circle')
      if (e.key === 'n') setTool('note')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render helpers ──────────────────────────────────────────────────────────
  function renderResizeHandles(item: CanvasItem) {
    const handles: { h: ResizeHandle; cx: number; cy: number }[] = [
      { h: 'nw', cx: 0, cy: 0 }, { h: 'n', cx: item.width / 2, cy: 0 }, { h: 'ne', cx: item.width, cy: 0 },
      { h: 'e', cx: item.width, cy: item.height / 2 }, { h: 'se', cx: item.width, cy: item.height },
      { h: 's', cx: item.width / 2, cy: item.height }, { h: 'sw', cx: 0, cy: item.height }, { h: 'w', cx: 0, cy: item.height / 2 },
    ]
    const cursorMap: Record<ResizeHandle, string> = {
      nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize', e: 'e-resize',
      se: 'se-resize', s: 's-resize', sw: 'sw-resize', w: 'w-resize',
    }
    return handles.map(({ h, cx, cy }) => (
      <div
        key={h}
        className="absolute z-10 h-2.5 w-2.5 rounded-sm bg-white border-2 border-indigo-500 shadow"
        style={{ left: cx - 5, top: cy - 5, cursor: cursorMap[h] }}
        onPointerDown={e => { e.stopPropagation(); handlePointerDown(e, item.id, h) }}
      />
    ))
  }

  const TOOLS: { key: Tool; icon: React.ElementType; label: string; shortcut?: string }[] = [
    { key: 'select', icon: MousePointer2, label: 'Sélection (V)', shortcut: 'V' },
    { key: 'note', icon: StickyNote, label: 'Post-it (N)', shortcut: 'N' },
    { key: 'rect', icon: Square, label: 'Rectangle (R)', shortcut: 'R' },
    { key: 'circle', icon: Circle, label: 'Cercle (C)', shortcut: 'C' },
    { key: 'triangle', icon: Triangle, label: 'Triangle' },
    { key: 'pencil', icon: PencilIcon, label: 'Dessin libre (P)', shortcut: 'P' },
    { key: 'arrow', icon: ArrowRight, label: 'Flèche' },
    { key: 'text', icon: Type, label: 'Texte' },
    { key: 'eraser', icon: Trash2, label: 'Gomme' },
  ]

  const selectedList = [...selectedIds]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0 flex-wrap">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {TOOLS.map(t => (
            <button
              key={t.key}
              title={t.label}
              onClick={() => { setTool(t.key); arrowStartRef.current = null }}
              className={cn(
                'h-8 w-8 rounded-md flex items-center justify-center transition-colors',
                tool === t.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-1 px-2">
          {NOTE_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setSelectedColor(c)}
              className={cn('h-5 w-5 rounded-full border transition-transform', selectedColor === c ? 'ring-2 ring-offset-1 ring-foreground scale-110' : 'border-border hover:scale-105')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {selectedList.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive gap-1.5" onClick={deleteSelected}>
            <Trash2 className="h-3.5 w-3.5" />
            {selectedList.length > 1 ? `Supprimer ${selectedList.length}` : 'Supprimer'}
          </Button>
        )}

        {tool === 'arrow' && arrowStartRef.current && (
          <span className="text-xs text-indigo-500 animate-pulse">Cliquer sur l&apos;élément cible…</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {saving && <span className="text-[10px] text-muted-foreground animate-pulse">Sauvegarde…</span>}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.min(4, s * 1.2))} title="Zoom +"><ZoomIn className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.max(0.1, s * 0.8))} title="Zoom -"><ZoomOut className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setScale(1); setPan({ x: 0, y: 0 }) }} title="Reset"><RotateCcw className="h-3.5 w-3.5" /></Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(scale * 100)}%</span>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="flex-1 overflow-hidden relative bg-[radial-gradient(circle,_#e5e7eb_1px,_transparent_1px)] dark:bg-[radial-gradient(circle,_#374151_1px,_transparent_1px)] bg-[length:20px_20px]"
        style={{ cursor: tool === 'pencil' ? 'crosshair' : tool === 'eraser' ? 'crosshair' : tool === 'arrow' ? 'crosshair' : tool === 'select' ? 'default' : 'crosshair' }}
        ref={canvasRef}
        onPointerDown={e => {
          if (tool === 'select') {
            const target = e.target as HTMLElement
            const onCanvas = target === canvasRef.current || target.classList.contains('canvas-bg') || target.classList.contains('canvas-inner')
            if (onCanvas) {
              if (!e.shiftKey) setSelectedIds(new Set())
              const { x, y } = canvasCoords(e.clientX, e.clientY)
              selectBoxRef.current = { startX: x, startY: y, x, y, w: 0, h: 0 }
              setSelectBox(selectBoxRef.current)
              panningRef.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y }
            }
          } else if (tool === 'pencil') {
            handlePointerDown(e)
          }
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={e => {
          if (selectBoxRef.current) {
            const sb = selectBoxRef.current
            if (sb.w > 5 || sb.h > 5) {
              const inBox = itemsRef.current.filter(it =>
                it.type !== 'pencil' && it.type !== 'arrow' &&
                it.x + it.width > sb.x && it.x < sb.x + sb.w &&
                it.y + it.height > sb.y && it.y < sb.y + sb.h
              )
              setSelectedIds(new Set(inBox.map(it => it.id)))
            }
            selectBoxRef.current = null
            setSelectBox(null)
            panningRef.current = null
            return
          }
          if (tool === 'pencil') { handlePointerUp(e); return }
          if (draggingRef.current || resizingRef.current) { handlePointerUp(e); return }
          panningRef.current = null

          // Shape placement on empty canvas click
          if (!['select', 'pencil', 'arrow', 'eraser'].includes(tool)) {
            const target = e.target as HTMLElement
            const onCanvas = target === canvasRef.current || target.classList.contains('canvas-bg') || target.classList.contains('canvas-inner')
            if (onCanvas) {
              const typeMap: Record<string, CanvasItem['type']> = {
                note: 'note', rect: 'rect', circle: 'circle', triangle: 'triangle', text: 'text',
              }
              const t = typeMap[tool]
              if (t) addItem(t, e.clientX, e.clientY)
            }
          }
        }}
        onPointerLeave={() => { panningRef.current = null; selectBoxRef.current = null; setSelectBox(null) }}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        <div
          className="absolute canvas-inner"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: '0 0', width: '8000px', height: '8000px' }}
        >
          {/* SVG layer: arrows, pencil paths, triangles */}
          <svg className="absolute inset-0 pointer-events-none" style={{ width: '8000px', height: '8000px', overflow: 'visible' }}>
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
              </marker>
              <marker id="arrowhead-hover" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#818cf8" />
              </marker>
            </defs>

            {/* Freehand paths */}
            {items.filter(it => it.type === 'pencil').map(it => (
              <path
                key={it.id}
                d={it.content ?? ''}
                fill="none"
                stroke={(it.style as Record<string, string>)?.stroke ?? selectedColor}
                strokeWidth={(it.style as Record<string, number>)?.strokeWidth ?? 3}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn('pointer-events-auto', tool === 'eraser' && 'cursor-crosshair')}
                onClick={() => { if (tool === 'eraser') deleteItem(it.id) }}
              />
            ))}

            {/* Arrow connectors */}
            {items.filter(it => it.type === 'arrow' && it.from_id && it.to_id).map(arrow => {
              const from = items.find(it => it.id === arrow.from_id)
              const to = items.find(it => it.id === arrow.to_id)
              if (!from || !to) return null
              const x1 = from.x + from.width / 2, y1 = from.y + from.height / 2
              const x2 = to.x + to.width / 2, y2 = to.y + to.height / 2
              return (
                <line key={arrow.id} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#6366f1" strokeWidth={2} markerEnd="url(#arrowhead)"
                  className="pointer-events-auto cursor-pointer"
                  onClick={() => { if (tool === 'eraser' || tool === 'select') deleteItem(arrow.id) }}
                />
              )
            })}

            {/* Active drawing path */}
            {drawingPath && (
              <path d={drawingPath} fill="none"
                stroke={selectedColor === NOTE_COLORS[7] ? '#374151' : selectedColor}
                strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            )}

            {/* Select box */}
            {selectBox && selectBox.w > 2 && (
              <rect
                x={selectBox.x} y={selectBox.y} width={selectBox.w} height={selectBox.h}
                fill="rgba(99,102,241,0.08)" stroke="#6366f1" strokeWidth={1} strokeDasharray="4 2"
              />
            )}
          </svg>

          {/* Items (notes, shapes) */}
          {items.filter(it => it.type !== 'pencil' && it.type !== 'arrow').map(item => {
            const isSelected = selectedIds.has(item.id)
            const style = (item.style ?? {}) as Record<string, string | number>
            return (
              <div
                key={item.id}
                className={cn(
                  'absolute select-none',
                  isSelected && 'ring-2 ring-indigo-500 shadow-lg',
                )}
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.width,
                  height: item.height,
                  zIndex: isSelected ? 100 : item.z_index,
                  cursor: tool === 'select' ? 'grab' : tool === 'eraser' ? 'crosshair' : 'default',
                }}
                onPointerDown={e => {
                  if (tool === 'arrow') { handlePointerDown(e, item.id); return }
                  handlePointerDown(e, item.id)
                }}
                onDoubleClick={() => {
                  if (item.type === 'note' || item.type === 'text') {
                    setItems(prev => prev.map(it => it.id === item.id ? { ...it, isEditing: true } : it))
                  }
                }}
              >
                {/* Shape body */}
                {item.type === 'triangle' ? (
                  <div
                    className="w-full h-full"
                    style={{
                      clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
                      backgroundColor: item.color ?? '#fef08a',
                      border: 'none',
                    }}
                  />
                ) : item.type === 'circle' ? (
                  <div className="w-full h-full rounded-full" style={{ backgroundColor: item.color, border: `2px solid ${style.stroke ?? '#6366f1'}` }} />
                ) : item.type === 'rect' ? (
                  <div className="w-full h-full rounded-md flex items-center justify-center" style={{ backgroundColor: item.color, border: `2px solid ${style.stroke ?? '#6366f1'}` }}>
                    {item.isEditing ? (
                      <textarea
                        className="w-full h-full bg-transparent text-sm p-2 resize-none outline-none text-gray-800 dark:text-gray-200 text-center"
                        value={item.content ?? ''}
                        onChange={e => updateContent(item.id, e.target.value)}
                        onBlur={() => finishEdit(item.id)}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                        placeholder="Texte…"
                      />
                    ) : (
                      <span className="text-sm text-gray-700 dark:text-gray-300 text-center px-2 leading-tight">{item.content}</span>
                    )}
                  </div>
                ) : item.type === 'text' ? (
                  <div className="w-full h-full">
                    {item.isEditing ? (
                      <textarea
                        className="w-full h-full bg-transparent text-sm p-1 resize-none outline-none"
                        value={item.content ?? ''}
                        onChange={e => updateContent(item.id, e.target.value)}
                        onBlur={() => finishEdit(item.id)}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                        placeholder="Texte…"
                      />
                    ) : (
                      <span className="text-sm whitespace-pre-wrap leading-tight">{item.content || <span className="text-muted-foreground text-xs">Double-clic</span>}</span>
                    )}
                  </div>
                ) : (
                  /* Note */
                  <div className="w-full h-full rounded-lg shadow-sm overflow-hidden" style={{ backgroundColor: item.color, border: '1px solid rgba(0,0,0,0.1)' }}>
                    <div className="h-6 flex items-center px-2 bg-black/10">
                      <div className="flex gap-1">
                        <div className="h-2 w-2 rounded-full bg-black/20" />
                        <div className="h-2 w-2 rounded-full bg-black/20" />
                      </div>
                    </div>
                    {item.isEditing ? (
                      <textarea
                        className="w-full bg-transparent text-sm p-2 resize-none outline-none text-gray-800"
                        style={{ height: 'calc(100% - 24px)' }}
                        value={item.content ?? ''}
                        onChange={e => updateContent(item.id, e.target.value)}
                        onBlur={() => finishEdit(item.id)}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                        placeholder="Tapez votre note…"
                      />
                    ) : (
                      <div className="p-2 text-sm text-gray-800 overflow-hidden break-words" style={{ height: 'calc(100% - 24px)' }}>
                        {item.content || <span className="text-gray-500 text-xs">Double-clic pour éditer</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Resize handles when selected in select mode */}
                {isSelected && tool === 'select' && item.type !== 'triangle' && renderResizeHandles(item)}

                {/* Delete button */}
                {isSelected && tool === 'select' && (
                  <button
                    className="absolute -top-3 -right-3 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 shadow z-20"
                    onPointerDown={e => { e.stopPropagation(); deleteItem(item.id) }}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Status bar */}
      <div className="px-4 py-1.5 border-t border-border bg-background shrink-0 flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
          {tool === 'select' ? '← Clic sur élément · Shift+clic = multi-sélection · Glisser fond = déplacer vue · Molette/pinch = zoom · Suppr = effacer sélection'
            : tool === 'pencil' ? '← Maintenir et dessiner librement'
            : tool === 'arrow' ? (arrowStartRef.current ? 'Cliquer sur l\'élément cible pour créer la flèche' : 'Cliquer sur un élément source')
            : tool === 'eraser' ? '← Cliquer sur un élément pour le supprimer'
            : '← Cliquer sur le fond pour placer · Double-clic pour éditer · Shortcut V/N/R/C/P'}
        </p>
        <span className="text-[10px] text-muted-foreground">{items.length} élément{items.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}
