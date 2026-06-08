export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

export default async function AdminLogsPage() {
  const supabase = await createClient()
  const { data: logs } = await supabase
    .from('activity_logs')
    .select(`
      *,
      user:profiles(full_name, email, avatar_url),
      workspace:workspaces(name, slug)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Journaux d&apos;activité</h1>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Action</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Utilisateur</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Espace</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Heure</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs?.map((log) => {
              const l = log as typeof log & {
                user?: { full_name?: string; email: string }
                workspace?: { name: string; slug: string }
              }
              return (
                <tr key={log.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="text-[10px] font-mono">{log.action}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {l.user?.full_name ?? l.user?.email ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {l.workspace?.name ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {format(new Date(log.created_at), 'MMM d, h:mm a')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
