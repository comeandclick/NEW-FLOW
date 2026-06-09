'use client'

import { use, useEffect, useRef, useState, useCallback } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ZoomIn, ZoomOut, RotateCcw, Network, X, ExternalLink, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Props { params: Promise<{ workspace: string }> }

interface GraphNode {
  id: string
  label: string
  type: 'task' | 'note' | 'file' | 'member' | 'project' | 'meeting'
  url?: string
  x: number
  y: number
  vx: number
  vy: number
}

interface GraphEdge {
  source: string
  target: string
  label?: string
}

const NODE_COLORS: Record<GraphNode['type'], string> = {
  task: '#6366f1',
  note: '#22c55e',
  file: '#f97316',
  member: '#8b5cf6',
  project: '#0ea5e9',
  meeting: '#ec4899',
}

const NODE_SIZES: Record<GraphNode['type'], number> = {
  project: 24,
  member: 20,
  task: 16,
  note: 14,
  file: 12,
  meeting: 14,
}

export default function KnowledgeGraphPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const router = useRouter()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const svgRef = useRef<SVGSVGElement>(null)
  const animRef = useRef<number>(0)
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])

  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const panMovedRef = useRef(false)
  const [filter, setFilter] = useState<GraphNode['type'] | 'all'>('all')
  const [search, setSearch] = useState('')
  // Node dragging state
  const draggingNodeRef = useRef<{ id: string; ox: number; oy: number; sx: number; sy: number } | null>(null)

  useEffect(() => {
    if (!currentWorkspace?.id) return
    loadGraph()
  }, [currentWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadGraph() {
    if (!currentWorkspace?.id) return
    setLoading(true)
    const ws = currentWorkspace.id

    const [tasks, notes, files, members, projects, meetings] = await Promise.all([
      getSupabaseClient().from('tasks').select('id, title, assignee_id, project_id').eq('workspace_id', ws).is('deleted_at', null).limit(50),
      getSupabaseClient().from('notes').select('id, title').eq('workspace_id', ws).eq('is_archived', false).limit(50),
      getSupabaseClient().from('files').select('id, name').eq('workspace_id', ws).limit(30),
      getSupabaseClient().from('workspace_members').select('user_id, profile:profiles(id, full_name, email)').eq('workspace_id', ws),
      getSupabaseClient().from('projects').select('id, name').eq('workspace_id', ws),
      getSupabaseClient().from('meetings').select('id, title').eq('workspace_id', ws).limit(20),
    ])

    const W = 800, H = 600
    const newNodes: GraphNode[] = []
    const newEdges: GraphEdge[] = []

    function rnd(r: number) { return (Math.random() - 0.5) * r * 2 }

    projects.data?.forEach(p => newNodes.push({ id: `project-${p.id}`, label: p.name, type: 'project', url: `/${slug}/projects/${p.id}`, x: W / 2 + rnd(200), y: H / 2 + rnd(200), vx: 0, vy: 0 }))

    type MemberRow = { user_id: string; profile?: { id: string; full_name?: string; email: string } | null }
    ;(members.data as unknown as MemberRow[] ?? []).forEach(m => {
      const p = m.profile
      if (!p) return
      newNodes.push({ id: `member-${m.user_id}`, label: p.full_name ?? p.email, type: 'member', x: W / 2 + rnd(250), y: H / 2 + rnd(250), vx: 0, vy: 0 })
    })

    tasks.data?.forEach(t => {
      newNodes.push({ id: `task-${t.id}`, label: t.title, type: 'task', url: `/${slug}/tasks/${t.id}`, x: W / 2 + rnd(300), y: H / 2 + rnd(300), vx: 0, vy: 0 })
      if (t.project_id) newEdges.push({ source: `task-${t.id}`, target: `project-${t.project_id}`, label: 'dans' })
      if (t.assignee_id) newEdges.push({ source: `task-${t.id}`, target: `member-${t.assignee_id}`, label: 'assigné' })
    })

    notes.data?.forEach(n => {
      newNodes.push({ id: `note-${n.id}`, label: n.title, type: 'note', url: `/${slug}/notes/${n.id}`, x: W / 2 + rnd(300), y: H / 2 + rnd(300), vx: 0, vy: 0 })
    })

    files.data?.forEach(f => {
      newNodes.push({ id: `file-${f.id}`, label: f.name, type: 'file', url: `/${slug}/files`, x: W / 2 + rnd(300), y: H / 2 + rnd(300), vx: 0, vy: 0 })
    })

    meetings.data?.forEach(m => {
      newNodes.push({ id: `meeting-${m.id}`, label: m.title, type: 'meeting', url: `/${slug}/meetings/${m.id}`, x: W / 2 + rnd(300), y: H / 2 + rnd(300), vx: 0, vy: 0 })
    })

    nodesRef.current = newNodes
    edgesRef.current = newEdges
    setNodes([...newNodes])
    setEdges(newEdges)
    setLoading(false)

    // Run force simulation
    runSimulation()
  }

  function runSimulation() {
    const SIM_STEPS = 200
    let step = 0
    function tick() {
      if (step++ >= SIM_STEPS) {
        setNodes([...nodesRef.current])
        return
      }
      const nodes = nodesRef.current
      const edges = edgesRef.current
      const alpha = 1 - step / SIM_STEPS

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x
          const dy = nodes[j].y - nodes[i].y
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          const f = (120 * 120) / (d * d) * alpha
          nodes[i].vx -= dx / d * f
          nodes[i].vy -= dy / d * f
          nodes[j].vx += dx / d * f
          nodes[j].vy += dy / d * f
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const s = nodes.find(n => n.id === edge.source)
        const t = nodes.find(n => n.id === edge.target)
        if (!s || !t) continue
        const dx = t.x - s.x
        const dy = t.y - s.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = (d - 150) * 0.05 * alpha
        s.vx += dx / d * f
        s.vy += dy / d * f
        t.vx -= dx / d * f
        t.vy -= dy / d * f
      }

      // Center gravity
      for (const n of nodes) {
        n.vx += (400 - n.x) * 0.01 * alpha
        n.vy += (300 - n.y) * 0.01 * alpha
      }

      // Apply velocity
      for (const n of nodes) {
        n.vx *= 0.85
        n.vy *= 0.85
        n.x += n.vx
        n.y += n.vy
      }

      // Render snapshot every 20 steps
      if (step % 20 === 0) setNodes([...nodes])

      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => cancelAnimationFrame(animRef.current), [])

  const visibleNodes = filter === 'all' ? nodes : nodes.filter(n => n.type === filter)
  const visibleIds = new Set(visibleNodes.map(n => n.id))
  const visibleEdges = edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))

  const FILTERS: Array<{ key: GraphNode['type'] | 'all'; label: string }> = [
    { key: 'all', label: 'Tout' },
    { key: 'project', label: 'Projets' },
    { key: 'task', label: 'Tâches' },
    { key: 'note', label: 'Notes' },
    { key: 'member', label: 'Membres' },
    { key: 'file', label: 'Fichiers' },
    { key: 'meeting', label: 'Réunions' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Knowledge Graph</h1>
          <p className="text-xs text-muted-foreground">{nodes.length} nœuds · {edges.length} liens</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="h-7 w-40 text-xs pl-6 pr-2 rounded-md border border-border bg-background/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.min(3, s * 1.2))}><ZoomIn className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.max(0.2, s * 0.8))}><ZoomOut className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setScale(1); setPan({ x: 0, y: 0 }) }}><RotateCcw className="h-3.5 w-3.5" /></Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(scale * 100)}%</span>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0 overflow-x-auto">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors shrink-0',
              filter === f.key ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-accent'
            )}
          >
            {f.key !== 'all' && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: NODE_COLORS[f.key as GraphNode['type']] }} />}
            {f.label}
          </button>
        ))}
      </div>

      {/* SVG Graph */}
      <div className="flex-1 overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-3">
            <Network className="h-8 w-8 text-muted-foreground animate-pulse" />
            <span className="text-sm text-muted-foreground">Construction du graphe…</span>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Network className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Aucun élément dans l&apos;espace</p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{ cursor: panning ? 'grabbing' : 'grab' }}
            onMouseDown={e => {
              if (e.button === 0 && !draggingNodeRef.current) {
                setPanning({ sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y })
                panMovedRef.current = false
              }
            }}
            onMouseMove={e => {
              if (draggingNodeRef.current) {
                // Drag node
                const dn = draggingNodeRef.current
                const dx = (e.clientX - dn.sx) / scale
                const dy = (e.clientY - dn.sy) / scale
                const idx = nodesRef.current.findIndex(n => n.id === dn.id)
                if (idx !== -1) {
                  nodesRef.current[idx].x = dn.ox + dx
                  nodesRef.current[idx].y = dn.oy + dy
                  setNodes([...nodesRef.current])
                }
              } else if (panning) {
                panMovedRef.current = true
                setPan({ x: panning.ox + e.clientX - panning.sx, y: panning.oy + e.clientY - panning.sy })
              }
            }}
            onMouseUp={e => {
              if (draggingNodeRef.current) {
                draggingNodeRef.current = null
              } else {
                // Click on empty space → deselect
                if (!panMovedRef.current) setSelectedId(null)
                setPanning(null)
              }
            }}
            onMouseLeave={() => { setPanning(null); draggingNodeRef.current = null }}
            onWheel={e => { e.preventDefault(); setScale(s => Math.min(3, Math.max(0.2, s * (e.deltaY > 0 ? 0.9 : 1.1)))) }}
          >
            <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
              {/* Edges */}
              {visibleEdges.map((edge, i) => {
                const s = visibleNodes.find(n => n.id === edge.source)
                const t = visibleNodes.find(n => n.id === edge.target)
                if (!s || !t) return null
                const mx = (s.x + t.x) / 2
                const my = (s.y + t.y) / 2
                return (
                  <g key={i}>
                    <line
                      x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                      stroke="currentColor" strokeWidth={1} opacity={0.2}
                      className="text-muted-foreground"
                    />
                    {edge.label && (
                      <text x={mx} y={my} textAnchor="middle" fontSize={8} opacity={0.5} className="fill-muted-foreground select-none">{edge.label}</text>
                    )}
                  </g>
                )
              })}

              {/* Nodes */}
              {visibleNodes.map(node => {
                const r = NODE_SIZES[node.type]
                const isHovered = hoveredId === node.id
                const isSelected = selectedId === node.id
                const isHighlighted = search && node.label.toLowerCase().includes(search.toLowerCase())
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    onMouseEnter={e => { setHoveredId(node.id); setTooltipPos({ x: e.clientX, y: e.clientY }) }}
                    onMouseLeave={() => setHoveredId(null)}
                    onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
                    onMouseDown={e => {
                      // Stop propagation so SVG pan doesn't start
                      e.stopPropagation()
                      draggingNodeRef.current = { id: node.id, ox: node.x, oy: node.y, sx: e.clientX, sy: e.clientY }
                    }}
                    onMouseUp={e => {
                      e.stopPropagation()
                      const dn = draggingNodeRef.current
                      if (dn) {
                        const dx = e.clientX - dn.sx
                        const dy = e.clientY - dn.sy
                        const moved = Math.sqrt(dx * dx + dy * dy)
                        draggingNodeRef.current = null
                        // Only click if barely moved
                        if (moved < 5) {
                          if (isSelected) {
                            // Second click → navigate
                            if (node.url) router.push(node.url)
                          } else {
                            setSelectedId(node.id)
                          }
                        }
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Highlight ring for search match */}
                    {isHighlighted && (
                      <circle r={r * 2.2} fill={NODE_COLORS[node.type]} opacity={0.15} />
                    )}
                    {/* Selected ring */}
                    {isSelected && (
                      <circle r={r * 1.8} fill="none" stroke={NODE_COLORS[node.type]} strokeWidth={2.5} opacity={0.8} strokeDasharray="4 2" />
                    )}
                    <circle
                      r={isHovered || isSelected ? r * 1.3 : r}
                      fill={NODE_COLORS[node.type]}
                      opacity={isHovered || isSelected ? 1 : 0.85}
                      style={{ transition: 'r 0.15s, opacity 0.15s' }}
                    />
                    {isHovered && !isSelected && (
                      <circle r={r * 1.6} fill="none" stroke={NODE_COLORS[node.type]} strokeWidth={2} opacity={0.3} />
                    )}
                    <text
                      textAnchor="middle"
                      y={r + 12}
                      fontSize={isHovered || isSelected ? 11 : 9}
                      className="fill-foreground select-none"
                      fontWeight={isSelected ? 600 : 400}
                      style={{ transition: 'font-size 0.15s' }}
                    >
                      {node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
        )}

        {/* Hover tooltip — follows cursor */}
        {hoveredId && hoveredId !== selectedId && (() => {
          const n = nodes.find(nd => nd.id === hoveredId)
          if (!n) return null
          const svgRect = svgRef.current?.getBoundingClientRect()
          const tx = svgRect ? tooltipPos.x - svgRect.left : tooltipPos.x
          const ty = svgRect ? tooltipPos.y - svgRect.top : tooltipPos.y
          return (
            <div
              className="absolute flex items-center gap-2 bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-sm pointer-events-none z-10"
              style={{ left: tx + 12, top: ty - 36, transform: 'translateY(-50%)' }}
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: NODE_COLORS[n.type] }} />
              <span className="font-medium whitespace-nowrap">{n.label}</span>
              <Badge className="text-[10px]" variant="secondary">{n.type}</Badge>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">Clic = sélectionner · 2e clic = ouvrir</span>
            </div>
          )
        })()}

        {/* Selected node detail panel */}
        {selectedId && (() => {
          const n = nodes.find(nd => nd.id === selectedId)
          if (!n) return null
          const connectedEdges = edges.filter(e => e.source === n.id || e.target === n.id)
          const connectedNodes = connectedEdges.map(e => {
            const otherId = e.source === n.id ? e.target : e.source
            return nodes.find(nd => nd.id === otherId)
          }).filter(Boolean) as GraphNode[]
          return (
            <div className="absolute top-3 left-3 bg-popover border border-border rounded-xl p-4 shadow-xl w-64 z-10">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: NODE_COLORS[n.type] }} />
                  <span className="font-semibold text-sm leading-tight">{n.label}</span>
                </div>
                <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Badge variant="secondary" className="text-[10px] mb-3 capitalize">{n.type}</Badge>
              {connectedNodes.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">{connectedNodes.length} connexion{connectedNodes.length > 1 ? 's' : ''}</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {connectedNodes.map(cn => (
                      <button
                        key={cn.id}
                        className="flex items-center gap-1.5 w-full text-left text-xs hover:bg-accent rounded px-1.5 py-1 transition-colors"
                        onClick={() => setSelectedId(cn.id)}
                      >
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: NODE_COLORS[cn.type] }} />
                        <span className="truncate">{cn.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {n.url && (
                <button
                  className="flex items-center gap-1.5 w-full text-xs bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 transition-colors"
                  onClick={() => router.push(n.url!)}
                >
                  <ExternalLink className="h-3 w-3" />
                  Ouvrir {n.type === 'task' ? 'la tâche' : n.type === 'note' ? 'la note' : n.type === 'meeting' ? 'la réunion' : n.type === 'project' ? 'le projet' : 'la page'}
                </button>
              )}
            </div>
          )
        })()}

        {/* Legend */}
        <div className="absolute top-3 right-3 bg-popover/90 border border-border rounded-lg p-3 space-y-1.5 text-xs">
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-muted-foreground capitalize">{type === 'meeting' ? 'Réunion' : type === 'member' ? 'Membre' : type === 'project' ? 'Projet' : type === 'file' ? 'Fichier' : type === 'note' ? 'Note' : 'Tâche'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
