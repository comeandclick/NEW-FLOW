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
    const body = await request.json().catch(() => ({}))
    const { workspaceId, email, role = 'member', welcomeMessage } = body

    if (!workspaceId || !email) {
      return NextResponse.json({ error: 'workspaceId et email requis' }, { status: 400 })
    }

    // Verify caller auth + role
    const supa = await createServerClient()
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const admin = getAdmin()

    // Check caller is owner/admin
    const { data: callerMember } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()

    if (!callerMember || !['owner', 'admin'].includes(callerMember.role)) {
      return NextResponse.json({ error: 'Permission refusée' }, { status: 403 })
    }

    // Get workspace info
    const { data: workspace } = await admin
      .from('workspaces')
      .select('name, slug')
      .eq('id', workspaceId)
      .single()
    if (!workspace) return NextResponse.json({ error: 'Espace introuvable' }, { status: 404 })

    // Check if user with this email already exists
    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (profile) {
      // User exists — add directly
      const { error: memberError } = await admin
        .from('workspace_members')
        .insert({ workspace_id: workspaceId, user_id: profile.id, role, invited_by: user.id })

      if (memberError) {
        if (memberError.message.includes('unique') || memberError.code === '23505') {
          return NextResponse.json({ error: 'Cet utilisateur est déjà membre' }, { status: 409 })
        }
        throw memberError
      }

      // Auto-create DM between inviter and new member
      let dmId: string | null = null
      try {
        // Check if DM already exists
        const { data: existingConvs } = await admin
          .from('conversations')
          .select('id, members:conversation_members(user_id)')
          .eq('workspace_id', workspaceId)
          .eq('type', 'dm')

        type ConvWithMembers = { id: string; members: { user_id: string }[] }
        const existing = (existingConvs as unknown as ConvWithMembers[] ?? []).find(
          (c) =>
            c.members.some((m) => m.user_id === user.id) &&
            c.members.some((m) => m.user_id === profile.id)
        )

        if (existing) {
          dmId = existing.id
        } else {
          const { data: dm } = await admin
            .from('conversations')
            .insert({ workspace_id: workspaceId, type: 'dm', created_by: user.id })
            .select()
            .single()

          if (dm) {
            dmId = dm.id
            await admin.from('conversation_members').insert([
              { conversation_id: dm.id, user_id: user.id },
              { conversation_id: dm.id, user_id: profile.id },
            ])
          }
        }

        // Send welcome message in DM
        if (dmId) {
          const callerProfile = await admin
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()
          const senderName = callerProfile.data?.full_name ?? 'L\'admin'
          const msg = welcomeMessage?.trim()
            ? welcomeMessage.trim()
            : `👋 Bienvenue dans **${workspace.name}** ! Je t'ai ajouté(e) en tant que **${role}**. N'hésite pas si tu as des questions.`
          await admin.from('messages').insert({
            conversation_id: dmId,
            user_id: user.id,
            content: msg,
          })
        }
      } catch {
        // DM creation failure is non-fatal
      }

      return NextResponse.json({
        success: true,
        type: 'added',
        member: { userId: profile.id, name: profile.full_name ?? profile.email, role },
        dmConversationId: dmId,
        workspaceSlug: workspace.slug,
      })
    } else {
      // User doesn't exist — create pending invitation
      const { data: invitation, error: invError } = await admin
        .from('workspace_invitations')
        .upsert(
          {
            workspace_id: workspaceId,
            email: email.toLowerCase().trim(),
            role,
            invited_by: user.id,
            welcome_message: welcomeMessage?.trim() || null,
            accepted_at: null,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'workspace_id,email' }
        )
        .select()
        .single()

      if (invError) throw invError

      const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://new-flow-dashboard.vercel.app'}/invite/${invitation.token}`

      return NextResponse.json({
        success: true,
        type: 'invited',
        inviteUrl,
        email,
        role,
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur interne'
    console.error('[workspaces/invite]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
