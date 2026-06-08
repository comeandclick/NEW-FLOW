export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

export default async function AdminWorkspacesPage() {
  const supabase = await createClient()
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select(`
      *,
      owner:profiles!workspaces_owner_id_fkey(full_name, email),
      member_count:workspace_members(count)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Workspaces ({workspaces?.length ?? 0})</h1>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Owner</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Plan</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Members</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {workspaces?.map((ws) => {
              const w = ws as typeof ws & {
                owner?: { full_name?: string; email: string }
                member_count?: { count: number }[]
              }
              return (
                <tr key={ws.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{ws.name}</p>
                      <p className="text-xs text-muted-foreground">{ws.slug}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {w.owner?.full_name ?? w.owner?.email ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs capitalize">{ws.plan}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {w.member_count?.[0]?.count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {format(new Date(ws.created_at), 'MMM d, yyyy')}
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
