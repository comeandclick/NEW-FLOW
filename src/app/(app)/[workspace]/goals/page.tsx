'use client'

import { use, useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Plus, Target, CheckCircle2, Pause, XCircle, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Goal, GoalKeyResult } from '@/types/database'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Props { params: Promise<{ workspace: string }> }

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active: { label: 'Actif', color: 'bg-blue-500/10 text-blue-500', icon: Target },
  completed: { label: 'Terminé', color: 'bg-green-500/10 text-green-500', icon: CheckCircle2 },
  paused: { label: 'En pause', color: 'bg-yellow-500/10 text-yellow-600', icon: Pause },
  cancelled: { label: 'Annulé', color: 'bg-muted text-muted-foreground', icon: XCircle },
}

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

type GoalWithKRs = Goal & { key_results: GoalKeyResult[] }

export default function GoalsPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [goals, setGoals] = useState<GoalWithKRs[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<GoalWithKRs | null>(null)
  const [form, setForm] = useState({ title: '', description: '', target_value: '100', unit: '%', status: 'active', due_date: '', color: COLORS[0] })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!currentWorkspace?.id) return
    loadGoals()
  }, [currentWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadGoals() {
    if (!currentWorkspace?.id) return
    setLoading(true)
    const { data } = await getSupabaseClient()
      .from('goals')
      .select('*, key_results:goal_key_results(*)')
      .eq('workspace_id', currentWorkspace.id)
      .order('created_at', { ascending: false })
    setGoals((data ?? []) as unknown as GoalWithKRs[])
    setLoading(false)
  }

  function openCreate() {
    setEditTarget(null)
    setForm({ title: '', description: '', target_value: '100', unit: '%', status: 'active', due_date: '', color: COLORS[0] })
    setCreateOpen(true)
  }

  function openEdit(goal: GoalWithKRs) {
    setEditTarget(goal)
    setForm({
      title: goal.title,
      description: goal.description ?? '',
      target_value: String(goal.target_value),
      unit: goal.unit,
      status: goal.status,
      due_date: goal.due_date ?? '',
      color: goal.color ?? COLORS[0],
    })
    setCreateOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id || !user?.id || !form.title.trim()) return
    setSaving(true)
    try {
      const payload = {
        workspace_id: currentWorkspace.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        target_value: parseFloat(form.target_value) || 100,
        unit: form.unit || '%',
        status: form.status,
        due_date: form.due_date || null,
        color: form.color,
        created_by: user.id,
      }
      if (editTarget) {
        await getSupabaseClient().from('goals').update(payload).eq('id', editTarget.id)
        toast.success('Objectif mis à jour')
      } else {
        await getSupabaseClient().from('goals').insert({ ...payload, current_value: 0 })
        toast.success('Objectif créé')
      }
      setCreateOpen(false)
      loadGoals()
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function updateProgress(goalId: string, value: number) {
    await getSupabaseClient().from('goals').update({ current_value: value }).eq('id', goalId)
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, current_value: value } : g))
  }

  async function deleteGoal(goalId: string) {
    await getSupabaseClient().from('goals').delete().eq('id', goalId)
    setGoals(prev => prev.filter(g => g.id !== goalId))
    toast.success('Objectif supprimé')
  }

  async function addKeyResult(goalId: string, title: string) {
    if (!title.trim()) return
    const { data } = await getSupabaseClient()
      .from('goal_key_results')
      .insert({ goal_id: goalId, title: title.trim(), target_value: 100, current_value: 0, unit: '%' })
      .select().single()
    if (data) {
      setGoals(prev => prev.map(g => g.id === goalId
        ? { ...g, key_results: [...(g.key_results ?? []), data as GoalKeyResult] }
        : g
      ))
    }
  }

  async function updateKR(krId: string, goalId: string, value: number) {
    await getSupabaseClient().from('goal_key_results').update({ current_value: value }).eq('id', krId)
    setGoals(prev => prev.map(g => g.id === goalId
      ? { ...g, key_results: g.key_results.map(kr => kr.id === krId ? { ...kr, current_value: value } : kr) }
      : g
    ))
  }

  const activeGoals = goals.filter(g => g.status === 'active')
  const otherGoals = goals.filter(g => g.status !== 'active')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold">Goals & OKR</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{goals.length} objectif{goals.length !== 1 ? 's' : ''}</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" /> Nouvel objectif
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Target className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground text-sm text-center">Aucun objectif — créez votre premier OKR</p>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Créer un objectif</Button>
          </div>
        ) : (
          <>
            {activeGoals.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Objectifs actifs</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {activeGoals.map(g => <GoalCard key={g.id} goal={g} onEdit={openEdit} onDelete={deleteGoal} onUpdateProgress={updateProgress} onAddKR={addKeyResult} onUpdateKR={updateKR} />)}
                </div>
              </section>
            )}
            {otherGoals.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Autres</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {otherGoals.map(g => <GoalCard key={g.id} goal={g} onEdit={openEdit} onDelete={deleteGoal} onUpdateProgress={updateProgress} onAddKR={addKeyResult} onUpdateKR={updateKR} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Modifier l\'objectif' : 'Nouvel objectif'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Titre *</Label>
              <Input placeholder="Lancer notre application mobile" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="Détails…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valeur cible</Label>
                <Input type="number" placeholder="100" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Unité</Label>
                <Input placeholder="%, €, users…" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Statut</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v ?? f.status }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date limite</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Couleur</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`h-6 w-6 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Sauvegarde…' : editTarget ? 'Mettre à jour' : 'Créer l\'objectif'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GoalCard({
  goal, onEdit, onDelete, onUpdateProgress, onAddKR, onUpdateKR,
}: {
  goal: GoalWithKRs
  onEdit: (g: GoalWithKRs) => void
  onDelete: (id: string) => void
  onUpdateProgress: (id: string, v: number) => void
  onAddKR: (goalId: string, title: string) => void
  onUpdateKR: (krId: string, goalId: string, v: number) => void
}) {
  const [newKR, setNewKR] = useState('')
  const [addingKR, setAddingKR] = useState(false)
  const percent = goal.target_value > 0 ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100)) : 0
  const statusCfg = STATUS_CONFIG[goal.status] ?? STATUS_CONFIG.active
  const StatusIcon = statusCfg.icon

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: goal.color ?? '#6366f1' }} />
          <h3 className="font-medium text-sm leading-tight truncate">{goal.title}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge className={`${statusCfg.color} text-[10px] gap-1`}>
            <StatusIcon className="h-2.5 w-2.5" />
            {statusCfg.label}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="ghost" size="icon" className="h-6 w-6"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
            } />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(goal)}><Pencil className="mr-2 h-3.5 w-3.5" /> Modifier</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(goal.id)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {goal.description && <p className="text-xs text-muted-foreground line-clamp-2">{goal.description}</p>}

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Progression</span>
          <span className="font-medium">{goal.current_value} / {goal.target_value} {goal.unit} ({percent}%)</span>
        </div>
        <Progress value={percent} className="h-2" />
        <input
          type="range" min={0} max={goal.target_value} value={goal.current_value}
          onChange={e => onUpdateProgress(goal.id, parseFloat(e.target.value))}
          className="w-full accent-indigo-500 h-1 cursor-pointer"
        />
      </div>

      {/* Due date */}
      {goal.due_date && (
        <p className="text-[10px] text-muted-foreground">
          Échéance : {format(new Date(goal.due_date), 'd MMM yyyy', { locale: fr })}
        </p>
      )}

      {/* Key results */}
      {(goal.key_results ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Key Results</p>
          {goal.key_results.map(kr => {
            const krPct = kr.target_value > 0 ? Math.min(100, Math.round((kr.current_value / kr.target_value) * 100)) : 0
            return (
              <div key={kr.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate flex-1">{kr.title}</span>
                  <span className="text-muted-foreground ml-2 shrink-0">{krPct}%</span>
                </div>
                <Progress value={krPct} className="h-1" />
                <input
                  type="range" min={0} max={kr.target_value} value={kr.current_value}
                  onChange={e => onUpdateKR(kr.id, goal.id, parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 h-1 cursor-pointer"
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Add key result */}
      {addingKR ? (
        <div className="flex gap-1.5">
          <Input
            placeholder="Titre du Key Result…"
            value={newKR}
            onChange={e => setNewKR(e.target.value)}
            className="h-7 text-xs"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') { onAddKR(goal.id, newKR); setNewKR(''); setAddingKR(false) }
              if (e.key === 'Escape') setAddingKR(false)
            }}
          />
          <Button size="sm" className="h-7 text-xs px-2"
            onClick={() => { onAddKR(goal.id, newKR); setNewKR(''); setAddingKR(false) }}>
            OK
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 text-xs w-full justify-start text-muted-foreground"
          onClick={() => setAddingKR(true)}>
          <Plus className="mr-1.5 h-3 w-3" /> Ajouter un Key Result
        </Button>
      )}
    </div>
  )
}
