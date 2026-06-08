'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ArrowLeft, CheckSquare, FileText, FolderOpen } from 'lucide-react'

interface ProjectNavProps {
  slug: string
  projectId: string
  projectName?: string
  active: 'tasks' | 'notes' | 'files'
}

export function ProjectNav({ slug, projectId, projectName, active }: ProjectNavProps) {
  const base = `/${slug}/projects/${projectId}`

  const tabs = [
    { key: 'tasks', label: 'Tasks', icon: CheckSquare, href: `${base}/tasks` },
    { key: 'notes', label: 'Notes', icon: FileText, href: `${base}/notes` },
    { key: 'files', label: 'Files', icon: FolderOpen, href: `${base}/files` },
  ]

  return (
    <div className="border-b border-border px-4 pt-3 space-y-2">
      <div className="flex items-center gap-2">
        <Link href={`/${slug}/projects`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-sm font-semibold">{projectName ?? 'Project'}</h1>
      </div>
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t-md border-b-2 transition-colors',
              active === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
