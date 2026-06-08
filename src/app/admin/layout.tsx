export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { LayoutDashboard, Users, Building2, ScrollText } from 'lucide-react'
import { cn } from '@/lib/utils'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  const nav = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/workspaces', label: 'Workspaces', icon: Building2 },
    { href: '/admin/logs', label: 'Activity Logs', icon: ScrollText },
  ]

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-52 border-r border-border flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <p className="text-sm font-semibold">Flow Admin</p>
          <p className="text-xs text-muted-foreground">Super admin panel</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
