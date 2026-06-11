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
            : `Bienvenue dans **${workspace.name}** ! Je t'ai ajouté(e) en tant que **${role}**. N'hésite pas si tu as des questions.`
          await admin.from('messages').insert({
            conversation_id: dmId,
            user_id: user.id,
            content: msg,
          })
        }
      } catch {
        // DM creation failure is non-fatal
      }

      // Insert real-time notification for the new member
      try {
        const inviterName = (await admin.from('profiles').select('full_name').eq('id', user.id).single()).data?.full_name ?? 'Un admin'
        await admin.from('notifications').insert({
          user_id: profile.id,
          workspace_id: workspaceId,
          type: 'workspace_invite',
          title: `Vous avez rejoint ${workspace.name}`,
          body: `${inviterName} vous a ajouté(e) en tant que ${role}. Cliquez pour accéder à l'espace.`,
          is_read: false,
          action_url: `/${workspace.slug}`,
          metadata: { workspace_id: workspaceId, role, invited_by: user.id },
        })
      } catch { /* non-fatal */ }

      // Send email notification (requires RESEND_API_KEY in env)
      if (process.env.RESEND_API_KEY) {
        try {
          const inviterProfile = (await admin.from('profiles').select('full_name').eq('id', user.id).single()).data
          const inviterName = inviterProfile?.full_name ?? 'Un membre'
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://new-flow-dashboard.vercel.app'
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Flow <onboarding@resend.dev>',
              to: [profile.email],
              subject: `${inviterName} vous a ajouté(e) à ${workspace.name}`,
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#09090b;color:#fafafa;border-radius:12px">
                  <h2 style="margin:0 0 8px;font-size:20px">Bienvenue dans <strong>${workspace.name}</strong></h2>
                  <p style="color:#a1a1aa;margin:0 0 24px">${inviterName} vous a ajouté(e) en tant que <strong>${role}</strong>.</p>
                  <a href="${appUrl}/${workspace.slug}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Accéder à l'espace →</a>
                  <p style="color:#52525b;font-size:12px;margin-top:32px">Flow · Votre espace de travail collaboratif</p>
                </div>
              `,
            }),
          })
        } catch { /* non-fatal */ }
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

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://new-flow-dashboard.vercel.app'
      const inviteUrl = `${appUrl}/invite/${invitation.token}`

      // Send invitation email
      if (process.env.RESEND_API_KEY) {
        try {
          const inviterProfile = (await admin.from('profiles').select('full_name').eq('id', user.id).single()).data
          const inviterName = inviterProfile?.full_name ?? 'Un membre'
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Flow <onboarding@resend.dev>',
              to: [email],
              subject: `${inviterName} vous invite à rejoindre ${workspace.name}`,
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#09090b;color:#fafafa;border-radius:12px">
                  <h2 style="margin:0 0 8px;font-size:20px">Invitation à rejoindre <strong>${workspace.name}</strong></h2>
                  <p style="color:#a1a1aa;margin:0 0 8px">${inviterName} vous invite à collaborer en tant que <strong>${role}</strong>.</p>
                  ${welcomeMessage ? `<blockquote style="border-left:3px solid #6366f1;margin:0 0 24px;padding:8px 16px;color:#d4d4d8">${welcomeMessage}</blockquote>` : '<br/>'}
                  <a href="${inviteUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Accepter l'invitation →</a>
                  <p style="color:#52525b;font-size:12px;margin-top:32px">Ce lien expire dans 7 jours · Flow</p>
                </div>
              `,
            }),
          })
        } catch { /* non-fatal */ }
      }

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
