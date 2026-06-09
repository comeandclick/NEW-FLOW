export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatDistanceToNow, format, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CheckSquare, FileText, MessageSquare, Calendar, Plus, TrendingUp, Clock, Users, Zap, ArrowRight, FolderOpen, Star, Bell } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface Props {
  params: Promise<{ workspace: string }>
}

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/10 text-blue-400',
  in_review: 'bg-purple-500/10 text-purple-400',
  done: 'bg-green-500/10 text-green-500',
  cancelled: 'bg-red-500/10 text-red-400',
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  in_review: 'En révision',
  done: 'Terminée',
  cancelled: 'Annulée',
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-blue-400',
}

export default async function WorkspaceHomePage({ params }: Props) {
  const { workspace: slug } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const user = session.user

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, plan')
    .eq('slug', slug)
    .single()
  if (!workspace) redirect('/workspaces')

  const [
    { data: recentTasks },
    { data: myTasks },
    { data: recentNotes },
    { data: upcomingEvents },
    { data: taskStats },
    { data: recentActivity },
    { data: memberCount },
    { data: recentFiles },
    { data: unreadNotifs },
  ] = await Promise.all([
    supabase.from('tasks').select('id, title, status, priority, due_date, updated_at')
      .eq('workspace_id', workspace.id).neq('status', 'done').neq('status', 'cancelled')
      .is('deleted_at', null).order('updated_at', { ascending: false }).limit(6),
    supabase.from('tasks').select('id, title, status, priority, due_date')
      .eq('workspace_id', workspace.id).eq('assignee_id', user.id).neq('status', 'done')
      .is('deleted_at', null).order('due_date', { ascending: true }).limit(5),
    supabase.from('notes').select('id, title, updated_at, icon')
      .eq('workspace_id', workspace.id).eq('is_archived', false)
      .order('updated_at', { ascending: false }).limit(5),
    supabase.from('events').select('id, title, start_at, all_day, color')
      .eq('workspace_id', workspace.id).gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true }).limit(4),
    supabase.from('tasks').select('status').eq('workspace_id', workspace.id).is('deleted_at', null),
    supabase.from('activity_logs').select('id, action, entity_type, metadata, created_at')
      .eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(8),
    supabase.from('workspace_members').select('id').eq('workspace_id', workspace.id),
    supabase.from('files').select('id, name, mime_type, created_at')
      .eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(4),
    supabase.from('notifications').select('id').eq('user_id', user.id).eq('is_read', false),
  ])

  const totalTasks = taskStats?.length ?? 0
  const doneTasks = taskStats?.filter((t) => t.status === 'done').length ?? 0
  const todoTasks = taskStats?.filter((t) => t.status === 'todo').length ?? 0
  const inProgressTasks = taskStats?.filter((t) => t.status === 'in_progress').length ?? 0
  const completionPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0
  const unreadCount = unreadNotifs?.length ?? 0

  const greetingHour = new Date().getHours()
  const greeting = greetingHour < 12 ? 'Bonjour' : greetingHour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const firstName = ((user.user_metadata?.full_name as string) ?? user.email ?? '').split(' ')[0]

  const ACTION_LABELS: Record<string, string> = {
    'task.created': 'a créé une tâche',
    'task.updated': 'a mis à jour une tâche',
    'task.completed': 'a terminé une tâche',
    'note.created': 'a créé une note',
    'note.updated': 'a mis à jour une note',
    'file.uploaded': 'a téléversé un fichier',
    'member.joined': 'a rejoint l\'espace',
    'meeting.created': 'a créé une réunion',
  }

  function getMimeIcon(mime: string | null) {
    if (!mime) return '📄'
    if (mime.startsWith('image/')) return '🖼️'
    if (mime.includes('pdf')) return '📕'
    if (mime.includes('video')) return '🎬'
    if (mime.includes('spreadsheet') || mime.includes('excel')) return '📊'
    return '📄'
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Hero greeting */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}, {firstName} 👋</h1>
          <p className="text-muted-foreground text-sm mt-1 capitalize">
            {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {unreadCount > 0 && (
            <Link href={`/${slug}/activity`}>
              <Button variant="outline" size="sm" className="h-8 gap-2">
                <Bell className="h-3.5 w-3.5" />
                <span className="text-xs">{unreadCount} notif{unreadCount > 1 ? 's' : ''}</span>
              </Button>
            </Link>
          )}
          <Link href={`/${slug}/tasks`}>
            <Button size="sm" className="h-8 gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nouvelle tâche
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Tâches totales</p>
            <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{totalTasks}</p>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${completionPct}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">{completionPct}% terminées</p>
        </Card>
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">En cours</p>
            <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-blue-400">{inProgressTasks}</p>
          <p className="text-[10px] text-muted-foreground">{todoTasks} à faire</p>
        </Card>
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Membres</p>
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{memberCount?.length ?? 0}</p>
          <Link href={`/${slug}/settings/members`} className="text-[10px] text-primary hover:underline">
            Gérer →
          </Link>
        </Card>
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Plan</p>
            <Zap className="h-3.5 w-3.5 text-yellow-400" />
          </div>
          <p className="text-2xl font-bold capitalize">{workspace.plan ?? 'Free'}</p>
          {(!workspace.plan || workspace.plan === 'free') && (
            <p className="text-[10px] text-muted-foreground">5 membres · 1 Go</p>
          )}
        </Card>
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { icon: CheckSquare, label: 'Tâches', href: `/${slug}/tasks`, color: 'text-blue-400 bg-blue-500/10' },
          { icon: FileText, label: 'Notes', href: `/${slug}/notes`, color: 'text-green-400 bg-green-500/10' },
          { icon: MessageSquare, label: 'Messages', href: `/${slug}/messages`, color: 'text-purple-400 bg-purple-500/10' },
          { icon: Calendar, label: 'Calendrier', href: `/${slug}/calendar`, color: 'text-orange-400 bg-orange-500/10' },
        ].map(({ icon: Icon, label, href, color }) => (
          <Link key={label} href={href}>
            <Card className="p-3 flex items-center gap-2.5 hover:bg-accent transition-all cursor-pointer group">
              <div className={`p-1.5 rounded-md ${color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-medium">{label}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* My tasks */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-yellow-400" /> Mes tâches
            </h2>
            <Link href={`/${slug}/tasks`} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              Tout <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {myTasks && myTasks.length > 0 ? (
            <ul className="space-y-1">
              {myTasks.map((task) => (
                <li key={task.id}>
                  <Link href={`/${slug}/tasks/${task.id}`}
                    className="flex items-center gap-2 hover:bg-muted/30 rounded p-1.5 -mx-1.5 transition-colors group">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? 'bg-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{task.title}</p>
                      {task.due_date && (
                        <p className={`text-[10px] ${new Date(task.due_date) < new Date() ? 'text-red-400' : 'text-muted-foreground'}`}>
                          {isToday(new Date(task.due_date)) ? 'Aujourd\'hui' : format(new Date(task.due_date), 'd MMM', { locale: fr })}
                        </p>
                      )}
                    </div>
                    <Badge className={`text-[9px] h-4 px-1 shrink-0 font-normal ${STATUS_COLORS[task.status]}`}>
                      {STATUS_LABELS[task.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">Aucune tâche assignée 🎉</p>
          )}
        </Card>

        {/* Right 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" /> Tâches actives
              </h2>
              <Link href={`/${slug}/tasks`} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                Tout <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {recentTasks && recentTasks.length > 0 ? (
              <div className="divide-y divide-border/40">
                {recentTasks.map((task) => (
                  <Link key={task.id} href={`/${slug}/tasks/${task.id}`}>
                    <div className="flex items-center gap-2 hover:bg-muted/30 rounded px-1.5 py-2 transition-colors group">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? 'bg-muted-foreground'}`} />
                      <span className="text-xs flex-1 truncate group-hover:text-foreground">{task.title}</span>
                      {task.due_date && (
                        <span className={`text-[10px] shrink-0 flex items-center gap-0.5 ${new Date(task.due_date) < new Date() ? 'text-red-400' : 'text-muted-foreground'}`}>
                          <Clock className="h-2.5 w-2.5" />
                          {format(new Date(task.due_date), 'd MMM', { locale: fr })}
                        </span>
                      )}
                      <Badge className={`text-[9px] h-4 px-1 shrink-0 font-normal ${STATUS_COLORS[task.status]}`}>
                        {STATUS_LABELS[task.status]}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-3">Aucune tâche active 🎉</p>
            )}
          </Card>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Notes
                </h2>
                <Link href={`/${slug}/notes`} className="text-[10px] text-muted-foreground hover:text-foreground">Tout →</Link>
              </div>
              {recentNotes && recentNotes.length > 0 ? (
                <ul className="space-y-1">
                  {recentNotes.map((note) => (
                    <li key={note.id}>
                      <Link href={`/${slug}/notes/${note.id}`}
                        className="flex items-center gap-2 hover:bg-muted/30 rounded p-1 transition-colors group">
                        <span className="text-sm shrink-0">{note.icon ?? '📄'}</span>
                        <span className="text-xs flex-1 truncate group-hover:text-foreground">{note.title}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(note.updated_at), { locale: fr })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-3">Aucune note</p>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" /> Fichiers
                </h2>
                <Link href={`/${slug}/files`} className="text-[10px] text-muted-foreground hover:text-foreground">Tout →</Link>
              </div>
              {recentFiles && recentFiles.length > 0 ? (
                <ul className="space-y-1">
                  {recentFiles.map((f) => (
                    <li key={f.id} className="flex items-center gap-2">
                      <span className="text-sm shrink-0">{getMimeIcon(f.mime_type)}</span>
                      <span className="text-xs flex-1 truncate">{f.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(f.created_at), { locale: fr })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-3">Aucun fichier</p>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Upcoming + Activity */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> À venir
            </h2>
            <Link href={`/${slug}/calendar`} className="text-[10px] text-muted-foreground hover:text-foreground">Calendrier →</Link>
          </div>
          {upcomingEvents && upcomingEvents.length > 0 ? (
            <ul className="space-y-2">
              {upcomingEvents.map((event) => (
                <li key={event.id} className="flex items-center gap-3">
                  <div className="flex flex-col items-center w-8 shrink-0 text-center">
                    <span className="text-[9px] text-muted-foreground font-semibold uppercase">
                      {format(new Date(event.start_at), 'MMM', { locale: fr })}
                    </span>
                    <span className="text-base font-bold leading-tight">
                      {format(new Date(event.start_at), 'd')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{event.title}</p>
                    {!event.all_day && (
                      <p className="text-[10px] text-muted-foreground">{format(new Date(event.start_at), 'HH:mm')}</p>
                    )}
                  </div>
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: event.color ?? '#6366f1' }} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">Aucun événement à venir</p>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" /> Activité récente
            </h2>
            <Link href={`/${slug}/activity`} className="text-[10px] text-muted-foreground hover:text-foreground">Tout →</Link>
          </div>
          {recentActivity && recentActivity.length > 0 ? (
            <ul className="space-y-1.5">
              {recentActivity.map((log) => (
                <li key={log.id} className="flex items-start gap-2 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/50 mt-1.5 shrink-0" />
                  <span className="flex-1 text-muted-foreground line-clamp-1">
                    {ACTION_LABELS[log.action] ?? log.action}{' '}
                    {(log.metadata as Record<string, string>)?.title && (
                      <span className="font-medium text-foreground">
                        « {(log.metadata as Record<string, string>).title} »
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(log.created_at), { locale: fr })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">Aucune activité</p>
          )}
        </Card>
      </div>
    </div>
  )
}
