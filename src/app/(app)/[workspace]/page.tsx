export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { CheckSquare, FileText, MessageSquare, Video, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import Link from 'next/link'

interface Props {
  params: Promise<{ workspace: string }>
}

export default async function WorkspaceHomePage({ params }: Props) {
  const { workspace: slug } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const user = session.user

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('slug', slug)
    .single()
  if (!workspace) redirect('/workspaces')

  // Fetch recent items in parallel
  const [
    { data: recentTasks },
    { data: recentNotes },
    { data: upcomingEvents },
    { data: taskStats },
  ] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, status, priority, updated_at')
      .eq('workspace_id', workspace.id)
      .neq('status', 'done')
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('notes')
      .select('id, title, updated_at, icon')
      .eq('workspace_id', workspace.id)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('events')
      .select('id, title, start_at, all_day')
      .eq('workspace_id', workspace.id)
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(5),
    supabase
      .from('tasks')
      .select('status')
      .eq('workspace_id', workspace.id),
  ])

  const totalTasks = taskStats?.length ?? 0
  const doneTasks = taskStats?.filter((t) => t.status === 'done').length ?? 0
  const todoTasks = taskStats?.filter((t) => t.status === 'todo').length ?? 0
  const inProgressTasks = taskStats?.filter((t) => t.status === 'in_progress').length ?? 0

  const priorityColor: Record<string, string> = {
    urgent: 'text-red-500',
    high: 'text-orange-500',
    medium: 'text-yellow-500',
    low: 'text-blue-400',
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{workspace.name}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total tâches', value: totalTasks, icon: CheckSquare },
          { label: 'En cours', value: inProgressTasks, icon: TrendingUp },
          { label: 'À faire', value: todoTasks, icon: CheckSquare },
          { label: 'Terminées', value: doneTasks, icon: CheckSquare },
        ].map((stat) => (
          <Card key={stat.label} className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Recent tasks */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-muted-foreground" />
              Tâches actives
            </h2>
            <Link href={`/${slug}/tasks`} className="text-xs text-muted-foreground hover:text-foreground">
              Voir tout →
            </Link>
          </div>
          {recentTasks && recentTasks.length > 0 ? (
            <ul className="space-y-2">
              {recentTasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/${slug}/tasks/${task.id}`}
                    className="flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground group"
                  >
                    <span className={`text-xs font-medium ${priorityColor[task.priority]}`}>
                      {task.priority[0].toUpperCase()}
                    </span>
                    <span className="flex-1 truncate group-hover:text-foreground">{task.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Aucune tâche active</p>
          )}
        </Card>

        {/* Recent notes */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Notes récentes
            </h2>
            <Link href={`/${slug}/notes`} className="text-xs text-muted-foreground hover:text-foreground">
              Voir tout →
            </Link>
          </div>
          {recentNotes && recentNotes.length > 0 ? (
            <ul className="space-y-2">
              {recentNotes.map((note) => (
                <li key={note.id}>
                  <Link
                    href={`/${slug}/notes/${note.id}`}
                    className="flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground group"
                  >
                    <span>{note.icon ?? '📄'}</span>
                    <span className="flex-1 truncate group-hover:text-foreground">{note.title}</span>
                    <span className="text-xs shrink-0">
                      {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true, locale: undefined })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Aucune note</p>
          )}
        </Card>

        {/* Upcoming events */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground" />
              Événements à venir
            </h2>
            <Link href={`/${slug}/calendar`} className="text-xs text-muted-foreground hover:text-foreground">
              Voir tout →
            </Link>
          </div>
          {upcomingEvents && upcomingEvents.length > 0 ? (
            <ul className="space-y-2">
              {upcomingEvents.map((event) => (
                <li key={event.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="flex-1 truncate">{event.title}</span>
                  <span className="text-xs shrink-0">
                    {event.all_day
                      ? new Date(event.start_at).toLocaleDateString()
                      : new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Aucun événement à venir</p>
          )}
        </Card>
      </div>
    </div>
  )
}
