export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Users ({users?.length ?? 0})</h1>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">User</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Joined</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users?.map((user) => (
              <tr key={user.id} className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={user.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">{user.full_name?.[0] ?? '?'}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{user.full_name ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {format(new Date(user.created_at), 'MMM d, yyyy')}
                </td>
                <td className="px-4 py-3">
                  {user.is_admin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
