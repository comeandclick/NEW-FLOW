'use client'

import { use, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { workspacesService } from '@/services/workspaces.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, FolderKanban, CheckSquare, Users, TrendingUp, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import type { Project } from '@/types/database'
import { getSupabaseClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Props {
  params: Promise<{ workspace: string }>
}

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444']

interface ProjectStats {
  total: number
  done: number
  members: number
}

export default function ProjectsPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const projects = useWorkspaceStore(s => s.projects)
  const addProject = useWorkspaceStore(s => s.addProject)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<Record<string, ProjectStats>>({})

  // Fetch task/member stats for all projects
  useEffect(() => {
    if (!projects.length || !currentWorkspace?.id) return
    const supa = getSupabaseClient()
    async function fetchStats() {
      const projectIds = projects.map(p => p.id)
      // Tasks per project
      const { data: tasks } = await supa
        .from('tasks')
        .select('id, project_id, status')
        .in('project_id', projectIds)
      // Members from workspace
      const { data: members } = await supa
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', currentWorkspace!.id)

      const memberCount = members?.length ?? 0
      const statsMap: Record<string, ProjectStats> = {}
      for (const pid of projectIds) {
        const proj = tasks?.filter(t => t.project_id === pid) ?? []
        statsMap[pid] = {
          total: proj.length,
          done: proj.filter(t => t.status === 'done').length,
          members: memberCount,
        }
      }
      setStats(statsMap)
    }
    fetchStats().catch(console.error)
  }, [projects, currentWorkspace?.id])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id || !user?.id) return
    setLoading(true)
    try {
      const project = await workspacesService.createProject(
        currentWorkspace.id, user.id, name.trim(), description || undefined, color
      )
      addProject(project)
      setCreateOpen(false)
      setName('')
      setDescription('')
      toast.success(`Projet "${project.name}" créé`)
      router.push(`/${slug}/projects/${project.id}`)
    } catch {
      toast.error('Impossible de créer le projet')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full page-enter">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold">Projets</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{projects.length} projet{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nouveau projet
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {projects.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <FolderKanban className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Aucun projet</p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Créer un projet
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project: Project) => {
              const s = stats[project.id]
              const pct = s && s.total > 0 ? Math.round((s.done / s.total) * 100) : 0
              return (
                <Link key={project.id} href={`/${slug}/projects/${project.id}`}>
                  <div className="group p-4 rounded-xl border border-border hover:bg-accent/40 transition-colors cursor-pointer space-y-3">
                    {/* Header */}
                    <div className="flex items-start gap-3">
                      <div
                        className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: `${project.color ?? '#6366f1'}20` }}
                      >
                        <FolderKanban className="h-4 w-4" style={{ color: project.color ?? '#6366f1' }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{project.name}</p>
                        {project.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{project.description}</p>
                        )}
                      </div>
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>

                    {/* Progress bar */}
                    {s && s.total > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>Progression</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: project.color ?? '#6366f1' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Stats row */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckSquare className="h-3 w-3" />
                        {s ? `${s.done}/${s.total}` : '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {s?.members ?? '—'}
                      </span>
                      {pct === 100 && s && s.total > 0 && (
                        <span className="flex items-center gap-1 text-green-400 ml-auto">
                          <TrendingUp className="h-3 w-3" />
                          Terminé
                        </span>
                      )}
                    </div>

                    {/* Color accent line */}
                    <div
                      className={cn('h-0.5 rounded-full opacity-40')}
                      style={{ backgroundColor: project.color ?? '#6366f1' }}
                    />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau projet</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input placeholder="Mon projet" value={name}
                onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Optionnel" value={description}
                onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Couleur</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button"
                    className={`h-6 w-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white/50' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" size="sm" disabled={loading}>
              {loading ? 'Création…' : 'Créer le projet'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
