'use client'

import { use, useEffect, useRef, useState, useCallback } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  MousePointer2, StickyNote, Square, Circle, Minus, Pencil as PencilIcon,
  Trash2, ZoomIn, ZoomOut, RotateCcw, Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WhiteboardItem } from '@/types/database'

interface Props { params: Promise<{ workspace: string }> }

type Tool = 'select' | 'note' | 'rect' | 'circle' | 'line' | 'pencil' | 'eraser'

const NOTE_COLORS = [
  '#fef08a', '#86efac', '#93c5fd', '#f9a8d4', '#fca5a5', '#c4b5fd', '#fdba74', '#ffffff',
]

interface CanvasItem extends WhiteboardItem {
  isEditing?: boolean
}

export default function WhiteboardPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const canvasRef = useRef<HTMLDivElement>(null)

  const [items, setItems] = useState<CanvasItem[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [panning, setPanning] = useState<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [drawing, setDrawing] = useState<{ points: [number, number][] } | null>(null)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  function scheduleSave(itemsToSave: CanvasItem[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persistItems(itemsToSave), 1200)
  }

  async function persistItems(current: CanvasItem[]) {
    if (!currentWorkspace?.id || saving) return
    setSaving(true)
    // Upsert all items
    if (current.length > 0) {
      const payload = current.map(({ isEditing, ...item }) => ({
        ...item,
        workspace_id: currentWorkspace.id!,
        board_id: 'main',
        created_by: user?.id ?? null,
      }))
      await getSupabaseClient().from('whiteboard_items').upsert(payload, { onConflict: 'id' }).then(r => { if (r.error) console.error(r.error) })
    }
    setSaving(false)
  }

  function addNote(e: React.MouseEvent) {
    if (tool !== 'note') return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e.clientX - rect.left - pan.x) / scale
    const y = (e.clientY - rect.top - pan.y) / scale
    const newItem: CanvasItem = {
      id: crypto.randomUUID(),
      workspace_id: currentWorkspace?.id ?? '',
      board_id: 'main',
      type: 'note',
      content: '',
      x, y,
      width: 200,
      height: 120,
      color: selectedColor,
      style: {},
      from_id: null,
      to_id: null,
      z_index: items.length,
      created_by: user?.id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      isEditing: true,
    }
    const next = [...items, newItem]
    setItems(next)
    setSelectedId(newItem.id)
    scheduleSave(next)
  }

  function addShape(e: React.MouseEvent, type: 'rect' | 'circle') {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e.clientX - rect.left - pan.x) / scale
    const y = (e.clientY - rect.top - pan.y) / scale
    const newItem: CanvasItem = {
      id: crypto.randomUUID(),
      workspace_id: currentWorkspace?.id ?? '',
      board_id: 'main',
      type,
      content: '',
      x, y,
      width: 120,
      height: 80,
      color: selectedColor,
      style: { stroke: '#6366f1', strokeWidth: 2 },
      from_id: null,
      to_id: null,
      z_index: items.length,
      created_by: user?.id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const next = [...items, newItem]
    setItems(next)
    setSelectedId(newItem.id)
    scheduleSave(next)
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-bg')) {
      setSelectedId(null)
      setItems(prev => prev.map(it => ({ ...it, isEditing: false })))
      if (tool === 'note') addNote(e)
      else if (tool === 'rect') addShape(e, 'rect')
      else if (tool === 'circle') addShape(e, 'circle')
    }
  }

  function handleMouseDown(e: React.MouseEvent, itemId?: string) {
    if (tool === 'eraser' && itemId) {
      deleteItem(itemId)
      return
    }
    if (tool === 'select') {
      if (itemId) {
        e.stopPropagation()
        setSelectedId(itemId)
        const item = items.find(it => it.id === itemId)
        if (!item) return
        setDragging({ id: itemId, startX: e.clientX, startY: e.clientY, origX: item.x, origY: item.y })
      } else {
        // Pan the canvas
        setPanning({ startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y })
      }
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (dragging) {
      const dx = (e.clientX - dragging.startX) / scale
      const dy = (e.clientY - dragging.startY) / scale
      setItems(prev => prev.map(it =>
        it.id === dragging.id ? { ...it, x: dragging.origX + dx, y: dragging.origY + dy } : it
      ))
    }
    if (panning) {
      setPan({ x: panning.origX + e.clientX - panning.startX, y: panning.origY + e.clientY - panning.startY })
    }
  }

  function handleMouseUp() {
    if (dragging) {
      setDragging(null)
      scheduleSave(items)
    }
    setPanning(null)
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    setScale(s => Math.min(3, Math.max(0.2, s * factor)))
  }

  function deleteItem(id: string) {
    const next = items.filter(it => it.id !== id)
    setItems(next)
    setSelectedId(null)
    getSupabaseClient().from('whiteboard_items').delete().eq('id', id).then(r => { if (r.error) console.error(r.error) })
    scheduleSave(next)
  }

  function updateContent(id: string, content: string) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, content, updated_at: new Date().toISOString() } : it))
  }

  function finishEdit(id: string) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, isEditing: false } : it))
    scheduleSave(items)
  }

  async function handleExport() {
    toast.info('Export PNG disponible dans une prochaine version')
  }

  function resetView() {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }

  const TOOLS: { key: Tool; icon: React.ElementType; label: string }[] = [
    { key: 'select', icon: MousePointer2, label: 'Sélection' },
    { key: 'note', icon: StickyNote, label: 'Post-it' },
    { key: 'rect', icon: Square, label: 'Rectangle' },
    { key: 'circle', icon: Circle, label: 'Cercle' },
    { key: 'eraser', icon: Trash2, label: 'Gomme' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {TOOLS.map(t => (
            <button
              key={t.key}
              title={t.label}
              onClick={() => setTool(t.key)}
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
              className={cn('h-5 w-5 rounded-full border transition-transform', selectedColor === c ? 'ring-2 ring-offset-1 ring-foreground scale-110' : 'border-border')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {saving && <span className="text-[10px] text-muted-foreground animate-pulse">Sauvegarde…</span>}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.min(3, s * 1.2))} title="Zoom +"><ZoomIn className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.max(0.2, s * 0.8))} title="Zoom -"><ZoomOut className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetView} title="Reset"><RotateCcw className="h-3.5 w-3.5" /></Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(scale * 100)}%</span>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="flex-1 overflow-hidden relative bg-[radial-gradient(circle,_#e5e7eb_1px,_transparent_1px)] dark:bg-[radial-gradient(circle,_#374151_1px,_transparent_1px)] bg-[length:20px_20px] canvas-bg"
        style={{ cursor: tool === 'select' ? (panning ? 'grabbing' : 'grab') : tool === 'eraser' ? 'crosshair' : 'crosshair' }}
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseDown={(e) => handleMouseDown(e)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          className="absolute inset-0 canvas-bg"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: '0 0' }}
        >
          {/* SVG layer for lines/connectors */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: '10000px', height: '10000px', overflow: 'visible' }}
          >
            {items
              .filter(it => it.type === 'line' && it.from_id && it.to_id)
              .map(line => {
                const from = items.find(it => it.id === line.from_id)
                const to = items.find(it => it.id === line.to_id)
                if (!from || !to) return null
                return (
                  <line
                    key={line.id}
                    x1={from.x + from.width / 2} y1={from.y + from.height / 2}
                    x2={to.x + to.width / 2} y2={to.y + to.height / 2}
                    stroke="#6366f1" strokeWidth={2} strokeDasharray="4,3"
                  />
                )
              })}
          </svg>

          {/* Items */}
          {items.filter(it => it.type !== 'line').map(item => (
            <div
              key={item.id}
              className={cn(
                'absolute rounded-lg shadow-sm select-none transition-shadow',
                selectedId === item.id && 'ring-2 ring-indigo-500 shadow-lg',
                item.type === 'note' && 'overflow-hidden',
                item.type === 'circle' && 'rounded-full',
              )}
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
                backgroundColor: item.color,
                border: item.type !== 'note' ? `2px solid #6366f1` : '1px solid rgba(0,0,0,0.1)',
                cursor: tool === 'select' ? (dragging?.id === item.id ? 'grabbing' : 'grab') : tool === 'eraser' ? 'crosshair' : 'default',
              }}
              onMouseDown={e => handleMouseDown(e, item.id)}
              onDoubleClick={() => setItems(prev => prev.map(it => it.id === item.id ? { ...it, isEditing: true } : it))}
            >
              {item.isEditing ? (
                <textarea
                  className="w-full h-full bg-transparent text-sm p-2 resize-none outline-none text-gray-800"
                  value={item.content ?? ''}
                  onChange={e => updateContent(item.id, e.target.value)}
                  onBlur={() => finishEdit(item.id)}
                  onClick={e => e.stopPropagation()}
                  autoFocus
                  placeholder="Tapez votre texte…"
                />
              ) : (
                <div className="w-full h-full p-2 text-sm text-gray-800 overflow-hidden break-words">
                  {item.content || <span className="text-gray-400 text-xs">Double-cliquer pour éditer</span>}
                </div>
              )}
              {selectedId === item.id && tool === 'select' && (
                <button
                  className="absolute -top-2.5 -right-2.5 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600"
                  onClick={e => { e.stopPropagation(); deleteItem(item.id) }}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Hint */}
      <div className="px-4 py-1.5 border-t border-border bg-background shrink-0">
        <p className="text-[10px] text-muted-foreground">
          {tool === 'select' ? '← Cliquer-glisser pour déplacer · Molette pour zoomer · Glisser fond pour déplacer la vue'
            : tool === 'note' ? '← Cliquer sur le fond pour ajouter un post-it · Double-cliquer pour éditer'
            : tool === 'rect' || tool === 'circle' ? '← Cliquer pour ajouter une forme'
            : tool === 'eraser' ? '← Cliquer sur un élément pour le supprimer'
            : 'Outil sélectionné'}
        </p>
      </div>
    </div>
  )
}
