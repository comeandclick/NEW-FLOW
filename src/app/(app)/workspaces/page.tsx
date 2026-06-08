export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, Building2 } from 'lucide-react'

export default async function WorkspacesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('role, workspace:workspaces(*)')
    .eq('user_id', user.id)

  type WsMembership = { role: string; workspace: { id: string; name: string; slug: string; plan: string } | null }
  const workspaces = ((memberships as unknown as WsMembership[]) ?? [])
    .map((m) => ({ ...m.workspace, userRole: m.role }))
    .filter((w): w is NonNullable<WsMembership['workspace']> & { userRole: string } => w.id != null)

  // Auto-redirect if only one workspace
  if (workspaces.length === 1) {
    redirect(`/${workspaces[0].slug}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Vos espaces</h1>
          <p className="text-muted-foreground text-sm">Sélectionnez un espace pour continuer</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {workspaces.map((ws) => (
            <Link key={ws.id} href={`/${ws.slug}`}>
              <Card className="p-4 hover:bg-accent transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{ws.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{ws.userRole}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}

          {workspaces.length < 5 && (
            <Link href="/workspaces/new">
              <Card className="p-4 hover:bg-accent transition-colors cursor-pointer border-dashed">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg border-2 border-dashed flex items-center justify-center">
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Créer un espace</p>
                </div>
              </Card>
            </Link>
          )}
        </div>

        {workspaces.length === 0 && (
          <div className="text-center space-y-4">
            <p className="text-muted-foreground text-sm">Vous n&apos;avez pas encore d&apos;espace</p>
            <Link href="/workspaces/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Créer mon premier espace
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
