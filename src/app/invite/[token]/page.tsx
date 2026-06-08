'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Building2, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

interface Props {
  params: Promise<{ token: string }>
}

interface InviteInfo {
  workspace_name: string
  role: string
  invited_by_name: string
  email: string
}

export default function AcceptInvitePage({ params }: Props) {
  const { token } = use(params)
  const router = useRouter()
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [workspaceSlug, setWorkspaceSlug] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    async function load() {
      // Load invitation details
      const supabase = getSupabaseClient()

      const { data: { user } } = await supabase.auth.getUser()
      setIsLoggedIn(!!user)

      const { data: inv } = await supabase
        .from('workspace_invitations')
        .select(`
          email, role, welcome_message,
          workspace:workspaces(name, slug),
          inviter:profiles!workspace_invitations_invited_by_fkey(full_name)
        `)
        .eq('token', token)
        .is('accepted_at', null)
        .single()

      if (!inv) {
        setError('Cette invitation est invalide ou a déjà été utilisée.')
        setLoading(false)
        return
      }

      type InvData = {
        email: string; role: string; welcome_message: string | null;
        workspace: { name: string; slug: string } | null
        inviter: { full_name: string | null } | null
      }
      const d = inv as unknown as InvData

      setInfo({
        workspace_name: d.workspace?.name ?? 'un espace',
        role: d.role,
        invited_by_name: d.inviter?.full_name ?? 'Quelqu\'un',
        email: d.email,
      })
      setWorkspaceSlug(d.workspace?.slug ?? null)
      setLoading(false)
    }
    load()
  }, [token])

  async function handleAccept() {
    setAccepting(true)
    try {
      const res = await fetch('/api/workspaces/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setDone(true)
      setWorkspaceSlug(json.workspace?.slug ?? workspaceSlug)
      setTimeout(() => {
        router.push(`/${json.workspace?.slug ?? workspaceSlug}`)
      }, 1800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setAccepting(false)
    }
  }

  const ROLE_LABELS: Record<string, string> = {
    admin: 'Administrateur',
    member: 'Membre',
    viewer: 'Lecteur',
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-lg font-semibold">Invitation invalide</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => router.push('/workspaces')}>
            Voir mes espaces
          </Button>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
          <h1 className="text-lg font-semibold">Bienvenue !</h1>
          <p className="text-sm text-muted-foreground">
            Vous avez rejoint <strong>{info?.workspace_name}</strong>. Redirection…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Invitation reçue</h1>
            <p className="text-sm text-muted-foreground mt-1">
              <strong>{info?.invited_by_name}</strong> vous invite à rejoindre
            </p>
          </div>
        </div>

        {/* Workspace card */}
        <div className="rounded-xl border border-border p-4 space-y-2 bg-muted/30">
          <p className="font-semibold text-lg">{info?.workspace_name}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rôle assigné :</span>
            <span className="text-xs font-medium bg-primary/10 text-primary rounded-full px-2 py-0.5">
              {ROLE_LABELS[info?.role ?? 'member'] ?? info?.role}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Invitation pour : {info?.email}</p>
        </div>

        {!isLoggedIn ? (
          <div className="space-y-3">
            <p className="text-sm text-center text-muted-foreground">
              Connectez-vous ou créez un compte pour accepter l&apos;invitation.
            </p>
            <Button
              className="w-full"
              onClick={() => router.push(`/login?redirect=/invite/${token}`)}
            >
              Se connecter
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push(`/register?redirect=/invite/${token}&email=${encodeURIComponent(info?.email ?? '')}`)}
            >
              Créer un compte
            </Button>
          </div>
        ) : (
          <Button
            className="w-full"
            size="lg"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Acceptation…</>
            ) : (
              'Rejoindre l\'espace'
            )}
          </Button>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Cette invitation expire dans 7 jours.
        </p>
      </div>
    </div>
  )
}
