export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Users, Building2, CheckSquare, MessageSquare } from 'lucide-react'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const [
    { count: userCount },
    { count: workspaceCount },
    { count: taskCount },
    { count: messageCount },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('workspaces').select('*', { count: 'exact', head: true }),
    supabase.from('tasks').select('*', { count: 'exact', head: true }),
    supabase.from('messages').select('*', { count: 'exact', head: true }),
  ])

  const stats = [
    { label: 'Total users', value: userCount ?? 0, icon: Users },
    { label: 'Workspaces', value: workspaceCount ?? 0, icon: Building2 },
    { label: 'Tasks', value: taskCount ?? 0, icon: CheckSquare },
    { label: 'Messages', value: messageCount ?? 0, icon: MessageSquare },
  ]

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <stat.icon className="h-4 w-4" />
              <span className="text-xs">{stat.label}</span>
            </div>
            <p className="text-3xl font-bold">{stat.value.toLocaleString()}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
