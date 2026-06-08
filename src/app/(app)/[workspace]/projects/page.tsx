'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { workspacesService } from '@/services/workspaces.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, FolderKanban } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import type { Project } from '@/types/database'

interface Props {
  params: Promise<{ workspace: string }>
}

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444']

export default function ProjectsPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const { currentWorkspace, projects, addProject } = useWorkspaceStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id || !user?.id) return
    setLoading(true)
    try {
      const project = await workspacesService.createProject(
        currentWorkspace.id,
        user.id,
        name.trim(),
        description || undefined,
        color
      )
      addProject(project)
      setCreateOpen(false)
      setName('')
      setDescription('')
      toast.success(`Project "${project.name}" created`)
      router.push(`/${slug}/projects/${project.id}`)
    } catch {
      toast.error('Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Projects</h1>
        <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New project
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {projects.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <FolderKanban className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No projects yet</p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create first project
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project: Project) => (
              <Link key={project.id} href={`/${slug}/projects/${project.id}`}>
                <Card className="p-4 hover:bg-accent transition-colors cursor-pointer">
                  <div className="flex items-start gap-3">
                    <div
                      className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: `${project.color}20` }}
                    >
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color ?? '#6366f1' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{project.name}</p>
                      {project.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{project.description}</p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="My project"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Optional"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`h-6 w-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white/50' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" size="sm" disabled={loading}>
              {loading ? 'Creating…' : 'Create project'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
