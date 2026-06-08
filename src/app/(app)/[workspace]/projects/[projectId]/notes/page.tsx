'use client'

import { use } from 'react'
import { ProjectNav } from '@/components/workspace/ProjectNav'
import { useWorkspaceStore } from '@/stores/workspaceStore'

interface Props {
  params: Promise<{ workspace: string; projectId: string }>
}

export default function ProjectNotesPage({ params }: Props) {
  const { workspace: slug, projectId } = use(params)
  const projects = useWorkspaceStore(s => s.projects)
  const project = projects.find((p) => p.id === projectId)

  return (
    <div className="flex flex-col h-full">
      <ProjectNav slug={slug} projectId={projectId} projectName={project?.name} active="notes" />
      <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
        Project notes coming soon
      </div>
    </div>
  )
}
