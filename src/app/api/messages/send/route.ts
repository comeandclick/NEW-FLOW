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
  const supa = await createServerClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { conversationId, content, replyToId } = await request.json()
  if (!conversationId || !content?.trim()) {
    return NextResponse.json({ error: 'conversationId et content requis' }, { status: 400 })
  }

  const admin = getAdmin()

  // Verify sender is member of conversation
  const { data: member } = await admin
    .from('conversation_members')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member) return NextResponse.json({ error: 'Non membre de la conversation' }, { status: 403 })

  // Insert message
  const { data: msg, error } = await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      user_id: user.id,
      content: content.trim(),
      parent_id: replyToId ?? null,
    })
    .select('*, user:profiles(id, full_name, avatar_url, email)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update conversation timestamp
  await admin
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  // Get conversation info + all other members
  const { data: conv } = await admin
    .from('conversations')
    .select('workspace_id, name, type, workspaces(slug)')
    .eq('id', conversationId)
    .single()

  const { data: allMembers } = await admin
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .neq('user_id', user.id)

  // Get sender name
  const { data: senderProfile } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  const senderName = senderProfile?.full_name ?? senderProfile?.email ?? 'Quelqu\'un'
  const convLabel = conv?.type === 'channel' ? `#${conv.name}` : senderName
  const wsSlug = (conv as { workspaces?: { slug?: string } } | null)?.workspaces?.slug ?? conv?.workspace_id

  // Send in-app notification to each other member
  if (conv?.workspace_id && allMembers?.length) {
    const notifs = allMembers.map(m => ({
      user_id: m.user_id,
      workspace_id: conv.workspace_id,
      type: 'message_received',
      title: `Nouveau message de ${senderName}`,
      body: `${convLabel}: ${content.trim().slice(0, 100)}`,
      is_read: false,
      action_url: `/${wsSlug}/messages/${conversationId}`,
      metadata: { conversation_id: conversationId, sender_id: user.id },
    }))
    await admin.from('notifications').insert(notifs)
  }

  return NextResponse.json(msg)
}
