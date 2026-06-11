'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CheckSquare, Plus, MessageSquare, MoreHorizontal,
  FileText, Calendar, FolderOpen, Video, Settings, User, ArrowRight,
} from 'lucide-react'
import { useState } from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { notesService } from '@/services/notes.service'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

interface MobileNavProps {
  workspaceSlug: string
  workspaceId: string
}

const MORE_ITEMS = [
  { label: 'Notes', href: '/notes', icon: FileText },
  { label: 'Calendrier', href: '/calendar', icon: Calendar },
  { label: 'Projets', href: '/projects', icon: FolderOpen },
  { label: 'Fichiers', href: '/files', icon: FolderOpen },
  { label: 'Réunions', href: '/meetings', icon: Video },
  { label: 'Paramètres', href: '/settings', icon: Settings },
  { label: 'Profil', href: '/settings/profile', icon: User },
]

const CREATE_ACTIONS = [
  { label: 'Tâche', icon: CheckSquare, color: 'text-blue-400' },
  { label: 'Note', icon: FileText, color: 'text-yellow-400' },
  { label: 'Événement', icon: Calendar, color: 'text-green-400' },
  { label: 'Réunion', icon: Video, color: 'text-purple-400' },
]

export function MobileNav({ workspaceSlug, workspaceId }: MobileNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [creatingNote, setCreatingNote] = useState(false)
  const base = `/${workspaceSlug}`

  function isActive(suffix: string, exact = false) {
    const full = `${base}${suffix}`
    if (exact) return pathname === full
    if (suffix === '') return pathname === base
    return pathname.startsWith(full)
  }

  async function handleCreate(label: string) {
    setCreateOpen(false)
    if (label === 'Note') {
      if (!workspaceId || !user) { router.push(`${base}/notes`); return }
      setCreatingNote(true)
      try {
        const note = await notesService.create({
          workspace_id: workspaceId,
          title: 'Sans titre',
          created_by: user.id,
          content: {},
        })
        router.push(`${base}/notes/${note.id}`)
      } catch {
        toast.error('Impossible de créer la note')
        router.push(`${base}/notes`)
      } finally {
        setCreatingNote(false)
      }
    } else if (label === 'Tâche') {
      router.push(`${base}/tasks`)
    } else if (label === 'Événement') {
      router.push(`${base}/calendar`)
    } else if (label === 'Réunion') {
      router.push(`${base}/meetings`)
    }
  }

  return (
    <>
      {/* Bottom nav bar */}
      <nav className="flex items-center justify-around bg-background border-t border-border h-16 px-1 safe-area-inset-bottom">
        <NavTab
          href={base}
          label="Accueil"
          icon={LayoutDashboard}
          active={isActive('')}
        />
        <NavTab
          href={`${base}/tasks`}
          label="Tâches"
          icon={CheckSquare}
          active={isActive('/tasks')}
        />

        {/* Central FAB */}
        <button
          onClick={() => setCreateOpen(true)}
          disabled={creatingNote}
          className="flex items-center justify-center h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
          aria-label="Créer"
        >
          <Plus className="h-5 w-5" />
        </button>

        <NavTab
          href={`${base}/messages`}
          label="Messages"
          icon={MessageSquare}
          active={isActive('/messages')}
        />

        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[48px]',
            MORE_ITEMS.some(i => pathname.startsWith(`${base}${i.href}`))
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-label="Plus"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] leading-none mt-0.5">Plus</span>
        </button>
      </nav>

      {/* Create sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="p-0 rounded-t-2xl" showCloseButton={false}>
          <SheetHeader className="px-5 pt-5 pb-2">
            <div className="mx-auto w-10 h-1 rounded-full bg-muted mb-3" />
            <SheetTitle>Créer</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 px-5 pb-8">
            {CREATE_ACTIONS.map(action => (
              <button
                key={action.label}
                onClick={() => handleCreate(action.label)}
                className="flex items-center gap-3 p-4 rounded-2xl border border-border hover:bg-accent active:scale-95 transition-all text-left"
              >
                <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <action.icon className={cn('h-5 w-5', action.color)} />
                </div>
                <span className="font-medium text-sm">{action.label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* More sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="p-0 rounded-t-2xl" showCloseButton={false}>
          <SheetHeader className="px-5 pt-5 pb-2">
            <div className="mx-auto w-10 h-1 rounded-full bg-muted mb-3" />
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-3 px-5 pb-4">
            {MORE_ITEMS.map(item => (
              <Link
                key={item.label}
                href={`${base}${item.href}`}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-2xl border border-border hover:bg-accent active:scale-95 transition-all',
                  pathname.startsWith(`${base}${item.href}`) && 'bg-accent border-primary/40'
                )}
              >
                <item.icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
              </Link>
            ))}
          </div>
          <div className="px-5 pb-8 pt-1 border-t border-border">
            <Link
              href="/workspaces"
              onClick={() => setMoreOpen(false)}
              className="flex items-center justify-between p-3 rounded-xl hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <LayoutDashboard className="h-4 w-4" />
                Changer d&apos;espace de travail
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function NavTab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: React.ElementType
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[48px]',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] leading-none mt-0.5">{label}</span>
    </Link>
  )
}
