import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  try {
    const { token } = await request.json().catch(() => ({}))
    if (!token) return NextResponse.json({ error: 'Token requis' }, { status: 400 })

    const supa = await createServerClient()
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Connexion requise' }, { status: 401 })

    const admin = getAdmin()

    // Load invitation
    const { data: invitation } = await admin
      .from('workspace_invitations')
      .select('*, workspace:workspaces(id, name, slug)')
      .eq('token', token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation invalide ou expirée' }, { status: 404 })
    }

    // Verify email matches
    if (invitation.email !== user.email) {
      return NextResponse.json(
        { error: `Cette invitation est destinée à ${invitation.email}` },
        { status: 403 }
      )
    }

    type InvWithWorkspace = typeof invitation & {
      workspace: { id: string; name: string; slug: string } | null
    }
    const inv = invitation as unknown as InvWithWorkspace
    const workspace = inv.workspace
    if (!workspace) return NextResponse.json({ error: 'Espace introuvable' }, { status: 404 })

    // Add to workspace_members
    const safeRole = (['admin', 'member', 'viewer'] as const).includes(invitation.role as 'admin' | 'member' | 'viewer')
      ? (invitation.role as 'admin' | 'member' | 'viewer')
      : 'member'

    const { error: memberError } = await admin
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: user.id,
        role: safeRole,
        invited_by: invitation.invited_by ?? undefined,
      })

    if (memberError && !memberError.message.includes('unique')) {
      throw memberError
    }

    // Mark invitation accepted
    await admin
      .from('workspace_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)

    // Create DM with inviter if they exist
    let dmId: string | null = null
    if (invitation.invited_by) {
      try {
        const { data: dm } = await admin
          .from('conversations')
          .insert({ workspace_id: workspace.id, type: 'dm', created_by: invitation.invited_by })
          .select()
          .single()

        if (dm) {
          dmId = dm.id
          await admin.from('conversation_members').insert([
            { conversation_id: dm.id, user_id: invitation.invited_by },
            { conversation_id: dm.id, user_id: user.id },
          ])

          // Welcome message from inviter
          const welcomeMsg = invitation.welcome_message
            ?? `👋 Bienvenue dans **${workspace.name}** ! Heureux de t'avoir avec nous.`
          await admin.from('messages').insert({
            conversation_id: dm.id,
            user_id: invitation.invited_by,
            content: welcomeMsg,
          })
        }
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({
      success: true,
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      dmConversationId: dmId,
    })
  } catch (err) {
    console.error('[accept-invite]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
